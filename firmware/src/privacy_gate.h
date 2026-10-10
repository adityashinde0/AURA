/**
 * @file privacy_gate.h
 * @brief AURA Orbit hardware privacy interlock — public API
 *
 * Enforces two immutable privacy rules:
 *
 *  1. HARDWARE AUTO-CUTOFF: The microphone P-FET gate is driven LOW automatically
 *     30 seconds after it was opened, regardless of application state.
 *
 *  2. ZERO AMBIENT STORAGE: No audio data is stored when the gate is closed.
 *     The gate may only be opened when an explicit focus session is active.
 *
 * The amber privacy LED ring mirrors the gate state in hardware: ON when the
 * microphone is powered, OFF otherwise.
 */

#ifndef PRIVACY_GATE_H
#define PRIVACY_GATE_H

#include <zephyr/kernel.h>
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Auto-cutoff timeout in milliseconds (30 seconds). */
#define PRIVACY_GATE_TIMEOUT_MS   30000U

/** Reason codes reported to the optional event callback. */
typedef enum {
    PRIVACY_GATE_EVT_OPENED     = 0,  /**< Gate opened — microphone powered on.   */
    PRIVACY_GATE_EVT_CLOSED     = 1,  /**< Gate closed — microphone powered off.  */
    PRIVACY_GATE_EVT_TIMEOUT    = 2,  /**< Gate auto-closed by 30-second watchdog. */
    PRIVACY_GATE_EVT_ERR_GPIO   = 3,  /**< GPIO assertion/de-assertion failed.    */
} privacy_gate_evt_t;

/**
 * @brief Privacy gate event callback.
 *
 * @param evt  Event type.
 */
typedef void (*privacy_gate_cb_t)(privacy_gate_evt_t evt);

/**
 * @brief Initialise the privacy gate subsystem.
 *
 * Configures GPIO_MIC_GATE and PRIVACY_LED as outputs.
 * Drives both LOW (safe default — microphone off, LED off).
 * Registers the 30-second auto-cutoff watchdog timer.
 *
 * @param cb  Optional event callback; may be NULL.
 * @return 0 on success, negative errno on GPIO failure.
 */
int privacy_gate_init(privacy_gate_cb_t cb);

/**
 * @brief Open the microphone gate (power the microphone on).
 *
 * Drives GPIO_MIC_GATE HIGH and lights the amber privacy LED.
 * Resets the 30-second auto-cutoff timer.
 *
 * @return 0 on success, negative errno on GPIO failure.
 */
int privacy_gate_open(void);

/**
 * @brief Close the microphone gate (power the microphone off).
 *
 * Drives GPIO_MIC_GATE LOW and extinguishes the amber privacy LED.
 * Cancels the auto-cutoff timer.
 *
 * @return 0 on success, negative errno on GPIO failure.
 */
int privacy_gate_close(void);

/**
 * @brief Query whether the microphone gate is currently open.
 *
 * @return true if the gate is open (microphone powered), false otherwise.
 */
bool privacy_gate_is_open(void);

#ifdef __cplusplus
}
#endif

#endif /* PRIVACY_GATE_H */
