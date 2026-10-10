import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { AppHeader } from '../components/AppHeader';
import { OrbitPuckGraphic, FocusHubGraphic, FireTvGraphic } from '../components/DeviceGraphics';
import { AuraIcon } from '../components/AuraIcon';
import { THEME } from '../theme';

interface DevicesScreenProps {
  onNavigateToSettings: () => void;
  batteryLevel?: number | null;
}

export function DevicesScreen({
  onNavigateToSettings,
  batteryLevel = 84,
}: DevicesScreenProps): React.JSX.Element {
  const [deviceScanning, setDeviceScanning] = useState(false);
  const [orbitConnected, setOrbitConnected] = useState(true);
  const [fireTvPermission, setFireTvPermission] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const handleDevicePress = (deviceName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveModal(deviceName);
  };

  const handleConnectDevice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDeviceScanning(true);
    setTimeout(() => {
      setDeviceScanning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Device Scan Complete',
        '3 trusted AURA devices found and verified.\n\n• AURA Orbit (BLE 5.4)\n• Focus Hub (mDNS)\n• Fire TV (Home Network)',
      );
    }, 1500);
  };

  const handleTestHaptic = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Haptic Sent', 'Delivered gentle executive whisper pulse to AURA Orbit wearable.');
  };

  const handleGrantFireTv = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFireTvPermission(true);
    setActiveModal(null);
    Alert.alert('Permission Granted', 'Fire TV Ambient Display Bridge is now active.');
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
          <Text style={styles.mainTitle}>Connected devices</Text>
          <Text style={styles.subtitle}>
            Manage your trusted devices and connections.
          </Text>
        </View>

        {/* Card 1: AURA Orbit */}
        <Pressable
          style={({ pressed }) => [styles.deviceCard, pressed && styles.cardPressed]}
          onPress={() => handleDevicePress('AURA Orbit')}
          accessibilityRole="button"
          accessibilityLabel="AURA Orbit Device"
        >
          <View style={styles.deviceGraphicContainer}>
            <OrbitPuckGraphic width={78} height={62} />
          </View>

          <View style={styles.deviceDetails}>
            <View style={styles.deviceHeaderRow}>
              <Text style={styles.deviceName}>AURA Orbit</Text>
              <AuraIcon name="chevron-right" size={18} color="#6A7786" />
            </View>

            <View style={styles.statusRow}>
              <View style={[styles.statusDot, orbitConnected ? styles.dotGreen : styles.dotAmber]} />
              <Text style={styles.statusText}>
                {orbitConnected ? `Connected · ${batteryLevel ?? 84}%` : 'Disconnected'}
              </Text>
            </View>

            {/* Glowing Battery/Link Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: orbitConnected ? `${batteryLevel ?? 84}%` : '0%' },
                ]}
              />
            </View>
          </View>
        </Pressable>

        {/* Card 2: Focus Hub */}
        <Pressable
          style={({ pressed }) => [styles.deviceCard, pressed && styles.cardPressed]}
          onPress={() => handleDevicePress('Focus Hub')}
          accessibilityRole="button"
          accessibilityLabel="Focus Hub Device"
        >
          <View style={styles.deviceGraphicContainer}>
            <FocusHubGraphic width={78} height={62} />
          </View>

          <View style={styles.deviceDetails}>
            <View style={styles.deviceHeaderRow}>
              <Text style={styles.deviceName}>Focus Hub</Text>
              <AuraIcon name="chevron-right" size={18} color="#6A7786" />
            </View>

            <View style={styles.statusRow}>
              <View style={[styles.statusDot, styles.dotGreen]} />
              <Text style={styles.statusText}>Ready</Text>
            </View>
          </View>
        </Pressable>

        {/* Card 3: Fire TV */}
        <Pressable
          style={({ pressed }) => [styles.deviceCard, pressed && styles.cardPressed]}
          onPress={() => handleDevicePress('Fire TV')}
          accessibilityRole="button"
          accessibilityLabel="Fire TV Device"
        >
          <View style={styles.deviceGraphicContainer}>
            <FireTvGraphic width={78} height={62} />
          </View>

          <View style={styles.deviceDetails}>
            <View style={styles.deviceHeaderRow}>
              <Text style={styles.deviceName}>Fire TV</Text>
              <AuraIcon name="chevron-right" size={18} color="#6A7786" />
            </View>

            <View style={styles.statusRow}>
              <View style={[styles.statusDot, fireTvPermission ? styles.dotGreen : styles.dotAmber]} />
              <Text style={styles.statusText}>
                {fireTvPermission ? 'Permission granted · Ready' : 'Permission required'}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Card 4: Connect device */}
        <Pressable
          style={({ pressed }) => [styles.connectCard, pressed && styles.cardPressed]}
          onPress={handleConnectDevice}
          accessibilityRole="button"
          accessibilityLabel="Connect device"
        >
          <View style={styles.plusIconWrap}>
            {deviceScanning ? (
              <ActivityIndicator size="small" color="#00E599" />
            ) : (
              <AuraIcon name="plus-circle" size={24} color="#00E599" />
            )}
          </View>

          <Text style={styles.connectTitle}>
            {deviceScanning ? 'Scanning for devices…' : 'Connect device'}
          </Text>

          <AuraIcon name="chevron-right" size={18} color="#6A7786" />
        </Pressable>

        {/* Card 5: Security Approval Policy Card */}
        <Pressable
          style={({ pressed }) => [styles.securityBanner, pressed && styles.cardPressed]}
          onPress={() => handleDevicePress('Privacy Policy')}
          accessibilityRole="button"
        >
          <View style={styles.securityIconWrap}>
            <AuraIcon name="shield" size={22} color="#00E599" />
          </View>

          <View style={styles.securityContent}>
            <Text style={styles.securityTitle}>Actions always need approval</Text>
            <Text style={styles.securityText}>
              Your privacy is in control. No device can access your data or perform actions without your explicit approval.
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Device Details Modal */}
      {activeModal && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={!!activeModal}
          onRequestClose={() => setActiveModal(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setActiveModal(null)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{activeModal}</Text>
              <Text style={styles.modalSubtitle}>Hardware Protocol · BLE 5.4 Encrypted</Text>

              <View style={styles.modalDivider} />

              {activeModal === 'AURA Orbit' && (
                <>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Battery Capacity</Text>
                    <Text style={styles.modalVal}>{batteryLevel}% (48h left)</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Link Quality</Text>
                    <Text style={styles.modalValActive}>-58 dBm (Excellent)</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Haptic Engine</Text>
                    <Text style={styles.modalVal}>LRA Dual-Axis Actuator</Text>
                  </View>

                  <Pressable style={styles.secondaryButton} onPress={handleTestHaptic}>
                    <Text style={styles.secondaryButtonText}>Test Haptic Whisper Pulse</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.secondaryButton, { marginTop: -4 }]}
                    onPress={() => {
                      setOrbitConnected(!orbitConnected);
                      setActiveModal(null);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {orbitConnected ? 'Disconnect Orbit' : 'Connect Orbit'}
                    </Text>
                  </Pressable>
                </>
              )}

              {activeModal === 'Focus Hub' && (
                <>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Local Hub Protocol</Text>
                    <Text style={styles.modalVal}>Thread / Matter 1.3</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>LAN Throughput</Text>
                    <Text style={styles.modalValActive}>12 Mbps Low Latency</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Edge Processing</Text>
                    <Text style={styles.modalVal}>NPU 4.0 TOPS Active</Text>
                  </View>
                </>
              )}

              {activeModal === 'Fire TV' && (
                <>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Display Surface</Text>
                    <Text style={styles.modalVal}>Living Room Fire TV 4K</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Access Level</Text>
                    <Text style={fireTvPermission ? styles.modalValActive : styles.modalValAmber}>
                      {fireTvPermission ? 'Authorized' : 'Permission Required'}
                    </Text>
                  </View>

                  {!fireTvPermission && (
                    <Pressable style={styles.primaryActionButton} onPress={handleGrantFireTv}>
                      <Text style={styles.primaryActionText}>Grant Ambient Notification Permission</Text>
                    </Pressable>
                  )}
                </>
              )}

              {activeModal === 'Privacy Policy' && (
                <>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Policy Gate</Text>
                    <Text style={styles.modalValActive}>Hardware Enclave Gate</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Cloud Upload</Text>
                    <Text style={styles.modalVal}>Zero Raw Audio Stored</Text>
                  </View>
                  <Text style={styles.policyDescription}>
                    Every action proposed by connected devices requires local policy engine consent. Unsolicited actions are blocked at the device driver layer.
                  </Text>
                </>
              )}

              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setActiveModal(null)}
              >
                <Text style={styles.modalCloseText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
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
  deviceCard: {
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
  cardPressed: {
    backgroundColor: THEME.cardHover,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  deviceGraphicContainer: {
    width: 80,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceDetails: {
    flex: 1,
    gap: 5,
  },
  deviceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotGreen: {
    backgroundColor: '#00E599',
    shadowColor: '#00E599',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  dotAmber: {
    backgroundColor: '#FF9F0A',
    shadowColor: '#FF9F0A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  statusText: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: '#1E2632',
    borderRadius: 2.5,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E599',
    borderRadius: 2.5,
  },
  connectCard: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  plusIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 229, 153, 0.08)',
  },
  connectTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  securityBanner: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radiusCard,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginTop: 2,
  },
  securityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 229, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.25)',
  },
  securityContent: {
    flex: 1,
    gap: 4,
  },
  securityTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  securityText: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#131922',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 22,
    gap: 14,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: THEME.textSecondary,
    fontSize: 13,
    marginTop: -8,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalLabel: {
    color: THEME.textSecondary,
    fontSize: 14,
  },
  modalValActive: {
    color: '#00E599',
    fontSize: 14,
    fontWeight: '700',
  },
  modalValAmber: {
    color: '#FF9F0A',
    fontSize: 14,
    fontWeight: '700',
  },
  modalVal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryActionButton: {
    backgroundColor: '#00E599',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryActionText: {
    color: '#0A0D12',
    fontSize: 14,
    fontWeight: '800',
  },
  policyDescription: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  modalCloseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
