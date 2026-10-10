import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { AppHeader } from '../components/AppHeader';
import { FocusBarChart } from '../components/FocusBarChart';
import { MiniSparkline } from '../components/MiniSparkline';
import { AuraIcon } from '../components/AuraIcon';
import { THEME } from '../theme';

interface InsightsScreenProps {
  onNavigateToSettings: () => void;
  onOpenFocusControl?: () => void;
}

export function InsightsScreen({
  onNavigateToSettings,
  onOpenFocusControl,
}: InsightsScreenProps): React.JSX.Element {
  const handleCardPress = (title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (title === 'Deep Work Bank' && onOpenFocusControl) {
      onOpenFocusControl();
    } else {
      Alert.alert(title, 'On-device neural inference verified. No raw telemetry left your secure enclave.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader
        title="AURA Mobile Bridge"
        onPressSettings={onNavigateToSettings}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>Focus insights</Text>
          <Text style={styles.subtitle}>
            See how AURA helps you stay focused and protected.
          </Text>
        </View>

        {/* Card 1: Main Focus Protected Chart Card */}
        <View style={styles.chartCard}>
          <View style={styles.chartTopRow}>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>This week</Text>
              <Text style={styles.statValue}>4h 32m</Text>
              <Text style={styles.statSub}>protected</Text>
            </View>

            <View style={styles.targetIconContainer}>
              <AuraIcon name="target" size={32} color="#00E599" />
            </View>
          </View>

          {/* 7-day pill bar chart */}
          <FocusBarChart />
        </View>

        {/* Card 2: Best focus window */}
        <Pressable
          style={({ pressed }) => [styles.insightCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('Best Focus Window')}
          accessibilityRole="button"
          accessibilityLabel="Best focus window details"
        >
          <View style={styles.iconCircleGreen}>
            <AuraIcon name="clock" size={22} color="#00E599" />
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Best focus window</Text>
            <Text style={styles.cardHighlight}>10:00 – 11:30</Text>
            <Text style={styles.cardDescription}>
              Your most consistent focus time this week.
            </Text>
          </View>

          <AuraIcon name="chevron-right" size={18} color="#6A7786" />
        </Pressable>

        {/* Card 3: Private to you */}
        <Pressable
          style={({ pressed }) => [styles.insightCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('Privacy Architecture')}
          accessibilityRole="button"
          accessibilityLabel="Privacy details"
        >
          <View style={styles.iconCircleGreen}>
            <AuraIcon name="shield" size={22} color="#00E599" />
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardTitleWhite}>Private to you</Text>
            <Text style={styles.cardDescription}>
              Your insights stay on your device and are never shared.
            </Text>
          </View>

          <AuraIcon name="chevron-right" size={18} color="#6A7786" />
        </Pressable>

        {/* Card 4: Deep Work Bank */}
        <Pressable
          style={({ pressed }) => [styles.insightCard, pressed && styles.cardPressed]}
          onPress={() => handleCardPress('Deep Work Bank')}
          accessibilityRole="button"
          accessibilityLabel="Deep work bank sessions"
        >
          <View style={styles.iconCircleAmber}>
            <AuraIcon name="layers" size={22} color="#FF9F0A" />
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Deep Work Bank</Text>
            <View style={styles.deepWorkRow}>
              <Text style={styles.deepWorkNumber}>+18</Text>
              <Text style={styles.deepWorkSub}>Focus sessions this week</Text>
            </View>
          </View>

          <View style={styles.sparklineWrap}>
            <MiniSparkline heights={[8, 14, 19, 24, 28]} />
          </View>

          <AuraIcon name="chevron-right" size={18} color="#6A7786" />
        </Pressable>
      </ScrollView>
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
    gap: 14,
  },
  titleSection: {
    marginBottom: 6,
  },
  mainTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: THEME.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  chartTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statColumn: {
    gap: 2,
  },
  statLabel: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statSub: {
    color: THEME.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  targetIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 229, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  iconCircleGreen: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 229, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleAmber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 159, 10, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardLabel: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  cardTitleWhite: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cardHighlight: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardDescription: {
    color: '#717E8E',
    fontSize: 12.5,
    lineHeight: 17,
  },
  deepWorkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  deepWorkNumber: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  deepWorkSub: {
    color: THEME.textSecondary,
    fontSize: 12,
  },
  sparklineWrap: {
    marginRight: 4,
  },
});
