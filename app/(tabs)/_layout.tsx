import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { BottomSheet, SheetAction } from '@/components/BottomSheet';
import { useTheme } from '@/ThemeContext';
import { FONTS } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Menu = 'record' | 'money' | 'ask';

interface Shortcut {
  label: string;
  hint?: string;
  icon: IconName;
  to: Href;
}

/**
 * What a long press on each tab offers: the jobs you open that tab to do,
 * one step sooner. Holding Money and choosing "Scan a receipt" skips the
 * Money screen entirely; holding Record and choosing "Speak" starts listening
 * the moment the tab opens.
 */
const SHORTCUTS: Record<Menu, { title: string; items: Shortcut[] }> = {
  record: {
    title: 'Record',
    items: [
      { label: 'Speak a note', hint: 'Starts listening straight away', icon: 'mic-outline', to: { pathname: '/', params: { start: 'voice' } } },
      { label: 'Type a note', hint: 'Opens the keyboard on the note box', icon: 'create-outline', to: { pathname: '/', params: { start: 'type' } } },
      { label: 'Timeline', hint: 'Everything you have recorded, by day', icon: 'list-outline', to: '/timeline' },
    ],
  },
  money: {
    title: 'Money',
    items: [
      { label: 'Add an expense', icon: 'remove-circle-outline', to: '/expense/expense' },
      { label: 'Scan a receipt', hint: 'Photograph a bill and fill it in for you', icon: 'camera-outline', to: { pathname: '/expense/expense', params: { scan: '1' } } },
      { label: 'Add income', icon: 'add-circle-outline', to: '/expense/income' },
      { label: 'History', icon: 'receipt-outline', to: '/expense-history' },
    ],
  },
  ask: {
    title: 'Ask',
    items: [
      { label: 'Data sources', hint: 'Documents, websites and Telegram channels Ask reads from', icon: 'documents-outline', to: '/data-sources' as Href },
    ],
  },
};

/**
 * Five tabs, always labelled: Record · Money · Insights · Ask · More.
 * Calendar is still a route here (so links to /calendar keep working) but
 * has no slot of its own — it opens from Record's shortcuts and from More.
 *
 * Record, Money and Ask also answer a long press with a short menu of what
 * you usually open them to do.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const [menu, setMenu] = useState<Menu | null>(null);

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

  const openMenu = (which: Menu) => () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMenu(which);
  };

  const shown = menu ? SHORTCUTS[menu] : null;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Typing hides the bar, so the input sits right above the keyboard.
          tabBarHideOnKeyboard: true,
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
        <Tabs.Screen
          name="index"
          options={{ title: 'Record', tabBarIcon: icon('mic-outline', 'mic'), tabBarAccessibilityLabel: 'Record. Long press for shortcuts.' }}
          listeners={{ tabLongPress: openMenu('record') }}
        />
        <Tabs.Screen
          name="expense-home"
          options={{ title: 'Money', tabBarIcon: icon('wallet-outline', 'wallet'), tabBarAccessibilityLabel: 'Money. Long press for shortcuts.' }}
          listeners={{ tabLongPress: openMenu('money') }}
        />
        <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
        <Tabs.Screen
          name="ask"
          options={{ title: 'Ask', tabBarIcon: icon('sparkles-outline', 'sparkles'), tabBarAccessibilityLabel: 'Ask. Long press for shortcuts.' }}
          listeners={{ tabLongPress: openMenu('ask') }}
        />
        <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal') }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar', href: null }} />
      </Tabs>

      <BottomSheet visible={menu !== null} onClose={() => setMenu(null)} title={shown?.title}>
        {shown?.items.map((item) => (
          <SheetAction
            key={item.label}
            label={item.label}
            hint={item.hint}
            icon={<Ionicons name={item.icon} size={22} color={colors.moss} />}
            onPress={() => {
              setMenu(null);
              router.push(item.to);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
