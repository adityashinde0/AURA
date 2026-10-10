# apple/ — AURA Apple Platform Implementation

> **Author:** Aditya Shinde · Project AURA  
> **Platforms:** watchOS 10+ · iOS 17+  
> **Language:** Swift 5.10 · SwiftUI

---

## Directory structure

```
apple/
├── AURAShared/                  # Code compiled into both targets
│   └── Models.swift             # Codable structs, enums, relay envelope
│
├── AURAWatch/                   # watchOS target
│   ├── WatchSessionManager.swift
│   ├── HealthKitManager.swift
│   └── Views/
│       ├── WatchHomeView.swift
│       ├── PreMeetingView.swift
│       ├── FocusGuardianWatchView.swift
│       └── SafetyCheckInView.swift
│
├── AURACompanion/               # iOS target (companion / gateway)
│   ├── iPhoneSessionManager.swift
│   ├── AuraAPIClient.swift
│   └── Views/
│       └── CompanionSettingsView.swift
│
└── README.md                    # ← you are here
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Xcode 15.4+ | Required for Swift 5.10 and watchOS 10 SDK |
| Apple Developer Program | Required for APNs, HealthKit, and App Store distribution |
| Physical iPhone + Apple Watch | WatchConnectivity, HealthKit background delivery, and Fall Detection **do not work in the Simulator** |
| iOS 17+ / watchOS 10+ deployment target | Set in Xcode target settings |

---

## Xcode project setup

### 1. Create the project

1. **File → New → Project**
2. Choose **iOS App** template; name it **AURACompanion**.
3. Set language to **Swift**, interface to **SwiftUI**.
4. After creation, **File → New → Target → watchOS App**; name it **AURAWatch**.  
   Xcode will offer to add a WatchKit App + Extension pair (watchOS 10 uses a single-target model — accept the single-target option).

### 2. Add AURAShared sources to both targets

1. Right-click the `apple/AURAShared/` folder in the Project navigator → **Add Files to "AURACompanion"**.
2. In the dialog tick **both** targets: `AURACompanion` and `AURAWatch`.
3. `Models.swift` will now compile into both.

### 3. Minimum deployment targets

| Target | Setting | Value |
|---|---|---|
| AURACompanion | iOS Deployment Target | 17.0 |
| AURAWatch | watchOS Deployment Target | 10.0 |

### 4. App Groups (shared UserDefaults / Keychain)

An App Group is required so the iPhone and Watch targets can share `UserDefaults` for settings sync.

1. Select the **AURACompanion** target → **Signing & Capabilities** → **+ Capability → App Groups**.
2. Add the group identifier: `group.com.aura.app` (replace with your Bundle ID prefix).
3. Repeat for the **AURAWatch** target with the **same** group identifier.
4. Update any `AppStorage` or `UserDefaults(suiteName:)` calls to use the shared group.

### 5. Required capabilities and entitlements

#### AURACompanion (iOS)

| Capability | Purpose |
|---|---|
| App Groups | Shared preferences with Watch |
| Push Notifications | Receive T-5 meeting alerts and focus updates from backend |
| Background Modes → Remote notifications | Wake app on incoming APNs |
| Keychain Sharing | OAuth token storage (optional, for future extensions) |

#### AURAWatch (watchOS)

| Capability | Purpose |
|---|---|
| App Groups | Shared preferences with iPhone |
| HealthKit | High/low heart rate, irregular rhythm, fall detection events |
| HealthKit Background Delivery | Receive events when app is not foregrounded |
| Push Notifications | Receive T-5 meeting briefs from backend via APNs |

> **Fall Detection entitlement:** `com.apple.developer.healthkit.background-delivery` is required for immediate background delivery. Request `com.apple.developer.healthkit.access` and the specific fall-detection key through the Apple Developer portal before submitting to App Review.

### 6. Info.plist keys

#### AURAWatch — HealthKit purpose strings (mandatory for App Review)

```xml
<key>NSHealthShareUsageDescription</key>
<string>AURA uses Apple Watch health warning events to offer an optional safety check-in. No raw health data is stored or shared.</string>

