import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { ChipWrap } from './Chip';
import { DEFAULT_CURRENCY } from '../constants';
import { fullDateLabel } from '../format';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, type Colors } from '../theme';
import { Button } from '../expense/ui';
import {
  CATEGORIES,
  MEMORY_TYPES,
  PRIORITIES,
  type MemoryDraft,
  type Priority,
} from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  draft: MemoryDraft;
  index: number;
  total: number;
  onChange: (patch: Partial<MemoryDraft>) => void;
  onSave: () => void;
  onDiscard: () => void;
}

/** Shifts an ISO timestamp by whole days, keeping the clock time. */
function shiftDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/** "personal care" → "Personal care". */
function sentence(text: string) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function DraftCard({ draft, index, total, onChange, onSave, onDiscard }: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((value) => !value);
  };

  return (
    <View style={styles.card}>
      {total > 1 ? (
        <Text style={type.fine}>
          {index + 1} of {total}
        </Text>
      ) : null}

      <TextInput
        value={draft.title}
        onChangeText={(title) => onChange({ title })}
        style={styles.titleInput}
        placeholder="Untitled"
        placeholderTextColor={colors.mist}
        accessibilityLabel="Title"
        multiline
      />

      <Text style={type.fine}>
        {[
          sentence(draft.type),
          sentence(draft.category),
          fullDateLabel(draft.eventDate),
        ]
          .filter(Boolean)
          .join(' · ')}
        {draft.amount !== null ? (
          <Text style={styles.figure}>
            {'  '}
            {draft.currency ?? ''} {draft.amount}
          </Text>
        ) : null}
      </Text>

      {draft.dateExpression ? (
        <Text style={[type.fine, styles.said]}>You said “{draft.dateExpression}”</Text>
      ) : null}

      <Pressable
        onPress={toggle}
        style={styles.more}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.moreText}>More details</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mist} />
      </Pressable>

      {open ? (
        <View style={styles.fields}>
          <Field label="Type">
            <ChipWrap
              options={MEMORY_TYPES}
              value={draft.type}
              onChange={(value) => value && onChange({ type: value })}
            />
          </Field>

          <Field label="Category">
            <ChipWrap
              options={CATEGORIES}
              value={draft.category}
              onChange={(value) => value && onChange({ category: value })}
            />
          </Field>

          <Field label="When">
            <View style={styles.dateRow}>
              <Pressable
                style={styles.step}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="A day earlier"
                onPress={() => onChange({ eventDate: shiftDays(draft.eventDate, -1) })}
              >
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </Pressable>
              <Text style={[type.body, styles.dateText]}>{fullDateLabel(draft.eventDate)}</Text>
              <Pressable
                style={styles.step}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="A day later"
                onPress={() => onChange({ eventDate: shiftDays(draft.eventDate, 1) })}
              >
                <Ionicons name="chevron-forward" size={18} color={colors.ink} />
              </Pressable>
            </View>
          </Field>

          <View style={styles.pair}>
            <Field label="Amount" style={styles.pairItem}>
              <TextInput
                value={draft.amount === null ? '' : String(draft.amount)}
                onChangeText={(raw) => {
                  const cleaned = raw.replace(/[^0-9.]/g, '');
                  if (cleaned === '') {
                    onChange({ amount: null, currency: null });
                    return;
                  }
                  const value = Number(cleaned);
                  onChange({
                    amount: Number.isFinite(value) ? value : null,
                    currency: draft.currency ?? DEFAULT_CURRENCY,
                  });
                }}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.mist}
                style={[styles.input, styles.mono]}
              />
            </Field>

            <Field label="Currency" style={styles.pairItem}>
              <TextInput
                value={draft.currency ?? ''}
                onChangeText={(currency) =>
                  onChange({ currency: currency.trim() ? currency.toUpperCase() : null })
                }
                autoCapitalize="characters"
                placeholder="—"
                placeholderTextColor={colors.mist}
                style={styles.input}
              />
            </Field>
          </View>

          <Field label="People">
            <TextInput
              value={draft.people ?? ''}
              onChangeText={(people) => onChange({ people: people.trim() ? people : null })}
              placeholder="Comma separated"
              placeholderTextColor={colors.mist}
              style={styles.input}
            />
          </Field>

          <Field label="Place">
            <TextInput
              value={draft.location ?? ''}
              onChangeText={(location) =>
                onChange({ location: location.trim() ? location : null })
              }
              placeholder="—"
              placeholderTextColor={colors.mist}
              style={styles.input}
            />
          </Field>

          <Field label="Tags">
            <TextInput
              value={draft.tags ?? ''}
              onChangeText={(tags) => onChange({ tags: tags.trim() ? tags : null })}
              placeholder="Comma separated"
              placeholderTextColor={colors.mist}
              style={styles.input}
            />
          </Field>

          <Field label="Priority">
            <ChipWrap
              options={PRIORITIES}
              value={(draft.priority ?? '') as Priority}
              onChange={(value) =>
                onChange({ priority: draft.priority === value ? null : value })
              }
            />
          </Field>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button title="Discard" kind="ghost" onPress={onDiscard} style={styles.action} />
        <Button title="Keep" icon="checkmark" onPress={onSave} style={styles.action} />
      </View>
    </View>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  const { colors } = useTheme();
  return (
    <View style={[fieldLayout.field, style]}>
      <Text style={[fieldLayout.label, { color: colors.ink }]}>{label}</Text>
      {children}
    </View>
  );
}

// Layout only — the label colour comes from the theme at render.
const fieldLayout = StyleSheet.create({
  field: { gap: 8 },
  label: { fontFamily: FONTS.sansSemi, fontSize: 14 },
});

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 16,
      gap: 8,
    },
    titleInput: {
      fontFamily: FONTS.sansSemi,
      fontSize: 18,
      lineHeight: 25,
      color: colors.ink,
      padding: 0,
    },
    figure: { fontFamily: FONTS.monoMedium, color: colors.ink },
    said: { color: colors.moss },
    more: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    moreText: { fontFamily: FONTS.sans, fontSize: 15, color: colors.ink },
    fields: { gap: 16, paddingBottom: 4 },
    input: {
      fontFamily: FONTS.sans,
      fontSize: 16,
      color: colors.ink,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.input,
    },
    mono: { fontFamily: FONTS.mono },
    pair: { flexDirection: 'row', gap: 12 },
    pairItem: { flex: 1 },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    step: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.well,
    },
    dateText: { flex: 1, textAlign: 'center', color: colors.ink },
    actions: { flexDirection: 'row', gap: 10, paddingTop: 8 },
    action: { flex: 1 },
  });
}
