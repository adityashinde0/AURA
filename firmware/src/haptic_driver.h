/**
 * @file haptic_driver.h
 * @brief TI DRV2605L haptic driver — public API
 *
 * Controls the TI DRV2605L I2C haptic driver connected to a 170 Hz Linear
 * Resonant Actuator (LRA).  Exposes three named waveform sequences that map
 * directly onto the AURA notification packet haptic styles:
 *
 *   HAPTIC_EFFECT_FOCUS_START  — firm double-pulse confirming focus session open
 *   HAPTIC_EFFECT_MEETING      — sustained alert sequence for meeting notifications
 *   HAPTIC_EFFECT_NUDGE        — brief single-tap nudge
 *   HAPTIC_EFFECT_URGENT       — rapid triple-pulse for urgent alerts
 *   HAPTIC_EFFECT_ACK          — soft single click for button acknowledge
 *
 * I2C address: 0x5A (DRV2605L default, SDO tied LOW).
 * Bus speed: 400 kHz (configured in the board overlay).
 */

#ifndef HAPTIC_DRIVER_H
#define HAPTIC_DRIVER_H

#include <zephyr/kernel.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ─── DRV2605L register map (subset required) ───────────────────────────────── */
#define DRV2605L_REG_STATUS       0x00U
#define DRV2605L_REG_MODE         0x01U
#define DRV2605L_REG_RTP          0x02U
#define DRV2605L_REG_LIBRARY      0x03U
#define DRV2605L_REG_WAVESEQ1     0x04U
#define DRV2605L_REG_WAVESEQ2     0x05U
#define DRV2605L_REG_WAVESEQ3     0x06U
#define DRV2605L_REG_WAVESEQ4     0x07U
#define DRV2605L_REG_WAVESEQ5     0x08U
#define DRV2605L_REG_WAVESEQ6     0x09U
#define DRV2605L_REG_WAVESEQ7     0x0AU
#define DRV2605L_REG_WAVESEQ8     0x0BU
#define DRV2605L_REG_GO           0x0CU
#define DRV2605L_REG_CONTROL1     0x1BU
#define DRV2605L_REG_CONTROL3     0x1DU
#define DRV2605L_REG_LRARESON     0x20U  /* LRA resonance period */
#define DRV2605L_REG_FEEDBACK     0x1AU

/* MODE register values */
#define DRV2605L_MODE_INTERNAL_TRIG 0x00U
#define DRV2605L_MODE_PWM_ANALOG    0x02U
#define DRV2605L_MODE_STANDBY       0x40U

/* Library selection: 6 = LRA library */
#define DRV2605L_LIB_LRA          0x06U

/* Waveform sequence end-of-sequence marker */
#define DRV2605L_WAVESEQ_STOP     0x00U

/* GO bit */
#define DRV2605L_GO               0x01U

/* ─── Named haptic effects ──────────────────────────────────────────────────── */

typedef enum {
    HAPTIC_EFFECT_FOCUS_START = 0, /**< Double-pulse — focus session started.  */
    HAPTIC_EFFECT_MEETING,         /**< Sustained 3-pulse — meeting alert.     */
    HAPTIC_EFFECT_NUDGE,           /**< Brief single tap — nudge notification. */
    HAPTIC_EFFECT_URGENT,          /**< Rapid triple-pulse — urgent alert.     */
    HAPTIC_EFFECT_ACK,             /**< Soft click — button acknowledge.       */
} haptic_effect_t;

/* ─── Public API ────────────────────────────────────────────────────────────── */

/**
 * @brief Initialise and configure the DRV2605L for LRA operation.
 *
 * Brings the chip out of standby, selects the LRA library, and configures
 * the internal trigger mode ready for waveform playback.
 *
 * @return 0 on success, negative errno on I2C failure.
 */
int haptic_driver_init(void);

/**
 * @brief Play a named haptic effect.
 *
 * Loads the waveform sequence for @p effect into the DRV2605L WAVESEQ
 * registers and sets the GO bit.  The function returns immediately; the
 * chip plays the sequence autonomously.
 *
 * @param effect  Named effect to play.
 * @return 0 on success, negative errno on I2C failure or unknown effect.
 */
int haptic_play(haptic_effect_t effect);

/**
 * @brief Stop any currently playing waveform immediately.
 *
 * Clears the GO bit and puts the chip back to idle (not standby).
 *
 * @return 0 on success, negative errno on I2C failure.
 */
int haptic_stop(void);

/**
 * @brief Put the DRV2605L into standby mode (lowest power state).
 *
 * @return 0 on success, negative errno on I2C failure.
 */
int haptic_standby(void);

/**
 * @brief Wake the DRV2605L from standby.
 *
 * @return 0 on success, negative errno on I2C failure.
 */
int haptic_wake(void);

#ifdef __cplusplus
}
#endif

#endif /* HAPTIC_DRIVER_H */
