import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export interface DayFocusData {
  day: string;
  hours: number; // e.g. 1.2, 2.1, 2.8, 3.2, 2.6, 1.8, 1.1
  tone: 'amber' | 'green' | 'lime';
}

const DEFAULT_DAYS: DayFocusData[] = [
  { day: 'Mon', hours: 1.1, tone: 'amber' },
  { day: 'Tue', hours: 2.1, tone: 'green' },
  { day: 'Wed', hours: 2.8, tone: 'green' },
  { day: 'Thu', hours: 3.2, tone: 'green' },
  { day: 'Fri', hours: 2.5, tone: 'green' },
  { day: 'Sat', hours: 1.8, tone: 'lime' },
  { day: 'Sun', hours: 1.0, tone: 'amber' },
];

export function FocusBarChart({ data = DEFAULT_DAYS }: { data?: DayFocusData[] }): React.JSX.Element {
  const chartHeight = 130;
  const maxHours = 3.5;
  const barWidth = 20;
  const barRadius = 10;

  // Coordinate mapping
  // Y-axis spans from y=15 (top, ~3h) to y=110 (bottom, 0)
  const topY = 15;
  const bottomY = 110;
  const plotHeight = bottomY - topY;

  return (
    <View style={styles.container}>
      <Svg width="100%" height={chartHeight + 24} viewBox="0 0 320 154">
        <Defs>
          {/* Green Bar Gradient */}
          <LinearGradient id="greenBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#10F4A5" />
            <Stop offset="50%" stopColor="#00E599" />
            <Stop offset="100%" stopColor="#059669" />
          </LinearGradient>

          {/* Lime Bar Gradient */}
          <LinearGradient id="limeBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#84CC16" />
            <Stop offset="100%" stopColor="#00E599" />
          </LinearGradient>

          {/* Amber Bar Gradient */}
          <LinearGradient id="amberBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FBBF24" />
            <Stop offset="100%" stopColor="#FF9F0A" />
          </LinearGradient>
        </Defs>

        {/* Horizontal gridlines and right labels */}
        {/* 3h gridline */}
        <Line
          x1="12"
          y1={bottomY - (3.0 / maxHours) * plotHeight}
          x2="280"
          y2={bottomY - (3.0 / maxHours) * plotHeight}
          stroke="rgba(255, 255, 255, 0.05)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <SvgText
          x="292"
          y={bottomY - (3.0 / maxHours) * plotHeight + 4}
          fill="#5E6B7A"
          fontSize="10"
          fontWeight="500"
        >
          3h
        </SvgText>

        {/* 2h gridline */}
        <Line
          x1="12"
          y1={bottomY - (2.0 / maxHours) * plotHeight}
          x2="280"
          y2={bottomY - (2.0 / maxHours) * plotHeight}
          stroke="rgba(255, 255, 255, 0.05)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <SvgText
          x="292"
          y={bottomY - (2.0 / maxHours) * plotHeight + 4}
          fill="#5E6B7A"
          fontSize="10"
          fontWeight="500"
        >
          2h
        </SvgText>

        {/* 1h gridline */}
        <Line
          x1="12"
          y1={bottomY - (1.0 / maxHours) * plotHeight}
          x2="280"
          y2={bottomY - (1.0 / maxHours) * plotHeight}
          stroke="rgba(255, 255, 255, 0.05)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <SvgText
          x="292"
          y={bottomY - (1.0 / maxHours) * plotHeight + 4}
          fill="#5E6B7A"
          fontSize="10"
          fontWeight="500"
        >
          1h
        </SvgText>

        {/* Baseline (0) */}
        <Line
          x1="12"
          y1={bottomY}
          x2="280"
          y2={bottomY}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="1"
        />
        <SvgText x="294" y={bottomY + 4} fill="#5E6B7A" fontSize="10" fontWeight="500">
          0
        </SvgText>

        {/* 7 Bars */}
        {data.map((item, index) => {
          const x = 20 + index * 38;
          const h = (item.hours / maxHours) * plotHeight;
          const y = bottomY - h;

          let grad = 'url(#greenBarGrad)';
          let glowColor = '#00E599';
          if (item.tone === 'amber') {
            grad = 'url(#amberBarGrad)';
            glowColor = '#FF9F0A';
          } else if (item.tone === 'lime') {
            grad = 'url(#limeBarGrad)';
            glowColor = '#84CC16';
          }

          return (
            <React.Fragment key={item.day}>
              {/* Glow filter behind bar */}
              <Rect
                x={x - 2}
                y={y - 2}
                width={barWidth + 4}
                height={h + 4}
                rx={barRadius + 2}
                fill={glowColor}
                fillOpacity="0.18"
              />

              {/* Main Pill Bar */}
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={barRadius}
                fill={grad}
              />

              {/* Day Label */}
              <SvgText
                x={x + barWidth / 2}
                y={bottomY + 22}
                fill="#717E8E"
                fontSize="11"
                fontWeight="500"
                textAnchor="middle"
              >
                {item.day}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 8,
    alignItems: 'center',
  },
});
