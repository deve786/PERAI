import React from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, numerals, radius, useTheme } from './theme';
import { fmtMoney } from './stats';

/** PERAI's one rule: mono for data (amounts, dates, counts, stamps), sans for language. */
function familyFor(weight: TextStyle['fontWeight'], tabular?: boolean): string {
  const w = typeof weight === 'string' ? parseInt(weight, 10) : (weight ?? 400);
  if (tabular) return w >= 600 ? FONTS.monoMedium : FONTS.mono;
  if (w >= 700) return FONTS.sansSemi;
  if (w >= 500) return FONTS.sansMedium;
  return FONTS.sans;
}

/** Every screen mounts through here, so no content can slip under the status bar. */
export function Screen({ children, edges = ['top'], style }: {
  children: React.ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: c.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function T({ children, size = 15, weight = '400', sub, faint, tabular, style, numberOfLines, onPress }: {
  children: React.ReactNode; size?: number; weight?: TextStyle['fontWeight']; sub?: boolean; faint?: boolean;
  tabular?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number; onPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Text
      onPress={onPress}
      numberOfLines={numberOfLines}
      style={[
        { fontSize: size, fontFamily: familyFor(weight, tabular), color: faint ? c.faint : sub ? c.sub : c.text },
        tabular && numerals,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Amounts always render in mono so columns of money line up. */
export function Money({ value, size = 15, weight = '600', tone, style }: {
  value: number; size?: number; weight?: TextStyle['fontWeight']; tone?: string; style?: StyleProp<TextStyle>;
}) {
  const { c, symbol } = useTheme();
  return (
    <Text style={[{ fontSize: size, fontFamily: familyFor(weight, true), color: tone ?? c.text }, numerals, style]}>
      {fmtMoney(value, symbol)}
    </Text>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <T size={28} weight="700" style={[{ letterSpacing: -0.4 }, style]}>{children}</T>;
}

/** A white rounded box with a hairline border — the one container every screen uses. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: c.line }, style]}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }, style]} />;
}

/**
 * primary: solid moss, for the one main action on a screen.
 * ghost: outlined, for secondary actions. danger: red text, for Delete.
 */
export function Button({ title, onPress, kind = 'primary', icon, disabled, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.solid : kind === 'ghost' ? c.card : 'transparent';
  const fg = kind === 'primary' ? c.inkText : kind === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        minHeight: 48, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: bg,
        borderWidth: kind === 'ghost' ? 1 : 0, borderColor: c.border,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      }, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: FONTS.sansSemi, fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

/** Rounded pill. Selected = solid ink; otherwise outlined. `color` adds a category dot. */
export function Chip({ label, active, onPress, color, icon }: {
  label: string; active?: boolean; onPress?: () => void; color?: string; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        minHeight: 36, paddingHorizontal: 13, borderRadius: radius.pill, marginRight: 8, marginBottom: 8,
        backgroundColor: active ? c.text : c.card,
        borderWidth: 1, borderColor: active ? c.text : c.border,
        flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? c.bg : c.sub} /> : null}
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Text style={{ color: active ? c.bg : c.text, fontFamily: active ? FONTS.sansSemi : FONTS.sans, fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Small sentence-case heading above a field or a group: "Paid with", "Category". */
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <T size={14} weight="600" style={[{ marginBottom: 8 }, style]}>{children}</T>;
}

export function Field(props: TextInputProps & { label?: string; right?: React.ReactNode; containerStyle?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const { label, right, style, containerStyle, ...rest } = props;
  return (
    <View style={[{ marginBottom: 16 }, containerStyle]}>
      {label || right ? (
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          {label ? <T size={14} weight="600">{label}</T> : <View />}
          {right}
        </Row>
      ) : null}
      <TextInput
        placeholderTextColor={c.faint}
        {...rest}
        style={[{
          fontFamily: FONTS.sans, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm,
          paddingHorizontal: 14, minHeight: 48, paddingVertical: 12, fontSize: 16, color: c.text,
        }, style]}
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

/** A section heading: sentence case, optional link or control on the right. */
export function Section({ title, right, style }: { title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: 24, marginBottom: 8 }, style]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={16} weight="700">{title}</T>
        {right}
      </Row>
    </View>
  );
}

/** Round back (or close) button used at the left of every header. */
export function BackButton({ onPress, icon = 'chevron-back', label = 'Back' }: {
  onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; label?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 20, backgroundColor: c.well,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={21} color={c.text} />
    </Pressable>
  );
}

/** Small outlined pill button for header actions: "Edit", "+ Add", "Today". */
export function PillButton({ label, onPress, icon, primary, disabled, tone }: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; primary?: boolean; disabled?: boolean; tone?: string;
}) {
  const { c } = useTheme();
  const fg = primary ? c.inkText : tone ?? c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: primary ? c.solid : c.card, borderWidth: primary ? 0 : 1, borderColor: c.border,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: FONTS.sansSemi, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * The bar pinned at the top of a pushed screen: back button, title, one
 * action. Put it outside the ScrollView so it never scrolls away.
 */
export function TopBar({ title, subtitle, onBack, right }: {
  title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 62,
      paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: c.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
    }}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <View style={{ flex: 1, paddingLeft: onBack ? 0 : 6 }}>
        <T size={20} weight="700" numberOfLines={1}>{title}</T>
        {subtitle ? <T size={12} sub numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Screen header inside a scroll view. With onClose it shows a back button on
 * the left (pushed screens); without, a large title (tab roots).
 */
export function Header({ title, subtitle, onClose, right }: {
  title: string; subtitle?: string; onClose?: () => void; right?: React.ReactNode;
}) {
  if (onClose) {
    return (
      <Row style={{ gap: 10, marginBottom: subtitle ? 14 : 12 }}>
        <BackButton onPress={onClose} />
        <View style={{ flex: 1 }}>
          <T size={22} weight="700" numberOfLines={1}>{title}</T>
          {subtitle ? <T size={13} sub style={{ marginTop: 1 }}>{subtitle}</T> : null}
        </View>
        {right}
      </Row>
    );
  }
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: subtitle ? 14 : 12 }}>
      <View style={{ flex: 1 }}>
        <Title>{title}</Title>
        {subtitle ? <T size={14} sub style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {right}
    </Row>
  );
}

type BarAction = { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap };

/**
 * Pinned top bar for forms and detail pages. A form passes onCancel + a
 * primary "Save" action: Cancel sits at the left, the title in the middle,
 * Save on the right. A detail page passes onClose (a back button) and an
 * "Edit" action.
 */
export function ActionBar({ title, onClose, onCancel, actions }: {
  title: string;
  /** Back button at the left, for pages that just go back. */
  onClose?: () => void;
  /** "Cancel" text at the left, for forms. */
  onCancel?: () => void;
  actions?: BarAction[];
}) {
  const { c } = useTheme();
  // Older callers passed Cancel as an action; it belongs on the left.
  const list = actions ?? [];
  const cancel = onCancel ? { label: 'Cancel', onPress: onCancel } : list.find((a) => !a.primary && a.label === 'Cancel');
  const right = list.filter((a) => a !== cancel);
  const centred = !!cancel;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 62,
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: c.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
    }}>
      {onClose ? <BackButton onPress={onClose} /> : null}
      {cancel ? (
        <Pressable onPress={cancel.onPress} hitSlop={8} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
          <T size={16} sub>Cancel</T>
        </Pressable>
      ) : null}
      <T size={centred ? 17 : 20} weight="700" numberOfLines={1} style={{ flex: 1, textAlign: centred ? 'center' : 'left', paddingLeft: onClose || centred ? 0 : 8 }}>
        {title}
      </T>
      {right.map((a) => (
        <PillButton key={a.label} label={a.label} onPress={a.onPress} primary={a.primary} disabled={a.disabled} icon={a.icon ?? (a.label === 'Edit' ? 'pencil-outline' : undefined)} />
      ))}
    </View>
  );
}

/** Segmented switch (Cash | UPI | Card | Bank). */
export function Segmented<K extends string>({ options, value, onChange, style }: {
  options: readonly { key: K; label: string }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: c.well, borderRadius: radius.sm, padding: 4, gap: 4 }, style]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
              backgroundColor: on ? c.raised : 'transparent',
              shadowColor: '#000', shadowOpacity: on ? 0.08 : 0, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: on ? 1 : 0,
            }}
          >
            <Text numberOfLines={1} style={{ fontFamily: on ? FONTS.sansSemi : FONTS.sans, fontSize: 14, color: on ? c.text : c.sub }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A card holding rows separated by hairlines. Put ListRow children inside. */
export function ListCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14 }, style]}>
      {children}
    </View>
  );
}

