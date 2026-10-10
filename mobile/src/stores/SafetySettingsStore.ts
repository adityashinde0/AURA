/**
 * SafetySettingsStore — persists emergency contacts and Safety Guardian
 * toggle state in expo-secure-store under a single JSON key.
 *
 * Zero-ambient-storage: phone numbers are stored encrypted by the OS
 * secure enclave via expo-secure-store. Nothing is written to plain disk.
 */
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';
import type { SafetySettings, EmergencyContact } from '../types';

const STORE_KEY = 'aura.safety_settings';

const DEFAULT_SETTINGS: SafetySettings = {
  safetyGuardianEnabled: false,
  contacts: [],
  timeoutThresholdMinutes: 30,
};

export async function loadSafetySettings(): Promise<SafetySettings> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return JSON.parse(raw) as SafetySettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSafetySettings(settings: SafetySettings): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(settings));
}

export async function addEmergencyContact(
  name: string,
  phoneNumber: string,
  notifyOnTimeout: boolean,
): Promise<EmergencyContact> {
  const settings = await loadSafetySettings();
  const contact: EmergencyContact = {
    id: uuidv4(),
    name,
    phoneNumber,
    notifyOnTimeout,
  };
  settings.contacts.push(contact);
  await saveSafetySettings(settings);
  return contact;
}

export async function removeEmergencyContact(contactId: string): Promise<void> {
  const settings = await loadSafetySettings();
  settings.contacts = settings.contacts.filter((c) => c.id !== contactId);
  await saveSafetySettings(settings);
}

export async function updateEmergencyContact(
  contactId: string,
  patch: Partial<Omit<EmergencyContact, 'id'>>,
): Promise<void> {
  const settings = await loadSafetySettings();
  settings.contacts = settings.contacts.map((c) =>
    c.id === contactId ? { ...c, ...patch } : c,
  );
  await saveSafetySettings(settings);
}

export async function setSafetyGuardianEnabled(enabled: boolean): Promise<void> {
  const settings = await loadSafetySettings();
  settings.safetyGuardianEnabled = enabled;
  await saveSafetySettings(settings);
}
