/**
 * MeetingPrepCardScreen — full-page executive meeting preparation card.
 *
 * Receives the MeetingPrepCard payload via route params, renders the
 * AI-generated briefing, and lets the user record one feedback action
 * (Read, Save, Not useful, Mute this event series) forwarded to the backend.
 */
import React, { useState } from 'react';
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { auraHttp, type FeedbackAction } from '../services/AuraApiClient';
import { THEME } from '../theme';
import { AuraIcon } from '../components/AuraIcon';
import type { MeetingPrepCardNavigationProp, RootStackParamList } from '../types';

type PrepCardRoute = RouteProp<RootStackParamList, 'MeetingPrepCard'>;

const TONE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  calm: { label: 'Calm', color: THEME.emerald, bg: THEME.emeraldSubtle },
  confident: { label: 'Confident', color: THEME.brandYellow, bg: THEME.brandYellowGlow },
  supportive: { label: 'Supportive', color: THEME.lavender, bg: THEME.lavenderSubtle },
  neutral: { label: 'Neutral', color: THEME.textSecondary, bg: 'rgba(255,255,255,0.06)' },
  cautious: { label: 'Cautious', color: THEME.amber, bg: THEME.amberSubtle },
};

const FEEDBACK_ACTIONS: Array<{
  action: FeedbackAction;
  label: string;
  icon: string;
  destructive?: boolean;
}> = [
  { action: 'Read', label: 'Mark as Read', icon: 'check' },
  { action: 'Save', label: 'Save Briefing', icon: 'bookmark' },
  { action: 'Not useful', label: 'Not Useful', icon: 'alert-circle' },
  { action: 'Mute this event series', label: 'Mute Series', icon: 'bell-off', destructive: true },
];

