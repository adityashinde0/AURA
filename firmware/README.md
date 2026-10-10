# AURA Orbit Firmware

Production firmware for the **AURA Orbit** wearable, built on the
[Nordic nRF Connect SDK (NCS) v2.7.0](https://developer.nordicsemi.com/nRF_Connect_SDK/doc/2.7.0/nrf/index.html)
/ Zephyr RTOS targeting the **nRF5340 Application Core**.

---

## Hardware

| Component | Part | Interface |
|-----------|------|-----------|
| SoC | Nordic nRF5340 (Cortex-M33 dual-core) | — |
| Button | Tactile crescent dome switch | GPIO P0.11, active-low, pull-up |
| Mic gate | P-FET microphone power switch | GPIO P0.28, active-high |
| Privacy LED | Amber LED ring | GPIO P0.29, active-high |
| Haptic | TI DRV2605L driving 170 Hz LRA | I2C1, SDA=P1.02, SCL=P1.03, addr=0x5A |

---

## Repository layout

```
firmware/
├── CMakeLists.txt
├── prj.conf
├── boards/
│   └── nrf5340dk_nrf5340_cpuapp.overlay   # GPIO + I2C devicetree overlay
└── src/
    ├── main.c                              # Entry point, BLE adv, button FSM
    ├── ble_orbit_service.h / .c            # Custom GATT service
    ├── privacy_gate.h / .c                 # Mic power gate + 30-s auto-cutoff
    └── haptic_driver.h / .c               # TI DRV2605L I2C driver
```

---

## Prerequisites

1. **nRF Connect SDK v2.7.0** installed via `nrfutil` or the nRF Connect for Desktop
   toolchain manager.
2. **west** meta-tool (`pip install west`).
3. **J-Link** software pack for flashing (ships with nRF Connect SDK installer).
4. A **nRF5340 DK** (PCA10095) or equivalent custom board with the AURA Orbit
   hardware as described above.

### First-time workspace initialisation

```bash
# From the nRF Connect SDK root (e.g. ~/ncs/v2.7.0)
west init -m https://github.com/nrfconnect/sdk-nrf --mr v2.7.0
west update
west zephyr-export
pip install -r zephyr/scripts/requirements.txt
```

---

## Building

All commands are run from the **project root** (this `firmware/` directory).

### nRF5340 DK (development board)

```bash
west build -b nrf5340dk_nrf5340_cpuapp .
```

### Clean build

```bash
west build -b nrf5340dk_nrf5340_cpuapp . --pristine
```

### Build with verbose output

```bash
west build -b nrf5340dk_nrf5340_cpuapp . -- -DCMAKE_VERBOSE_MAKEFILE=ON
```

The build artefact is produced at:

```
build/zephyr/zephyr.hex
```

---

## Flashing

### Via J-Link (nRF5340 DK USB)

```bash
west flash
```

This erases the target, programs `build/zephyr/zephyr.hex`, and resets the
device.  Requires the J-Link USB cable connected to the **Debug USB** port of
the nRF5340 DK.

### Specifying a J-Link serial number (multiple boards connected)

```bash
west flash --snr <JLINK_SERIAL>
```

### Via `nrfjprog` directly

```bash
nrfjprog --family NRF53 --coprocessor CP_APPLICATION \
         --program build/zephyr/zephyr.hex --sectorerase --verify --reset
```

---

## Serial logging

The firmware logs structured output over UART0 at **115200 8N1**.

```bash
# On Linux/macOS
screen /dev/ttyACM0 115200

# Or with pyserial miniterm
python -m serial.tools.miniterm /dev/ttyACM0 115200
```

On Windows use **PuTTY** or the built-in nRF Connect Serial Terminal.

Log verbosity is controlled by `CONFIG_LOG_DEFAULT_LEVEL` in `prj.conf`
(3 = INFO, 4 = DEBUG).

---

## BLE Protocol

All wire constants are defined in [`src/ble_orbit_service.h`](src/ble_orbit_service.h)
and must remain in sync with the mobile-side constants in
[`mobile/src/services/BLEService.ts`](../mobile/src/services/BLEService.ts).

| UUID | Role | Description |
|------|------|-------------|
| `12345678-1234-5678-1234-56789ABCDEF0` | Service | AURA Orbit primary service |
| `12345678-1234-5678-1234-56789ABCDEF1` | FOCUS_CHAR | Read/Notify/Write — focus state & commands |
| `12345678-1234-5678-1234-56789ABCDEF2` | NOTIF_CHAR | WriteWithoutResponse — haptic notification packets |
| `12345678-1234-5678-1234-56789ABCDEF3` | BATTERY_CHAR | Read/Notify — battery level 0–100 |

### Commands (1 byte, written to or notified on FOCUS_CHAR)

| Value | Constant | Direction | Meaning |
|-------|----------|-----------|---------|
| `0x01` | `CMD_FOCUS_START` | App→Orbit or Orbit→App | Start focus session |
| `0x02` | `CMD_FOCUS_STOP` | App→Orbit | Stop focus session |
| `0x03` | `CMD_DISTRACTED` | Orbit→App | User logged a distraction |
| `0x04` | `CMD_UNDO` | App→Orbit | Undo last distraction log |
| `0x10` | `EVT_SAFETY_TIMEOUT` | Orbit→App | Privacy auto-cutoff fired |

### Notification packet (written to NOTIF_CHAR, WriteWithoutResponse)

```
Byte 0:   packet_type  (0x01 meeting_alert, 0x02 nudge, 0x03 generic)
Byte 1:   haptic_style (0x01 brief, 0x02 sustained, 0x03 urgent)
Bytes 2-3: payload_len  (uint16 little-endian)
Bytes 4…n: label       (UTF-8, max 28 bytes)
```

---

## Button state machine

| Gesture | Timing | Action |
|---------|--------|--------|
| **Long press** | Hold ≥ 2 000 ms | Emit `CMD_FOCUS_START` over BLE + open privacy gate + play focus haptic |
| **Single click** | Release < 2 000 ms, no follow-up within 300 ms | Play ACK haptic (dismiss notification) |
| **Double click** | Second press within 300 ms of first release | Emit `CMD_DISTRACTED` (0x03) over BLE + play nudge haptic |

---

## Privacy gate

The privacy gate enforces two hardware-level rules:

1. **30-second auto-cutoff**: After `privacy_gate_open()` is called, a
   `k_work_delayable` timer drives `GPIO_MIC_GATE` LOW after 30 s regardless
   of application state.  `EVT_SAFETY_TIMEOUT` (0x10) is then notified to the
   mobile app.

2. **Zero ambient storage**: The gate may only be opened from an active focus
   session (`CMD_FOCUS_START` received or long-press fired).  The firmware never
   opens the gate at boot or on connection.

The amber **privacy LED ring** mirrors the gate state in hardware.

### Firmware Contract: EVT_SAFETY_TIMEOUT (0x10)
- **Constraint:** The BLE event `EVT_SAFETY_TIMEOUT` (`0x10`) is **strictly session-gated**. It is only ever emitted by Orbit firmware during an active focus session (`FocusSession.status == "active"`).
- **PPG Wellness Gate:** The MAX86141 PPG optical sensor is powered down by default and powered on only during an active focus session. Outside an active focus session, no PPG sampling occurs and `EVT_SAFETY_TIMEOUT` is never emitted.
- **No Continuous Telemetry:** In accordance with the AURA privacy architecture, Orbit firmware never streams raw PPG or optical waveforms over BLE. Only discrete event notifications (`0x10`) are emitted.

---

## Haptic effects

| Effect constant | DRV2605L ROM waveform(s) | Trigger |
|----------------|--------------------------|---------|
| `HAPTIC_EFFECT_FOCUS_START` | Double Click (10) + Strong Click (1) | Long press / CMD_FOCUS_START |
| `HAPTIC_EFFECT_MEETING` | Long Alert 2 (47) | Meeting alert packet |
| `HAPTIC_EFFECT_NUDGE` | Short Buzz 100% (58) | Nudge packet / CMD_DISTRACTED |
| `HAPTIC_EFFECT_URGENT` | Triple Click (14) + Strong Click (1) | Urgent packet |
| `HAPTIC_EFFECT_ACK` | Strong Click 100% (1) | Single click / CMD_UNDO / CMD_FOCUS_STOP |

ROM waveform indices are from the **TI DRV2605L datasheet, Table 3, LRA Library (F)**.

---

## Security

- **LE Secure Connections** (`CONFIG_BT_SMP_SC_ONLY=y`) — enforces ECDH-based
  key agreement; legacy pairing is rejected.
- **Passkey display** pairing method — a 6-digit passkey is emitted over UART
  and must be confirmed on the mobile app.
- **Bonding** is enabled with up to 4 stored bond records in NVS flash.
- **Resolvable Private Addresses** rotate every 900 s to prevent passive tracking.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `bt_enable failed` | Clock or entropy driver missing | Check `CONFIG_ENTROPY_GENERATOR=y` and `prj.conf` |
| `mic-gate GPIO not ready` | Overlay not applied | Confirm `-b nrf5340dk_nrf5340_cpuapp` and overlay file name matches board |
| `DRV2605L I2C bus not ready` | Wrong SDA/SCL pins | Check `i2c1_default` pin assignments in overlay |
| Device not discoverable | Already bonded / privacy RPA | Delete bonds with `bt_unpair(BT_ID_DEFAULT, NULL)` from a debug build |
| No haptic on notification | DRV2605L not ack'ing | Verify I2C pull-ups (4.7 kΩ to 3.3 V) and address solder bridge (SDO=GND → 0x5A) |
