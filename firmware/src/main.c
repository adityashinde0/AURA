/**
 * @file main.c
 * @brief AURA Orbit — system entry point
 *
 * Responsibilities:
 *   1. Initialise all subsystems (privacy gate, haptic driver, BLE service).
 *   2. Start BLE advertising with the Orbit service UUID in the AD payload.
 *   3. Run the tactile crescent button state machine:
 *        - Single click (< 400 ms hold, no prior click within 300 ms)
 *              → CMD_ACK: acknowledge / dismiss current notification.
 *        - Double click (second press within 300 ms of first release)
 *              → CMD_DISTRACTED (0x03): log distraction over BLE.
 *        - Long press (≥ 2000 ms hold)
 *              → CMD_FOCUS_START (0x01) + HAPTIC_EFFECT_FOCUS_START
 *                + open privacy gate.
 *   4. Handle incoming BLE focus commands from the mobile app.
 *   5. Handle incoming BLE notification packets (haptic playback).
 *   6. Put the CPU into low-power sleep between events.
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/pm/pm.h>
#include <zephyr/logging/log.h>

#include "ble_orbit_service.h"
#include "privacy_gate.h"
#include "haptic_driver.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

/* ─── Button GPIO ─────────────────────────────────────────────────────────────── */

#define BTN_NODE DT_ALIAS(int_btn)
static const struct gpio_dt_spec s_btn = GPIO_DT_SPEC_GET(BTN_NODE, gpios);
static struct gpio_callback       s_btn_cb_data;

/* ─── Button state machine ───────────────────────────────────────────────────── */

/*
 * Timing constants (milliseconds)
 *   LONG_PRESS_MS         — hold time required to trigger CMD_FOCUS_START
 *   DOUBLE_CLICK_MS       — maximum inter-click gap to count as a double-click
 *   DEBOUNCE_MS           — debounce window; ignore edges within this window
 *   BTN_ISR_FLOOD_LIMIT   — maximum ISR invocations allowed within
 *                           BTN_ISR_FLOOD_WINDOW_MS before the interrupt
 *                           handler is silenced (switch bounce / attack guard)
 *   BTN_ISR_FLOOD_WINDOW_MS — rolling window for the flood counter (ms)
 */
#define LONG_PRESS_MS           2000U
#define DOUBLE_CLICK_MS          300U
#define DEBOUNCE_MS               20U
#define BTN_ISR_FLOOD_LIMIT        8U   /* max edges per window                */
#define BTN_ISR_FLOOD_WINDOW_MS  200U   /* rolling window length (ms)          */

typedef enum {
    BTN_STATE_IDLE = 0,
    BTN_STATE_PRESSED,       /* Button is held down                          */
    BTN_STATE_FIRST_RELEASE, /* Waiting to see if a second press follows     */
} btn_state_t;

static volatile btn_state_t s_btn_state         = BTN_STATE_IDLE;
static int64_t              s_press_start_ms     = 0;
static int64_t              s_first_release_ms   = 0;
static bool                 s_long_press_handled = false;

/* ── ISR flood / bounce guard ──────────────────────────────────────────────
 * Tracks the number of GPIO edge interrupts inside a rolling window of
 * BTN_ISR_FLOOD_WINDOW_MS milliseconds.  If the count exceeds
 * BTN_ISR_FLOOD_LIMIT the interrupt handler discards additional edges until
 * the window has expired.  This prevents a malfunctioning or deliberately
 * chattering switch from spinning the CPU or injecting spurious commands.
 */
static int64_t s_flood_window_start_ms = 0;
static uint8_t s_flood_edge_count      = 0U;

/* Forward declarations */
static void btn_pressed_handler(const struct device *dev,
                                struct gpio_callback *cb, uint32_t pins);
static void long_press_work_handler(struct k_work *work);
static void double_click_expire_work_handler(struct k_work *work);

K_WORK_DELAYABLE_DEFINE(s_long_press_work,        long_press_work_handler);
K_WORK_DELAYABLE_DEFINE(s_double_click_expire_work, double_click_expire_work_handler);

/* ─── BLE advertising payload ────────────────────────────────────────────────── */

