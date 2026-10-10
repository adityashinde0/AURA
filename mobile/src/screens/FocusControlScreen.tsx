import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';

import { relayController } from '../controllers/RelayController';
import { getStoredUserId, type RoutineDeviceAction } from '../services/AuraApiClient';
import { bleService, CMD_DISTRACTED, CMD_UNDO } from '../services/BLEService';
import { THEME } from '../theme';
import { AuraIcon } from '../components/AuraIcon';
import type { FocusControlNavigationProp, FocusSession } from '../types';

type ActionState = 'idle' | 'loading' | 'success' | 'error';

interface RoutineProposalState {
  intent: string;
  summary: string;
  actions: RoutineDeviceAction[];
  tone?: string;
}

function getActionIcon(action: string, device: string): string {
  const devLower = device.toLowerCase();
  const actLower = action.toLowerCase();
  if (devLower.includes('firetv') || devLower.includes('tv')) return 'tv';
  if (devLower.includes('light') || actLower.includes('dim')) return 'bulb';
  if (devLower.includes('slack') || actLower.includes('dnd')) return 'message-square';
  if (devLower.includes('orbit') || devLower.includes('wearable') || actLower.includes('nudge')) {
    return 'zap';
  }
  return 'sliders';
}

export default function FocusControlScreen(): React.JSX.Element {
  const navigation = useNavigation<FocusControlNavigationProp>();

  const [session, setSession] = useState<FocusSession | null>(relayController.session);
  const [userId, setUserId] = useState<string | null>(null);
  const [startState, setStartState] = useState<ActionState>('idle');
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);

  // Adaptive Intent & Routine State
  const [activeIntentLoading, setActiveIntentLoading] = useState<string | null>(null);
  const [proposalModalVisible, setProposalModalVisible] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<RoutineProposalState | null>(null);
  const [isApplyingRoutine, setIsApplyingRoutine] = useState(false);

  // Custom Intent Modal
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customInputText, setCustomInputText] = useState('');

  // 30-Second Countdown Undo
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [isUndoing, setIsUndoing] = useState(false);
  const undoIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      if (undoIntervalRef.current) {
        clearInterval(undoIntervalRef.current);
      }
    };
  }, []);

  // ── Countdown Timer Helper ───────────────────────────────────────────────

  const startUndoCountdown = useCallback(() => {
    if (undoIntervalRef.current) {
      clearInterval(undoIntervalRef.current);
    }
    setUndoSecondsLeft(30);

    undoIntervalRef.current = setInterval(() => {
      setUndoSecondsLeft((prev) => {
        if (prev <= 1) {
          if (undoIntervalRef.current) {
            clearInterval(undoIntervalRef.current);
            undoIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Session Controls ─────────────────────────────────────────────────────

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

  // ── Adaptive Intent Trigger ──────────────────────────────────────────────

  const handleTriggerIntent = useCallback(
    async (intentPhrase: string, displayLabel: string) => {
      const activeUid = userId ?? 'demo_developer_aura';
      setActiveIntentLoading(displayLabel);

      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const res = await relayController.triggerAdaptiveIntent(activeUid, intentPhrase);

        // If Orbit is connected and intent is distraction, also notify hardware
        if (displayLabel.toLowerCase().includes('distract') && bleService.isConnected) {
          await bleService.writeFocusCommand(CMD_DISTRACTED).catch(() => {});
        }

        // If the policy engine executed the action automatically via a learned grant
        if (res.decision === 'executed_consent_rule' || (res.undo_token && !res.proposal?.device_actions?.length)) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setLastActionLabel(`Executed learned routine for "${displayLabel}"`);
          startUndoCountdown();
        } else {
          // Present the Routine Proposal Review Modal
          const proposalActions =
            res.device_actions ??
            res.proposal?.device_actions ??
            res.routine_actions ??
            [];

          setCurrentProposal({
            intent: displayLabel,
            summary: res.proposal?.prep_summary ?? `Claude 3.5 routine tailored for "${displayLabel}".`,
            actions: proposalActions,
            tone: res.proposal?.emotion_tone,
          });
          setProposalModalVisible(true);
        }
      } catch {
        Alert.alert('Intent evaluation failed', 'Local fallback activated.');
      } finally {
        setActiveIntentLoading(null);
      }
    },
    [userId, startUndoCountdown],
  );

  // ── Apply Routine (Once or Remember) ──────────────────────────────────────

  const handleApplyRoutine = useCallback(
    async (remember: boolean) => {
      if (!currentProposal) return;
      const activeUid = userId ?? 'demo_developer_aura';
      setIsApplyingRoutine(true);

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await relayController.applyRoutineProposal(
          activeUid,
          currentProposal.intent,
          remember,
          currentProposal.actions,
        );

        setProposalModalVisible(false);
        setLastActionLabel(
          remember
            ? `Routine remembered & applied for "${currentProposal.intent}"`
            : `Routine applied for "${currentProposal.intent}"`,
        );
        startUndoCountdown();
      } catch {
        Alert.alert('Could not apply routine', 'Please try again.');
      } finally {
        setIsApplyingRoutine(false);
        setCurrentProposal(null);
      }
    },
    [userId, currentProposal, startUndoCountdown],
  );

  // ── Submit Custom Intent Phrase ──────────────────────────────────────────

  const handleSubmitCustomIntent = useCallback(async () => {
    const trimmed = customInputText.trim();
    if (!trimmed) return;
    setCustomModalVisible(false);
    setCustomInputText('');
    await handleTriggerIntent(trimmed, trimmed);
  }, [customInputText, handleTriggerIntent]);

  // ── 30-Second Countdown Undo ─────────────────────────────────────────────

  const handleUndo = useCallback(async () => {
    const activeUid = userId ?? 'demo_developer_aura';
    setIsUndoing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      await relayController.undoLastAction(activeUid);
      if (bleService.isConnected) {
        await bleService.writeFocusCommand(CMD_UNDO).catch(() => {});
      }
      if (undoIntervalRef.current) {
        clearInterval(undoIntervalRef.current);
        undoIntervalRef.current = null;
      }
      setUndoSecondsLeft(0);
      setLastActionLabel('Previous routine actions reversed');
    } catch {
      Alert.alert('Undo failed', 'The action could not be reversed.');
    } finally {
      setIsUndoing(false);
    }
  }, [userId]);

  // ── Duration Formatter ───────────────────────────────────────────────────

  const formatDuration = (startedAt: number): string => {
    const elapsed = Math.round((Date.now() / 1000 - startedAt) / 60);
    if (elapsed < 1) return '0 min (just started)';
    return `${elapsed} min`;
  };

  const isSessionActive = session !== null;
  const isUndoAvailable = undoSecondsLeft > 0 && !!session?.lastUndoToken;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
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
              color={isSessionActive ? THEME.green : THEME.textMuted}
            />
          </View>
          <Text style={styles.sessionStateTitle}>
            {isSessionActive ? 'Deep Work in Progress' : 'Ready for Deep Work'}
          </Text>
          <Text style={styles.sessionStateSubtitle}>
            {session
              ? `Elapsed: ${formatDuration(session.startedAt)}`
              : 'Multi-device routine engine standby'}
          </Text>
        </View>

        {/* Feedback Banner */}
        {lastActionLabel && (
          <View style={styles.feedbackBanner}>
            <AuraIcon name="check" size={16} color={THEME.green} />
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

        {/* 30-Second Countdown Undo Card */}
        {isUndoAvailable && (
          <View style={styles.undoCard}>
            <View style={styles.undoCardTop}>
              <View style={styles.undoBadge}>
                <AuraIcon name="clock" size={14} color={THEME.amber} />
                <Text style={styles.undoBadgeText}>{undoSecondsLeft}s Left to Undo</Text>
              </View>
              <Text style={styles.undoPolicyTag}>Deterministic Gate</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.undoButton,
                pressed && styles.undoButtonPressed,
                isUndoing && styles.buttonLoading,
              ]}
              onPress={handleUndo}
              disabled={isUndoing}
              accessibilityRole="button"
            >
              {isUndoing ? (
                <ActivityIndicator size="small" color={THEME.textDark} />
              ) : (
                <>
                  <AuraIcon name="refresh" size={16} color={THEME.textDark} />
                  <Text style={styles.undoButtonText}>Undo Routine Actions</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* ── Adaptive State Grid ── */}
        <View style={styles.gridSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Adaptive State & Routines</Text>
            <View style={styles.aiBadge}>
              <AuraIcon name="zap" size={12} color={THEME.green} />
              <Text style={styles.aiBadgeText}>Bedrock Engine</Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
            Signal physical or cognitive shifts for Claude 3.5 multi-device routines.
          </Text>

          <View style={styles.adaptiveGrid}>
            {/* Card 1: Distracted */}
            <Pressable
              style={({ pressed }) => [
                styles.gridCard,
                pressed && styles.gridCardPressed,
                activeIntentLoading === 'Distracted' && styles.gridCardLoading,
              ]}
              onPress={() => handleTriggerIntent('distracted', 'Distracted')}
              disabled={activeIntentLoading !== null}
              accessibilityRole="button"
            >
              <View style={[styles.gridIconCircle, { backgroundColor: THEME.amberSubtle }]}>
                {activeIntentLoading === 'Distracted' ? (
                  <ActivityIndicator size="small" color={THEME.amber} />
                ) : (
                  <AuraIcon name="alert-circle" size={22} color={THEME.amber} />
                )}
              </View>
              <Text style={styles.gridCardTitle}>Distracted</Text>
              <Text style={styles.gridCardSub}>Refocus nudge pulse</Text>
            </Pressable>

            {/* Card 2: Tired / Sleep */}
            <Pressable
              style={({ pressed }) => [
                styles.gridCard,
                pressed && styles.gridCardPressed,
                activeIntentLoading === 'Tired / Sleep' && styles.gridCardLoading,
              ]}
              onPress={() => handleTriggerIntent('I am tired, want to sleep', 'Tired / Sleep')}
              disabled={activeIntentLoading !== null}
              accessibilityRole="button"
            >
              <View style={[styles.gridIconCircle, { backgroundColor: THEME.lavenderSubtle }]}>
                {activeIntentLoading === 'Tired / Sleep' ? (
                  <ActivityIndicator size="small" color={THEME.lavender} />
                ) : (
                  <AuraIcon name="moon" size={22} color={THEME.lavender} />
                )}
              </View>
              <Text style={styles.gridCardTitle}>Tired / Sleep</Text>
              <Text style={styles.gridCardSub}>Dim lights, pause Fire TV</Text>
            </Pressable>

            {/* Card 3: Quick Break */}
            <Pressable
              style={({ pressed }) => [
                styles.gridCard,
                pressed && styles.gridCardPressed,
                activeIntentLoading === 'Quick Break' && styles.gridCardLoading,
              ]}
              onPress={() => handleTriggerIntent('Need a quick break', 'Quick Break')}
              disabled={activeIntentLoading !== null}
              accessibilityRole="button"
            >
              <View style={[styles.gridIconCircle, { backgroundColor: THEME.greenSubtle }]}>
                {activeIntentLoading === 'Quick Break' ? (
                  <ActivityIndicator size="small" color={THEME.green} />
                ) : (
                  <AuraIcon name="coffee" size={22} color={THEME.green} />
                )}
              </View>
              <Text style={styles.gridCardTitle}>Quick Break</Text>
              <Text style={styles.gridCardSub}>15-min pause + Slack DND</Text>
            </Pressable>

            {/* Card 4: Custom Intent */}
            <Pressable
              style={({ pressed }) => [
                styles.gridCard,
                styles.gridCardCustom,
                pressed && styles.gridCardPressed,
              ]}
              onPress={() => setCustomModalVisible(true)}
              disabled={activeIntentLoading !== null}
              accessibilityRole="button"
            >
              <View style={[styles.gridIconCircle, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                <AuraIcon name="plus" size={22} color={THEME.textPrimary} />
              </View>
              <Text style={styles.gridCardTitle}>Custom Intent</Text>
              <Text style={styles.gridCardSub}>Voice or text phrase</Text>
            </Pressable>
          </View>
        </View>

        {/* Privacy Shield Note */}
        <View style={styles.privacyCard}>
          <AuraIcon name="shield" size={16} color={THEME.textSecondary} />
          <Text style={styles.privacyText}>
            All focus metrics and intent triggers are processed with strict edge minimization. Bedrock proposals are non-authoritative recommendations gated by the deterministic Policy Engine.
          </Text>
        </View>
      </ScrollView>

      {/* ── Routine Proposal Review Modal ── */}
      <Modal
        visible={proposalModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setProposalModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.proposalModal}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <AuraIcon name="zap" size={18} color={THEME.green} />
                <Text style={styles.modalTitle}>Adaptive Routine Proposal</Text>
              </View>
              <Pressable
                onPress={() => setProposalModalVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close proposal"
              >
                <AuraIcon name="close" size={20} color={THEME.textMuted} />
              </Pressable>
            </View>

            <View style={styles.intentTagContainer}>
              <Text style={styles.intentTagLabel}>Detected Intent:</Text>
              <Text style={styles.intentTagValue}>{currentProposal?.intent}</Text>
            </View>

            <Text style={styles.modalSummary}>{currentProposal?.summary}</Text>

            {/* Device Actions List */}
            <Text style={styles.actionsHeader}>Recommended Certified Device Actions</Text>
            <ScrollView style={styles.actionsList} showsVerticalScrollIndicator={false}>
              {currentProposal?.actions.map((act, idx) => (
                <View key={`${act.device}-${idx}`} style={styles.actionRow}>
                  <View style={styles.actionIconBox}>
                    <AuraIcon
                      name={getActionIcon(act.action, act.device)}
                      size={18}
                      color={THEME.green}
                    />
                  </View>
                  <View style={styles.actionInfo}>
                    <Text style={styles.actionDeviceName}>
                      {act.device_name ?? act.device}
                    </Text>
                    <Text style={styles.actionDesc}>
                      {act.description ?? act.action}
                    </Text>
                  </View>
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{act.action}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Deterministic Policy Notice */}
            <View style={styles.policyNotice}>
              <AuraIcon name="shield" size={14} color={THEME.textSecondary} />
              <Text style={styles.policyNoticeText}>
                Policy Engine Gate: Requires your explicit consent before device actuation.
              </Text>
            </View>

            {/* Action Buttons: Apply Once & Remember Routine */}
            <View style={styles.modalButtonsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.applyOnceBtn,
                  pressed && styles.applyOnceBtnPressed,
                  isApplyingRoutine && styles.buttonLoading,
                ]}
                onPress={() => handleApplyRoutine(false)}
                disabled={isApplyingRoutine}
                accessibilityRole="button"
              >
                {isApplyingRoutine ? (
                  <ActivityIndicator size="small" color={THEME.textPrimary} />
                ) : (
                  <Text style={styles.applyOnceBtnText}>Apply Once</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.rememberBtn,
                  pressed && styles.rememberBtnPressed,
                  isApplyingRoutine && styles.buttonLoading,
                ]}
                onPress={() => handleApplyRoutine(true)}
                disabled={isApplyingRoutine}
                accessibilityRole="button"
              >
                {isApplyingRoutine ? (
                  <ActivityIndicator size="small" color={THEME.textDark} />
                ) : (
                  <>
                    <AuraIcon name="bookmark" size={16} color={THEME.textDark} />
                    <Text style={styles.rememberBtnText}>Remember Routine</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Custom Intent Input Modal ── */}
      <Modal
        visible={customModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.customModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <AuraIcon name="edit" size={18} color={THEME.amber} />
                <Text style={styles.modalTitle}>Custom Intent Phrase</Text>
              </View>
              <Pressable
                onPress={() => setCustomModalVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close custom dialog"
              >
                <AuraIcon name="close" size={20} color={THEME.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.customPrompt}>
              Describe how you feel or what state you want to enter:
            </Text>

            <TextInput
              style={styles.textInput}
              value={customInputText}
              onChangeText={setCustomInputText}
              placeholder="e.g. Brain fog, Headache, Need fresh air"
              placeholderTextColor={THEME.textMuted}
              returnKeyType="done"
              autoFocus
            />

            {/* Quick Suggestion Chips */}
            <Text style={styles.chipsLabel}>Quick suggestions:</Text>
            <View style={styles.chipsRow}>
              {['Brain fog', 'Headache', 'Eye strain', 'Stretch break'].map((chip) => (
                <Pressable
                  key={chip}
                  style={styles.chip}
                  onPress={() => setCustomInputText(chip)}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipText}>{chip}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitIntentBtn,
                pressed && styles.submitIntentBtnPressed,
                !customInputText.trim() && styles.buttonDisabled,
              ]}
              onPress={handleSubmitCustomIntent}
              disabled={!customInputText.trim()}
              accessibilityRole="button"
            >
              <AuraIcon name="zap" size={16} color={THEME.textDark} />
              <Text style={styles.submitIntentBtnText}>Analyze Intent with Bedrock</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    backgroundColor: THEME.greenGlow,
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
    borderColor: THEME.green,
    backgroundColor: THEME.greenSubtle,
    shadowColor: THEME.green,
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
    backgroundColor: THEME.greenSubtle,
    borderColor: THEME.green,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 14,
  },
  feedbackText: {
    color: THEME.green,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.green,
    borderRadius: THEME.radiusPill,
    paddingVertical: 17,
    gap: 10,
    shadowColor: THEME.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 3,
  },
  primaryButtonPressed: {
    opacity: 0.9,
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
  buttonDisabled: {
    opacity: 0.45,
  },

  // ── Undo Card ──
  undoCard: {
    backgroundColor: THEME.card,
    borderColor: THEME.amber,
    borderWidth: 1.2,
    borderRadius: THEME.radiusCard,
    padding: 16,
    gap: 12,
  },
  undoCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  undoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.amberSubtle,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: THEME.radiusPill,
  },
  undoBadgeText: {
    color: THEME.amber,
    fontSize: 12,
    fontWeight: '800',
  },
  undoPolicyTag: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.amber,
    borderRadius: THEME.radiusPill,
    paddingVertical: 13,
    gap: 8,
  },
  undoButtonPressed: {
    opacity: 0.85,
  },
  undoButtonText: {
    color: THEME.textDark,
    fontSize: 14,
    fontWeight: '800',
  },

  // ── Adaptive State Grid ──
  gridSection: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.greenSubtle,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: THEME.radiusPill,
  },
  aiBadgeText: {
    color: THEME.green,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  adaptiveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    padding: 16,
    gap: 8,
  },
  gridCardCustom: {
    borderStyle: 'dashed',
    borderColor: THEME.borderHover,
  },
  gridCardPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: THEME.borderHover,
  },
  gridCardLoading: {
    opacity: 0.7,
  },
  gridIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCardTitle: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  gridCardSub: {
    color: THEME.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },

  // ── Privacy Card ──
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

  // ── Modal Styles ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  proposalModal: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: THEME.card,
    borderColor: THEME.borderHover,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    padding: 22,
    gap: 14,
  },
  customModal: {
    width: '100%',
    backgroundColor: THEME.card,
    borderColor: THEME.borderHover,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    padding: 22,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  intentTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: THEME.radiusSm,
  },
  intentTagLabel: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  intentTagValue: {
    color: THEME.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  modalSummary: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actionsHeader: {
    color: THEME.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  actionsList: {
    maxHeight: 160,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  actionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME.greenSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: {
    flex: 1,
  },
  actionDeviceName: {
    color: THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  actionDesc: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  actionBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: THEME.radiusPill,
  },
  actionBadgeText: {
    color: THEME.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  policyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 10,
    borderRadius: THEME.radiusSm,
  },
  policyNoticeText: {
    flex: 1,
    color: THEME.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  applyOnceBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: THEME.borderHover,
    borderWidth: 1,
    borderRadius: THEME.radiusPill,
    paddingVertical: 14,
  },
  applyOnceBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  applyOnceBtnText: {
    color: THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  rememberBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.green,
    borderRadius: THEME.radiusPill,
    paddingVertical: 14,
    gap: 6,
  },
  rememberBtnPressed: {
    opacity: 0.9,
  },
  rememberBtnText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '800',
  },
  customPrompt: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: THEME.borderHover,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    color: THEME.textPrimary,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipsLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusPill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  submitIntentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.amber,
    borderRadius: THEME.radiusPill,
    paddingVertical: 14,
    gap: 8,
    marginTop: 4,
  },
  submitIntentBtnPressed: {
    opacity: 0.85,
  },
  submitIntentBtnText: {
    color: THEME.textDark,
    fontSize: 14,
    fontWeight: '800',
  },
});
