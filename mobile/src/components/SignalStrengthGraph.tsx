import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
  Circle,
} from 'react-native-svg';

interface SignalStrengthGraphProps {
  height?: number;
}

export function SignalStrengthGraph({ height = 96 }: SignalStrengthGraphProps): React.JSX.Element {
  const chartWidth = 320;
  const chartHeight = height;

  // Exact Bézier path replicating the fluid wave from Image 4
  // Path coordinates designed for viewBox 0 0 320 96:
  // Starts amber at x=10, y=70 -> curve to peak at x=250, y=24 -> ends at x=310, y=32
  const strokePath =
    'M 12 72 ' +
    'C 35 72, 45 52, 65 48 ' +
    'C 85 44, 98 68, 120 64 ' +
    'C 142 60, 155 38, 178 36 ' +
    'C 201 34, 218 52, 235 44 ' +
    'C 244 40, 248 24, 256 24 ' +
    'C 264 24, 275 32, 308 30';

  // Area path for subtle gradient fill under the curve
  const areaPath = `${strokePath} L 308 92 L 12 92 Z`;

  // Peak marker coordinates
  const peakX = 256;
  const peakY = 24;

  return (
    <View style={styles.container}>
      <Svg width="100%" height={chartHeight} viewBox="0 0 320 96" preserveAspectRatio="none">
        <Defs>
          {/* Stroke gradient: Amber on left to Electric Mint on right */}
          <LinearGradient id="waveStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FF9F0A" />
            <Stop offset="30%" stopColor="#EAB308" />
            <Stop offset="55%" stopColor="#22C55E" />
            <Stop offset="85%" stopColor="#00E599" />
            <Stop offset="100%" stopColor="#10F4A5" />
          </LinearGradient>

          {/* Area fill gradient: Soft green/amber glow fading down */}
          <LinearGradient id="waveArea" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#00E599" stopOpacity="0.22" />
            <Stop offset="50%" stopColor="#00E599" stopOpacity="0.08" />
            <Stop offset="100%" stopColor="#00E599" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Subtle Horizontal Gridlines */}
        <Line x1="10" y1="26" x2="310" y2="26" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
        <Line x1="10" y1="50" x2="310" y2="50" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
        <Line x1="10" y1="74" x2="310" y2="74" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />

        {/* Subtle Vertical Gridlines */}
        <Line x1="70" y1="12" x2="70" y2="88" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />
        <Line x1="130" y1="12" x2="130" y2="88" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />
        <Line x1="190" y1="12" x2="190" y2="88" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />
        <Line x1="250" y1="12" x2="250" y2="88" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />

        {/* Ambient Area Fill under curve */}
        <Path d={areaPath} fill="url(#waveArea)" />

        {/* Glow Halo Stroke */}
        <Path
          d={strokePath}
          stroke="url(#waveStroke)"
          strokeWidth="6"
          strokeOpacity="0.28"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Crisp Main Wave Stroke */}
        <Path
          d={strokePath}
          stroke="url(#waveStroke)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Glowing Peak Dot */}
        {/* Outer Halo */}
        <Circle cx={peakX} cy={peakY} r="7" fill="#00E599" fillOpacity="0.25" />
        {/* Core Dot */}
        <Circle cx={peakX} cy={peakY} r="3.5" fill="#FFFFFF" stroke="#00E599" strokeWidth="2" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