/** One row in a ListCard: optional icon, label (+ sub line), value on the right, chevron when tappable. */
export function ListRow({ icon, iconColor, label, sub, value, valueTone, onPress, last, chevron, right }: {
  icon?: keyof typeof Ionicons.glyphMap; iconColor?: string; label: string; sub?: string;
  value?: string; valueTone?: string; onPress?: () => void; last?: boolean; chevron?: boolean; right?: React.ReactNode;
}) {
  const { c } = useTheme();
  const body = (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: sub ? 60 : 52,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
    }}>
      {icon ? <Ionicons name={icon} size={20} color={iconColor ?? c.sub} /> : null}
      <View style={{ flex: 1 }}>
        <T size={16}>{label}</T>
        {sub ? <T size={13} sub style={{ marginTop: 1 }}>{sub}</T> : null}
      </View>
      {value ? <T size={15} sub style={valueTone ? { color: valueTone } : undefined}>{value}</T> : null}
      {right}
      {onPress && chevron !== false ? <Ionicons name="chevron-forward" size={18} color={c.faint} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Square-ish shortcut tile: icon over a label (Calendar, Lists…), or icon beside label + sub line. */
export function IconTile({ icon, label, sub, onPress, wide }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; wide?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1, minHeight: wide ? 58 : 66, borderRadius: radius.sm, borderWidth: 1, borderColor: c.line, backgroundColor: c.card,
        flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center',
        gap: wide ? 10 : 5, paddingHorizontal: wide ? 12 : 4, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={wide ? 22 : 20} color={c.accent} />
      <View style={{ alignItems: wide ? 'flex-start' : 'center', flexShrink: 1 }}>
        <T size={wide ? 14 : 13} weight={wide ? '600' : '500'} numberOfLines={1}>{label}</T>
        {sub ? <T size={12} sub numberOfLines={1}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}

/** A quiet category mark — a tinted circle, not a boxed icon badge. */
export function IconDot({ icon, color, size = 36 }: { icon: string; color: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22`,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={size * 0.48} color={color} />
    </View>
  );
}

/** Horizontal proportional bar — the workhorse for ranked breakdowns. */
export function Meter({ fraction, tone, height = 6 }: { fraction: number; tone?: string; height?: number }) {
  const { c } = useTheme();
  const w = Math.max(0, Math.min(fraction, 1)) * 100;
  return (
    <View style={{ height, backgroundColor: c.well, overflow: 'hidden', borderRadius: height / 2 }}>
      <View style={{ width: `${w}%`, height, backgroundColor: tone ?? c.accent, borderRadius: height / 2 }} />
    </View>
  );
}

/**
 * In-app confirmation, replacing the OS's native Alert for destructive actions —
 * a system dialog looks out of place against the rest of the app's design.
 */
export function ConfirmDialog({ visible, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: {
  visible: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 360, backgroundColor: c.card, borderRadius: 18,
            borderWidth: 1, borderColor: c.line, padding: 20,
          }}
        >
          <T size={17} weight="700">{title}</T>
          <T size={15} sub style={{ marginTop: 8, lineHeight: 21 }}>{message}</T>
          <Row style={{ justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
            <Button title="Keep" kind="ghost" onPress={onCancel} style={{ minHeight: 44 }} />
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: c.danger, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: '#FFFFFF', fontFamily: FONTS.sansSemi, fontSize: 16 }}>{confirmLabel}</Text>
            </Pressable>
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Empty state: round icon, title, one line of help, optional button. */
export function Empty({ title, hint, icon, action }: {
  title: string; hint?: string; icon?: keyof typeof Ionicons.glyphMap; action?: { label: string; onPress: () => void };
}) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center', gap: 8 }}>
      {icon ? (
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Ionicons name={icon} size={26} color={c.sub} />
        </View>
      ) : null}
      <T size={17} weight="700" style={{ textAlign: 'center' }}>{title}</T>
      {hint ? <T size={14} sub style={{ textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>{hint}</T> : null}
      {action ? <Button title={action.label} kind="ghost" onPress={action.onPress} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}
