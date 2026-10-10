import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import {
  loadSafetySettings,
  addEmergencyContact,
  removeEmergencyContact,
  updateEmergencyContact,
  setSafetyGuardianEnabled,
} from '../stores/SafetySettingsStore';
import { THEME } from '../theme';
import { AuraIcon } from '../components/AuraIcon';
import type { SafetySettingsNavigationProp, SafetySettings, EmergencyContact } from '../types';

// ─── SafetySettingsScreen ─────────────────────────────────────────────────────

export default function SafetySettingsScreen(): React.JSX.Element {
  const navigation = useNavigation<SafetySettingsNavigationProp>();

  const [settings, setSettings] = useState<SafetySettings>({
    safetyGuardianEnabled: false,
    contacts: [],
    timeoutThresholdMinutes: 30,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Add-contact form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotify, setNewNotify] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;
    loadSafetySettings().then((s) => {
      if (isMounted) {
        setSettings(s);
        setIsLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // ── Toggle Safety Guardian ────────────────────────────────────────────────

  const handleGuardianToggle = useCallback(async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (value && settings.contacts.length === 0) {
      Alert.alert(
        'No contacts configured',
        'Add at least one emergency contact before enabling Safety Guardian.',
      );
      return;
    }
    await setSafetyGuardianEnabled(value);
    setSettings((prev) => ({ ...prev, safetyGuardianEnabled: value }));
  }, [settings.contacts.length]);

  // ── Add contact ───────────────────────────────────────────────────────────

  const validatePhone = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  };

  const handleAddContact = useCallback(async () => {
    setFormError(null);
    if (!newName.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!validatePhone(newPhone)) {
      setFormError('Enter a valid phone number (7–15 digits).');
      return;
    }
    setIsSaving(true);
    try {
      const contact = await addEmergencyContact(newName.trim(), newPhone.trim(), newNotify);
      setSettings((prev) => ({ ...prev, contacts: [...prev.contacts, contact] }));
      setNewName('');
      setNewPhone('');
      setNewNotify(true);
      setShowAddForm(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      Alert.alert('Could not save contact', 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [newName, newPhone, newNotify]);

  // ── Remove contact ────────────────────────────────────────────────────────

  const handleRemoveContact = useCallback((id: string, name: string) => {
    Alert.alert(
      'Remove contact',
      `Are you sure you want to remove ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            await removeEmergencyContact(id);
            setSettings((prev) => {
              const updated = prev.contacts.filter((c) => c.id !== id);
              const shouldDisable = updated.length === 0 && prev.safetyGuardianEnabled;
              if (shouldDisable) setSafetyGuardianEnabled(false).catch(() => {});
              return {
                ...prev,
                contacts: updated,
                safetyGuardianEnabled: shouldDisable ? false : prev.safetyGuardianEnabled,
              };
            });
          },
        },
      ],
    );
  }, []);

  // ── Toggle notify-on-timeout per contact ──────────────────────────────────

  const handleToggleNotify = useCallback(async (contact: EmergencyContact, value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await updateEmergencyContact(contact.id, { notifyOnTimeout: value });
    setSettings((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c) => (c.id === contact.id ? { ...c, notifyOnTimeout: value } : c)),
    }));
  }, []);

  // ── Render contact item ───────────────────────────────────────────────────

  const renderContact = ({ item }: { item: EmergencyContact }) => (
    <View style={styles.contactCard}>
      <View style={styles.contactTopRow}>
        <View style={styles.contactAvatar}>
          <Text style={styles.contactAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phoneNumber}</Text>
        </View>
        <Pressable
          onPress={() => handleRemoveContact(item.id, item.name)}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
        >
          <AuraIcon name="bell-off" size={16} color={THEME.rose} />
        </Pressable>
      </View>

      <View style={styles.contactToggleRow}>
        <Text style={styles.contactToggleLabel}>Notify on Safety Timeout</Text>
        <Switch
          value={item.notifyOnTimeout}
          onValueChange={(val) => handleToggleNotify(item, val)}
          trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.brandYellow }}
          thumbColor={Platform.OS === 'android' ? (item.notifyOnTimeout ? THEME.textDark : THEME.textMuted) : undefined}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <AuraIcon name="chevron-left" size={20} color={THEME.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Safety & Escalation</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Master Toggle Card */}
          <View style={styles.sectionCard}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <View style={styles.labelBadgeRow}>
                  <AuraIcon name="shield" size={16} color={THEME.brandYellow} />
                  <Text style={styles.toggleLabel}>Safety Guardian</Text>
                </View>
                <Text style={styles.toggleSub}>
                  If Orbit detects an anomalous inactivity timeout ({settings.timeoutThresholdMinutes} min), your designated contacts are notified automatically.
                </Text>
              </View>
              <Switch
                value={settings.safetyGuardianEnabled}
                onValueChange={handleGuardianToggle}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.brandYellow }}
                thumbColor={Platform.OS === 'android' ? (settings.safetyGuardianEnabled ? THEME.textDark : THEME.textMuted) : undefined}
              />
            </View>

            {settings.safetyGuardianEnabled && (
              <View style={styles.guardianActiveBanner}>
                <AuraIcon name="check" size={14} color={THEME.emerald} />
                <Text style={styles.guardianActiveText}>
                  Shield Active · Background Bluetooth monitoring enabled
                </Text>
              </View>
            )}
          </View>

          {/* Emergency Contacts Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Designated Emergency Contacts</Text>
            {!showAddForm && (
              <Pressable
                onPress={() => setShowAddForm(true)}
                style={styles.addPill}
                accessibilityRole="button"
              >
                <Text style={styles.addPillText}>+ Add Contact</Text>
              </Pressable>
            )}
          </View>

          {/* Add contact form */}
          {showAddForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add Trusted Contact</Text>

              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Maya Chen"
                placeholderTextColor={THEME.textMuted}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="+1 (555) 019-2834"
                placeholderTextColor={THEME.textMuted}
                keyboardType="phone-pad"
              />

              {formError && <Text style={styles.formErrorText}>{formError}</Text>}

              <View style={styles.formButtonsRow}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setShowAddForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.saveButton}
                  onPress={handleAddContact}
                  disabled={isSaving}
                >
                  <Text style={styles.saveButtonText}>{isSaving ? 'Saving…' : 'Save Contact'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {settings.contacts.length === 0 && !showAddForm ? (
            <View style={styles.emptyStateCard}>
              <AuraIcon name="shield" size={28} color={THEME.textMuted} />
              <Text style={styles.emptyStateTitle}>No emergency contacts</Text>
              <Text style={styles.emptyStateSub}>
                Add at least one contact so AURA knows who to alert if Orbit detects an unexpected safety anomaly.
              </Text>
            </View>
          ) : (
            <FlatList
              data={settings.contacts}
              keyExtractor={(item) => item.id}
              renderItem={renderContact}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.textPrimary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.textPrimary,
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 50,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 16,
  },
  sectionCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderColor: THEME.border,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  toggleTextCol: {
    flex: 1,
    gap: 6,
  },
  labelBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleLabel: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  toggleSub: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  guardianActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.emeraldSubtle,
    borderColor: THEME.emerald,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 10,
  },
  guardianActiveText: {
    color: THEME.emerald,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  addPill: {
    backgroundColor: 'rgba(255, 207, 0, 0.1)',
    borderColor: THEME.borderGold,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: THEME.radiusPill,
  },
  addPillText: {
    color: THEME.brandYellow,
    fontSize: 12,
    fontWeight: '800',
  },
  contactCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderColor: THEME.border,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  contactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: THEME.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  contactPhone: {
    color: THEME.textMuted,
    fontSize: 13,
  },
  deleteButton: {
    padding: 6,
  },
  contactToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  contactToggleLabel: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  formCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderColor: THEME.borderGold,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  formTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  fieldLabel: {
    color: THEME.warmSand,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: THEME.bg,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: THEME.textPrimary,
    fontSize: 15,
  },
  formErrorText: {
    color: THEME.rose,
    fontSize: 12,
    fontWeight: '600',
  },
  formButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: THEME.radiusPill,
    borderColor: THEME.border,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: THEME.radiusPill,
    backgroundColor: THEME.brandYellow,
    alignItems: 'center',
  },
  saveButtonText: {
    color: THEME.textDark,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyStateCard: {
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyStateTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyStateSub: {
    color: THEME.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
