/**
 * @file ble_orbit_service.c
 * @brief AURA Orbit custom GATT service implementation
 *
 * Service UUID:  12345678-1234-5678-1234-56789ABCDEF0
 * FOCUS_CHAR:    12345678-1234-5678-1234-56789ABCDEF1  (Read | Notify | Write)
 * NOTIF_CHAR:    12345678-1234-5678-1234-56789ABCDEF2  (WriteWithoutResponse)
 * BATTERY_CHAR:  12345678-1234-5678-1234-56789ABCDEF3  (Read | Notify)
 */

#include "ble_orbit_service.h"

#include <zephyr/kernel.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/logging/log.h>
#include <string.h>

LOG_MODULE_REGISTER(ble_orbit, LOG_LEVEL_INF);

/* ─── 128-bit UUIDs ─────────────────────────────────────────────────────────── */
/*
 * BT_UUID_128_ENCODE takes the five UUID fields in MSB-first order and produces
 * a little-endian byte array as required by bt_uuid_128.
 *
 * Service:   12345678-1234-5678-1234-56789ABCDEF0
 * Focus:     12345678-1234-5678-1234-56789ABCDEF1
 * Notif:     12345678-1234-5678-1234-56789ABCDEF2
 * Battery:   12345678-1234-5678-1234-56789ABCDEF3
 */
#define ORBIT_SVC_UUID_VAL \
    BT_UUID_128_ENCODE(0x12345678, 0x1234, 0x5678, 0x1234, 0x56789ABCDEF0)

#define ORBIT_FOCUS_UUID_VAL \
    BT_UUID_128_ENCODE(0x12345678, 0x1234, 0x5678, 0x1234, 0x56789ABCDEF1)

#define ORBIT_NOTIF_UUID_VAL \
    BT_UUID_128_ENCODE(0x12345678, 0x1234, 0x5678, 0x1234, 0x56789ABCDEF2)

#define ORBIT_BATTERY_UUID_VAL \
    BT_UUID_128_ENCODE(0x12345678, 0x1234, 0x5678, 0x1234, 0x56789ABCDEF3)

static struct bt_uuid_128 orbit_svc_uuid     = BT_UUID_INIT_128(ORBIT_SVC_UUID_VAL);
static struct bt_uuid_128 orbit_focus_uuid   = BT_UUID_INIT_128(ORBIT_FOCUS_UUID_VAL);
static struct bt_uuid_128 orbit_notif_uuid   = BT_UUID_INIT_128(ORBIT_NOTIF_UUID_VAL);
static struct bt_uuid_128 orbit_battery_uuid = BT_UUID_INIT_128(ORBIT_BATTERY_UUID_VAL);

/* ─── State ─────────────────────────────────────────────────────────────────── */

static orbit_focus_cmd_cb_t s_focus_cb;
static orbit_notif_cb_t     s_notif_cb;

/* Latest values kept in-memory for Read responses */
static uint8_t s_focus_value   = CMD_FOCUS_STOP;   /* last known focus state    */
static uint8_t s_battery_level = 100U;             /* 0–100                     */

/* GATT notification subscription tracking */
static bool s_focus_subscribed   = false;
static bool s_battery_subscribed = false;

/* Active connection handle (single-peripheral, one central) */
static struct bt_conn *s_conn = NULL;

/* ─── GATT read handlers ─────────────────────────────────────────────────────── */

static ssize_t on_focus_read(struct bt_conn *conn,
                             const struct bt_gatt_attr *attr,
                             void *buf, uint16_t len, uint16_t offset)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    return bt_gatt_attr_read(conn, attr, buf, len, offset,
                             &s_focus_value, sizeof(s_focus_value));
}

static ssize_t on_battery_read(struct bt_conn *conn,
                               const struct bt_gatt_attr *attr,
                               void *buf, uint16_t len, uint16_t offset)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    return bt_gatt_attr_read(conn, attr, buf, len, offset,
                             &s_battery_level, sizeof(s_battery_level));
}

/* ─── GATT write handlers ────────────────────────────────────────────────────── */

/**
 * FOCUS_CHAR write — mobile app sends CMD_FOCUS_START / CMD_FOCUS_STOP / etc.
 */
static ssize_t on_focus_write(struct bt_conn *conn,
                              const struct bt_gatt_attr *attr,
                              const void *buf, uint16_t len,
                              uint16_t offset, uint8_t flags)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    ARG_UNUSED(flags);

    if (offset != 0 || len < 1) {
        LOG_WRN("focus_write: bad offset=%u len=%u", offset, len);
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
    }

    const uint8_t *data = buf;
    uint8_t cmd = data[0];

    LOG_INF("focus_write: cmd=0x%02x", cmd);
    s_focus_value = cmd;

    if (s_focus_cb != NULL) {
        s_focus_cb(cmd);
    }

    return (ssize_t)len;
}

