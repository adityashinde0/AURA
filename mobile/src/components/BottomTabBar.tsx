import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AuraIcon } from './AuraIcon';
import { THEME } from '../theme';

export type TabKey = 'home' | 'devices' | 'insights' | 'settings';

interface BottomTabBarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

interface TabConfig {
  key: TabKey;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'devices', label: 'Devices', icon: 'nodes' },
  { key: 'insights', label: 'Insights', icon: 'insights' },
  { key: 'settings', label: 'Settings', icon: 'user' },
];

export function BottomTabBar({ activeTab, onSelectTab }: BottomTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  const handlePress = (tab: TabKey) => {
    if (tab !== activeTab) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onSelectTab(tab);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.tabsRow}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const iconColor = isActive ? '#00E599' : '#6B7888';
          const textColor = isActive ? '#00E599' : '#6B7888';

          return (
            <Pressable
              key={tab.key}
              style={styles.tabButton}
              onPress={() => handlePress(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <View style={styles.iconContainer}>
                <AuraIcon name={tab.icon} size={22} color={iconColor} />
              </View>

              <Text style={[styles.tabLabel, { color: textColor }]}>
                {tab.label}
              </Text>

              {/* Glowing Mint Underline Indicator */}
              <View
                style={[
                  styles.activeIndicator,
                  isActive ? styles.activeIndicatorVisible : styles.activeIndicatorHidden,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D1117',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  iconContainer: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  activeIndicator: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#00E599',
    marginTop: 5,
  },
  activeIndicatorVisible: {
    opacity: 1,
  },
  activeIndicatorHidden: {
    opacity: 0,
  },
});
