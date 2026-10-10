/**
 * @file ble_orbit_service.h
 * @brief AURA Orbit custom GATT service — public API
 *
 * Exposes the three AURA Orbit characteristics over BLE 5.4 Secure Connections:
 *
 *   FOCUS_CHAR    (Read | Notify | Write)      — focus state + button commands
 *   NOTIF_CHAR    (WriteWithoutResponse)        — inbound haptic notification packets
 *   BATTERY_CHAR  (Read | Notify)              — battery level 0–100
 *
 * UUID base: 12345678-1234-5678-1234-56789ABCDEF0
 */

#ifndef BLE_ORBIT_SERVICE_H
#define BLE_ORBIT_SERVICE_H

#include <zephyr/kernel.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/gatt.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ─── Wire constants — must stay in sync with mobile/src/services/BLEService.ts ─ */

/** Commands written by the mobile app to FOCUS_CHAR, or notified by Orbit. */
#define CMD_FOCUS_START    0x01U
#define CMD_FOCUS_STOP     0x02U
#define CMD_DISTRACTED     0x03U
#define CMD_UNDO           0x04U
#define EVT_SAFETY_TIMEOUT 0x10U

/** Notification packet offsets (NOTIF_CHAR write-without-response payload). */
#define NOTIF_OFF_PKT_TYPE    0U
#define NOTIF_OFF_HAPTIC_STYL 1U
#define NOTIF_OFF_PAYLOAD_LEN 2U   /* uint16 LE */
#define NOTIF_OFF_LABEL       4U
#define NOTIF_MAX_LABEL_BYTES 28U
#define NOTIF_PKT_MAX_SIZE    (NOTIF_OFF_LABEL + NOTIF_MAX_LABEL_BYTES)

/** Packet types */
#define NOTIF_TYPE_MEETING_ALERT 0x01U
#define NOTIF_TYPE_NUDGE         0x02U
#define NOTIF_TYPE_GENERIC       0x03U

/** Haptic style codes */
#define HAPTIC_STYLE_BRIEF     0x01U
#define HAPTIC_STYLE_SUSTAINED 0x02U
#define HAPTIC_STYLE_URGENT    0x03U

/* ─── Callback types ────────────────────────────────────────────────────────── */

/**
 * @brief Called when the mobile app writes a focus command to FOCUS_CHAR.
 *
 * @param command  One of CMD_FOCUS_START, CMD_FOCUS_STOP, CMD_DISTRACTED, CMD_UNDO.
 */
typedef void (*orbit_focus_cmd_cb_t)(uint8_t command);

/**
 * @brief Called when a valid notification packet is received on NOTIF_CHAR.
 *
 * @param pkt_type     Packet type (NOTIF_TYPE_*).
 * @param haptic_style Haptic style (HAPTIC_STYLE_*).
 * @param label        Null-terminated UTF-8 label (max NOTIF_MAX_LABEL_BYTES).
 * @param label_len    Number of valid bytes in @p label.
 */
typedef void (*orbit_notif_cb_t)(uint8_t pkt_type, uint8_t haptic_style,
                                 const char *label, uint16_t label_len);

/* ─── Public API ────────────────────────────────────────────────────────────── */

/**
 * @brief Initialise the Orbit GATT service and register application callbacks.
 *
 * Must be called once before BLE advertising starts.
 *
 * @param focus_cb  Callback invoked on FOCUS_CHAR write (may be NULL).
 * @param notif_cb  Callback invoked on NOTIF_CHAR write (may be NULL).
 * @return 0 on success, negative errno on failure.
 */
int ble_orbit_service_init(orbit_focus_cmd_cb_t focus_cb,
                           orbit_notif_cb_t     notif_cb);

/**
 * @brief Send a focus command notification to the connected mobile app.
 *
 * Triggers a GATT notification on FOCUS_CHAR.  No-op if the central has not
 * subscribed or no connection is active.
 *
 * @param command  One of CMD_FOCUS_START … EVT_SAFETY_TIMEOUT.
 * @return 0 on success, -ENOTCONN if no subscriber, other negative errno.
 */
int ble_orbit_notify_focus(uint8_t command);

/**
 * @brief Update the battery level and optionally notify the connected central.
 *
 * @param level  Battery percentage, clamped to [0, 100].
 * @return 0 on success, -ENOTCONN if no subscriber, other negative errno.
 */
int ble_orbit_set_battery_level(uint8_t level);

#ifdef __cplusplus
}
#endif

#endif /* BLE_ORBIT_SERVICE_H */
