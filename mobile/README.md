# AURA Mobile

React Native / Expo companion application for the AURA Orbit wearable.

## Architecture

```
mobile/
├── App.tsx                          # Root: auth gate, push registration, navigation
├── babel.config.js
├── package.json
├── tsconfig.json
└── src/
    ├── auth/
    │   └── AuthService.ts           # OAuth 2.0 PKCE flow (expo-auth-session)
    ├── controllers/
    │   └── RelayController.ts       # BLE ↔ Cloud relay logic
    ├── screens/
    │   ├── HomeScreen.tsx           # Connection status, focus state, T-5 prep card
    │   ├── FocusControlScreen.tsx   # Start Focus / I'm Distracted / Undo
    │   └── SafetySettingsScreen.tsx # Emergency contacts, Safety Guardian toggle
    ├── services/
    │   ├── AuraApiClient.ts         # HTTPS + WebSocket client (AWS API Gateway)
    │   └── BLEService.ts            # BLE 5.4 GATT scanning, bonding, read/write/notify
    ├── stores/
    │   └── SafetySettingsStore.ts   # Encrypted contact storage (expo-secure-store)
    └── types/
        └── index.ts                 # Shared TypeScript types
```

## Setup

```bash
cd mobile
npm install
npm start          # Expo Go / development build
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run typecheck  # TypeScript check (no emit)
```

## Environment variables

Set in a `.env` file (gitignored) or via Expo EAS secrets:

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_API_BASE` | `https://api.aura.internal/v1` | AURA HTTPS base URL |
| `EXPO_PUBLIC_WS_URL` | `wss://ws.aura.internal/v1` | AURA WebSocket URL |
| `EXPO_PUBLIC_OAUTH_ISSUER` | `https://auth.aura.internal` | OAuth 2.0 issuer (Cognito-compatible) |
| `EXPO_PUBLIC_OAUTH_CLIENT_ID` | `aura-mobile-client` | OAuth client ID |

## BLE GATT layout

| UUID suffix | Characteristic | Properties |
|---|---|---|
| `…CDEF1` | Focus | Read / Write-with-response / Notify |
| `…CDEF2` | Notification haptic | Write-without-response |
| `…CDEF3` | Battery level | Read / Notify |

### Command bytes (Focus characteristic)

| Byte | Direction | Meaning |
|---|---|---|
| `0x01` | Phone → Orbit | `CMD_FOCUS_START` |
| `0x02` | Phone → Orbit | `CMD_FOCUS_STOP` |
| `0x03` | Phone → Orbit | `CMD_DISTRACTED` |
| `0x04` | Phone → Orbit | `CMD_UNDO` |
| `0x10` | Orbit → Phone | `EVT_SAFETY_TIMEOUT` |

## Relay rules

1. **BLE `CMD_FOCUS_START` from Orbit** → `POST /api/v1/focus/session {action:"start"}` + WebSocket relay envelope with `explicit_signal:"focus_started"`.
2. **BLE `CMD_DISTRACTED`** → `POST /api/v1/focus/signal` with `explicit_signal:"self_report_distracted"` + WebSocket relay.
3. **BLE `EVT_SAFETY_TIMEOUT`** → reads emergency contacts from secure store, opens native `tel:` dialler for the first notify-enabled contact.
4. **APNs `WatchWhisperCard` push** → decodes payload, forwards meeting-alert haptic packet over BLE to Orbit.

## Privacy constraints

- **Zero-ambient-storage**: no audio, transcript, or PII is written to local disk.
- Emergency contact numbers are stored exclusively in the OS secure enclave (iOS Keychain / Android Keystore) via `expo-secure-store`.
- Focus signals are minimized before leaving the device — only `explicit_signal` enum values, not content.
- Push token is sent only to the AURA device registry endpoint; it is not stored locally.
