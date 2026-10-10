import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { relayController } from '../controllers/RelayController';
import { getStoredUserId } from '../services/AuraApiClient';
import { bleService, CMD_DISTRACTED, CMD_UNDO } from '../services/BLEService';
import { THEME } from '../theme';
import { AuraIcon } from '../components/AuraIcon';
import type { FocusControlNavigationProp, FocusSession, RootStackParamList } from '../types';

type FocusControlRouteProp = RouteProp<RootStackParamList, 'FocusControl'>;
type ActionState = 'idle' | 'loading' | 'success' | 'error';

// ─── FocusControlScreen ───────────────────────────────────────────────────────

export default function FocusControlScreen(): React.JSX.Element {
  const navigation = useNavigation<FocusControlNavigationProp>();
  const route = useRoute<FocusControlRouteProp>();

  const [session, setSession] = useState<FocusSession | null>(relayController.session);
  const [userId, setUserId] = useState<string | null>(null);
  const [startState, setStartState] = useState<ActionState>('idle');
  const [distractedState, setDistractedState] = useState<ActionState>('idle');
  const [undoState, setUndoState] = useState<ActionState>('idle');
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);

  // ── Bootstrap ────────────────────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const uid = await getStoredUserId();
      if (isMounted) setUserId(uid);
    })();

    const unsubscribe = relayController.subscribe((s) => {
      if (isMounted) setSession(s);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleStartFocus = useCallback(async () => {
    const activeUid = userId ?? 'demo_developer_aura';
    if (session) {
      Alert.alert('Session active', 'A focus session is already running. Stop it before starting a new one.');
      return;
    }
    setStartState('loading');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newSession = await relayController.startFocusSession(activeUid);
      setSession(newSession);
      setLastActionLabel('Focus session started');
      setStartState('success');
      setTimeout(() => setStartState('idle'), 2000);
    } catch {
      setStartState('error');
      Alert.alert('Could not start focus', 'Check your connection and try again.');
      setTimeout(() => setStartState('idle'), 2000);
    }
  }, [userId, session]);

  const handleStopFocus = useCallback(async () => {
    const activeUid = userId ?? 'demo_developer_aura';
    if (!session) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await relayController.stopFocusSession(activeUid);
      setLastActionLabel('Focus session ended');
    } catch {
      Alert.alert('Could not stop session', 'Please try again.');
    }
  }, [userId, session]);

  const handleDistracted = useCallback(async () => {
    const activeUid = userId ?? 'demo_developer_aura';
    if (!session) {
      Alert.alert('No active session', 'Start a deep work session first.');
      return;
    }
    setDistractedState('loading');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await relayController.reportDistracted(activeUid);
      if (bleService.isConnected) {
        await bleService.writeFocusCommand(CMD_DISTRACTED).catch(() => {});
      }
      setLastActionLabel('Distraction self-reported to Orbit');
      setDistractedState('success');
      setTimeout(() => setDistractedState('idle'), 2000);
    } catch {
      setDistractedState('error');
      Alert.alert('Could not report distraction', 'Check your connection.');
      setTimeout(() => setDistractedState('idle'), 2000);
    }
  }, [userId, session]);

  const handleUndo = useCallback(async () => {
    const activeUid = userId ?? 'demo_developer_aura';
    if (!session?.lastUndoToken) {
      Alert.alert('Nothing to undo', 'There is no recent action to reverse.');
      return;
    }
    setUndoState('loading');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      await relayController.undoLastAction(activeUid);
      if (bleService.isConnected) {
        await bleService.writeFocusCommand(CMD_UNDO).catch(() => {});
      }
      setLastActionLabel('Previous action undone');
      setUndoState('success');
      setTimeout(() => setUndoState('idle'), 2000);
    } catch {
      setUndoState('error');
      Alert.alert('Undo failed', 'The action could not be reversed.');
      setTimeout(() => setUndoState('idle'), 2000);
    }
  }, [userId, session]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatDuration = (startedAt: number): string => {
    const elapsed = Math.round((Date.now() / 1000 - startedAt) / 60);
    if (elapsed < 1) return '0 min (just started)';
    return `${elapsed} min`;
  };

  const isSessionActive = session !== null;

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
        <Text style={styles.headerTitle}>Focus Guardian</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Visual Focus Arc / Orb */}
        <View style={styles.orbCard}>
          <View style={[styles.ambientOrb, isSessionActive && styles.ambientOrbActive]} />
          <View style={[styles.focusRing, isSessionActive && styles.focusRingActive]}>
            <AuraIcon
              name={isSessionActive ? 'flash' : 'radio'}
              size={36}
              color={isSessionActive ? THEME.brandYellow : THEME.textMuted}
            />
          </View>
          <Text style={styles.sessionStateTitle}>
            {isSessionActive ? 'Deep Work in Progress' : 'Ready for Deep Work'}
          </Text>
          <Text style={styles.sessionStateSubtitle}>
            {session
              ? `Elapsed: ${formatDuration(session.startedAt)}`
              : 'Orbit haptic distraction shielding standby'}
          </Text>
        </View>

        {lastActionLabel && (
          <View style={styles.feedbackBanner}>
            <AuraIcon name="check" size={16} color={THEME.emerald} />
            <Text style={styles.feedbackText}>{lastActionLabel}</Text>
          </View>
        )}

        {/* Primary Action Button: Start or Stop */}
        {!isSessionActive ? (
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              startState === 'loading' && styles.buttonLoading,
            ]}
            onPress={handleStartFocus}
            disabled={startState === 'loading'}
            accessibilityRole="button"
          >
            {startState === 'loading' ? (
              <ActivityIndicator color={THEME.textDark} />
            ) : (
              <>
                <AuraIcon name="play" size={18} color={THEME.textDark} />
                <Text style={styles.primaryButtonText}>Start Deep Work Session</Text>
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.stopButton,
              pressed && styles.stopButtonPressed,
            ]}
            onPress={handleStopFocus}
            accessibilityRole="button"
          >
            <AuraIcon name="stop" size={18} color={THEME.rose} />
            <Text style={styles.stopButtonText}>End Focus Session</Text>
          </Pressable>
        )}

        {/* Distraction & Undo Action Cards */}
        <View style={styles.controlsGrid}>
          {/* I'm Distracted Button */}
          <Pressable
            style={({ pressed }) => [
              styles.controlCard,
              !isSessionActive && styles.controlCardDisabled,
              pressed && isSessionActive && styles.controlCardPressed,
            ]}
            onPress={handleDistracted}
            disabled={!isSessionActive || distractedState === 'loading'}
            accessibilityRole="button"
          >
            <View style={styles.controlIconWrap}>
              <AuraIcon name="alert-circle" size={20} color={isSessionActive ? THEME.amber : THEME.textMuted} />
            </View>
            <View style={styles.controlTextCol}>
              <Text style={[styles.controlTitle, !isSessionActive && styles.textDisabled]}>
                {distractedState === 'loading' ? 'Logging…' : "I'm Distracted"}
              </Text>
              <Text style={[styles.controlSub, !isSessionActive && styles.textDisabled]}>
                Self-reports a distraction signal to Orbit haptic engine
              </Text>
            </View>
          </Pressable>

          {/* Undo Button */}
          <Pressable
            style={({ pressed }) => [
              styles.controlCard,
              !session?.lastUndoToken ? styles.controlCardDisabled : null,
              pressed && session?.lastUndoToken ? styles.controlCardPressed : null,
            ]}
            onPress={handleUndo}
            disabled={!session?.lastUndoToken || undoState === 'loading'}
            accessibilityRole="button"
          >
            <View style={styles.controlIconWrap}>
              <AuraIcon
                name="refresh"
                size={20}
                color={session?.lastUndoToken ? THEME.brandYellow : THEME.textMuted}
              />
            </View>
            <View style={styles.controlTextCol}>
              <Text style={[styles.controlTitle, !session?.lastUndoToken && styles.textDisabled]}>
                {undoState === 'loading' ? 'Undoing…' : 'Undo Last Action'}
              </Text>
              <Text style={[styles.controlSub, !session?.lastUndoToken && styles.textDisabled]}>
                Reverses the most recent automated Slack DND / focus state
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Privacy Shield Note */}
        <View style={styles.privacyCard}>
          <AuraIcon name="shield" size={16} color={THEME.textSecondary} />
          <Text style={styles.privacyText}>
            All focus metrics are processed with strict edge minimization. No audio recordings or application window titles leave your personal device enclave.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
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
    paddingTop: 20,
    paddingBottom: 40,
    gap: 18,
  },
  orbCard: {
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ambientOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  ambientOrbActive: {
    backgroundColor: 'rgba(255, 207, 0, 0.07)',
  },
  focusRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: THEME.border,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  focusRingActive: {
    borderColor: THEME.brandYellow,
    backgroundColor: 'rgba(255, 207, 0, 0.12)',
    shadowColor: THEME.brandYellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  sessionStateTitle: {
    color: THEME.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  sessionStateSubtitle: {
    color: THEME.textMuted,
    fontSize: 13,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.emeraldSubtle,
    borderColor: THEME.emerald,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 14,
  },
  feedbackText: {
    color: THEME.emerald,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.brandYellow,
    borderRadius: THEME.radiusPill,
    paddingVertical: 17,
    gap: 10,
    shadowColor: THEME.brandYellow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 3,
  },
  primaryButtonPressed: {
    backgroundColor: THEME.brandYellowHover,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: THEME.textDark,
    fontSize: 16,
    fontWeight: '800',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderColor: 'rgba(244, 63, 94, 0.3)',
    borderWidth: 1,
    borderRadius: THEME.radiusPill,
    paddingVertical: 16,
    gap: 8,
  },
  stopButtonPressed: {
    backgroundColor: 'rgba(244, 63, 94, 0.16)',
  },
  stopButtonText: {
    color: THEME.rose,
    fontSize: 16,
    fontWeight: '800',
  },
  buttonLoading: {
    opacity: 0.65,
  },
  controlsGrid: {
    gap: 12,
  },
  controlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    padding: 16,
    gap: 14,
  },
  controlCardPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: THEME.borderHover,
  },
  controlCardDisabled: {
    opacity: 0.45,
  },
  controlIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlTextCol: {
    flex: 1,
  },
  controlTitle: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  controlSub: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  textDisabled: {
    color: THEME.textMuted,
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: THEME.cardSubtle,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 14,
  },
  privacyText: {
    flex: 1,
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