/**
 * NOTIF_CHAR write-without-response — mobile app pushes notification packets.
 * Packet layout: [0]=pkt_type [1]=haptic_style [2-3]=payload_len(LE) [4..n]=label
 */
static ssize_t on_notif_write(struct bt_conn *conn,
                              const struct bt_gatt_attr *attr,
                              const void *buf, uint16_t len,
                              uint16_t offset, uint8_t flags)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    ARG_UNUSED(flags);

    /*
     * Hard reject any packet that does not fit within the strict wire bounds.
     * Both checks are performed BEFORE any field access so that a malformed or
     * oversized packet from an untrusted BLE central cannot cause an out-of-
     * bounds read or a label-buffer overflow in this handler.
     *
     * Invariants enforced:
     *   1. len >= NOTIF_OFF_LABEL   — packet carries all header fields.
     *   2. len <= NOTIF_PKT_MAX_SIZE — packet never exceeds max label size.
     *   3. payload_len_field strictly bounded to [0, NOTIF_MAX_LABEL_BYTES]
     *      using the minimum of the wire-declared length, the actually-arrived
     *      label bytes, and the compiled constant — in that order.
     *   4. memcpy destination is label[NOTIF_MAX_LABEL_BYTES+1]: the index
     *      payload_len can never exceed NOTIF_MAX_LABEL_BYTES, so the
     *      null-terminator write at label[payload_len] is always within bounds.
     */
    if (offset != 0 || len < NOTIF_OFF_LABEL) {
        LOG_WRN("notif_write: packet too short: %u bytes", len);
        return (ssize_t)len; /* WriteWithoutResponse — ignore silently */
    }

    if (len > NOTIF_PKT_MAX_SIZE) {
        LOG_WRN("notif_write: packet too large: %u bytes (max %u)",
                len, NOTIF_PKT_MAX_SIZE);
        return (ssize_t)len;
    }

    const uint8_t *pkt     = buf;
    uint8_t  pkt_type      = pkt[NOTIF_OFF_PKT_TYPE];
    uint8_t  haptic_style  = pkt[NOTIF_OFF_HAPTIC_STYL];

    /*
     * Read the wire-declared payload length from the two-byte LE field.
     * Then clamp it to the minimum of:
     *   (a) the number of label bytes that actually arrived in this ATT PDU,
     *   (b) the compiled maximum label constant NOTIF_MAX_LABEL_BYTES.
     * This triple-clamp prevents a crafted length field from causing a
     * read beyond the received buffer or an overflow of the label array.
     */
    uint16_t payload_len_field = (uint16_t)pkt[NOTIF_OFF_PAYLOAD_LEN] |
                                 ((uint16_t)pkt[NOTIF_OFF_PAYLOAD_LEN + 1U] << 8U);

    uint16_t actual_label_len = (uint16_t)(len - NOTIF_OFF_LABEL);

    /* Step 1: clamp wire-declared length to what actually arrived. */
    uint16_t payload_len = (payload_len_field < actual_label_len)
                            ? payload_len_field : actual_label_len;

    /* Step 2: hard-cap to the compiled constant — prevents any future path
     * where NOTIF_MAX_LABEL_BYTES changes independently of this function. */
    if (payload_len > NOTIF_MAX_LABEL_BYTES) {
        payload_len = NOTIF_MAX_LABEL_BYTES;
    }

    /* Build null-terminated label for the callback.
     * payload_len <= NOTIF_MAX_LABEL_BYTES, so label[payload_len] is valid. */
    char label[NOTIF_MAX_LABEL_BYTES + 1U];
    memcpy(label, &pkt[NOTIF_OFF_LABEL], payload_len);
    label[payload_len] = '\0';

    LOG_INF("notif_write: type=0x%02x style=0x%02x label='%s'",
            pkt_type, haptic_style, label);

    if (s_notif_cb != NULL) {
        s_notif_cb(pkt_type, haptic_style, label, payload_len);
    }

    return (ssize_t)len;
}

/* ─── CCC changed (subscription tracking) ───────────────────────────────────── */

static void on_focus_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    ARG_UNUSED(attr);
    s_focus_subscribed = (value == BT_GATT_CCC_NOTIFY);
    LOG_INF("focus notify %s", s_focus_subscribed ? "enabled" : "disabled");
}

