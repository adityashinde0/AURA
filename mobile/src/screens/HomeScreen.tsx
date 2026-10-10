import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { bleService, type OrbitDevice } from '../services/BLEService';
import { auraWS, getStoredUserId, type WatchWhisperCard } from '../services/AuraApiClient';
import { relayController } from '../controllers/RelayController';
import { signOut } from '../auth/AuthService';
import { THEME } from '../theme';
import { AuraIcon } from '../components/AuraIcon';
import type { HomeNavigationProp, FocusSession, MeetingPrepCard } from '../types';

const EMOTION_TONE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  calm: { label: 'Calm', color: THEME.emerald, bg: THEME.emeraldSubtle },
  confident: { label: 'Confident', color: THEME.brandYellow, bg: THEME.brandYellowGlow },
  supportive: { label: 'Supportive', color: THEME.lavender, bg: THEME.lavenderSubtle },
  neutral: { label: 'Neutral', color: THEME.textSecondary, bg: 'rgba(255,255,255,0.06)' },
  cautious: { label: 'Cautious', color: THEME.amber, bg: THEME.amberSubtle },
};

const DEMO_PREP_CARD: MeetingPrepCard = {
  cardId: 'card-demo-001',
  calendarEventId: 'cal-event-9988',
  meetingTitle: 'AURA Architecture Review & Sprint Sync',
  startEpoch: Math.floor(Date.now() / 1000) + 900,
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

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation<HomeNavigationProp>();

  const [bleState, setBleState] = useState<'idle' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle');
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [focusSession, setFocusSession] = useState<FocusSession | null>(null);
  const [prepCard, setPrepCard] = useState<MeetingPrepCard | null>(DEMO_PREP_CARD);
  const [scanResults, setScanResults] = useState<OrbitDevice[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const scanResultsRef = useRef<OrbitDevice[]>([]);

  // ── Bootstrap ────────────────────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const uid = await getStoredUserId();
      if (isMounted) setUserId(uid);
    })();

    // Wire BLE callbacks
    bleService.registerConnectionStateCallback((state, deviceId) => {
      if (!isMounted) return;
      setBleState(state);
      if (state === 'connected') {
        setConnectedDeviceId(deviceId ?? null);
        setScanResults([]);
        scanResultsRef.current = [];
        bleService.readBatteryLevel().then((lvl) => {
          if (isMounted && lvl >= 0) setBatteryLevel(lvl);
        }).catch(() => {});
      } else if (state === 'disconnected' || state === 'error') {
        setConnectedDeviceId(null);
        setBatteryLevel(null);
      }
    });

    bleService.registerBatteryCallback((lvl) => {
      if (isMounted) setBatteryLevel(lvl);
    });

    // Wire RelayController session updates
    const unsubscribe = relayController.subscribe((session) => {
      if (isMounted) setFocusSession(session);
    });

    // WebSocket state
    auraWS.registerStateCallback((connected) => {
      if (isMounted) setWsConnected(connected);
    });

    // WebSocket push messages — meeting prep card delivery
    auraWS.registerMessageCallback((data) => {
      if (!isMounted) return;
      try {
        const msg = data as Record<string, unknown>;
        if (msg.card_id && msg.meeting_title) {
          const card = msg as unknown as WatchWhisperCard;
          const prep: MeetingPrepCard = {
            cardId: card.card_id,
            calendarEventId: card.calendar_event_id,
            meetingTitle: card.meeting_title,
            startEpoch: card.start_epoch,
            prepSummary: card.prep_summary,
            questions: card.questions as [string, string, string],
            emotionTone: card.emotion_tone,
            evidenceSources: card.evidence_sources,
            hapticEnabled: card.haptic_enabled ?? true,
          };
          setPrepCard(prep);
          relayController.relayMeetingPrepToOrbit(card).catch(() => {});
        }
      } catch {
        // Silently ignore unknown messages
      }
    });

    auraWS.connect().catch(() => {});

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // ── Scan ─────────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setScanResults([]);
    scanResultsRef.current = [];
    try {
      await bleService.scanForOrbit((device) => {
        const exists = scanResultsRef.current.some((d) => d.id === device.id);
        if (!exists) {
          scanResultsRef.current = [...scanResultsRef.current, device];
          setScanResults([...scanResultsRef.current]);
        }
      }, 12_000);
    } catch {
      Alert.alert('Scan failed', 'Make sure Bluetooth is enabled and Orbit Pebble is nearby.');
    }
  }, []);

  const handleConnectDevice = useCallback(async (deviceId: string) => {
    bleService.stopScan();
    try {
      await bleService.connect(deviceId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      Alert.alert('Connection failed', 'Could not link with Orbit Pebble. Check range.');
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    await bleService.disconnect();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  // Demo simulator: lets user test connected state without physical pebble
  const handleSimulateOrbitLink = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBleState('connected');
    setConnectedDeviceId('orbit-pebble-demo-01');
    setBatteryLevel(94);
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleOpenFocusControl = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const sessionId = focusSession?.sessionId ?? 'new';
    navigation.navigate('FocusControl', { sessionId });
  }, [navigation, focusSession]);

  const handleOpenSafety = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('SafetySettings');
  }, [navigation]);

  const handleOpenPreferences = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('NotificationPreferences');
  }, [navigation]);

  const handleOpenPrepCard = useCallback(() => {
    if (!prepCard) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('MeetingPrepCard', { card: prepCard });
  }, [navigation, prepCard]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatTime = (epoch: number): string => {
    const d = new Date(epoch * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const minutesUntil = (epoch: number): number => {
    return Math.max(0, Math.round((epoch * 1000 - Date.now()) / 60_000));
  };

  const isConnected = bleState === 'connected';

  // ── Render Components ─────────────────────────────────────────────────────

  const renderHardwareCard = () => {
    return (
      <View style={styles.hardwareCard}>
        <View style={styles.hardwareTopRow}>
          <View style={styles.hardwareBadge}>
            <View style={[styles.statusDot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
            <Text style={styles.hardwareBadgeText}>
              {isConnected ? 'ORBIT PAIRED' : 'DISCONNECTED'}
            </Text>
          </View>
          {isConnected && batteryLevel !== null && (
            <View style={styles.batteryChip}>
              <AuraIcon name="battery" size={14} color={THEME.warmSand} />
              <Text style={styles.batteryText}>{batteryLevel}%</Text>
            </View>
          )}
        </View>

        <View style={styles.hardwareMainRow}>
          <View style={[styles.pebbleIconRing, isConnected && styles.pebbleIconRingActive]}>
            <AuraIcon name="radio" size={24} color={isConnected ? THEME.brandYellow : THEME.textMuted} />
          </View>
          <View style={styles.hardwareInfo}>
            <Text style={styles.hardwareTitle}>
              {isConnected ? 'AURA Orbit Pebble' : 'Orbit Wearable Offline'}
            </Text>
            <Text style={styles.hardwareSubtitle}>
              {isConnected
                ? 'BLE 5.4 · Active Haptic Relay ready'
                : 'Bring your Orbit close or tap below to link'}
            </Text>
          </View>
        </View>

        <View style={styles.hardwareActions}>
          {isConnected ? (
            <Pressable
              onPress={handleDisconnect}
              style={({ pressed }) => [styles.secondaryPill, pressed && styles.pillPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryPillText}>Disconnect Link</Text>
            </Pressable>
          ) : (
            <View style={styles.hardwareButtonsRow}>
              <Pressable
                onPress={handleScan}
                style={({ pressed }) => [styles.primaryPill, pressed && styles.pillPressed]}
                accessibilityRole="button"
              >
                <AuraIcon name="bluetooth" size={15} color={THEME.textDark} />
                <Text style={styles.primaryPillText}>
                  {bleState === 'scanning' ? 'Scanning…' : 'Scan for Orbit'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSimulateOrbitLink}
                style={({ pressed }) => [styles.simPill, pressed && styles.pillPressed]}
                accessibilityRole="button"
              >
                <AuraIcon name="flash" size={14} color={THEME.brandYellow} />
                <Text style={styles.simPillText}>Pair Virtual Pebble</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderScanResults = () => {
    if (bleState !== 'scanning' && scanResults.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Discovered Orbit Hardware</Text>
        {bleState === 'scanning' && scanResults.length === 0 && (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={THEME.brandYellow} />
            <Text style={styles.mutedText}> Searching for BLE 5.4 advertisements…</Text>
          </View>
        )}
        <FlatList
          data={scanResults}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              style={styles.deviceRow}
              onPress={() => handleConnectDevice(item.id)}
              accessibilityRole="button"
            >
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{item.name ?? 'AURA Orbit Pebble'}</Text>
                <Text style={styles.mutedText}>{item.rssi !== null ? `${item.rssi} dBm` : ''}</Text>
              </View>
              <View style={styles.connectChip}>
                <Text style={styles.connectChipText}>Connect</Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    );
  };

  const renderFocusStatus = () => {
    if (!focusSession) return null;
    const elapsed = Math.round((Date.now() / 1000 - focusSession.startedAt) / 60);
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Deep Work</Text>
        <View style={styles.focusCard}>
          <View style={styles.focusLeft}>
            <View style={styles.focusAuraDot} />
            <View>
              <Text style={styles.focusTimerTitle}>In Focus · {elapsed}m</Text>
              {focusSession.expiresAt && (
                <Text style={styles.focusTimerSub}>Until {formatTime(focusSession.expiresAt)}</Text>
              )}
            </View>
          </View>
          <Pressable
            style={styles.focusCtrlButton}
            onPress={handleOpenFocusControl}
            accessibilityRole="button"
          >
            <AuraIcon name="play" size={14} color={THEME.textDark} />
            <Text style={styles.focusCtrlButtonText}>Controls</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderPrepCard = () => {
    if (!prepCard) return null;
    const mins = minutesUntil(prepCard.startEpoch);
    const fallbackTone = { label: 'Confident', color: THEME.brandYellow, bg: THEME.brandYellowGlow };
    const toneConfig = (prepCard.emotionTone && EMOTION_TONE_CONFIG[prepCard.emotionTone]) ?? fallbackTone;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Executive Meeting Prep</Text>
          <View style={styles.tMinusBadge}>
            <Text style={styles.tMinusText}>T‑{mins} min</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.prepCard, pressed && styles.prepCardPressed]}
          onPress={handleOpenPrepCard}
          accessibilityRole="button"
        >
          <View style={styles.prepCardTop}>
            <View style={styles.prepTitleContainer}>
              <Text style={styles.prepTitle} numberOfLines={1}>{prepCard.meetingTitle}</Text>
              <Text style={styles.prepTime}>Starts at {formatTime(prepCard.startEpoch)}</Text>
            </View>
            <View style={[styles.toneChip, { backgroundColor: toneConfig.bg, borderColor: toneConfig.color }]}>
              <Text style={[styles.toneChipText, { color: toneConfig.color }]}>{toneConfig.label}</Text>
            </View>
          </View>

          <Text style={styles.prepSummary} numberOfLines={2}>
            {prepCard.prepSummary}
          </Text>

          <View style={styles.prepCardFooter}>
            <View style={styles.prepQuestionsPill}>
              <AuraIcon name="flash" size={13} color={THEME.brandYellow} />
              <Text style={styles.prepQuestionsText}>3 key questions prepared</Text>
            </View>
            <AuraIcon name="chevron-right" size={18} color={THEME.textSecondary} />
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Executive Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.headerTitle}>AURA</Text>
          <View style={styles.brandDot} />
        </View>

        <View style={styles.headerRight}>
          {wsConnected && (
            <View style={styles.wsIndicator}>
              <View style={styles.wsDot} />
              <Text style={styles.wsLabel}>LIVE</Text>
            </View>
          )}

          <Pressable
            onPress={handleOpenPreferences}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Notification Preferences"
          >
            <AuraIcon name="settings" size={20} color={THEME.textSecondary} />
          </Pressable>

          <Pressable
            onPress={handleOpenSafety}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Safety Settings"
          >
            <AuraIcon name="shield" size={20} color={THEME.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderHardwareCard()}
        {renderScanResults()}
        {renderFocusStatus()}
        {renderPrepCard()}

        {/* Start Focus CTA */}
        {!focusSession && (
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryCta,
                pressed && styles.primaryCtaPressed,
              ]}
              onPress={handleOpenFocusControl}
              accessibilityRole="button"
            >
              <AuraIcon name="play" size={18} color={THEME.textDark} />
              <Text style={styles.primaryCtaText}>Start Deep Work Session</Text>
            </Pressable>
          </View>
        )}

        {/* User sign out pill */}
        {userId && (
          <Pressable
            style={styles.signOutButton}
            onPress={() => {
              Alert.alert('Sign Out', 'Return to the sign-in screen?', [
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
            <AuraIcon name="log-out" size={14} color={THEME.textMuted} />
            <Text style={styles.userIdLabel}>
              Signed in as <Text style={styles.userIdBold}>{userId}</Text> · Sign out
            </Text>
          </Pressable>
        )}
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
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.textPrimary,
    letterSpacing: 3,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.brandYellow,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radiusPill,
    marginRight: 4,
  },
  wsDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: THEME.emerald,
  },
  wsLabel: {
    color: THEME.emerald,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: THEME.borderHover,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 18,
  },
  hardwareCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderColor: THEME.border,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  hardwareTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hardwareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotConnected: {
    backgroundColor: THEME.emerald,
  },
  dotDisconnected: {
    backgroundColor: THEME.amber,
  },
  hardwareBadgeText: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  batteryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.radiusPill,
  },
  batteryText: {
    color: THEME.warmSand,
    fontSize: 12,
    fontWeight: '700',
  },
  hardwareMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pebbleIconRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: THEME.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pebbleIconRingActive: {
    backgroundColor: 'rgba(255, 207, 0, 0.08)',
    borderColor: THEME.borderGold,
  },
  hardwareInfo: {
    flex: 1,
  },
  hardwareTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  hardwareSubtitle: {
    color: THEME.textMuted,
    fontSize: 13,
    lineHeight: 17,
  },
  hardwareActions: {
    marginTop: 4,
  },
  hardwareButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.brandYellow,
    paddingVertical: 12,
    borderRadius: THEME.radiusPill,
    gap: 6,
  },
  primaryPillText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '800',
  },
  simPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: THEME.borderGold,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: THEME.radiusPill,
    gap: 6,
  },
  simPillText: {
    color: THEME.brandYellow,
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: THEME.border,
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: THEME.radiusPill,
    alignItems: 'center',
  },
  secondaryPillText: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  pillPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tMinusBadge: {
    backgroundColor: THEME.amberSubtle,
    borderColor: THEME.amber,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: THEME.radiusPill,
  },
  tMinusText: {
    color: THEME.amberGlow,
    fontSize: 11,
    fontWeight: '800',
  },
  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.card,
    borderColor: THEME.borderGold,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 16,
  },
  focusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  focusAuraDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.brandYellow,
    shadowColor: THEME.brandYellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  focusTimerTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  focusTimerSub: {
    color: THEME.textMuted,
    fontSize: 12,
  },
  focusCtrlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.brandYellow,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: THEME.radiusPill,
  },
  focusCtrlButtonText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '800',
  },
  prepCard: {
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    padding: 16,
    gap: 12,
  },
  prepCardPressed: {
    borderColor: THEME.borderHover,
    backgroundColor: THEME.cardHover,
  },
  prepCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  prepTitleContainer: {
    flex: 1,
  },
  prepTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.textPrimary,
    marginBottom: 3,
  },
  prepTime: {
    fontSize: 13,
    color: THEME.textMuted,
  },
  toneChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: THEME.radiusPill,
    borderWidth: 1,
  },
  toneChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prepSummary: {
    fontSize: 13,
    color: THEME.textSecondary,
    lineHeight: 19,
  },
  prepCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  prepQuestionsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prepQuestionsText: {
    color: THEME.warmSand,
    fontSize: 12,
    fontWeight: '600',
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.brandYellow,
    borderRadius: THEME.radiusPill,
    paddingVertical: 16,
    gap: 8,
    shadowColor: THEME.brandYellow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  primaryCtaPressed: {
    backgroundColor: THEME.brandYellowHover,
    transform: [{ scale: 0.99 }],
  },
  primaryCtaText: {
    color: THEME.textDark,
    fontSize: 16,
    fontWeight: '800',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusInner,
    padding: 14,
    marginTop: 6,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  connectChip: {
    backgroundColor: THEME.brandYellow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radiusPill,
  },
  connectChipText: {
    color: THEME.textDark,
    fontSize: 12,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  mutedText: {
    fontSize: 13,
    color: THEME.textMuted,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 10,
  },
  userIdLabel: {
    fontSize: 12,
    color: THEME.textMuted,
  },
  userIdBold: {
    fontWeight: '700',
    color: THEME.warmSand,
  },
});
