import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import {
  loadPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
} from '../stores/NotificationPreferencesStore';
import { THEME } from '../theme';
import { AuraIcon } from '../components/AuraIcon';
import type { NotificationPreferencesNavigationProp, UserPreferences } from '../types';

export default function NotificationPreferencesScreen(): React.JSX.Element {
  const navigation = useNavigation<NotificationPreferencesNavigationProp>();

  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    loadPreferences().then((p) => {
      if (isMounted) {
        setPrefs(p);
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const updatePreference = async <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsSaving(true);
    const updated = await savePreferences({ [key]: value });
    setPrefs(updated);
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={THEME.brandYellow} style={styles.loader} />
      </SafeAreaView>
    );
  }

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
        <Text style={styles.headerTitle}>Notification & Privacy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isSaving && (
          <View style={styles.savingBadge}>
            <ActivityIndicator size="small" color={THEME.brandYellow} />
            <Text style={styles.savingText}>Syncing policy to local enclave…</Text>
          </View>
        )}

        {/* Row 1: Meeting Brief */}
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Proactive Meeting Briefs</Text>
              <Text style={styles.rowDescription}>
                Deliver glanceable AI briefings 5 minutes before scheduled calendar events.
              </Text>
            </View>
            <Switch
              value={prefs.pre_meeting_enabled}
              onValueChange={(val) => updatePreference('pre_meeting_enabled', val)}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.brandYellow }}
              thumbColor={Platform.OS === 'android' ? (prefs.pre_meeting_enabled ? THEME.textDark : THEME.textMuted) : undefined}
            />
          </View>
        </View>

        {/* Row 2: Watch Notification Preview */}
        <View style={styles.card}>
          <Text style={styles.rowTitle}>Orbit Pebble Preview Privacy</Text>
          <Text style={styles.rowDescription}>
            Privacy filter applied to incoming alerts rendered on the Orbit wearable face.
          </Text>
          <View style={styles.segmentedControl}>
            <Pressable
              style={[
                styles.segmentButton,
                prefs.notification_preview === 'generic' && styles.segmentButtonActive,
              ]}
              onPress={() => updatePreference('notification_preview', 'generic')}
            >
              <Text
                style={[
                  styles.segmentText,
                  prefs.notification_preview === 'generic' && styles.segmentTextActive,
                ]}
              >
                Generic Alert
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentButton,
                prefs.notification_preview === 'private_context' && styles.segmentButtonActive,
              ]}
              onPress={() => updatePreference('notification_preview', 'private_context')}
            >
              <Text
                style={[
                  styles.segmentText,
                  prefs.notification_preview === 'private_context' && styles.segmentTextActive,
                ]}
              >
                Private Context
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Row 3: Focus Actions Scope */}
        <View style={styles.card}>
          <Text style={styles.rowTitle}>Focus Action Consent Gate</Text>
          <Text style={styles.rowDescription}>
            Policy gate requiring manual confirmation for model-proposed interventions.
          </Text>
          <View style={styles.segmentedControl}>
            {(['ask_every_time', 'this_session', 'never'] as const).map((scope) => (
              <Pressable
                key={scope}
                style={[
                  styles.segmentButton,
                  prefs.focus_action_scope === scope && styles.segmentButtonActive,
                ]}
                onPress={() => updatePreference('focus_action_scope', scope)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    prefs.focus_action_scope === scope && styles.segmentTextActive,
                  ]}
                >
                  {scope === 'ask_every_time'
                    ? 'Always Ask'
                    : scope === 'this_session'
                    ? 'Session'
                    : 'Never'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Row 4: Slack Status */}
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Slack Ambient Presence</Text>
              <Text style={styles.rowDescription}>
                Sync focus state to enterprise workspace without exposing meeting context.
              </Text>
            </View>
            <Switch
              value={prefs.slack_status_enabled}
              onValueChange={(val) => updatePreference('slack_status_enabled', val)}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.brandYellow }}
              thumbColor={Platform.OS === 'android' ? (prefs.slack_status_enabled ? THEME.textDark : THEME.textMuted) : undefined}
            />
          </View>
        </View>

        {/* Row 5: Safety Guardian Quick Link */}
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Safety Guardian Integration</Text>
              <Text style={styles.rowDescription}>
                Autonomous wellness check-ins on prolonged inactivity timeouts.
              </Text>
            </View>
            <Switch
              value={prefs.safety_guardian_enabled}
              onValueChange={(val) => {
                updatePreference('safety_guardian_enabled', val);
                if (val) {
                  navigation.navigate('SafetySettings');
                }
              }}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: THEME.emerald }}
              thumbColor={Platform.OS === 'android' ? (prefs.safety_guardian_enabled ? THEME.textDark : THEME.textMuted) : undefined}
            />
          </View>
          <Pressable
            style={styles.linkButton}
            onPress={() => navigation.navigate('SafetySettings')}
          >
            <Text style={styles.linkButtonText}>Configure Emergency Contacts</Text>
            <AuraIcon name="chevron-right" size={16} color={THEME.brandYellow} />
          </Pressable>
        </View>

        {/* Row 6: Location in SOS */}
        <View style={styles.card}>
          <Text style={styles.rowTitle}>SOS Location Sharing Policy</Text>
          <Text style={styles.rowDescription}>
            Controls whether coordinates attach to SMS alerts during safety escalation.
          </Text>
          <View style={styles.segmentedControl}>
            {(['off', 'ask_each_time', 'approved_contacts_only'] as const).map((loc) => (
              <Pressable
                key={loc}
                style={[
                  styles.segmentButton,
                  prefs.location_in_sos === loc && styles.segmentButtonActive,
                ]}
                onPress={() => updatePreference('location_in_sos', loc)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    prefs.location_in_sos === loc && styles.segmentTextActive,
                  ]}
                >
                  {loc === 'off'
                    ? 'Disabled'
                    : loc === 'ask_each_time'
                    ? 'Ask Each Time'
                    : 'Approved'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 14,
  },
  savingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 207, 0, 0.08)',
    borderColor: THEME.borderGold,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radiusPill,
    alignSelf: 'center',
    marginBottom: 4,
  },
  savingText: {
    color: THEME.warmSand,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderColor: THEME.border,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  rowDescription: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusPill,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.radiusPill,
  },
  segmentButtonActive: {
    backgroundColor: THEME.brandYellow,
    shadowColor: THEME.brandYellow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  segmentText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: THEME.textDark,
    fontWeight: '800',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  linkButtonText: {
    color: THEME.brandYellow,
    fontSize: 13,
    fontWeight: '700',
  },
});
