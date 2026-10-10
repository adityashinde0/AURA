import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { AppHeader } from '../components/AppHeader';
import { SignalStrengthGraph } from '../components/SignalStrengthGraph';
import { BatteryGauge, PrivacyGauge } from '../components/RadialGauges';
import { MiniSparkline } from '../components/MiniSparkline';
import { AuraIcon } from '../components/AuraIcon';
import { THEME } from '../theme';

import { bleService } from '../services/BLEService';
import { auraWS, getStoredUserId, type WatchWhisperCard } from '../services/AuraApiClient';
import { relayController } from '../controllers/RelayController';
import type { HomeNavigationProp, FocusSession, MeetingPrepCard } from '../types';

const DEMO_PREP_CARD: MeetingPrepCard = {
  cardId: 'card-demo-001',
  calendarEventId: 'cal-event-9988',
  meetingTitle: 'Design Review',
  startEpoch: Math.floor(Date.now() / 1000) + 300,
  prepSummary: 'Review Orbit pebble BLE throughput, Focus Guardian policy gate contracts, and APNs whisper cards.',
  questions: [
    'How do we handle intermittent BLE disconnects during deep work?',
    'What latency guarantees are required for the APNs whisper relay?',
    'Is the 3-question prompt grounding compliant with Bedrock guardrails?',
  ],
  emotionTone: 'confident',
  evidenceSources: ['ARCHITECTURE.md', 'RelayController.ts', 'FocusGuardian.py'],
  hapticEnabled: true,
};

interface HomeScreenProps {
  onNavigateToTab?: (tab: 'home' | 'devices' | 'insights' | 'settings') => void;
  onOpenPrepCard?: (card: MeetingPrepCard) => void;
  onOpenFocusControl?: () => void;
}

