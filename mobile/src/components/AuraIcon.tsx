import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export function AuraIcon({ name, size = 20, color = '#FFFFFF' }: IconProps): React.JSX.Element {
  // Map common semantic names
  switch (name) {
    case 'shield':
      return <Ionicons name="shield-checkmark-outline" size={size} color={color} />;
    case 'settings':
      return <Ionicons name="settings-outline" size={size} color={color} />;
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
    case 'alert-circle':
      return <Feather name="alert-circle" size={size} color={color} />;
    case 'check':
      return <Feather name="check" size={size} color={color} />;
    case 'bookmark':
      return <Feather name="bookmark" size={size} color={color} />;
    case 'bell-off':
      return <Feather name="bell-off" size={size} color={color} />;
    case 'radio':
      return <Feather name="radio" size={size} color={color} />;
    case 'log-out':
      return <Feather name="log-out" size={size} color={color} />;
    case 'refresh':
      return <Feather name="refresh-cw" size={size} color={color} />;
    default:
      return <Ionicons name="sparkles-outline" size={size} color={color} />;
  }
}
