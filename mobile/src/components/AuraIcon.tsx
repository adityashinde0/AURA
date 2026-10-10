import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Svg, { Circle, Path, G } from 'react-native-svg';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export function AuraIcon({ name, size = 20, color = '#FFFFFF' }: IconProps): React.JSX.Element {
  switch (name) {
    case 'shield':
    case 'shield-check':
      return <Ionicons name="shield-checkmark-outline" size={size} color={color} />;

    case 'calendar':
      return <Ionicons name="calendar-outline" size={size} color={color} />;

    case 'clock':
      return <Feather name="clock" size={size} color={color} />;

    case 'target':
    case 'concentric':
      // Gorgeous concentric focus rings matching Image 3 & 4
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" />
          <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.8" />
          <Circle cx="12" cy="12" r="2.2" fill={color} />
        </Svg>
      );

    case 'broadcast':
    case 'signal':
      // Concentric signal broadcast waves (( • )) matching Image 4
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="3" fill={color} />
          <Path
            d="M 7 7 A 7 7 0 0 0 7 17"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <Path
            d="M 17 7 A 7 7 0 0 1 17 17"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <Path
            d="M 4 4 A 11 11 0 0 0 4 20"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
          <Path
            d="M 20 4 A 11 11 0 0 1 20 20"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
        </Svg>
      );

    case 'layers':
      return <Feather name="layers" size={size} color={color} />;

    case 'link':
      return <Feather name="link-2" size={size} color={color} />;

    case 'bell':
      return <Feather name="bell" size={size} color={color} />;

    case 'settings':
    case 'gear':
      return <Ionicons name="settings-outline" size={size} color={color} />;

    case 'plus-circle':
      return <Feather name="plus-circle" size={size} color={color} />;

    case 'monitor':
    case 'laptop':
      return <Feather name="monitor" size={size} color={color} />;

    case 'home':
      return <Feather name="home" size={size} color={color} />;

    case 'nodes':
    case 'devices':
    case 'network':
      // Connected node graph icon matching bottom bar in Image 1
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="6" r="2.8" stroke={color} strokeWidth="1.8" />
          <Circle cx="6" cy="18" r="2.8" stroke={color} strokeWidth="1.8" />
          <Circle cx="18" cy="18" r="2.8" stroke={color} strokeWidth="1.8" />
          <Path d="M 10.5 8.2 L 7.5 15.5" stroke={color} strokeWidth="1.6" />
          <Path d="M 13.5 8.2 L 16.5 15.5" stroke={color} strokeWidth="1.6" />
        </Svg>
      );

    case 'bar-chart':
    case 'insights':
      return <Feather name="bar-chart-2" size={size} color={color} />;

    case 'user':
      return <Feather name="user" size={size} color={color} />;

    case 'bluetooth':
      return <Ionicons name="bluetooth-outline" size={size} color={color} />;

    case 'battery':
      return <Ionicons name="battery-charging-outline" size={size} color={color} />;

    case 'flash':
      return <Ionicons name="flash-outline" size={size} color={color} />;

    case 'chevron-right':
      return <Feather name="chevron-right" size={size} color={color} />;

    case 'chevron-left':
      return <Feather name="chevron-left" size={size} color={color} />;

    case 'play':
      return <Ionicons name="play" size={size} color={color} />;

    case 'pause':
      return <Ionicons name="pause" size={size} color={color} />;

    case 'stop':
      return <Ionicons name="stop" size={size} color={color} />;

    case 'check':
      return <Feather name="check" size={size} color={color} />;

    case 'log-out':
      return <Feather name="log-out" size={size} color={color} />;

    case 'refresh':
      return <Feather name="refresh-cw" size={size} color={color} />;

    case 'moon':
    case 'sleep':
      return <Feather name="moon" size={size} color={color} />;

    case 'coffee':
    case 'break':
      return <Feather name="coffee" size={size} color={color} />;

    case 'alert-circle':
    case 'distracted':
      return <Feather name="alert-circle" size={size} color={color} />;

    case 'zap':
      return <Feather name="zap" size={size} color={color} />;

    case 'tv':
      return <Feather name="tv" size={size} color={color} />;

    case 'bulb':
    case 'light':
      return <Feather name="sun" size={size} color={color} />;

    case 'plus':
      return <Feather name="plus" size={size} color={color} />;

    case 'x':
    case 'close':
      return <Feather name="x" size={size} color={color} />;

    case 'bookmark':
      return <Feather name="bookmark" size={size} color={color} />;

    case 'sliders':
      return <Feather name="sliders" size={size} color={color} />;

    case 'message-square':
    case 'slack':
      return <Feather name="message-square" size={size} color={color} />;

    case 'edit':
      return <Feather name="edit-2" size={size} color={color} />;

    case 'trash':
      return <Feather name="trash-2" size={size} color={color} />;

    default:
      return <Ionicons name="sparkles-outline" size={size} color={color} />;
  }
}