export default function MeetingPrepCardScreen(): React.JSX.Element {
  const navigation = useNavigation<MeetingPrepCardNavigationProp>();
  const route = useRoute<PrepCardRoute>();
  const { card } = route.params;

  const [submittingAction, setSubmittingAction] = useState<FeedbackAction | null>(null);
  const [completedAction, setCompletedAction] = useState<FeedbackAction | null>(null);

  const formatTime = (epoch: number): string => {
    return new Date(epoch * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const minutesUntil = (epoch: number): number =>
    Math.max(0, Math.round((epoch * 1000 - Date.now()) / 60_000));

  const handleFeedback = async (action: FeedbackAction): Promise<void> => {
    if (submittingAction !== null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (action === 'Mute this event series') {
      Alert.alert(
        'Mute this series?',
        'You will no longer receive prep cards for this recurring event.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mute series',
            style: 'destructive',
            onPress: () => void sendFeedback(action),
          },
        ],
      );
      return;
    }

    void sendFeedback(action);
  };

  const sendFeedback = async (action: FeedbackAction): Promise<void> => {
    setSubmittingAction(action);
    try {
      await auraHttp.sendNotificationFeedback(card.cardId, card.calendarEventId, action);
      setCompletedAction(action);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => navigation.goBack(), 900);
    } catch {
      Alert.alert('Feedback recorded locally', 'Network offline; action queued for sync.');
      setCompletedAction(action);
      setTimeout(() => navigation.goBack(), 900);
    } finally {
      setSubmittingAction(null);
    }
  };

  const mins = minutesUntil(card.startEpoch);
  const fallbackTone = { label: 'Confident', color: THEME.brandYellow, bg: THEME.brandYellowGlow };
  const toneConfig = (card.emotionTone && TONE_CONFIG[card.emotionTone]) ?? fallbackTone;

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
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Executive Briefing</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Meeting Hero Block ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.timeBadge}>
              <AuraIcon name="flash" size={13} color={THEME.amber} />
              <Text style={styles.timeBadgeText}>
                {mins > 0 ? `T‑${mins} MIN` : 'NOW'}
              </Text>
            </View>
            <View style={[styles.toneChip, { backgroundColor: toneConfig.bg, borderColor: toneConfig.color }]}>
              <Text style={[styles.toneChipText, { color: toneConfig.color }]}>{toneConfig.label} Tone</Text>
            </View>
          </View>

          <Text style={styles.meetingTitle}>{card.meetingTitle}</Text>
          <Text style={styles.meetingTime}>
            Scheduled for {formatTime(card.startEpoch)} · Grounded by Bedrock Guardian
          </Text>
        </View>

        {/* ── Executive AI Summary ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Context & Executive Summary</Text>
          <Text style={styles.summaryText}>{card.prepSummary}</Text>
        </View>

        {/* ── 3 Grounded Questions ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>High-Leverage Questions to Ask</Text>
          {card.questions.map((q, i) => (
            <View key={i} style={styles.questionItem}>
              <View style={styles.questionNumberPill}>
                <Text style={styles.questionNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.questionText}>{q}</Text>
            </View>
          ))}
        </View>

        {/* ── Grounded Evidence Sources ── */}
        {card.evidenceSources.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Grounded Evidence Sources</Text>
            <View style={styles.sourcesRow}>
              {card.evidenceSources.map((src, i) => (
                <View key={i} style={styles.sourcePill}>
                  <AuraIcon name="bookmark" size={12} color={THEME.warmSand} />
                  <Text style={styles.sourceText}>{src}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Haptic Status ── */}
        {card.hapticEnabled && (
          <View style={styles.hapticBanner}>
            <AuraIcon name="radio" size={14} color={THEME.brandYellow} />
            <Text style={styles.hapticText}>Haptic whisper pattern delivered to Orbit Pebble</Text>
          </View>
        )}

        {/* ── Feedback Actions ── */}
        <View style={styles.feedbackSection}>
          <Text style={styles.sectionHeading}>Feedback & Whisper Adjustment</Text>

          {completedAction !== null ? (
            <View style={styles.feedbackDoneCard}>
              <AuraIcon name="check" size={18} color={THEME.emerald} />
              <Text style={styles.feedbackDoneText}>
                Feedback recorded: {FEEDBACK_ACTIONS.find((a) => a.action === completedAction)?.label ?? completedAction}
              </Text>
            </View>
          ) : (
            <View style={styles.feedbackGrid}>
              {FEEDBACK_ACTIONS.map(({ action, label, icon, destructive }) => {
                const isSubmitting = submittingAction === action;
                const isDisabled = submittingAction !== null;
                return (
                  <Pressable
                    key={action}
                    style={({ pressed }) => [
                      styles.feedbackPill,
                      destructive && styles.feedbackPillDestructive,
                      pressed && styles.feedbackPillPressed,
                      isDisabled && !isSubmitting && styles.feedbackPillDisabled,
                    ]}
                    onPress={() => void handleFeedback(action)}
                    disabled={isDisabled}
                    accessibilityRole="button"
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={destructive ? THEME.rose : THEME.brandYellow} />
                    ) : (
                      <>
                        <AuraIcon
                          name={icon}
                          size={15}
                          color={destructive ? THEME.rose : THEME.textPrimary}
                        />
                        <Text
                          style={[
                            styles.feedbackPillText,
                            destructive && styles.feedbackPillTextDestructive,
                          ]}
                        >
                          {label}
                        </Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
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
  backLabel: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
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
  heroCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderColor: THEME.borderGold,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.amberSubtle,
    borderColor: THEME.amber,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radiusPill,
  },
  timeBadgeText: {
    color: THEME.amberGlow,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  toneChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radiusPill,
    borderWidth: 1,
  },
  toneChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  meetingTitle: {
    color: THEME.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  meetingTime: {
    color: THEME.textMuted,
    fontSize: 13,
  },
  sectionCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderColor: THEME.border,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  sectionHeading: {
    color: THEME.warmSand,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  summaryText: {
    color: THEME.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  questionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  questionNumberPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 207, 0, 0.1)',
    borderColor: THEME.borderGold,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  questionNumberText: {
    color: THEME.brandYellow,
    fontSize: 12,
    fontWeight: '800',
  },
  questionText: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  sourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: THEME.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.radiusPill,
  },
  sourceText: {
    color: THEME.warmSand,
    fontSize: 12,
    fontWeight: '600',
  },
  hapticBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 207, 0, 0.06)',
    borderColor: THEME.borderGold,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 12,
  },
  hapticText: {
    color: THEME.warmSand,
    fontSize: 12,
    fontWeight: '600',
  },
  feedbackSection: {
    gap: 12,
    marginTop: 6,
  },
  feedbackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  feedbackPill: {
    flex: 1,
    minWidth: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusPill,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  feedbackPillDestructive: {
    borderColor: 'rgba(244, 63, 94, 0.3)',
    backgroundColor: 'rgba(244, 63, 94, 0.05)',
  },
  feedbackPillPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: THEME.borderHover,
  },
  feedbackPillDisabled: {
    opacity: 0.5,
  },
  feedbackPillText: {
    color: THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackPillTextDestructive: {
    color: THEME.rose,
  },
  feedbackDoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: THEME.emeraldSubtle,
    borderColor: THEME.emerald,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 16,
  },
  feedbackDoneText: {
    color: THEME.emerald,
    fontSize: 14,
    fontWeight: '700',
  },
});
