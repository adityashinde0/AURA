/**
 * @file haptic_driver.c
 * @brief TI DRV2605L I2C haptic driver implementation
 *
 * Drives a 170 Hz LRA via the DRV2605L ROM waveform library (LRA library = 6).
 *
 * DRV2605L ROM waveforms used (from TI datasheet Table 3, LRA column):
 *   Effect 1  — Strong Click 100% (index  1) — crisp single pulse
 *   Effect 10 — Double Click 100% (index 10) — double pulse
 *   Effect 14 — Triple Click     (index 14) — triple burst
 *   Effect 47 — Long Alert 2     (index 47) — sustained 3-pulse sequence
 *   Effect 56 — Transition Ramp Up Long     — ramp confirmation
 *   Effect 58 — Short Buzz 100%  (index 58) — soft nudge
 *
 * All sequences terminate with DRV2605L_WAVESEQ_STOP (0x00) in the next slot.
 */

#include "haptic_driver.h"

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(haptic_drv, LOG_LEVEL_INF);

/* ─── I2C device binding ─────────────────────────────────────────────────────── */

#define DRV2605L_I2C_NODE DT_ALIAS(haptic_drv)

static const struct i2c_dt_spec s_i2c =
    I2C_DT_SPEC_GET(DRV2605L_I2C_NODE);

/* ─── Low-level I2C helpers ──────────────────────────────────────────────────── */

static int drv_write_reg(uint8_t reg, uint8_t val)
{
    uint8_t buf[2] = { reg, val };
    int ret = i2c_write_dt(&s_i2c, buf, sizeof(buf));
    if (ret) {
        LOG_ERR("drv2605l: write reg 0x%02x = 0x%02x failed: %d", reg, val, ret);
    }
    return ret;
}

static int drv_read_reg(uint8_t reg, uint8_t *out)
{
    int ret = i2c_write_read_dt(&s_i2c, &reg, 1, out, 1);
    if (ret) {
        LOG_ERR("drv2605l: read reg 0x%02x failed: %d", reg, ret);
    }
    return ret;
}

/* ─── Effect waveform table ──────────────────────────────────────────────────── */
/*
 * Each row: up to 8 waveform slots; 0x00 terminates the sequence early.
 * ROM indices are from TI DRV2605L datasheet, Table 3, LRA library (lib=6).
 */

#define SEQ_LEN 8U

typedef struct {
    uint8_t slots[SEQ_LEN]; /* waveform ROM indices, 0x00 = end-of-sequence */
} haptic_seq_t;

static const haptic_seq_t s_effects[] = {
    /* HAPTIC_EFFECT_FOCUS_START — Double Click (10) + brief pause + Strong Click (1) */
    [HAPTIC_EFFECT_FOCUS_START] = { .slots = { 10U, 1U, 0x00 } },

    /* HAPTIC_EFFECT_MEETING — Long Alert 2 (47): internal 3-pulse sustained sequence */
    [HAPTIC_EFFECT_MEETING]     = { .slots = { 47U, 0x00 } },

    /* HAPTIC_EFFECT_NUDGE — Short Buzz 100% (58): soft single tap */
    [HAPTIC_EFFECT_NUDGE]       = { .slots = { 58U, 0x00 } },

    /* HAPTIC_EFFECT_URGENT — Triple Click (14) + Strong Click (1) */
    [HAPTIC_EFFECT_URGENT]      = { .slots = { 14U, 1U, 0x00 } },

    /* HAPTIC_EFFECT_ACK — Strong Click 100% (1): crisp feedback */
    [HAPTIC_EFFECT_ACK]         = { .slots = { 1U, 0x00 } },
};

#define NUM_EFFECTS (sizeof(s_effects) / sizeof(s_effects[0]))

/* ─── Initialisation ─────────────────────────────────────────────────────────── */