<key>NSHealthUpdateUsageDescription</key>
<string>AURA does not write health data.</string>
```

#### AURACompanion — API configuration

```xml
<key>AURAAPIBaseURL</key>
<string>https://api.aura.example.com</string>

<key>AURAAuthorizationEndpoint</key>
<string>https://auth.aura.example.com/oauth/authorize</string>

<key>AURATokenEndpoint</key>
<string>https://auth.aura.example.com/oauth/token</string>

<key>AURAClientID</key>
<string>YOUR_CLIENT_ID</string>

<key>AURARedirectURI</key>
<string>aura://oauth/callback</string>
```

Add the custom URL scheme `aura` to **AURACompanion → Info → URL Types**.

---

## Build and run

```bash
# Open workspace (or .xcodeproj) in Xcode
open AURACompanion.xcodeproj

# Select the AURAWatch scheme and a real Apple Watch device
# ↑ Simulator is insufficient for WatchConnectivity and HealthKit background delivery

# Build both targets:
# Product → Build For → Testing  (⌘⇧U)
```

> **Note:** There is no Swift Package Manager or CocoaPods dependency. All code uses only Apple system frameworks: `SwiftUI`, `WatchConnectivity`, `HealthKit`, `AuthenticationServices`, `CryptoKit`, and `WatchKit`.

---

## WatchConnectivity message schema

Commands flow from Watch → iPhone via `WCSession`. The payload is a JSON-serialised `CommandEnvelope`:

```jsonc
{
  "commandType": "focus.start",       // CommandType raw value
  "commandID":   "550e8400-...",      // UUIDv4 idempotency key
  "issuedAt":    "2024-06-01T10:00:00Z",
  "payload": { "durationSeconds": "1500" }
}
```

State flows from iPhone → Watch as a `FocusState` or `PreMeetingCard` dict nested under the key `"focusState"` or `"meetingCard"` respectively.

---

## Safety Guardian — integration checklist

- [x] Safety Guardian toggle is **OFF** by default (`SafetySettings.defaultSettings.isEnabled == false`).
- [x] `HealthKitManager.requestAuthorization()` is called **only** when the user explicitly enables Safety Guardian in `CompanionSettingsView`.
- [x] `SafetyCheckInView` displays the disclaimer: *"Not medical advice. Not emergency detection."*
- [x] 30-second countdown auto-escalates if the user does not respond.
- [x] Emergency SOS button in `SafetyCheckInView` opens `tel://112` as a system handoff — AURA never initiates the call.
- [x] No raw HealthKit samples are written to disk or any log.
- [x] Contact identifiers are opaque strings resolved server-side; names never appear in logs.

---

## Backend API endpoints used

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/relay` | Forward a `RelayEnvelope` (focus signal, distraction) |
| `POST` | `/apns/register` | Register APNs device token after sign-in |
| `POST` | `<tokenEndpoint>` | OAuth token exchange / refresh |

All requests require `Authorization: Bearer <access_token>` over HTTPS/TLS 1.3.  
The relay payload matches `schemas/websocket/relay_envelope.json` in this repository.

---

## Testing notes

| Test type | How |
|---|---|
| WatchConnectivity | Must run on a real paired iPhone + Apple Watch |
| HealthKit background delivery | Must run on a real Apple Watch; test with synthetic events in Xcode Health app |
| APNs | Use APNs sandbox environment; register token via `registerAPNsToken` after sign-in |
| OAuth PKCE | Use `ASWebAuthenticationSession`; test with a staging auth server |
| Safety check-in | Trigger `HealthKitManager.triggerCheckIn` manually in a debug build; verify 30-second auto-escalation |

---

*Project AURA · All Rights Reserved · Aditya Shinde*