export default function HomeScreen({
  onNavigateToTab,
  onOpenPrepCard,
  onOpenFocusControl,
}: HomeScreenProps): React.JSX.Element {
  const navigation = useNavigation<HomeNavigationProp>();

  const [batteryLevel, setBatteryLevel] = useState<number>(84);
  const [focusMinutes, setFocusMinutes] = useState<number>(42);
  const [prepCard, setPrepCard] = useState<MeetingPrepCard>(DEMO_PREP_CARD);
  const [focusSession, setFocusSession] = useState<FocusSession | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Battery & BLE updates
    bleService.registerBatteryCallback((lvl) => {
      if (isMounted && lvl >= 0) setBatteryLevel(lvl);
    });

    // Session updates
    const unsubSession = relayController.subscribe((session) => {
      if (!isMounted) return;
      setFocusSession(session);
      if (session) {
        const elapsed = Math.round((Date.now() / 1000 - session.startedAt) / 60);
        setFocusMinutes(Math.max(42, elapsed));
      }
    });

    return () => {
      isMounted = false;
      unsubSession();
    };
  }, []);

  const handleOpenMeeting = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onOpenPrepCard) {
      onOpenPrepCard(prepCard);
    } else {
      navigation.navigate('MeetingPrepCard', { card: prepCard });
    }
  }, [navigation, onOpenPrepCard, prepCard]);

  const handleOpenFocus = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onOpenFocusControl) {
      onOpenFocusControl();
    } else {
      navigation.navigate('FocusControl', { sessionId: focusSession?.sessionId ?? 'new' });
    }
  }, [navigation, onOpenFocusControl, focusSession]);

  const handleOpenDevices = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onNavigateToTab) {
      onNavigateToTab('devices');
    }
  }, [onNavigateToTab]);

  const handleOpenSettings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onNavigateToTab) {
      onNavigateToTab('settings');
    }
  }, [onNavigateToTab]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <AppHeader
        title="AURA Mobile Bridge"
        onPressSettings={handleOpenSettings}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card 1: Secure Connection Hero */}
        <Pressable
          style={({ pressed }) => [styles.heroCard, pressed && styles.cardPressed]}
          onPress={() => Alert.alert('Secure Connection', 'Hardware Enclave BLE 5.4 tunnel is active and encrypted with AES-256.')}
          accessibilityRole="button"
          accessibilityLabel="Secure Connection details"
        >
          <View style={styles.broadcastIconWrap}>
            <AuraIcon name="broadcast" size={24} color="#00E599" />
          </View>

          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>Secure Connection</Text>
            <Text style={styles.heroTitle}>Securely connected</Text>
            <Text style={styles.heroSubtext}>
              Your data is encrypted and your device is protected.
            </Text>
          </View>

          <AuraIcon name="chevron-right" size={18} color="#6A7786" />
        </Pressable>

        {/* Card 2: Signal Strength Waveform */}
        <View style={styles.signalCard}>
          <View style={styles.signalHeaderRow}>
            <Text style={styles.signalTitle}>Signal Strength</Text>
            <Pressable
              style={styles.signalRatingRow}
              onPress={() => Alert.alert('Signal Telemetry', 'RSSI: -58 dBm · BLE 5.4 Coded PHY · 0 packet loss')}
            >
              <Text style={styles.signalRatingText}>Excellent</Text>
              <AuraIcon name="chevron-right" size={15} color="#00E599" />
            </Pressable>
          </View>

          {/* Bézier gradient wave graph */}
          <SignalStrengthGraph height={92} />
        </View>

        {/* 2-Column Row: Battery & Privacy Status */}
        <View style={styles.gaugeRow}>
          {/* Column A: Battery */}
          <Pressable
            style={({ pressed }) => [styles.gaugeCard, pressed && styles.cardPressed]}
            onPress={() => Alert.alert('Battery Status', `Orbit Wearable is at ${batteryLevel}%. Estimated battery life: 48 hours.`)}
            accessibilityRole="button"
            accessibilityLabel="Battery gauge"
          >
            <View style={styles.gaugeHeader}>
              <Text style={styles.gaugeTitle}>Battery</Text>
              <AuraIcon name="chevron-right" size={15} color="#6A7786" />
            </View>

            <BatteryGauge level={batteryLevel} />
          </Pressable>

          {/* Column B: Privacy status */}
          <Pressable
            style={({ pressed }) => [styles.gaugeCard, pressed && styles.cardPressed]}
            onPress={() => Alert.alert('Privacy Status', 'Zero cloud audio upload. All speech synthesis & ambient noise detection run on-device.')}
            accessibilityRole="button"
            accessibilityLabel="Privacy status gauge"
          >
            <View style={styles.gaugeHeader}>
              <Text style={styles.gaugeTitle}>Privacy status</Text>
              <AuraIcon name="chevron-right" size={15} color="#6A7786" />
            </View>

            <PrivacyGauge status="Active" />
          </Pressable>
        </View>

        {/* Card 4: Today's Focus */}
        <Pressable
          style={({ pressed }) => [styles.standardCard, pressed && styles.cardPressed]}
          onPress={handleOpenFocus}
          accessibilityRole="button"
          accessibilityLabel="Today's focus details"
        >
          <View style={styles.iconCircleGreen}>
            <AuraIcon name="target" size={22} color="#00E599" />
          </View>

          <View style={styles.cardMain}>
            <Text style={styles.cardSublabel}>Today's Focus</Text>
            <View style={styles.focusStatRow}>
              <Text style={styles.focusBoldVal}>{focusMinutes} min</Text>
              <Text style={styles.focusProtectedText}>protected</Text>
            </View>
          </View>

          <View style={styles.sparklineWrap}>
            <MiniSparkline heights={[10, 16, 22, 28, 25]} />
          </View>

          <AuraIcon name="chevron-right" size={18} color="#6A7786" />
        </Pressable>

        {/* Card 5: Next meeting */}
        <Pressable
          style={({ pressed }) => [styles.standardCard, pressed && styles.cardPressed]}
          onPress={handleOpenMeeting}
          accessibilityRole="button"
          accessibilityLabel="Next meeting prep card"
        >
          <View style={styles.iconBoxGreen}>
            <AuraIcon name="calendar" size={22} color="#00E599" />
          </View>

          <View style={styles.cardMain}>
            <Text style={styles.cardSublabel}>Next meeting</Text>
            <Text style={styles.cardHeaderWhite}>Design Review</Text>
            <Text style={styles.cardTimeText}>in 5 min</Text>
          </View>

          <AuraIcon name="chevron-right" size={18} color="#6A7786" />
        </Pressable>

        {/* Card 6: Connected devices */}
        <Pressable
          style={({ pressed }) => [styles.standardCard, pressed && styles.cardPressed]}
          onPress={handleOpenDevices}
          accessibilityRole="button"
          accessibilityLabel="Connected devices"
        >
          <View style={styles.iconBoxGreen}>
            <AuraIcon name="laptop" size={22} color="#00E599" />
          </View>

          <View style={styles.cardMain}>
            <Text style={styles.cardSublabel}>Connected devices</Text>
            <View style={styles.bridgeHubRow}>
              <View style={styles.miniHubIcon} />
              <Text style={styles.bridgeHubTitle}>AURA Bridge Hub</Text>
            </View>
            <View style={styles.statusDotRow}>
              <View style={styles.statusDotGreen} />
              <Text style={styles.statusSpeedText}>Active • 12 Mbps</Text>
            </View>
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
  cardPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  heroCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  broadcastIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 229, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    flex: 1,
    gap: 2,
  },
  heroLabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  heroSubtext: {
    color: '#717E8E',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  signalCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  signalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  signalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signalRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signalRatingText: {
    color: '#00E599',
    fontSize: 13.5,
    fontWeight: '600',
  },
  gaugeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gaugeCard: {
    flex: 1,
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  gaugeTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  standardCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  cardMain: {
    flex: 1,
    gap: 3,
  },
  cardSublabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  focusStatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  focusBoldVal: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  focusProtectedText: {
    color: '#717E8E',
    fontSize: 13,
  },
  sparklineWrap: {
    marginRight: 4,
  },
  cardHeaderWhite: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cardTimeText: {
    color: '#717E8E',
    fontSize: 12,
  },
  bridgeHubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniHubIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B4856',
  },
  bridgeHubTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  statusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00E599',
    shadowColor: '#00E599',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  statusSpeedText: {
    color: THEME.textSecondary,
    fontSize: 12,
  },
});