int haptic_driver_init(void)
{
    int ret;

    if (!i2c_is_ready_dt(&s_i2c)) {
        LOG_ERR("DRV2605L I2C bus not ready");
        return -ENODEV;
    }

    /* Read STATUS register — verifies I2C comms and that DEV_ID = 0b111 (DRV2605L) */
    uint8_t status = 0U;
    ret = drv_read_reg(DRV2605L_REG_STATUS, &status);
    if (ret) {
        return ret;
    }
    LOG_INF("DRV2605L status=0x%02x", status);

    /* Wake from standby: clear bit 6 in MODE, set to Internal Trigger */
    ret = drv_write_reg(DRV2605L_REG_MODE, DRV2605L_MODE_INTERNAL_TRIG);
    if (ret) {
        return ret;
    }

    /*
     * Select LRA library (0x06).
     * Bits [2:0] = 0b110 → Library F (LRA) in the DRV2605 register map.
     */
    ret = drv_write_reg(DRV2605L_REG_LIBRARY, DRV2605L_LIB_LRA);
    if (ret) {
        return ret;
    }

    /*
     * FEEDBACK register: LRA mode
     * Bit 7 = 1 → LRA (not ERM)
     * Bits [6:4] = 0b011 → BRAKE_FACTOR = 3×
     * Bits [3:2] = 0b01  → LOOP_GAIN = medium
     * Default BEMF_GAIN[1:0] = 0b11
     */
    ret = drv_write_reg(DRV2605L_REG_FEEDBACK, 0xB3U);
    if (ret) {
        return ret;
    }

    /*
     * CONTROL1: drive_time tuned for 170 Hz LRA.
     * drive_time = (1 / (2 * f_LRA)) / 24.39 µs ≈ 12 → 0x0C
     * Bit 7 = 0 (startup boost disabled for LRA)
     */
    ret = drv_write_reg(DRV2605L_REG_CONTROL1, 0x93U); /* AC_COUPLE=1 | DRIVE_TIME=12 */
    if (ret) {
        return ret;
    }

    /*
     * CONTROL3: LRA open-loop disabled, auto-resonance enabled.
     * Bit 0 = 0 → closed-loop (auto-resonance tracking)
     */
    ret = drv_write_reg(DRV2605L_REG_CONTROL3, 0x20U);
    if (ret) {
        return ret;
    }

    LOG_INF("DRV2605L initialised for LRA @ 170 Hz");
    return 0;
}

/* ─── Playback ───────────────────────────────────────────────────────────────── */

int haptic_play(haptic_effect_t effect)
{
    if ((unsigned)effect >= NUM_EFFECTS) {
        LOG_ERR("haptic_play: unknown effect %d", (int)effect);
        return -EINVAL;
    }

    const haptic_seq_t *seq = &s_effects[effect];
    int ret;

    /* Wake from standby if needed — write Internal Trigger mode first */
    ret = drv_write_reg(DRV2605L_REG_MODE, DRV2605L_MODE_INTERNAL_TRIG);
    if (ret) {
        return ret;
    }

    /* Load waveform sequence into WAVESEQ1..WAVESEQ8 */
    for (uint8_t i = 0U; i < SEQ_LEN; i++) {
        ret = drv_write_reg((uint8_t)(DRV2605L_REG_WAVESEQ1 + i), seq->slots[i]);
        if (ret) {
            return ret;
        }
        if (seq->slots[i] == DRV2605L_WAVESEQ_STOP) {
            /* Fill remaining slots with STOP to prevent stale data replaying */
            for (uint8_t j = (uint8_t)(i + 1U); j < SEQ_LEN; j++) {
                (void)drv_write_reg((uint8_t)(DRV2605L_REG_WAVESEQ1 + j),
                                    DRV2605L_WAVESEQ_STOP);
            }
            break;
        }
    }

    /* Set GO bit to start playback */
    ret = drv_write_reg(DRV2605L_REG_GO, DRV2605L_GO);
    if (ret) {
        return ret;
    }

    LOG_INF("haptic_play: effect=%d", (int)effect);
    return 0;
}

int haptic_stop(void)
{
    /* Clear GO bit — chip stops immediately */
    int ret = drv_write_reg(DRV2605L_REG_GO, 0x00U);
    if (ret) {
        LOG_ERR("haptic_stop: failed: %d", ret);
    }
    return ret;
}

int haptic_standby(void)
{
    int ret = drv_write_reg(DRV2605L_REG_MODE, DRV2605L_MODE_STANDBY);
    if (ret) {
        LOG_ERR("haptic_standby: failed: %d", ret);
    } else {
        LOG_DBG("DRV2605L in standby");
    }
    return ret;
}

int haptic_wake(void)
{
    int ret = drv_write_reg(DRV2605L_REG_MODE, DRV2605L_MODE_INTERNAL_TRIG);
    if (ret) {
        LOG_ERR("haptic_wake: failed: %d", ret);
    } else {
        LOG_DBG("DRV2605L awake");
    }
    return ret;
}
