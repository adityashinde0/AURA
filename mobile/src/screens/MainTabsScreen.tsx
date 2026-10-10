import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import HomeScreen from './HomeScreen';
import { DevicesScreen } from './DevicesScreen';
import { InsightsScreen } from './InsightsScreen';
import { SettingsScreen } from './SettingsScreen';
import { BottomTabBar, type TabKey } from '../components/BottomTabBar';
import { THEME } from '../theme';
import type { HomeNavigationProp, MeetingPrepCard } from '../types';

interface MainTabsScreenProps {
  userId?: string | null;
}

export default function MainTabsScreen({ userId }: MainTabsScreenProps): React.JSX.Element {
  const navigation = useNavigation<HomeNavigationProp>();
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  const handleOpenPrepCard = (card: MeetingPrepCard) => {
    navigation.navigate('MeetingPrepCard', { card });
  };

  const handleOpenFocusControl = () => {
    navigation.navigate('FocusControl', { sessionId: 'current' });
  };

  const handleOpenSafety = () => {
    navigation.navigate('SafetySettings');
  };

  const handleOpenNotifications = () => {
    navigation.navigate('NotificationPreferences');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {activeTab === 'home' && (
          <HomeScreen
            onNavigateToTab={setActiveTab}
            onOpenPrepCard={handleOpenPrepCard}
            onOpenFocusControl={handleOpenFocusControl}
          />
        )}

        {activeTab === 'devices' && (
          <DevicesScreen
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsScreen
            onNavigateToSettings={() => setActiveTab('settings')}
            onOpenFocusControl={handleOpenFocusControl}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsScreen
            userId={userId}
            onOpenNotifications={handleOpenNotifications}
            onOpenFocusControl={handleOpenFocusControl}
            onOpenSafety={handleOpenSafety}
          />
        )}
      </View>

      {/* Persistent Bottom Tab Bar across all 4 screens */}
      <BottomTabBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  content: {
    flex: 1,
  },
});
