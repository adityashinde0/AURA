/**
 * Root application component for AURA Mobile.
 *
 * Responsibilities:
 * - Bootstrap: initialise RelayController BLE wiring on mount.
 * - Auth gate: redirect to AuthScreen if no credentials are stored.
 * - Push notifications: register for APNs / FCM tokens, forward
 *   WatchWhisperCard payloads to RelayController → Orbit haptic.
 * - Navigation stack: Home → FocusControl | SafetySettings.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

import { relayController } from './src/controllers/RelayController';
import { getStoredUserId, auraHttp, type WatchWhisperCard } from './src/services/AuraApiClient';
import { signIn, demoSignIn, onAuthStateChanged } from './src/auth/AuthService';
import { THEME } from './src/theme';
import { AuraIcon } from './src/components/AuraIcon';

import MainTabsScreen from './src/screens/MainTabsScreen';
import FocusControlScreen from './src/screens/FocusControlScreen';
import SafetySettingsScreen from './src/screens/SafetySettingsScreen';
import MeetingPrepCardScreen from './src/screens/MeetingPrepCardScreen';
import NotificationPreferencesScreen from './src/screens/NotificationPreferencesScreen';

import type { RootStackParamList } from './src/types';

// ─── Notification handler ─────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: THEME.bg,
    card: THEME.card,
    text: THEME.textPrimary,
    border: THEME.border,
    primary: THEME.green,
    notification: THEME.amber,
  },
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App(): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // 1. Check or auto-seed demo credentials for seamless Expo Go testing
    (async () => {
      let uid = await getStoredUserId();
      if (!uid) {
        // Automatically provide demo developer sandbox credentials
        const demo = await demoSignIn();
        uid = demo.userId;
      }
      if (isMounted) {
        setUserId(uid);
        setIsAuthenticated(true);
      }
    })();

    // 2. Listen for reactive auth changes
    const unsubAuth = onAuthStateChanged((authed) => {
      if (isMounted) setIsAuthenticated(authed);
    });

    // 3. Wire RelayController BLE bridge
    relayController.init();

    // 4. Register for push notifications
    registerForPushNotifications();

    // 5. Subscribe to push notification data payloads (meeting prep cards from APNs)
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown>;
      if (data?.card_id && data?.meeting_title) {
        relayController.relayMeetingPrepToOrbit(data as unknown as WatchWhisperCard).catch(() => {});
      }
    });

    return () => {
      isMounted = false;
      unsubAuth();
      subscription.remove();
    };
  }, []);

  const handleSignIn = async (): Promise<void> => {
    try {
      const res = await signIn();
      setUserId(res.userId);
      setIsAuthenticated(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      Alert.alert('Sign-in failed', message);
    }
  };

  const handleDemoSignIn = async (): Promise<void> => {
    try {
      const res = await demoSignIn();
      setUserId(res.userId);
      setIsAuthenticated(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Demo sign-in failed';
      Alert.alert('Demo sign-in failed', message);
    }
  };

  if (isAuthenticated === null) return <></>;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={AppNavTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: THEME.bg },
          }}
        >
          {isAuthenticated ? (
            <>
              <Stack.Screen name="Home">
                {() => <MainTabsScreen userId={userId} />}
              </Stack.Screen>
              <Stack.Screen name="FocusControl" component={FocusControlScreen} />
              <Stack.Screen name="SafetySettings" component={SafetySettingsScreen} />
              <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
              <Stack.Screen name="MeetingPrepCard" component={MeetingPrepCardScreen} />
            </>
          ) : (
            <Stack.Screen name="Auth">
              {() => <AuthScreen onSignIn={handleSignIn} onDemoSignIn={handleDemoSignIn} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── Inline Auth screen ───────────────────────────────────────────────────────

function AuthScreen({
  onSignIn,
  onDemoSignIn,
}: {
  onSignIn: () => Promise<void>;
  onDemoSignIn: () => Promise<void>;
}): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      await onSignIn();
    } finally {
      setLoading(false);
    }
  };

  const handleDemoPress = async () => {
    setDemoLoading(true);
    try {
      await onDemoSignIn();
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <SafeAreaView style={authStyles.container}>
      {/* Background ambient radial glow */}
      <View style={authStyles.ambientGlow} pointerEvents="none" />

      {/* Brand Header */}
      <View style={authStyles.headerContainer}>
        <View style={authStyles.badge}>
          <View style={authStyles.badgeDot} />
          <Text style={authStyles.badgeText}>AURA ORBIT · BLE 5.4</Text>
        </View>

        <Text style={authStyles.logo}>AURA</Text>
        <Text style={authStyles.tagline}>
          Proactive Memory That Fights For Your Focus
        </Text>
      </View>

      {/* Hardware Spec Card */}
      <View style={authStyles.pebbleCard}>
        <View style={authStyles.pebbleIconWrap}>
          <AuraIcon name="radio" size={22} color={THEME.brandYellow} />
        </View>
        <View style={authStyles.pebbleInfo}>
          <Text style={authStyles.pebbleTitle}>Context-Aware Wearable Companion</Text>
          <Text style={authStyles.pebbleSubtitle}>
            Haptic Whisper relay · Distraction guardian · Executive prep
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={authStyles.actionsContainer}>
        <Pressable
          style={({ pressed }) => [
            authStyles.primaryButton,
            pressed && authStyles.primaryButtonPressed,
            loading && authStyles.buttonLoading,
          ]}
          onPress={handlePress}
          disabled={loading || demoLoading}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Enterprise OAuth"
        >
          <Text style={authStyles.primaryButtonText}>
            {loading ? 'Connecting…' : 'Sign In with SSO / OAuth'}
          </Text>
          <AuraIcon name="chevron-right" size={18} color={THEME.textDark} />
        </Pressable>

        <View style={authStyles.dividerRow}>
          <View style={authStyles.dividerLine} />
          <Text style={authStyles.dividerText}>or</Text>
          <View style={authStyles.dividerLine} />
        </View>

        <Pressable
          style={({ pressed }) => [
            authStyles.demoButton,
            pressed && authStyles.demoButtonPressed,
            demoLoading && authStyles.buttonLoading,
          ]}
          onPress={handleDemoPress}
          disabled={loading || demoLoading}
          accessibilityRole="button"
          accessibilityLabel="Enter instant offline demo sandbox"
        >
          <AuraIcon name="flash" size={18} color={THEME.brandYellow} />
          <Text style={authStyles.demoButtonText}>
            {demoLoading ? 'Initializing Sandbox…' : 'Explore Interactive Demo'}
          </Text>
        </Pressable>
      </View>

      {/* Security note */}
      <View style={authStyles.privacyFooter}>
        <AuraIcon name="shield" size={14} color={THEME.textMuted} />
        <Text style={authStyles.privacyNote}>
          Hardware Enclave Encrypted · Zero Cloud Audio Storage
        </Text>
      </View>
    </SafeAreaView>
  );
}

