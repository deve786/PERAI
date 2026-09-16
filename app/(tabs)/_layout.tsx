import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet } from 'react-native';
import { COLORS, FONTS } from '@/theme';

/**
 * Icons survive the minimalist pass only here, where they earn their place:
 * a tab bar needs a glanceable target and the label alone is a small hit.
 * Everywhere else category and type are typographic.
 *
 * "Timeline" rather than "Archive" — a memory can have status `archived`, and
 * the interface should not use that word for something else.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.moss,
        tabBarInactiveTintColor: COLORS.mist,
        tabBarStyle: {
          backgroundColor: COLORS.paper,
          borderTopColor: COLORS.rule,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 74,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontFamily: FONTS.mono,
          fontSize: 10,
          letterSpacing: 0.9,
          marginTop: 3,
        },
        sceneStyle: { backgroundColor: COLORS.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'RECORD',
          tabBarIcon: ({ color }) => (
            <Ionicons name="add" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'TIMELINE',
          tabBarIcon: ({ color }) => (
            <Ionicons name="reorder-two-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'ASK',
          tabBarIcon: ({ color }) => (
            <Ionicons name="search-outline" size={18} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
