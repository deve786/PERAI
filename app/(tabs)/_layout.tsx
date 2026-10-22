import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useTheme } from '@/ThemeContext';
import { FONTS } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Five tabs, always labelled: Record · Money · Insights · Ask · More.
 * Calendar is still a route here (so links to /calendar keep working) but
 * has no slot of its own — it opens from Record's shortcuts and from More.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  // The active tab gets a soft moss pill behind its icon, so it reads as
  // selected even without relying on colour alone.
  const icon = (name: IconName, active: IconName = name) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <View style={[styles.pill, focused && { backgroundColor: colors.mossSoft }]}>
          <Ionicons name={focused ? active : name} size={21} color={color as string} />
        </View>
      );
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.moss,
        tabBarInactiveTintColor: colors.graphite,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.rule,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 76,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: FONTS.sansSemi,
          fontSize: 11,
          marginTop: 2,
        },
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Record', tabBarIcon: icon('mic-outline', 'mic') }} />
      <Tabs.Screen name="expense-home" options={{ title: 'Money', tabBarIcon: icon('wallet-outline', 'wallet') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask', tabBarIcon: icon('sparkles-outline', 'sparkles') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