/*
 * Advertise with:
 *   - Flags (LE General Discoverable, BR/EDR not supported)
 *   - 128-bit service UUID so iOS/Android can filter by UUID before connecting
 *   - Device name in the scan response (keeps the AD payload compact)
 */
#define ORBIT_SVC_UUID_VAL \
    BT_UUID_128_ENCODE(0x12345678, 0x1234, 0x5678, 0x1234, 0x56789ABCDEF0)

static const struct bt_data s_ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA_BYTES(BT_DATA_UUID128_ALL, ORBIT_SVC_UUID_VAL),
};

static const struct bt_data s_sd[] = {
    BT_DATA(BT_DATA_NAME_COMPLETE,
            CONFIG_BT_DEVICE_NAME,
            sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

/* ─── Focus state ────────────────────────────────────────────────────────────── */

static bool s_focus_active = false;

/* ─── Privacy gate event handler ─────────────────────────────────────────────── */

static void on_privacy_gate_event(privacy_gate_evt_t evt)
{
    if (evt == PRIVACY_GATE_EVT_TIMEOUT) {
        LOG_WRN("Privacy auto-cutoff — notifying mobile app");
        /* Notify the mobile app so it can stop the session cleanly */
        (void)ble_orbit_notify_focus(EVT_SAFETY_TIMEOUT);
        s_focus_active = false;
    }
}

/* ─── BLE focus command handler (from mobile app) ────────────────────────────── */

static void on_focus_cmd(uint8_t command)
{
    LOG_INF("focus cmd: 0x%02x", command);

    switch (command) {
    case CMD_FOCUS_START:
        s_focus_active = true;
        (void)privacy_gate_open();
        (void)haptic_play(HAPTIC_EFFECT_FOCUS_START);
        break;

    case CMD_FOCUS_STOP:
        s_focus_active = false;
        (void)privacy_gate_close();
        (void)haptic_play(HAPTIC_EFFECT_ACK);
        break;

    case CMD_DISTRACTED:
        (void)haptic_play(HAPTIC_EFFECT_NUDGE);
        break;

    case CMD_UNDO:
        (void)haptic_play(HAPTIC_EFFECT_ACK);
        break;

    default:
        LOG_WRN("focus cmd: unknown command 0x%02x", command);
        break;
    }
}

/* ─── BLE notification packet handler (from mobile app) ──────────────────────── */

static void on_notif_packet(uint8_t pkt_type, uint8_t haptic_style,
                            const char *label, uint16_t label_len)
{
    ARG_UNUSED(label);
    ARG_UNUSED(label_len);

    haptic_effect_t effect;

    switch (haptic_style) {
    case HAPTIC_STYLE_BRIEF:
        effect = HAPTIC_EFFECT_NUDGE;
        break;
    case HAPTIC_STYLE_SUSTAINED:
        effect = HAPTIC_EFFECT_MEETING;
        break;
    case HAPTIC_STYLE_URGENT:
        effect = HAPTIC_EFFECT_URGENT;
        break;
    default:
        /* Unknown style — use nudge as a safe default */
        effect = HAPTIC_EFFECT_NUDGE;
        break;
    }

    /* Meeting alert overrides style selection for the sustained waveform */
    if (pkt_type == NOTIF_TYPE_MEETING_ALERT) {
        effect = HAPTIC_EFFECT_MEETING;
    }

    (void)haptic_play(effect);
}

/* ─── Button state machine implementation ────────────────────────────────────── */

/**
 * Long-press watchdog — fires LONG_PRESS_MS after button-press if still held.
 */
static void long_press_work_handler(struct k_work *work)
{
    ARG_UNUSED(work);

    /* Verify the button is still physically held */
    if (gpio_pin_get_dt(&s_btn) != 1) {
        return; /* Released before timer fired — not a long press */
    }

    if (s_long_press_handled) {
        return; /* Already dispatched */
    }
    s_long_press_handled = true;

    LOG_INF("Button: LONG PRESS → CMD_FOCUS_START");

    s_focus_active = true;
    (void)privacy_gate_open();
    (void)haptic_play(HAPTIC_EFFECT_FOCUS_START);
    (void)ble_orbit_notify_focus(CMD_FOCUS_START);
}

/**
 * Double-click expiry — fires DOUBLE_CLICK_MS after first release if no second
 * press has arrived, promoting the first click to a single-click.
 */
static void double_click_expire_work_handler(struct k_work *work)
{
    ARG_UNUSED(work);

    if (s_btn_state != BTN_STATE_FIRST_RELEASE) {
        return;
    }

    LOG_INF("Button: SINGLE CLICK → ACK/dismiss");
    s_btn_state = BTN_STATE_IDLE;

    /* Acknowledge notification — brief haptic feedback */
    (void)haptic_play(HAPTIC_EFFECT_ACK);
    /* No BLE notification for a simple dismiss; the mobile app drives focus state */
}

/**
 * GPIO interrupt handler — called on both edges (press and release).
 */
static void btn_pressed_handler(const struct device *dev,
                                struct gpio_callback *cb, uint32_t pins)
{
    ARG_UNUSED(dev);
    ARG_UNUSED(cb);
    ARG_UNUSED(pins);

    int level = gpio_pin_get_dt(&s_btn);
    int64_t now = k_uptime_get();

    /* ── Flood / bounce guard ───────────────────────────────────────────── */
    if ((now - s_flood_window_start_ms) >= (int64_t)BTN_ISR_FLOOD_WINDOW_MS) {
        /* Start a fresh rolling window. */
        s_flood_window_start_ms = now;
        s_flood_edge_count      = 0U;
    }
    s_flood_edge_count++;
    if (s_flood_edge_count > BTN_ISR_FLOOD_LIMIT) {
        LOG_WRN("btn_isr: edge flood detected (%u edges in %u ms) — edge discarded",
                s_flood_edge_count, BTN_ISR_FLOOD_WINDOW_MS);
        return;
    }

    if (level == 1) {
        /* ── PRESS ─────────────────────────────────────────────────────── */

        /* Debounce: ignore glitches within DEBOUNCE_MS of last release */
        if ((s_btn_state == BTN_STATE_FIRST_RELEASE) &&
            ((now - s_first_release_ms) < (int64_t)DEBOUNCE_MS)) {
            return;
        }
        /* Debounce: ignore double-trigger on press */
        if ((s_btn_state == BTN_STATE_PRESSED) &&
            ((now - s_press_start_ms) < (int64_t)DEBOUNCE_MS)) {
            return;
        }

        if (s_btn_state == BTN_STATE_FIRST_RELEASE) {
            /* ── DOUBLE CLICK detected ─────────────────────────────────── */
            k_work_cancel_delayable(&s_double_click_expire_work);
            s_btn_state = BTN_STATE_IDLE;

            LOG_INF("Button: DOUBLE CLICK → CMD_DISTRACTED");
            (void)haptic_play(HAPTIC_EFFECT_NUDGE);
            (void)ble_orbit_notify_focus(CMD_DISTRACTED);
        } else {
            /* ── First press ───────────────────────────────────────────── */
            s_btn_state          = BTN_STATE_PRESSED;
            s_press_start_ms     = now;
            s_long_press_handled = false;

            /* Arm the long-press watchdog */
            k_work_schedule(&s_long_press_work, K_MSEC(LONG_PRESS_MS));
        }

    } else {
        /* ── RELEASE ───────────────────────────────────────────────────── */

        if (s_btn_state != BTN_STATE_PRESSED) {
            return; /* Spurious release */
        }

        /* Cancel the long-press timer */
        k_work_cancel_delayable(&s_long_press_work);

        int64_t hold_ms = now - s_press_start_ms;
        s_first_release_ms = now;

        if (s_long_press_handled) {
            /* Long press already dispatched — return to idle silently */
            s_btn_state = BTN_STATE_IDLE;
        } else if (hold_ms >= (int64_t)LONG_PRESS_MS) {
            /* Edge case: very precise release exactly at threshold */
            s_btn_state          = BTN_STATE_IDLE;
            s_long_press_handled = true;
            LOG_INF("Button: LONG PRESS (release boundary) → CMD_FOCUS_START");
            s_focus_active = true;
            (void)privacy_gate_open();
            (void)haptic_play(HAPTIC_EFFECT_FOCUS_START);
            (void)ble_orbit_notify_focus(CMD_FOCUS_START);
        } else {
            /* Short press — wait for potential double-click */
            s_btn_state = BTN_STATE_FIRST_RELEASE;
            k_work_schedule(&s_double_click_expire_work, K_MSEC(DOUBLE_CLICK_MS));
        }
    }
}

/* ─── BLE advertising start ──────────────────────────────────────────────────── */

static void start_advertising(void)
{
    int ret = bt_le_adv_start(
        BT_LE_ADV_CONN,
        s_ad, ARRAY_SIZE(s_ad),
        s_sd, ARRAY_SIZE(s_sd)
    );
    if (ret && ret != -EALREADY) {
        LOG_ERR("Advertising start failed: %d", ret);
    } else {
        LOG_INF("BLE advertising started");
    }
}

/* Re-start advertising after disconnection */
static void on_bt_disconnected_adv(struct bt_conn *conn, uint8_t reason)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(reason);
    start_advertising();
}

BT_CONN_CB_DEFINE(main_conn_cb) = {
    .disconnected = on_bt_disconnected_adv,
};

/* ─── Pairing / authentication callbacks ──────────────────────────────────────── */

static void auth_passkey_display(struct bt_conn *conn, unsigned int passkey)
{
    ARG_UNUSED(conn);
    LOG_INF("Passkey: %06u", passkey);
}

static void auth_cancel(struct bt_conn *conn)
{
    ARG_UNUSED(conn);
    LOG_WRN("Pairing cancelled");
}

static const struct bt_conn_auth_cb s_auth_cb = {
    .passkey_display = auth_passkey_display,
    .cancel          = auth_cancel,
};

/* ─── main() ─────────────────────────────────────────────────────────────────── */

int main(void)
{
    int ret;

    LOG_INF("AURA Orbit booting...");

    /* 1. Privacy gate — must come first; boots with mic OFF */
    ret = privacy_gate_init(on_privacy_gate_event);
    if (ret) {
        LOG_ERR("privacy_gate_init failed: %d", ret);
        return ret;
    }

    /* 2. Haptic driver */
    ret = haptic_driver_init();
    if (ret) {
        LOG_ERR("haptic_driver_init failed: %d", ret);
        return ret;
    }

    /* 3. Button GPIO — configure interrupt on both edges */
    if (!gpio_is_ready_dt(&s_btn)) {
        LOG_ERR("Button GPIO not ready");
        return -ENODEV;
    }
    ret = gpio_pin_configure_dt(&s_btn, GPIO_INPUT);
    if (ret) {
        LOG_ERR("Button configure failed: %d", ret);
        return ret;
    }
    ret = gpio_pin_interrupt_configure_dt(&s_btn, GPIO_INT_EDGE_BOTH);
    if (ret) {
        LOG_ERR("Button interrupt configure failed: %d", ret);
        return ret;
    }
    gpio_init_callback(&s_btn_cb_data, btn_pressed_handler, BIT(s_btn.pin));
    gpio_add_callback(s_btn.port, &s_btn_cb_data);
    LOG_INF("Button GPIO configured");

    /* 4. Bluetooth */
    ret = bt_enable(NULL);
    if (ret) {
        LOG_ERR("bt_enable failed: %d", ret);
        return ret;
    }

    ret = bt_conn_auth_cb_register(&s_auth_cb);
    if (ret) {
        LOG_ERR("bt_conn_auth_cb_register failed: %d", ret);
        return ret;
    }

    /* 5. GATT Orbit service */
    ret = ble_orbit_service_init(on_focus_cmd, on_notif_packet);
    if (ret) {
        LOG_ERR("ble_orbit_service_init failed: %d", ret);
        return ret;
    }

    /* 6. Start advertising */
    start_advertising();

    /* 7. Boot haptic — single ACK pulse to confirm successful init */
    (void)haptic_play(HAPTIC_EFFECT_ACK);

    LOG_INF("AURA Orbit ready");

    /*
     * Main loop — all work is event-driven via GPIO interrupts and BLE
     * callbacks submitted to the system workqueue.  Put the CPU to sleep
     * between events using Zephyr's power management idle entry.
     */
    while (1) {
        k_sleep(K_FOREVER);
    }

    return 0;
}
