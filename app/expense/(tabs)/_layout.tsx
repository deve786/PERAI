import React from 'react';
import { Platform, StyleSheet, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/expense/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * One outline icon per tab, same icon whether active or not — like PERAI,
 * selection reads entirely through the accent-coloured label and icon tint,
 * not an icon swap. `size` comes from the tab bar itself (smaller in compact
 * layouts), so the icon stays responsive to that rather than a fixed number.
 */
function icon(name: IconName) {
  const TabBarIcon = ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size - 2} color={color} />
  );
  TabBarIcon.displayName = `TabBarIcon(${name})`;
  return TabBarIcon;
}

const monoFont = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

export default function TabsLayout() {
  const { c } = useTheme();
  // A custom tabBarStyle.height is used as-is by the tab bar, with no automatic
  // `+ insets.bottom` the way the library's own default height gets — so the
  // bottom safe-area inset (the home-indicator strip on Face ID iPhones) has to
  // be added in by hand here, or the icon/label row gets squeezed against it.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64 + insets.bottom,
          paddingTop: 10,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: monoFont,
          fontSize: 10,
          letterSpacing: 0.8,
          marginTop: 4,
        },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'HOME', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'HISTORY', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="analytics" options={{ title: 'ANALYTICS', tabBarIcon: icon('stats-chart-outline') }} />
      <Tabs.Screen name="chat" options={{ title: 'ASK', tabBarIcon: icon('sparkles-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'SETTINGS', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