static void on_battery_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    ARG_UNUSED(attr);
    s_battery_subscribed = (value == BT_GATT_CCC_NOTIFY);
    LOG_INF("battery notify %s", s_battery_subscribed ? "enabled" : "disabled");
}

/* ─── GATT service definition ────────────────────────────────────────────────── */

BT_GATT_SERVICE_DEFINE(orbit_svc,
    /* Primary service declaration */
    BT_GATT_PRIMARY_SERVICE(&orbit_svc_uuid),

    /* FOCUS_CHAR — Read | Notify | Write */
    BT_GATT_CHARACTERISTIC(&orbit_focus_uuid.uuid,
                           BT_GATT_CHRC_READ | BT_GATT_CHRC_NOTIFY | BT_GATT_CHRC_WRITE,
                           BT_GATT_PERM_READ | BT_GATT_PERM_WRITE,
                           on_focus_read, on_focus_write, NULL),
    BT_GATT_CCC(on_focus_ccc_changed,
                BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),

    /* NOTIF_CHAR — WriteWithoutResponse */
    BT_GATT_CHARACTERISTIC(&orbit_notif_uuid.uuid,
                           BT_GATT_CHRC_WRITE_WITHOUT_RESP,
                           BT_GATT_PERM_WRITE,
                           NULL, on_notif_write, NULL),

    /* BATTERY_CHAR — Read | Notify */
    BT_GATT_CHARACTERISTIC(&orbit_battery_uuid.uuid,
                           BT_GATT_CHRC_READ | BT_GATT_CHRC_NOTIFY,
                           BT_GATT_PERM_READ,
                           on_battery_read, NULL, NULL),
    BT_GATT_CCC(on_battery_ccc_changed,
                BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);

/* ─── Connection callbacks (track active conn for notifications) ─────────────── */

static void on_connected(struct bt_conn *conn, uint8_t err)
{
    if (err) {
        LOG_ERR("BLE connect failed: %u", err);
        return;
    }
    s_conn = bt_conn_ref(conn);
    s_focus_subscribed   = false;
    s_battery_subscribed = false;
    LOG_INF("BLE connected");
}

static void on_disconnected(struct bt_conn *conn, uint8_t reason)
{
    ARG_UNUSED(reason);
    if (s_conn == conn) {
        bt_conn_unref(s_conn);
        s_conn               = NULL;
        s_focus_subscribed   = false;
        s_battery_subscribed = false;
    }
    LOG_INF("BLE disconnected (reason 0x%02x)", reason);
}

static void on_security_changed(struct bt_conn *conn, bt_security_t level,
                                enum bt_security_err err)
{
    ARG_UNUSED(conn);
    if (err) {
        LOG_ERR("Security update failed: level %u err %d", (unsigned)level, err);
    } else {
        LOG_INF("Security level: %u", (unsigned)level);
    }
}

BT_CONN_CB_DEFINE(orbit_conn_cb) = {
    .connected        = on_connected,
    .disconnected     = on_disconnected,
    .security_changed = on_security_changed,
};

/* ─── Public API ─────────────────────────────────────────────────────────────── */

int ble_orbit_service_init(orbit_focus_cmd_cb_t focus_cb,
                           orbit_notif_cb_t     notif_cb)
{
    s_focus_cb   = focus_cb;
    s_notif_cb   = notif_cb;
    s_focus_value   = CMD_FOCUS_STOP;
    s_battery_level = 100U;
    LOG_INF("Orbit BLE service initialised");
    return 0;
}

int ble_orbit_notify_focus(uint8_t command)
{
    if (!s_focus_subscribed || s_conn == NULL) {
        return -ENOTCONN;
    }

    s_focus_value = command;

    /* Locate the FOCUS_CHAR value attribute (index 1 in the service table) */
    const struct bt_gatt_attr *attr = &orbit_svc.attrs[2]; /* value attr after decl */
    int ret = bt_gatt_notify(s_conn, attr, &command, sizeof(command));
    if (ret) {
        LOG_ERR("focus notify failed: %d", ret);
    }
    return ret;
}

int ble_orbit_set_battery_level(uint8_t level)
{
    s_battery_level = MIN(level, 100U);

    if (!s_battery_subscribed || s_conn == NULL) {
        return -ENOTCONN;
    }

    /* Battery value attr is at index 7 (after svc decl, 2×focus attrs+CCC, notif, bat decl) */
    const struct bt_gatt_attr *attr = &orbit_svc.attrs[8];
    int ret = bt_gatt_notify(s_conn, attr, &s_battery_level, sizeof(s_battery_level));
    if (ret) {
        LOG_ERR("battery notify failed: %d", ret);
    }
    return ret;
}
