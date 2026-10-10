import React from 'react';
import { View, StyleSheet } from 'react-native';

interface MiniSparklineProps {
  heights?: number[];
}

export function MiniSparkline({ heights = [8, 14, 20, 26, 24] }: MiniSparklineProps): React.JSX.Element {
  // 5 mini vertical bars with gradient progression from amber to electric green
  const colors = ['#FF9F0A', '#EAB308', '#22C55E', '#00E599', '#10F4A5'];

  return (
    <View style={styles.container}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: h,
              backgroundColor: colors[i % colors.length],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3.5,
    height: 28,
  },
  bar: {
    width: 3.8,
    borderRadius: 2,
  },
});
