import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

interface AuraLogoProps {
  size?: number;
  color?: string;
}

export function AuraLogo({ size = 26, color = '#00E599' }: AuraLogoProps): React.JSX.Element {
  // Stylized futuristic chevron / triangle glyph matching the AURA 'A' mark in the design mockups
  const width = size;
  const height = size * 1.05;

  return (
    <Svg width={width} height={height} viewBox="0 0 28 30" fill="none">
      <Defs>
        <LinearGradient id="auraLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#10F4A5" />
          <Stop offset="100%" stopColor={color} />
        </LinearGradient>
      </Defs>

      {/* Main triangular chevron A shape */}
      <Path
        d="M14 2.5 L25.5 26.5 H19.8 L14 13.8 L8.2 26.5 H2.5 L14 2.5 Z"
        fill="url(#auraLogoGrad)"
      />

      {/* Futuristic inner horizontal energy bridge */}
      <Path
        d="M9.5 20.2 H18.5 L17.2 22.8 H10.8 L9.5 20.2 Z"
        fill="#0A0D12"
      />
    </Svg>
  );
}
