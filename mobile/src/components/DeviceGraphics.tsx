import React from 'react';
import Svg, {
  Rect,
  Path,
  Circle,
  Ellipse,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  G,
} from 'react-native-svg';

interface GraphicProps {
  width?: number;
  height?: number;
}

/**
 * AURA Orbit: Cylindrical dark wearable puck with neon green perimeter glow ring.
 */
export function OrbitPuckGraphic({ width = 84, height = 66 }: GraphicProps): React.JSX.Element {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 80" fill="none">
      <Defs>
        {/* Soft emerald pool glow on table/surface */}
        <RadialGradient id="orbitGlow" cx="50%" cy="55%" r="50%">
          <Stop offset="0%" stopColor="#00E599" stopOpacity="0.45" />
          <Stop offset="55%" stopColor="#00E599" stopOpacity="0.15" />
          <Stop offset="100%" stopColor="#00E599" stopOpacity="0" />
        </RadialGradient>

        {/* Cylinder side gradient */}
        <LinearGradient id="orbitBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#1E2733" />
          <Stop offset="50%" stopColor="#131A22" />
          <Stop offset="100%" stopColor="#090D12" />
        </LinearGradient>

        {/* Cylinder top surface */}
        <LinearGradient id="orbitTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#2A3545" />
          <Stop offset="50%" stopColor="#18202A" />
          <Stop offset="100%" stopColor="#10151C" />
        </LinearGradient>

        {/* Neon green LED ring gradient */}
        <LinearGradient id="ledRing" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#00E599" stopOpacity="0.3" />
          <Stop offset="25%" stopColor="#10F4A5" stopOpacity="1" />
          <Stop offset="75%" stopColor="#00E599" stopOpacity="1" />
          <Stop offset="100%" stopColor="#00E599" stopOpacity="0.3" />
        </LinearGradient>
      </Defs>

      {/* Surface ambient glow */}
      <Ellipse cx="50" cy="46" rx="42" ry="24" fill="url(#orbitGlow)" />

      {/* Outer base shadow */}
      <Ellipse cx="50" cy="46" rx="36" ry="17" fill="#06090D" fillOpacity="0.8" />

      {/* Lower Cylinder Body */}
      <Path
        d="M 16 38 C 16 48 84 48 84 38 L 84 42 C 84 52 16 52 16 42 Z"
        fill="url(#orbitBody)"
      />

      {/* Neon Green LED Ring */}
      <Path
        d="M 15 36 C 15 47 85 47 85 36"
        stroke="url(#ledRing)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* LED Ring Glow Haze */}
      <Path
        d="M 15 36 C 15 47 85 47 85 36"
        stroke="#00E599"
        strokeWidth="7"
        strokeOpacity="0.3"
        strokeLinecap="round"
      />

      {/* Upper Cylinder Body */}
      <Path
        d="M 17 28 C 17 38 83 38 83 28 L 83 36 C 83 45 17 45 17 36 Z"
        fill="url(#orbitBody)"
      />

      {/* Top Elliptical Face */}
      <Ellipse cx="50" cy="28" rx="33" ry="14" fill="url(#orbitTop)" stroke="#384759" strokeWidth="1" />

      {/* Subtle Inner Bevel / Concave Rim */}
      <Ellipse cx="50" cy="27" rx="27" ry="11" fill="#121720" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.8" />

      {/* Glossy Reflection Highlight */}
      <Path
        d="M 28 23 C 36 19 54 18 64 21"
        stroke="rgba(255, 255, 255, 0.22)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Focus Hub: Rounded matte console box with centered green status LED slit.
 */
export function FocusHubGraphic({ width = 84, height = 66 }: GraphicProps): React.JSX.Element {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 80" fill="none">
      <Defs>
        {/* Ambient green glow under hub */}
        <RadialGradient id="hubGlow" cx="50%" cy="60%" r="50%">
          <Stop offset="0%" stopColor="#00E599" stopOpacity="0.45" />
          <Stop offset="60%" stopColor="#00E599" stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#00E599" stopOpacity="0" />
        </RadialGradient>

        <LinearGradient id="hubTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#252F3D" />
          <Stop offset="100%" stopColor="#151C24" />
        </LinearGradient>

        <LinearGradient id="hubFront" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#1A222C" />
          <Stop offset="100%" stopColor="#0C1016" />
        </LinearGradient>
      </Defs>

      {/* Surface glow */}
      <Ellipse cx="50" cy="50" rx="42" ry="22" fill="url(#hubGlow)" />

      {/* Shadow */}
      <Ellipse cx="50" cy="52" rx="38" ry="14" fill="#06090D" fillOpacity="0.9" />

      {/* Front Face of Hub */}
      <Path
        d="M 18 40 L 48 54 L 82 40 L 82 47 L 48 61 L 18 47 Z"
        fill="url(#hubFront)"
      />

      {/* Top Face (Perspective Diamond / Rounded Rhombus) */}
      <Path
        d="M 48 24 L 82 40 L 48 54 L 18 40 Z"
        fill="url(#hubTop)"
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth="1"
      />

      {/* Top Center Recessed Square Badge */}
      <Path
        d="M 48 31 L 67 40 L 48 48 L 30 40 Z"
        fill="#10151C"
        stroke="rgba(255, 255, 255, 0.06)"
        strokeWidth="0.8"
      />

      {/* Horizontal Glowing Green Slot / LED Bar on Front */}
      <Path
        d="M 33 49 L 45 54"
        stroke="#10F4A5"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Glow bloom */}
      <Path
        d="M 33 49 L 45 54"
        stroke="#00E599"
        strokeWidth="7"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Fire TV: Streaming stick with HDMI plug and warm amber ambient glow.
 */
export function FireTvGraphic({ width = 84, height = 66 }: GraphicProps): React.JSX.Element {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 80" fill="none">
      <Defs>
        {/* Warm amber glow */}
        <RadialGradient id="fireTvGlow" cx="50%" cy="55%" r="50%">
          <Stop offset="0%" stopColor="#FF9F0A" stopOpacity="0.42" />
          <Stop offset="65%" stopColor="#FF9F0A" stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#FF9F0A" stopOpacity="0" />
        </RadialGradient>

        <LinearGradient id="stickBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#2A303A" />
          <Stop offset="50%" stopColor="#1B2027" />
          <Stop offset="100%" stopColor="#0F1318" />
        </LinearGradient>

        <LinearGradient id="hdmiMetal" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#C2CBD6" />
          <Stop offset="50%" stopColor="#8C98A6" />
          <Stop offset="100%" stopColor="#586370" />
        </LinearGradient>
      </Defs>

      {/* Surface glow */}
      <Ellipse cx="48" cy="48" rx="44" ry="22" fill="url(#fireTvGlow)" />

      {/* Shadow */}
      <Ellipse cx="48" cy="50" rx="38" ry="12" fill="#06090D" fillOpacity="0.85" />

      {/* Main Stick Body (Tilted perspective rectangle) */}
      <G transform="rotate(6, 48, 44)">
        {/* Body */}
        <Rect
          x="18"
          y="32"
          width="50"
          height="22"
          rx="5"
          fill="url(#stickBody)"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="1"
        />

        {/* HDMI Metal Connector Tip on the Right */}
        <Rect
          x="67"
          y="36"
          width="13"
          height="14"
          rx="2"
          fill="url(#hdmiMetal)"
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="0.8"
        />

        {/* HDMI inner slot pins */}
        <Rect x="77" y="39" width="2.5" height="8" rx="1" fill="#242B33" />

        {/* Stick embossed subtle smile / logo line */}
        <Path
          d="M 32 43 Q 42 47 52 43"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}
