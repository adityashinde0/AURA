import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { THEME } from '../theme';

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const radians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

interface BatteryGaugeProps {
  level?: number;
}

/**
 * Battery arc gauge with amber curved meter, large numeric readout and percent sign.
 */
export function BatteryGauge({ level = 84 }: BatteryGaugeProps): React.JSX.Element {
  const cx = 60;
  const cy = 54;
  const r = 44;
  const startAngle = -120;
  const maxSweep = 240;

  // Progress arc
  const sweepAngle = (level / 100) * maxSweep;
  const progressEndAngle = startAngle + sweepAngle;

  const trackPath = describeArc(cx, cy, r, startAngle, startAngle + maxSweep);
  const progressPath = describeArc(cx, cy, r, startAngle, progressEndAngle);

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={120} height={92} viewBox="0 0 120 92">
        <Defs>
          <LinearGradient id="batteryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FF9F0A" />
            <Stop offset="100%" stopColor="#FFB340" />
          </LinearGradient>
        </Defs>

        {/* Inactive Track Arc */}
        <Path
          d={trackPath}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />

        {/* Glow halo */}
        <Path
          d={progressPath}
          stroke="#FF9F0A"
          strokeWidth="11"
          strokeOpacity="0.25"
          strokeLinecap="round"
          fill="none"
        />

        {/* Active Progress Arc */}
        <Path
          d={progressPath}
          stroke="url(#batteryGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>

      {/* Numerical readout centered in the arc */}
      <View style={styles.batteryCenterText}>
        <Text style={styles.batteryValue}>{level}</Text>
        <Text style={styles.batteryUnit}>%</Text>
      </View>
    </View>
  );
}

interface PrivacyGaugeProps {
  status?: string;
}

/**
 * Privacy status arc gauge with vibrant green curved meter, shield icon and status label.
 */
export function PrivacyGauge({ status = 'Active' }: PrivacyGaugeProps): React.JSX.Element {
  const cx = 60;
  const cy = 54;
  const r = 44;
  const startAngle = -120;
  const maxSweep = 240;

  const trackPath = describeArc(cx, cy, r, startAngle, startAngle + maxSweep);
  const progressPath = describeArc(cx, cy, r, startAngle, startAngle + maxSweep);

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={120} height={92} viewBox="0 0 120 92">
        <Defs>
          <LinearGradient id="privacyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#10F4A5" />
            <Stop offset="100%" stopColor="#00E599" />
          </LinearGradient>
        </Defs>

        {/* Glow halo */}
        <Path
          d={progressPath}
          stroke="#00E599"
          strokeWidth="11"
          strokeOpacity="0.25"
          strokeLinecap="round"
          fill="none"
        />

        {/* Active Progress Arc */}
        <Path
          d={progressPath}
          stroke="url(#privacyGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>

      {/* Shield and status centered in the arc */}
      <View style={styles.privacyCenterText}>
        <Ionicons name="shield-checkmark" size={17} color="#00E599" style={styles.privacyShield} />
        <Text style={styles.privacyStatus}>{status}</Text>
        <Text style={styles.privacySub}>All systems secure</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 98,
    position: 'relative',
  },
  batteryCenterText: {
    position: 'absolute',
    top: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batteryValue: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  batteryUnit: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: -2,
  },
  privacyCenterText: {
    position: 'absolute',
    top: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyShield: {
    marginBottom: 2,
  },
  privacyStatus: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  privacySub: {
    color: '#717E8E',
    fontSize: 9.5,
    fontWeight: '500',
    marginTop: 1,
  },
});
