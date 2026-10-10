import { BleManager, Device, Characteristic, BleError, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// ─── AURA Orbit GATT UUIDs ────────────────────────────────────────────────────
// Primary service advertised by AURA Orbit (BLE 5.4)
export const ORBIT_SERVICE_UUID = '12345678-1234-5678-1234-56789ABCDEF0';

// Characteristic: read/notify — current focus state; write — CMD_FOCUS_START / CMD_FOCUS_STOP
export const FOCUS_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789ABCDEF1';

// Characteristic: write-without-response — deliver notification haptic packets from APNs relay
export const NOTIFICATION_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789ABCDEF2';

// Characteristic: read/notify — battery level (0–100)
export const BATTERY_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789ABCDEF3';

// ─── Wire constants ───────────────────────────────────────────────────────────
// Commands written to FOCUS_CHARACTERISTIC_UUID
export const CMD_FOCUS_START = 0x01;
export const CMD_FOCUS_STOP = 0x02;
export const CMD_DISTRACTED = 0x03;
export const CMD_UNDO = 0x04;

// Safety timeout sentinel — Orbit writes this to FOCUS_CHARACTERISTIC_UUID when
// it detects an anomalous inactivity period (no interaction for > threshold).
export const EVT_SAFETY_TIMEOUT = 0x10;

// Notification packet byte layout written to NOTIFICATION_CHARACTERISTIC_UUID:
//   [0]    packet_type  (0x01 = meeting_alert, 0x02 = nudge, 0x03 = generic)
//   [1]    haptic_style (0x01 = brief, 0x02 = sustained, 0x03 = urgent)
//   [2–3]  payload_len  (uint16 LE, length of optional payload bytes)
//   [4…n]  payload      (UTF-8 short label, max 28 bytes — display on Orbit face)
export const HAPTIC_PACKET_TYPE_MEETING_ALERT = 0x01;
export const HAPTIC_PACKET_TYPE_NUDGE = 0x02;
export const HAPTIC_PACKET_TYPE_GENERIC = 0x03;

export const HAPTIC_STYLE_BRIEF = 0x01;
export const HAPTIC_STYLE_SUSTAINED = 0x02;
export const HAPTIC_STYLE_URGENT = 0x03;

// ─── Types ────────────────────────────────────────────────────────────────────
export type BLEConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface OrbitDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export type FocusStateCallback = (command: number) => void;
export type SafetyTimeoutCallback = () => void;
export type BatteryCallback = (level: number) => void;
export type ConnectionStateCallback = (state: BLEConnectionState, deviceId?: string) => void;

// ─── BLEService ───────────────────────────────────────────────────────────────

// ─── Reconnect backoff constants ──────────────────────────────────────────────
// Exponential backoff prevents CPU/battery spin-locking on a lost BLE link.
//   Initial delay: 1 s → 2 s → 4 s → … capped at RECONNECT_MAX_DELAY_MS.
// The last-attempted device ID is stored so the caller can decide whether to
// reconnect automatically or prompt the user to re-scan.
const RECONNECT_BASE_DELAY_MS = 1_000;   //  1 s initial backoff
const RECONNECT_MAX_DELAY_MS  = 30_000;  // 30 s maximum backoff cap

class BLEService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Reconnect backoff state ────────────────────────────────────────────────
  /** Timer handle for the pending reconnect attempt (null = no reconnect scheduled). */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Current backoff delay in ms; doubles on each failed attempt up to the cap. */
  private reconnectDelay: number = RECONNECT_BASE_DELAY_MS;

  private onFocusState: FocusStateCallback | null = null;
  private onSafetyTimeout: SafetyTimeoutCallback | null = null;
  private onBattery: BatteryCallback | null = null;
  private onConnectionState: ConnectionStateCallback | null = null;

  constructor() {
    try {
      this.manager = new BleManager();
    } catch (err) {
      console.warn('[BLEService] Native BLE module unavailable (e.g. Expo Go sandbox). Operating in fallback mode.');
      this.manager = null as unknown as BleManager;
    }
  }

  // ── Public registration ──────────────────────────────────────────────────

  registerFocusStateCallback(cb: FocusStateCallback): void {
    this.onFocusState = cb;
  }

  registerSafetyTimeoutCallback(cb: SafetyTimeoutCallback): void {
    this.onSafetyTimeout = cb;
  }

  registerBatteryCallback(cb: BatteryCallback): void {
    this.onBattery = cb;
  }

  registerConnectionStateCallback(cb: ConnectionStateCallback): void {
    this.onConnectionState = cb;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async waitForBLEPoweredOn(): Promise<void> {
    if (!this.manager) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const subscription = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          subscription.remove();
          resolve();
        } else if (state === State.Unsupported || state === State.Unauthorized) {
          subscription.remove();
          reject(new Error(`BLE state: ${state}`));
        }
      }, true);
    });
  }

  // ── Scanning ─────────────────────────────────────────────────────────────

  async scanForOrbit(
    onDeviceFound: (device: OrbitDevice) => void,
    timeoutMs: number = 15_000,
  ): Promise<void> {
    if (!this.manager) {
      this.onConnectionState?.('idle');
      return;
    }
    await this.waitForBLEPoweredOn();
    this.onConnectionState?.('scanning');

    const seen = new Set<string>();

    this.scanTimeout = setTimeout(() => {
      this.stopScan();
    }, timeoutMs);

    this.manager.startDeviceScan(
      [ORBIT_SERVICE_UUID],
      { allowDuplicates: false },
      (error: BleError | null, device: Device | null) => {
        if (error) {
          this.stopScan();
          this.onConnectionState?.('error');
          return;
        }
        if (device && !seen.has(device.id)) {
          seen.add(device.id);
          onDeviceFound({ id: device.id, name: device.name, rssi: device.rssi });
        }
      },
    );
  }

  stopScan(): void {
    if (this.scanTimeout !== null) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    if (this.manager) {
      this.manager.stopDeviceScan();
    }
    if (!this.connectedDevice) {
      this.onConnectionState?.('idle');
    }
  }

  // ── Connection / bonding ─────────────────────────────────────────────────

  async connect(deviceId: string): Promise<void> {
    if (!this.manager) {
      this.onConnectionState?.('error', deviceId);
      return;
    }
    this.onConnectionState?.('connecting', deviceId);
    try {
      const device = await this.manager.connectToDevice(deviceId, {
        autoConnect: false,
        requestMTU: 185,
      });
      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;
      this.onConnectionState?.('connected', device.id);
      this.subscribeToNotifications(device);
      this.watchDisconnection(device);
    } catch (err) {
      this.onConnectionState?.('error', deviceId);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // Cancel any pending reconnect before explicitly disconnecting so that a
    // user-initiated disconnect does not immediately re-schedule a reconnect.
    this.cancelReconnect();
    if (this.connectedDevice && this.manager) {
      await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      this.connectedDevice = null;
      this.onConnectionState?.('disconnected');
    }
  }

  get isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  get connectedDeviceId(): string | null {
    return this.connectedDevice?.id ?? null;
  }

  // ── GATT writes ──────────────────────────────────────────────────────────

  async writeFocusCommand(command: number): Promise<void> {
    this.assertConnected();
    const data = Buffer.from([command]).toString('base64');
    await this.connectedDevice!.writeCharacteristicWithResponseForService(
      ORBIT_SERVICE_UUID,
      FOCUS_CHARACTERISTIC_UUID,
      data,
    );
  }

  /**
   * Forward a meeting-alert haptic packet to Orbit.
   * label is a short display string shown on the Orbit face (max 28 UTF-8 bytes).
   */
  async sendMeetingAlertHaptic(label: string): Promise<void> {
    this.assertConnected();
    const labelBytes = Buffer.from(label.slice(0, 28), 'utf8');
    const packet = Buffer.alloc(4 + labelBytes.length);
    packet.writeUInt8(HAPTIC_PACKET_TYPE_MEETING_ALERT, 0);
    packet.writeUInt8(HAPTIC_STYLE_SUSTAINED, 1);
    packet.writeUInt16LE(labelBytes.length, 2);
    labelBytes.copy(packet, 4);
    await this.connectedDevice!.writeCharacteristicWithoutResponseForService(
      ORBIT_SERVICE_UUID,
      NOTIFICATION_CHARACTERISTIC_UUID,
      packet.toString('base64'),
    );
  }

  /**
   * Forward a generic nudge haptic packet to Orbit.
   */
  async sendNudgeHaptic(label: string): Promise<void> {
    this.assertConnected();
    const labelBytes = Buffer.from(label.slice(0, 28), 'utf8');
    const packet = Buffer.alloc(4 + labelBytes.length);
    packet.writeUInt8(HAPTIC_PACKET_TYPE_NUDGE, 0);
    packet.writeUInt8(HAPTIC_STYLE_BRIEF, 1);
    packet.writeUInt16LE(labelBytes.length, 2);
    labelBytes.copy(packet, 4);
    await this.connectedDevice!.writeCharacteristicWithoutResponseForService(
      ORBIT_SERVICE_UUID,
      NOTIFICATION_CHARACTERISTIC_UUID,
      packet.toString('base64'),
    );
  }

  // ── GATT reads ───────────────────────────────────────────────────────────

  async readBatteryLevel(): Promise<number> {
    this.assertConnected();
    const characteristic = await this.connectedDevice!.readCharacteristicForService(
      ORBIT_SERVICE_UUID,
      BATTERY_CHARACTERISTIC_UUID,
    );
    return this.parseBatteryCharacteristic(characteristic);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private subscribeToNotifications(device: Device): void {
    // Focus characteristic: receives CMD_* from Orbit (e.g. CMD_FOCUS_START from hardware button)
    // and EVT_SAFETY_TIMEOUT.
    device.monitorCharacteristicForService(
      ORBIT_SERVICE_UUID,
      FOCUS_CHARACTERISTIC_UUID,
      (error: BleError | null, characteristic: Characteristic | null) => {
        if (error || !characteristic?.value) return;
        const bytes = Buffer.from(characteristic.value, 'base64');
        if (bytes.length < 1) return;
        const cmd = bytes.readUInt8(0);
        if (cmd === EVT_SAFETY_TIMEOUT) {
          this.onSafetyTimeout?.();
        } else {
          this.onFocusState?.(cmd);
        }
      },
    );

    // Battery characteristic: periodic notify
    device.monitorCharacteristicForService(
      ORBIT_SERVICE_UUID,
      BATTERY_CHARACTERISTIC_UUID,
      (error: BleError | null, characteristic: Characteristic | null) => {
        if (error || !characteristic?.value) return;
        const level = this.parseBatteryCharacteristic(characteristic);
        this.onBattery?.(level);
      },
    );
  }

  private parseBatteryCharacteristic(characteristic: Characteristic): number {
    if (!characteristic.value) return -1;
    const bytes = Buffer.from(characteristic.value, 'base64');
    if (bytes.length < 1) return -1;
    return Math.min(100, Math.max(0, bytes.readUInt8(0)));
  }

  /**
   * Watches for unexpected BLE disconnections and schedules an exponential-
   * backoff reconnect.  The backoff sequence is: 1 s, 2 s, 4 s, 8 s, 16 s,
   * 30 s (capped), 30 s, … preventing CPU/battery spin-locking when the
   * Orbit device is temporarily out of range.
   *
   * Backoff resets to the base delay on a successful re-connection so that
   * the next disconnect starts from a fast retry again.
   *
   * A user-initiated disconnect (via `disconnect()`) cancels the pending timer
   * before it fires, so this handler never runs after an explicit teardown.
   */
  private watchDisconnection(device: Device): void {
    this.manager.onDeviceDisconnected(device.id, (_error, _dev) => {
      this.connectedDevice = null;
      this.onConnectionState?.('disconnected', device.id);

      this.scheduleReconnect(device.id);
    });
  }

  /**
   * Schedules a reconnect attempt after the current `reconnectDelay`, then
   * doubles the delay (capped at `RECONNECT_MAX_DELAY_MS`) for the next
   * failure.
   */
  private scheduleReconnect(deviceId: string): void {
    this.cancelReconnect(); // clear any existing timer before scheduling a new one

    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_DELAY_MS);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      // Abort if a new device has been connected in the meantime.
      if (this.connectedDevice !== null) return;
      try {
        this.onConnectionState?.('connecting', deviceId);
        await this.connect(deviceId);
        // Success — reset the backoff so the next disconnect starts fast.
        this.reconnectDelay = RECONNECT_BASE_DELAY_MS;
      } catch {
        // connect() already calls onConnectionState?.('error') internally.
        // The next watchDisconnection callback will schedule the next attempt
        // with the already-doubled delay.
      }
    }, delay);
  }

  /** Cancels any pending reconnect timer without resetting the backoff state. */
  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private assertConnected(): void {
    if (!this.connectedDevice) {
      throw new Error('BLEService: no connected Orbit device');
    }
  }

  destroy(): void {
    this.cancelReconnect();
    this.stopScan();
    this.manager.destroy();
  }
}

export const bleService = new BLEService();
