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
import { COLORS, FONTS, SPACE, TYPE } from '../theme';
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

export function DraftCard({ draft, index, total, onChange, onSave, onDiscard }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((value) => !value);
  };

  return (
    <View style={styles.card}>
      <Text style={TYPE.label}>
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </Text>

      <TextInput
        value={draft.title}
        onChangeText={(title) => onChange({ title })}
        style={styles.titleInput}
        placeholder="Untitled"
        placeholderTextColor={COLORS.mist}
        multiline
      />

      <Pressable onPress={toggle} style={styles.summary} hitSlop={4}>
        <Text style={[TYPE.stamp, styles.summaryText]}>
          {[
            draft.category.toUpperCase(),
            draft.type.toUpperCase(),
            fullDateLabel(draft.eventDate).toUpperCase(),
            draft.amount !== null ? `${draft.currency ?? ''} ${draft.amount}` : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={13}
          color={COLORS.mist}
        />
      </Pressable>

      {draft.dateExpression ? (
        <Text style={TYPE.fine}>you said “{draft.dateExpression}”</Text>
      ) : null}

      {open ? (
        <View style={styles.fields}>
          <Field label="CATEGORY">
            <ChipWrap
              options={CATEGORIES}
              value={draft.category}
              onChange={(value) => value && onChange({ category: value })}
            />
          </Field>

          <Field label="TYPE">
            <ChipWrap
              options={MEMORY_TYPES}
              value={draft.type}
              onChange={(value) => value && onChange({ type: value })}
            />
          </Field>

          <Field label="WHEN">
            <View style={styles.dateRow}>
              <Pressable
                style={styles.step}
                hitSlop={6}
                onPress={() => onChange({ eventDate: shiftDays(draft.eventDate, -1) })}
              >
                <Ionicons name="chevron-back" size={14} color={COLORS.graphite} />
              </Pressable>
              <Text style={[TYPE.gutter, styles.dateText]}>
                {fullDateLabel(draft.eventDate)}
              </Text>
              <Pressable
                style={styles.step}
                hitSlop={6}
                onPress={() => onChange({ eventDate: shiftDays(draft.eventDate, 1) })}
              >
                <Ionicons name="chevron-forward" size={14} color={COLORS.graphite} />
              </Pressable>
            </View>
          </Field>

          <View style={styles.pair}>
            <Field label="AMOUNT" style={styles.pairItem}>
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
                placeholderTextColor={COLORS.mist}
                style={styles.input}
              />
            </Field>

            <Field label="CURRENCY" style={styles.pairItem}>
              <TextInput
                value={draft.currency ?? ''}
                onChangeText={(currency) =>
                  onChange({ currency: currency.trim() ? currency.toUpperCase() : null })
                }
                autoCapitalize="characters"
                placeholder="—"
                placeholderTextColor={COLORS.mist}
                style={styles.input}
              />
            </Field>
          </View>

          <Field label="PEOPLE">
            <TextInput
              value={draft.people ?? ''}
              onChangeText={(people) => onChange({ people: people.trim() ? people : null })}
              placeholder="comma separated"
              placeholderTextColor={COLORS.mist}
              style={styles.input}
            />
          </Field>

          <Field label="PLACE">
            <TextInput
              value={draft.location ?? ''}
              onChangeText={(location) =>
                onChange({ location: location.trim() ? location : null })
              }
              placeholder="—"
              placeholderTextColor={COLORS.mist}
              style={styles.input}
            />
          </Field>

          <Field label="TAGS">
            <TextInput
              value={draft.tags ?? ''}
              onChangeText={(tags) => onChange({ tags: tags.trim() ? tags : null })}
              placeholder="comma separated"
              placeholderTextColor={COLORS.mist}
              style={styles.input}
            />
          </Field>

          <Field label="PRIORITY">
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
        <Pressable onPress={onDiscard} hitSlop={6} style={styles.discard}>
          <Text style={[TYPE.label, styles.discardText]}>DISCARD</Text>
        </Pressable>
        <Pressable onPress={onSave} style={styles.save}>
          <Text style={[TYPE.label, styles.saveText]}>KEEP</Text>
        </Pressable>
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
  return (
    <View style={[styles.field, style]}>
      <Text style={TYPE.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    padding: 16,
    gap: 10,
  },
  titleInput: {
    fontFamily: FONTS.sansMedium,
    fontSize: 18,
    lineHeight: 25,
    color: COLORS.ink,
    padding: 0,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
  },
  summaryText: { flex: 1, lineHeight: 15 },
  fields: { gap: 16, paddingTop: 6 },
  field: { gap: 7 },
  input: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.ink,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  pair: { flexDirection: 'row', gap: 14 },
  pairItem: { flex: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: 4,
  },
  dateText: { flex: 1, color: COLORS.ink },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.tight,
    paddingTop: 10,
  },
  discard: { paddingVertical: 10, paddingRight: 16 },
  discardText: { color: COLORS.mist },
  save: {
    marginLeft: 'auto',
    backgroundColor: COLORS.moss,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 4,
  },
  saveText: { color: COLORS.paper },
});
