import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AuraLogo } from './AuraLogo';
import { AuraIcon } from './AuraIcon';
import * as Haptics from 'expo-haptics';

interface AppHeaderProps {
  title?: string;
  isSettingsScreen?: boolean;
  onPressSettings?: () => void;
}

export function AppHeader({
  title = 'AURA Mobile Bridge',
  isSettingsScreen = false,
  onPressSettings,
}: AppHeaderProps): React.JSX.Element {
  const handleSettingsPress = () => {
    if (onPressSettings) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPressSettings();
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.leftBrand}>
        <AuraLogo size={23} />
        <Text style={[styles.title, isSettingsScreen && styles.settingsTitle]}>
          {title}
        </Text>
      </View>

      {!isSettingsScreen && (
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
          onPress={handleSettingsPress}
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
        >
          <AuraIcon name="settings" size={19} color="#8895A5" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 14,
  },
  leftBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  settingsButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
