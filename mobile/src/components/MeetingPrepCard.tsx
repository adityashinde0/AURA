import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { FeedbackAction } from '../services/AuraApiClient';
import type { MeetingPrepCard as MeetingPrepCardType } from '../types';
import { THEME } from '../theme';

export interface MeetingPrepCardProps {
  card: MeetingPrepCardType;
  onAction?: (action: FeedbackAction | 'Open') => void;
}

const TONE_LABEL: Record<string, string> = {
  calm: 'Calm',
  confident: 'Confident',
  supportive: 'Supportive',
  neutral: 'Neutral',
  cautious: 'Cautious',
};

const TONE_COLOR: Record<string, string> = {
  calm: THEME.emerald,
  confident: THEME.brandYellow,
  supportive: THEME.lavender,
  neutral: THEME.textSecondary,
  cautious: THEME.amber,
};

export default function MeetingPrepCard({ card, onAction }: MeetingPrepCardProps): React.JSX.Element {
  const formatTime = (epoch: number): string => {
    return new Date(epoch * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const minutesUntil = (epoch: number): number => {
    return Math.max(0, Math.round((epoch * 1000 - Date.now()) / 60_000));
  };

  const mins = minutesUntil(card.startEpoch);
  const toneLabel = TONE_LABEL[card.emotionTone] ?? card.emotionTone;
  const toneColor = TONE_COLOR[card.emotionTone] ?? THEME.textSecondary;

  return (
    <View style={styles.card} testID="meeting-prep-card">
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {card.meetingTitle}
          </Text>
          <Text style={styles.subtitle}>
            at {formatTime(card.startEpoch)} · {mins > 0 ? `in ${mins} min` : 'Starting now'}
          </Text>
        </View>
        <View style={[styles.toneBadge, { borderColor: toneColor }]}>
          <Text style={[styles.toneBadgeText, { color: toneColor }]}>{toneLabel}</Text>
        </View>
      </View>

      <Text style={styles.summary} numberOfLines={4}>
        {card.prepSummary}
      </Text>

      {card.questions && card.questions.length > 0 && (
        <View style={styles.questionsContainer}>
          <Text style={styles.questionsLabel}>Questions to consider:</Text>
          {card.questions.map((question, index) => (
            <View key={index} style={styles.questionRow}>
              <Text style={styles.questionIndex}>{index + 1}.</Text>
              <Text style={styles.questionText}>{question}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.actionBtn, styles.primaryBtn]}
          onPress={() => onAction?.('Open')}
          accessibilityRole="button"
          accessibilityLabel="Open meeting details"
        >
          <Text style={styles.primaryBtnText}>Open</Text>
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => onAction?.('Save')}
          accessibilityRole="button"
          accessibilityLabel="Save meeting prep"
        >
          <Text style={styles.actionBtnText}>Save</Text>
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => onAction?.('Read')}
          accessibilityRole="button"
          accessibilityLabel="Mark meeting prep as read"
        >
          <Text style={styles.actionBtnText}>Read</Text>
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => onAction?.('Not useful')}
          accessibilityRole="button"
          accessibilityLabel="Mark meeting prep as not useful"
        >
          <Text style={styles.actionBtnText}>Not Useful</Text>
        </Pressable>

        <Pressable
          style={[styles.actionBtn, styles.destructiveBtn]}
          onPress={() => onAction?.('Mute this event series')}
          accessibilityRole="button"
          accessibilityLabel="Mute meeting series"
        >
          <Text style={styles.destructiveBtnText}>Mute</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.textMuted,
  },
  toneBadge: {
    borderWidth: 1,
    borderRadius: THEME.radiusPill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  toneBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  summary: {
    fontSize: 14,
    color: THEME.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  questionsContainer: {
    marginBottom: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  questionsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.warmSand,
    marginVertical: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  questionIndex: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.brandYellow,
    width: 20,
  },
  questionText: {
    flex: 1,
    fontSize: 13,
    color: THEME.textPrimary,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.radiusPill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  actionBtnText: {
    fontSize: 12,
    color: THEME.textPrimary,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: THEME.brandYellow,
    borderColor: THEME.brandYellow,
  },
  primaryBtnText: {
    fontSize: 12,
    color: THEME.textDark,
    fontWeight: '800',
  },
  destructiveBtn: {
    borderColor: 'rgba(244, 63, 94, 0.3)',
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
  destructiveBtnText: {
    fontSize: 12,
    color: THEME.rose,
    fontWeight: '700',
  },
});
