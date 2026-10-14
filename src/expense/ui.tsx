import React from 'react';
import { Modal, Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { numerals, radius, useTheme } from './theme';
import { fmtMoney } from './stats';

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
        { fontSize: size, fontWeight: weight, color: faint ? c.faint : sub ? c.sub : c.text },
        tabular && numerals,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Amounts always render with tabular figures so columns of money line up. */
export function Money({ value, size = 15, weight = '600', tone, style }: {
  value: number; size?: number; weight?: TextStyle['fontWeight']; tone?: string; style?: StyleProp<TextStyle>;
}) {
  const { c, symbol } = useTheme();
  return (
    <Text style={[{ fontSize: size, fontWeight: weight, color: tone ?? c.text }, numerals, style]}>
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
    <View style={[{ backgroundColor: c.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: c.line }, style]}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: 1, backgroundColor: c.line }, style]} />;
}

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
        borderWidth: kind === 'primary' ? 0 : 1, borderColor: kind === 'danger' ? c.danger : c.line,
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      }, style]}
    >
      {icon ? <Ionicons name={icon} size={17} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
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
        paddingVertical: 8, paddingHorizontal: 13, borderRadius: radius.pill, marginRight: 8, marginBottom: 8,
        backgroundColor: active ? c.ink : 'transparent',
        borderWidth: 1, borderColor: active ? c.ink : c.line,
        flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? c.inkText : c.sub} /> : null}
      {color ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? c.inkText : color }} /> : null}
      <Text style={{ color: active ? c.inkText : c.text, fontSize: 13, fontWeight: '500' }}>{label}</Text>
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
          {label ? <T size={13} sub>{label}</T> : <View />}
          {right}
        </Row>
      ) : null}
      <TextInput
        placeholderTextColor={c.faint}
        {...rest}
        style={[{
          backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.md,
          paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: c.text,
        }, style]}
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function Section({ title, right, style }: { title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Row style={[{ justifyContent: 'space-between', marginTop: 26, marginBottom: 10 }, style]}>
      <T size={14} weight="600" sub>{title}</T>
      {right}
    </Row>
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

export function IconDot({ icon, color, size = 38 }: { icon: string; color: string; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={{
      width: size, height: size, borderRadius: radius.md, backgroundColor: c.card,
      borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={size * 0.46} color={color} />
    </View>
  );
}

/** Horizontal proportional bar — the workhorse for ranked breakdowns. */
export function Meter({ fraction, tone, height = 6 }: { fraction: number; tone?: string; height?: number }) {
  const { c } = useTheme();
  const w = Math.max(0, Math.min(fraction, 1)) * 100;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: c.line, overflow: 'hidden' }}>
      <View style={{ width: `${w}%`, height, borderRadius: height / 2, backgroundColor: tone ?? c.text }} />
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
            borderWidth: 1, borderColor: c.line, padding: 20,
          }}
        >
          <T size={16} weight="700">{title}</T>
          <T size={14} sub style={{ marginTop: 8, lineHeight: 20 }}>{message}</T>
          <Row style={{ justifyContent: 'flex-end', gap: 24, marginTop: 22 }}>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button">
              <T size={14.5} weight="600">Keep</T>
            </Pressable>
            <Pressable onPress={onConfirm} hitSlop={10} accessibilityRole="button">
              <T size={14.5} weight="700" style={{ color: c.danger }}>{confirmLabel}</T>
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