const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  ambientGlow: {
    position: 'absolute',
    top: -120,
    alignSelf: 'center',
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(255, 207, 0, 0.08)',
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: THEME.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radiusPill,
    gap: 7,
    marginBottom: 20,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.brandYellow,
  },
  badgeText: {
    color: THEME.warmSand,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 6,
    color: THEME.textPrimary,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: 290,
    fontWeight: '400',
  },
  pebbleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusCard,
    padding: 18,
    gap: 14,
  },
  pebbleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 207, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: THEME.borderGold,
    borderWidth: 1,
  },
  pebbleInfo: {
    flex: 1,
  },
  pebbleTitle: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  pebbleSubtitle: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.brandYellow,
    borderRadius: THEME.radiusPill,
    paddingVertical: 17,
    gap: 8,
    shadowColor: THEME.brandYellow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryButtonPressed: {
    backgroundColor: THEME.brandYellowHover,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: THEME.textDark,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  buttonLoading: {
    opacity: 0.65,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.border,
  },
  dividerText: {
    fontSize: 12,
    color: THEME.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.card,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: THEME.radiusPill,
    paddingVertical: 16,
    gap: 10,
  },
  demoButtonPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: THEME.borderHover,
  },
  demoButtonText: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  privacyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  privacyNote: {
    fontSize: 11,
    color: THEME.textMuted,
    textAlign: 'center',
  },
});

// ─── Push registration helper ─────────────────────────────────────────────────

async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('aura-default', {
      name: 'AURA',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
  if (!tokenData) return;

  const uid = await getStoredUserId();
  if (!uid) return;

  await auraHttp.registerDevice(uid, tokenData.data).catch(() => {});
}
