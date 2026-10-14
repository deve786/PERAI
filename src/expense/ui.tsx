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
  return <T size={26} weight="700" style={[{ letterSpacing: -0.4 }, style]}>{children}</T>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.md, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, style]}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }, style]} />;
}

/**
 * PERAI renders its own text actions (UNDO, EDIT, RETRY) as uppercase mono
 * stamps rather than filled buttons — this keeps that voice even for
 * Expense's filled primary actions, so "Add expense" reads ADD EXPENSE.
 */
export function Button({ title, onPress, kind = 'primary', icon, disabled, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.ink : 'transparent';
  const fg = kind === 'primary' ? c.inkText : kind === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 15, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: bg,
        borderWidth: kind === 'primary' ? 0 : StyleSheet.hairlineWidth, borderColor: kind === 'danger' ? c.danger : c.line,
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      }, style]}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: FONTS.monoMedium, fontSize: 12, letterSpacing: 1 }}>{title.toUpperCase()}</Text>
    </Pressable>
  );
}

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
        paddingVertical: 7, paddingHorizontal: 11, borderRadius: radius.md, marginRight: 6, marginBottom: 6,
        backgroundColor: active ? c.ink : 'transparent',
        borderWidth: StyleSheet.hairlineWidth, borderColor: active ? c.ink : c.line,
        flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={12} color={active ? c.inkText : c.sub} /> : null}
      {color ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? c.inkText : color }} /> : null}
      <Text style={{
        color: active ? c.inkText : c.sub, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.9,
      }}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string; right?: React.ReactNode; containerStyle?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const { label, right, style, containerStyle, ...rest } = props;
  return (
    <View style={[{ marginBottom: 14 }, containerStyle]}>
      {label || right ? (
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
          {label ? <T size={10} sub style={{ fontFamily: FONTS.monoMedium, letterSpacing: 1.1 }}>{label.toUpperCase()}</T> : <View />}
          {right}
        </Row>
      ) : null}
      <TextInput
        placeholderTextColor={c.faint}
        {...rest}
        style={[{
          fontFamily: FONTS.sans, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
          paddingHorizontal: 0, paddingVertical: 10, fontSize: 16, color: c.text,
        }, style]}
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

/** Mono eyebrow + hairline, matching PERAI's own Section component exactly. */
export function Section({ title, right, style }: { title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ marginTop: 26, marginBottom: 10 }, style]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={10} sub style={{ fontFamily: FONTS.monoMedium, letterSpacing: 1.4 }}>{title.toUpperCase()}</T>
        {right}
      </Row>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginTop: 6 }} />
    </View>
  );
}

/** Screen header. Modals pass onClose to get the dismiss control. */
export function Header({ title, subtitle, onClose, right }: {
  title: string; subtitle?: string; onClose?: () => void; right?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: subtitle ? 14 : 10 }}>
      <View style={{ flex: 1 }}>
        <Title>{title}</Title>
        {subtitle ? <T size={14} sub style={{ marginTop: 3 }}>{subtitle}</T> : null}
      </View>
      {right}
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={14} accessibilityLabel="Close" accessibilityRole="button">
          <Ionicons name="close" size={24} color={c.sub} />
        </Pressable>
      ) : null}
    </Row>
  );
}

/** A quiet category mark — a tinted circle, not a boxed icon badge. */
export function IconDot({ icon, color, size = 36 }: { icon: string; color: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}1A`,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={size * 0.46} color={color} />
    </View>
  );
}

/** Horizontal proportional bar — the workhorse for ranked breakdowns. */
export function Meter({ fraction, tone, height = 3 }: { fraction: number; tone?: string; height?: number }) {
  const { c } = useTheme();
  const w = Math.max(0, Math.min(fraction, 1)) * 100;
  return (
    <View style={{ height, backgroundColor: c.line, overflow: 'hidden' }}>
      <View style={{ width: `${w}%`, height, backgroundColor: tone ?? c.text }} />
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
            width: '100%', maxWidth: 360, backgroundColor: c.card, borderRadius: radius.lg,
            borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 20,
          }}
        >
          <T size={16} weight="600">{title}</T>
          <T size={14} sub style={{ marginTop: 8, lineHeight: 20 }}>{message}</T>
          <Row style={{ justifyContent: 'flex-end', gap: 24, marginTop: 22 }}>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button">
              <T size={11} weight="600" style={{ fontFamily: FONTS.monoMedium, letterSpacing: 0.9 }}>KEEP</T>
            </Pressable>
            <Pressable onPress={onConfirm} hitSlop={10} accessibilityRole="button">
              <T size={11} weight="600" style={{ fontFamily: FONTS.monoMedium, letterSpacing: 0.9, color: c.danger }}>
                {confirmLabel.toUpperCase()}
              </T>
            </Pressable>
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ paddingVertical: 36, alignItems: 'center' }}>
      <T size={15} weight="600">{title}</T>
      {hint ? <T size={14} sub style={{ marginTop: 4, textAlign: 'center' }}>{hint}</T> : null}
    </View>
  );
}
