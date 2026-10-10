/**
 * @file privacy_gate.c
 * @brief AURA Orbit hardware privacy interlock implementation
 *
 * Hardware connections (defined in the board overlay):
 *   mic-gate    alias → GPIO0.28, active-high P-FET gate
 *   privacy-led alias → GPIO0.29, active-high amber LED ring
 *
 * Safety invariants:
 *   - Both outputs boot LOW (microphone off, LED off).
 *   - A k_work_delayable watchdog fires at +30 s after any gate-open and
 *     drives both outputs LOW regardless of application state.
 *   - privacy_gate_close() cancels the watchdog before driving LOW, so
 *     an explicit close does not race with the timer callback.
 */

#include "privacy_gate.h"

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(privacy_gate, LOG_LEVEL_INF);

/* ─── Devicetree alias nodes ─────────────────────────────────────────────────── */

#define MIC_GATE_NODE    DT_ALIAS(mic_gate)
#define PRIVACY_LED_NODE DT_ALIAS(privacy_led)

static const struct gpio_dt_spec s_mic_gate =
    GPIO_DT_SPEC_GET(MIC_GATE_NODE, gpios);

static const struct gpio_dt_spec s_privacy_led =
    GPIO_DT_SPEC_GET(PRIVACY_LED_NODE, gpios);

/* ─── State ─────────────────────────────────────────────────────────────────── */

static privacy_gate_cb_t s_cb        = NULL;
static bool              s_gate_open = false;

/* ─── Auto-cutoff workqueue item ─────────────────────────────────────────────── */

static void autocutoff_work_handler(struct k_work *work);

K_WORK_DELAYABLE_DEFINE(s_cutoff_work, autocutoff_work_handler);

static void autocutoff_work_handler(struct k_work *work)
{
    ARG_UNUSED(work);

    if (!s_gate_open) {
        return; /* Already closed — nothing to do. */
    }

    LOG_WRN("Privacy auto-cutoff: closing mic gate after %u ms",
            PRIVACY_GATE_TIMEOUT_MS);

    /* Drive outputs LOW directly (bypass privacy_gate_close to avoid timer
     * cancel race — the timer IS the caller here). */
    gpio_pin_set_dt(&s_mic_gate, 0);
    gpio_pin_set_dt(&s_privacy_led, 0);
    s_gate_open = false;

    if (s_cb != NULL) {
        s_cb(PRIVACY_GATE_EVT_TIMEOUT);
    }
}

/* ─── Public API ─────────────────────────────────────────────────────────────── */

int privacy_gate_init(privacy_gate_cb_t cb)
{
    int ret;

    s_cb        = cb;
    s_gate_open = false;

    /* Validate that both GPIO devices are ready */
    if (!gpio_is_ready_dt(&s_mic_gate)) {
        LOG_ERR("mic-gate GPIO not ready");
        return -ENODEV;
    }
    if (!gpio_is_ready_dt(&s_privacy_led)) {
        LOG_ERR("privacy-led GPIO not ready");
        return -ENODEV;
    }

    /* Configure as outputs, default LOW */
    ret = gpio_pin_configure_dt(&s_mic_gate, GPIO_OUTPUT_INACTIVE);
    if (ret) {
        LOG_ERR("mic-gate configure failed: %d", ret);
        return ret;
    }

    ret = gpio_pin_configure_dt(&s_privacy_led, GPIO_OUTPUT_INACTIVE);
    if (ret) {
        LOG_ERR("privacy-led configure failed: %d", ret);
        return ret;
    }

    LOG_INF("Privacy gate initialised — mic OFF, LED OFF");
    return 0;
}

int privacy_gate_open(void)
{
    int ret;

    /* Cancel any pending cutoff before re-arming to avoid double-fire */
    k_work_cancel_delayable(&s_cutoff_work);

    ret = gpio_pin_set_dt(&s_mic_gate, 1);
    if (ret) {
        LOG_ERR("mic-gate set HIGH failed: %d", ret);
        if (s_cb != NULL) {
            s_cb(PRIVACY_GATE_EVT_ERR_GPIO);
        }
        return ret;
    }

    ret = gpio_pin_set_dt(&s_privacy_led, 1);
    if (ret) {
        /* LED failed — close mic gate to maintain fail-safe state */
        gpio_pin_set_dt(&s_mic_gate, 0);
        LOG_ERR("privacy-led set HIGH failed: %d", ret);
        if (s_cb != NULL) {
            s_cb(PRIVACY_GATE_EVT_ERR_GPIO);
        }
        return ret;
    }

    s_gate_open = true;

    /*
     * Arm the 30-second auto-cutoff watchdog.
     *
     * Fail-closed invariant: if the workqueue is not in a state that allows
     * scheduling (k_work_schedule returns 0 on success, negative on failure),
     * we MUST immediately drive the GPIO LOW rather than leaving the microphone
     * live with no watchdog. An armed-but-unscheduled gate is a privacy breach.
     */
    ret = k_work_schedule(&s_cutoff_work, K_MSEC(PRIVACY_GATE_TIMEOUT_MS));
    if (ret < 0) {
        LOG_ERR("privacy_gate_open: failed to arm watchdog (%d) — forcing mic OFF (fail-closed)", ret);
        gpio_pin_set_dt(&s_mic_gate, 0);
        gpio_pin_set_dt(&s_privacy_led, 0);
        s_gate_open = false;
        if (s_cb != NULL) {
            s_cb(PRIVACY_GATE_EVT_ERR_GPIO);
        }
        return ret;
    }

    LOG_INF("Privacy gate OPEN — mic ON, LED ON, watchdog armed (%u ms)",
            PRIVACY_GATE_TIMEOUT_MS);

    if (s_cb != NULL) {
        s_cb(PRIVACY_GATE_EVT_OPENED);
    }
    return 0;
}

int privacy_gate_close(void)
{
    /* Cancel watchdog before driving outputs to avoid a spurious TIMEOUT event */
    k_work_cancel_delayable(&s_cutoff_work);

    int ret = gpio_pin_set_dt(&s_mic_gate, 0);
    if (ret) {
        LOG_ERR("mic-gate set LOW failed: %d", ret);
        if (s_cb != NULL) {
            s_cb(PRIVACY_GATE_EVT_ERR_GPIO);
        }
        return ret;
    }

    ret = gpio_pin_set_dt(&s_privacy_led, 0);
    if (ret) {
        LOG_ERR("privacy-led set LOW failed: %d", ret);
        if (s_cb != NULL) {
            s_cb(PRIVACY_GATE_EVT_ERR_GPIO);
        }
        return ret;
    }

    s_gate_open = false;

    LOG_INF("Privacy gate CLOSED — mic OFF, LED OFF");

    if (s_cb != NULL) {
        s_cb(PRIVACY_GATE_EVT_CLOSED);
    }
    return 0;
}

bool privacy_gate_is_open(void)
{
    return s_gate_open;
}
