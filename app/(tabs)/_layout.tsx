import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/ThemeContext';
import { FONTS } from '@/theme';

/**
 * One combined tab bar for the whole app — PERAI's own screens and Expense's
 * sit side by side, not behind a mode switch. Only the most frequent action
 * from each side gets a primary slot (Record, Home); everything else is one
 * tap away through More, same as before when it lived behind Settings'
 * "Manage" section — this just makes that the front door instead of the
 * mode-switch toggle.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.moss,
        tabBarInactiveTintColor: colors.mist,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.rule,
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
        sceneStyle: { backgroundColor: colors.paper },
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
        name="expense-home"
        options={{
          title: 'HOME',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={18} color={color} />
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
      <Tabs.Screen
        name="more"
        options={{
          title: 'MORE',
          tabBarIcon: ({ color }) => (
            <Ionicons name="ellipsis-horizontal" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
