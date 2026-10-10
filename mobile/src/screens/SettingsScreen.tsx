import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { AppHeader } from '../components/AppHeader';
import { AuraIcon } from '../components/AuraIcon';
import { THEME } from '../theme';
import { signOut } from '../auth/AuthService';

interface SettingsScreenProps {
  onOpenNotifications?: () => void;
  onOpenFocusControl?: () => void;
  onOpenSafety?: () => void;
  userId?: string | null;
}

export function SettingsScreen({
  onOpenNotifications,
  onOpenFocusControl,
  onOpenSafety,
  userId = 'demo_developer_aura',
}: SettingsScreenProps): React.JSX.Element {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Dynamic setting values
  const [meetingWhispersValue, setMeetingWhispersValue] = useState('5 min before');
  const [focusGuardianValue, setFocusGuardianValue] = useState('Ask every time');
  const [privacyControlsValue, setPrivacyControlsValue] = useState('On-device first');
  const [safetyCheckinValue, setSafetyCheckinValue] = useState('Off');

  const handleCardPress = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveModal(key);
  };

  const selectOption = (type: string, value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (type === 'meeting') setMeetingWhispersValue(value);
    if (type === 'guardian') setFocusGuardianValue(value);
    if (type === 'privacy') setPrivacyControlsValue(value);
    if (type === 'safety') setSafetyCheckinValue(value);
    setActiveModal(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Settings Header */}
      <AppHeader
        title="Settings"
        isSettingsScreen={true}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card 1: Meeting whispers */}
        <Pressable
          style={({ pressed }) => [styles.settingsCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('meeting-whispers')}
          accessibilityRole="button"
          accessibilityLabel="Meeting whispers configuration"
        >
          <View style={styles.iconBoxGreen}>
            <AuraIcon name="calendar" size={22} color="#00E599" />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Meeting whispers</Text>
            <Text style={styles.cardSubtitle}>
              Get a gentle reminder before your meetings.
            </Text>
          </View>

          <View style={styles.rightAction}>
            <Text style={styles.rightValue}>{meetingWhispersValue}</Text>
            <AuraIcon name="chevron-right" size={18} color="#6A7786" />
          </View>
        </Pressable>

        {/* Card 2: Focus Guardian */}
        <Pressable
          style={({ pressed }) => [styles.settingsCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('focus-guardian')}
          accessibilityRole="button"
          accessibilityLabel="Focus Guardian configuration"
        >
          <View style={styles.iconBoxAmber}>
            <AuraIcon name="target" size={22} color="#FF9F0A" />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Focus Guardian</Text>
            <Text style={styles.cardSubtitle}>
              Helps protect your focus when you get distracted.
            </Text>
          </View>

          <View style={styles.rightAction}>
            <Text style={styles.rightValue}>{focusGuardianValue}</Text>
            <AuraIcon name="chevron-right" size={18} color="#6A7786" />
          </View>
        </Pressable>

        {/* Card 3: Privacy controls */}
        <Pressable
          style={({ pressed }) => [styles.settingsCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('privacy-controls')}
          accessibilityRole="button"
          accessibilityLabel="Privacy controls configuration"
        >
          <View style={styles.iconBoxGreen}>
            <AuraIcon name="shield" size={22} color="#00E599" />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Privacy controls</Text>
            <Text style={styles.cardSubtitle}>
              Choose how your data is processed.
            </Text>
          </View>

          <View style={styles.rightAction}>
            <Text style={styles.rightValue}>{privacyControlsValue}</Text>
            <AuraIcon name="chevron-right" size={18} color="#6A7786" />
          </View>
        </Pressable>

        {/* Card 4: Safety check-in */}
        <Pressable
          style={({ pressed }) => [styles.settingsCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('safety-checkin')}
          accessibilityRole="button"
          accessibilityLabel="Safety check-in configuration"
        >
          <View style={styles.iconBoxAmber}>
            <AuraIcon name="bell" size={22} color="#FF9F0A" />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Safety check-in</Text>
            <Text style={styles.cardSubtitle}>
              Set a regular check-in reminder for peace of mind.
            </Text>
          </View>

          <View style={styles.rightAction}>
            <Text style={styles.rightValue}>{safetyCheckinValue}</Text>
            <AuraIcon name="chevron-right" size={18} color="#6A7786" />
          </View>
        </Pressable>

        {/* Card 5: Connected accounts */}
        <Pressable
          style={({ pressed }) => [styles.settingsCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('connected-accounts')}
          accessibilityRole="button"
          accessibilityLabel="Connected accounts configuration"
        >
          <View style={styles.iconBoxGreen}>
            <AuraIcon name="link" size={22} color="#00E599" />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Connected accounts</Text>
            <Text style={styles.cardSubtitle}>
              Manage your connected services and integrations.
            </Text>
          </View>

          <View style={styles.rightAction}>
            <AuraIcon name="chevron-right" size={18} color="#6A7786" />
          </View>
        </Pressable>

        {/* Card 6: Manage permissions */}
        <Pressable
          style={({ pressed }) => [styles.settingsCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('manage-permissions')}
          accessibilityRole="button"
          accessibilityLabel="Manage permissions configuration"
        >
          <View style={styles.iconBoxGreen}>
            <AuraIcon name="gear" size={22} color="#00E599" />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Manage permissions</Text>
            <Text style={styles.cardSubtitle}>
              Control what AURA can access on your device.
            </Text>
          </View>

          <View style={styles.rightAction}>
            <AuraIcon name="chevron-right" size={18} color="#6A7786" />
          </View>
        </Pressable>

        {/* Account Info / Sign Out Button */}
        <View style={styles.footerSection}>
          <Pressable
            style={styles.signOutButton}
            onPress={() => {
              Alert.alert('Sign Out', 'Sign out of this session and return to Auth screen?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: () => signOut(),
                },
              ]);
            }}
            accessibilityRole="button"
          >
            <AuraIcon name="log-out" size={16} color="#717E8E" />
            <Text style={styles.signOutText}>
              Signed in as <Text style={styles.signOutBold}>{userId}</Text> · Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Settings Modal Selectors */}
      {activeModal && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={!!activeModal}
          onRequestClose={() => setActiveModal(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
            <View style={styles.modalContent}>
              {/* Meeting Whispers Selector */}
              {activeModal === 'meeting-whispers' && (
                <>
                  <Text style={styles.modalTitle}>Meeting Whispers</Text>
                  <Text style={styles.modalSub}>Select notification timing before calendar events:</Text>
                  <View style={styles.optionsList}>
                    {['At start of meeting', '5 min before', '10 min before', '15 min before'].map((opt) => (
                      <Pressable
                        key={opt}
                        style={[styles.optionRow, meetingWhispersValue === opt && styles.optionSelected]}
                        onPress={() => selectOption('meeting', opt)}
                      >
                        <Text style={[styles.optionText, meetingWhispersValue === opt && styles.optionTextSelected]}>
                          {opt}
                        </Text>
                        {meetingWhispersValue === opt && <AuraIcon name="check" size={16} color="#00E599" />}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Focus Guardian Selector */}
              {activeModal === 'focus-guardian' && (
                <>
                  <Text style={styles.modalTitle}>Focus Guardian</Text>
                  <Text style={styles.modalSub}>Policy action permission level:</Text>
                  <View style={styles.optionsList}>
                    {['Ask every time', 'Allow this session', 'Always on'].map((opt) => (
                      <Pressable
                        key={opt}
                        style={[styles.optionRow, focusGuardianValue === opt && styles.optionSelected]}
                        onPress={() => selectOption('guardian', opt)}
                      >
                        <Text style={[styles.optionText, focusGuardianValue === opt && styles.optionTextSelected]}>
                          {opt}
                        </Text>
                        {focusGuardianValue === opt && <AuraIcon name="check" size={16} color="#FF9F0A" />}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Privacy Controls Selector */}
              {activeModal === 'privacy-controls' && (
                <>
                  <Text style={styles.modalTitle}>Privacy Controls</Text>
                  <Text style={styles.modalSub}>Enclave computation strategy:</Text>
                  <View style={styles.optionsList}>
                    {['On-device first', 'Strict offline enclave', 'Encrypted sync'].map((opt) => (
                      <Pressable
                        key={opt}
                        style={[styles.optionRow, privacyControlsValue === opt && styles.optionSelected]}
                        onPress={() => selectOption('privacy', opt)}
                      >
                        <Text style={[styles.optionText, privacyControlsValue === opt && styles.optionTextSelected]}>
                          {opt}
                        </Text>
                        {privacyControlsValue === opt && <AuraIcon name="check" size={16} color="#00E599" />}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Safety Check-in Selector */}
              {activeModal === 'safety-checkin' && (
                <>
                  <Text style={styles.modalTitle}>Safety Check-in</Text>
                  <Text style={styles.modalSub}>Periodic wellness confirmation timer:</Text>
                  <View style={styles.optionsList}>
                    {['Off', 'Every 15 min', 'Every 30 min', 'Every 60 min'].map((opt) => (
                      <Pressable
                        key={opt}
                        style={[styles.optionRow, safetyCheckinValue === opt && styles.optionSelected]}
                        onPress={() => selectOption('safety', opt)}
                      >
                        <Text style={[styles.optionText, safetyCheckinValue === opt && styles.optionTextSelected]}>
                          {opt}
                        </Text>
                        {safetyCheckinValue === opt && <AuraIcon name="check" size={16} color="#FF9F0A" />}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Connected Accounts */}
              {activeModal === 'connected-accounts' && (
                <>
                  <Text style={styles.modalTitle}>Connected Accounts</Text>
                  <Text style={styles.modalSub}>Integrations linked with AURA:</Text>
                  <View style={styles.optionsList}>
                    <View style={styles.serviceRow}>
                      <Text style={styles.serviceName}>Google Calendar</Text>
                      <Text style={styles.serviceActive}>Active · Synced</Text>
                    </View>
                    <View style={styles.serviceRow}>
                      <Text style={styles.serviceName}>Slack Ambient Status</Text>
                      <Text style={styles.serviceActive}>Active · Synced</Text>
                    </View>
                    <View style={styles.serviceRow}>
                      <Text style={styles.serviceName}>Microsoft 365</Text>
                      <Text style={styles.serviceAvailable}>Available to Link</Text>
                    </View>
                  </View>
                </>
              )}

              {/* Manage Permissions */}
              {activeModal === 'manage-permissions' && (
                <>
                  <Text style={styles.modalTitle}>Manage Permissions</Text>
                  <Text style={styles.modalSub}>Device capabilities granted to AURA:</Text>
                  <View style={styles.optionsList}>
                    <View style={styles.serviceRow}>
                      <Text style={styles.serviceName}>Bluetooth BLE 5.4</Text>
                      <Text style={styles.serviceActive}>Granted</Text>
                    </View>
                    <View style={styles.serviceRow}>
                      <Text style={styles.serviceName}>Push Notifications</Text>
                      <Text style={styles.serviceActive}>Granted</Text>
                    </View>
                    <View style={styles.serviceRow}>
                      <Text style={styles.serviceName}>Edge Audio Sensing</Text>
                      <Text style={styles.serviceActive}>On-Device Only</Text>
                    </View>
                  </View>
                </>
              )}

              <Pressable
                style={styles.modalDoneButton}
                onPress={() => setActiveModal(null)}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 12,
  },
  settingsCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  iconBoxGreen: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 229, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxAmber: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 159, 10, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  cardSubtitle: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  rightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rightValue: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  footerSection: {
    marginTop: 12,
    alignItems: 'center',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  signOutText: {
    color: '#717E8E',
    fontSize: 13,
  },
  signOutBold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#131922',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 22,
    gap: 12,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  modalSub: {
    color: THEME.textSecondary,
    fontSize: 13.5,
    lineHeight: 18,
    marginBottom: 4,
  },
  optionsList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionSelected: {
    backgroundColor: 'rgba(0, 229, 153, 0.1)',
    borderColor: 'rgba(0, 229, 153, 0.35)',
  },
  optionText: {
    color: THEME.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  serviceName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  serviceActive: {
    color: '#00E599',
    fontSize: 13,
    fontWeight: '600',
  },
  serviceAvailable: {
    color: THEME.textSecondary,
    fontSize: 13,
  },
  modalDoneButton: {
    backgroundColor: '#00E599',
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalDoneText: {
    color: '#0A0D12',
    fontSize: 15,
    fontWeight: '800',
  },
});
