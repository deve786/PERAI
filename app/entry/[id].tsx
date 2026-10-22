import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TripSpending } from '@/components/TripSpending';
import { completeMemory, reopenMemory } from '@/complete';
import { deleteMemory, getMemory, rememberSpelling, updateMemory } from '@/db/queries';
import { dayLabel, fullDateLabel, hasStatedTime, timeLabel } from '@/format';
import { logOk } from '@/log';
import { showDialog } from '@/dialogStore';
import { syncReminders } from '@/reminders';
import { groupNames, normalizeGroupName } from '@/groups';
import { nextOccurrence } from '@/repeat';
import { useGroups } from '@/useGroups';
import { useMemories } from '@/useMemories';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, SPACE, type Colors } from '@/theme';
import { CATEGORIES, MEMORY_TYPES, PRIORITIES, REPEATS, type Memory, type Repeat } from '@/types';
import { Button, Chip, Empty, PillButton, Screen, TopBar } from '@/expense/ui';
import { KeyboardLift } from '@/components/KeyboardLift';

/** Quick snooze presets covering hours, start-of-day, weekends and next week */
const SNOOZE_PRESETS: { label: string; calc: () => { date: Date; desc: string } }[] = [
  {
    label: '3 hours later',
    calc: () => ({ date: new Date(Date.now() + 3 * 3600 * 1000), desc: 'in 3 hours' }),
  },
  {
    label: 'Tomorrow 9 AM',
    calc: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return { date: d, desc: 'tomorrow at 9:00 AM' };
    },
  },
  {
    label: 'Weekend',
    calc: () => {
      const d = new Date();
      const diff = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return { date: d, desc: 'Saturday at 9:00 AM' };
    },
  },
  {
    label: 'Next week',
    calc: () => {
      const d = new Date();
      const diff = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return { date: d, desc: 'next Monday at 9:00 AM' };
    },
  },
];

/** How long a span runs, counted from the day it starts. */
const ENDS: { label: string; days: number }[] = [
  { label: 'Same day', days: 0 },
  { label: '2 days', days: 2 },
  { label: 'A week', days: 7 },
];

/** Moving an entry by whole days, keeping its clock time. */
const PUSHES: { label: string; days: number }[] = [
  { label: 'A day earlier', days: -1 },
  { label: 'A day later', days: 1 },
  { label: '3 days later', days: 3 },
  { label: 'A week later', days: 7 },
];

const REPEAT_LABEL: Record<Repeat, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
};

/** "personal care" → "Personal care". */
function sentence(text: string) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "Tomorrow, 10:00" — the time only when the note stated one. */
function whenLabel(iso: string, dateExpression: string | null) {
  const day = dayLabel(iso);
  return hasStatedTime(dateExpression) ? `${day}, ${timeLabel(iso)}` : day;
}

type Picker = 'group' | 'repeat' | 'priority' | 'type' | 'category';

/**
 * One entry, and everything that can be done to it.
 *
 * Until this screen there was no way to correct an entry or move it: anything
 * not done on the day it was said could only be struck off or deleted, so the
 * record filled up with work that had quietly gone stale. Reached by
 * long-pressing a row on the Timeline or the Today screen. The back button
 * saves a changed title before leaving, as the Close link used to.
 */
export default function EntryScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [memory, setMemory] = useState<Memory | null>(null);
  const [title, setTitle] = useState('');
  const [gone, setGone] = useState(false);
  /** A group being typed, before it is committed to the entry. */
  const [groupDraft, setGroupDraft] = useState('');
  /** Which detail row is open to show its choices. */
  const [picking, setPicking] = useState<Picker | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { memories } = useMemories();
  const { empty: madeGroups } = useGroups();
  const existingGroups = groupNames(memories, madeGroups);

  const load = useCallback(async () => {
    const found = await getMemory(String(id));
    if (!found) {
      setGone(true);
      return;
    }
    setMemory(found);
    setTitle(found.title);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // A title typed and then left — by the back gesture, not by tapping away —
  // used to be lost, because nothing but losing focus ever saved it.
  const latest = useRef<{ title: string; entry: Memory | null }>({ title: '', entry: null });
  useEffect(() => {
    latest.current = { title, entry: memory };
  }, [title, memory]);
  useEffect(
    () => () => {
      const { title: typed, entry } = latest.current;
      const next = typed.trim();
      if (!entry || !next || next === entry.title) return;
      void (async () => {
        await rememberSpelling(entry.title, next, 'user');
        await updateMemory(entry.id, { title: next });
        logOk('Learned your spelling', `${entry.title} → ${next}`);
      })();
    },
    []
  );

  if (gone) {
    return (
      <Screen edges={['top', 'bottom']}>
        <TopBar title="Entry" onBack={() => router.back()} />
        <Empty icon="trash-outline" title="This entry is gone" hint="It was deleted, here or on another device." />
      </Screen>
    );
  }
  if (!memory) {
    return (
      <Screen edges={['top', 'bottom']}>
        <TopBar title="Entry" onBack={() => router.back()} />
      </Screen>
    );
  }

  const entry = memory;

  const patch = async (change: Parameters<typeof updateMemory>[1]) => {
    await updateMemory(entry.id, change);
    await load();
  };

  const push = async (days: number) => {
    const when = new Date(entry.eventDate);
    when.setDate(when.getDate() + days);
    await patch({ eventDate: when.toISOString() });
    logOk(days === 1 ? 'Pushed to tomorrow' : `Moved by ${days} days`, entry.title);
  };

  const snoozeTo = async (target: { date: Date; desc: string }) => {
    await patch({ eventDate: target.date.toISOString(), dateExpression: target.desc });
    await syncReminders().catch(() => {});
    logOk('Snoozed entry', entry.title);
  };

  /** A day picked from the calendar; the clock time stays as it was. */
  const moveToDay = async (day: Date) => {
    const when = new Date(entry.eventDate);
    when.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    if (when.getTime() === new Date(entry.eventDate).getTime()) return;
    await patch({ eventDate: when.toISOString() });
    await syncReminders().catch(() => {});
    logOk('Moved entry', entry.title);
  };

  /** Give the entry a span of this many days, or clear it with 0. */
  const setEnd = async (days: number) => {
    if (days === 0) {
      await patch({ endDate: null });
      return;
    }
    const end = new Date(entry.eventDate);
    end.setDate(end.getDate() + days);
    await patch({ endDate: end.toISOString() });
  };

  /** Lengthen or shorten the span, never past the day it starts. */
  const nudgeEnd = async (days: number) => {
    if (!entry.endDate) return;
    const end = new Date(entry.endDate);
    end.setDate(end.getDate() + days);
    if (end.getTime() < new Date(entry.eventDate).getTime()) {
      showDialog({
        title: 'It cannot end before it starts',
        message: 'Pick a day on or after the start.',
      });
      return;
    }
    await patch({ endDate: end.toISOString() });
  };

  const titleChanged = title.trim().length > 0 && title.trim() !== memory.title;

  const saveTitle = async () => {
    const next = title.trim();
    if (!next || next === entry.title) return;
    // A title corrected by hand is the best spelling there is, so it is kept
    // for every later note (see src/dictionary.ts).
    await rememberSpelling(entry.title, next, 'user');
    logOk('Learned your spelling', `${entry.title} → ${next}`);
    await patch({ title: next });
  };

  const close = async () => {
    await saveTitle();
    router.back();
  };

  const confirmDelete = () => {
    showDialog({
      title: 'Delete this entry?',
      message: entry.title,
      actions: [
        { label: 'Keep', cancel: true },
        {
          label: 'Delete',
          destructive: true,
          onPress: () => {
            void deleteMemory(entry.id);
            logOk('Deleted an entry', entry.title);
            router.back();
          },
        },
      ],
    });
  };

  const struck = entry.status !== 'active';
  const comesBack = entry.repeat
    ? fullDateLabel(nextOccurrence(entry.eventDate, entry.repeat))
    : null;

  const toggle = (which: Picker) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPicking((open) => (open === which ? null : which));
  };

  const pickers: { key: Picker; label: string; value: string; sub?: string | null }[] = [
    { key: 'group', label: 'Group', value: entry.groupName ?? 'None' },
    {
      key: 'repeat',
      label: 'Repeats',
      value: entry.repeat ? REPEAT_LABEL[entry.repeat] : 'Once',
      sub: comesBack ? `Ticking it off moves it to ${comesBack}.` : null,
    },
    { key: 'priority', label: 'Priority', value: entry.priority ? sentence(entry.priority) : 'None' },
    { key: 'type', label: 'Type', value: sentence(entry.type) },
    { key: 'category', label: 'Category', value: sentence(entry.category) },
  ];

  /** The choices under an open row. Tapping the chosen one again clears it, as before. */
  const choices = (which: Picker) => {
    switch (which) {
      case 'repeat':
        return (
          <View style={styles.chips}>
            <Chip label="Once" active={entry.repeat === null} onPress={() => void patch({ repeat: null })} />
            {REPEATS.map((option) => (
              <Chip
                key={option}
                label={REPEAT_LABEL[option]}
                active={entry.repeat === option}
                onPress={() => void patch({ repeat: entry.repeat === option ? null : option })}
              />
            ))}
          </View>
        );
      case 'priority':
        return (
          <View style={styles.chips}>
            <Chip label="None" active={entry.priority === null} onPress={() => void patch({ priority: null })} />
            {PRIORITIES.map((option) => (
              <Chip
                key={option}
                label={sentence(option)}
                active={entry.priority === option}
                onPress={() => void patch({ priority: entry.priority === option ? null : option })}
              />
            ))}
          </View>
        );
      case 'type':
        return (
          <View style={styles.chips}>
            {MEMORY_TYPES.map((option) => (
              <Chip
                key={option}
                label={sentence(option)}
                active={entry.type === option}
                onPress={() => {
                  if (entry.type !== option) void patch({ type: option });
                }}
              />
            ))}
          </View>
        );
      case 'category':
        return (
          <View style={styles.chips}>
            {CATEGORIES.map((option) => (
              <Chip
                key={option}
                label={sentence(option)}
                active={entry.category === option}
                onPress={() => {
                  if (entry.category !== option) void patch({ category: option });
                }}
              />
            ))}
          </View>
        );
      case 'group':
        // A group is only a name: picking one here is what puts this entry
        // with the others, and clearing it takes it back out.
        return (
          <View style={styles.groupChoices}>
            {existingGroups.length > 0 ? (
              <View style={styles.chips}>
                <Chip
                  label="None"
                  active={entry.groupName === null}
                  onPress={() => void patch({ groupName: null })}
                />
                {existingGroups.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    active={entry.groupName === name}
                    onPress={() => void patch({ groupName: entry.groupName === name ? null : name })}
                  />
                ))}
              </View>
            ) : null}
            <TextInput
              value={groupDraft}
              onChangeText={setGroupDraft}
              onSubmitEditing={() => {
                const name = normalizeGroupName(groupDraft);
                setGroupDraft('');
                if (name) void patch({ groupName: name });
              }}
              placeholder={entry.groupName ? 'Move to another group…' : 'New group…'}
              placeholderTextColor={colors.mist}
              returnKeyType="done"
              accessibilityLabel="Group name"
              style={styles.input}
            />
          </View>
        );
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Entry" onBack={() => void close()} />
      <KeyboardLift style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.tags}>
            <View style={[styles.tag, styles.kindTag]}>
              <Text style={[styles.tagText, styles.kindText]}>{sentence(entry.type)}</Text>
            </View>
            <View style={[styles.tag, styles.categoryTag]}>
              <Text style={styles.tagText}>{sentence(entry.category)}</Text>
            </View>
            {struck ? (
              <View style={[styles.tag, styles.categoryTag]}>
                <Ionicons name="checkmark" size={14} color={colors.graphite} />
                <Text style={styles.tagText}>Done</Text>
              </View>
            ) : null}
          </View>

          <View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onBlur={() => void saveTitle()}
              style={styles.title}
              accessibilityLabel="Title"
              multiline
            />
            {/* Leaving the screen saves it too, but an edit you can see is
                pending should have something to press. */}
            {titleChanged ? (
              <View style={styles.saveTitle}>
                <PillButton label="Save title" icon="checkmark" onPress={() => void saveTitle()} />
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.whenHead}>
              <View style={styles.whenIcon}>
                <Ionicons name="time-outline" size={20} color={colors.moss} />
              </View>
              <View style={styles.whenText}>
                <Text style={type.fine}>When</Text>
                <Text style={styles.whenValue}>{whenLabel(entry.eventDate, entry.dateExpression)}</Text>
              </View>
              <PillButton
                label={showDatePicker && Platform.OS === 'ios' ? 'Done' : 'Change'}
                onPress={() => setShowDatePicker((open) => !open)}
              />
            </View>
            {showDatePicker ? (
              <DateTimePicker
                value={new Date(entry.eventDate)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                accentColor={colors.moss}
                onChange={(event, day) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (day && event.type !== 'dismissed') void moveToDay(day);
                }}
              />
            ) : null}

            <View style={styles.moveBlock}>
              <Text style={type.fine}>Move it</Text>
              <View style={styles.chips}>
                {SNOOZE_PRESETS.map((option) => (
                  <Chip key={option.label} label={option.label} onPress={() => void snoozeTo(option.calc())} />
                ))}
                {PUSHES.map((option) => (
                  <Chip key={option.label} label={option.label} onPress={() => void push(option.days)} />
                ))}
              </View>
            </View>
          </View>

          {/* An entry that covers days rather than a moment — a trip. Gives the
              Spending card below a span to gather expenses from. */}
          <View style={styles.card}>
            <View style={styles.whenHead}>
              <View style={styles.whenIcon}>
                <Ionicons name="flag-outline" size={19} color={colors.moss} />
              </View>
              <View style={styles.whenText}>
                <Text style={type.fine}>Ends</Text>
                <Text style={styles.whenValue}>
                  {entry.endDate ? dayLabel(entry.endDate) : 'Same day'}
                </Text>
              </View>
            </View>
            <View style={styles.chips}>
              {ENDS.map((option) => (
                <Chip key={option.label} label={option.label} onPress={() => void setEnd(option.days)} />
              ))}
              {entry.endDate ? (
                <>
                  <Chip label="A day shorter" onPress={() => void nudgeEnd(-1)} />
                  <Chip label="A day longer" onPress={() => void nudgeEnd(1)} />
                </>
              ) : null}
            </View>
          </View>

          {entry.endDate ? <TripSpending memory={entry} /> : null}

          <View style={styles.list}>
            {pickers.map((row, index) => {
              const open = picking === row.key;
              return (
                <View
                  key={row.key}
                  style={[styles.pickRow, index === pickers.length - 1 && styles.lastRow]}
                >
                  <Pressable
                    onPress={() => toggle(row.key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${row.label}: ${row.value}`}
                    style={({ pressed }) => [styles.pickHead, pressed && styles.pressed]}
                  >
                    <View style={styles.pickLabel}>
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      {row.sub ? <Text style={type.fine}>{row.sub}</Text> : null}
                    </View>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {row.value}
                    </Text>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-forward'}
                      size={18}
                      color={colors.mist}
                    />
                  </Pressable>
                  {open ? <View style={styles.pickBody}>{choices(row.key)}</View> : null}
                </View>
              );
            })}
          </View>

          <View style={styles.spacer} />

          <View style={styles.actions}>
            <Button
              title={struck ? 'Put it back' : entry.repeat ? 'Done for now' : 'Mark done'}
              icon={struck ? 'arrow-undo' : 'checkmark'}
              onPress={async () => {
                if (struck) await reopenMemory(entry);
                else await completeMemory(entry);
                await load();
              }}
              style={styles.primary}
            />
            <Button title="Delete entry" kind="danger" onPress={confirmDelete} />
          </View>
        </ScrollView>
      </KeyboardLift>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { flexGrow: 1, padding: SPACE.page, paddingTop: 18, paddingBottom: 24, gap: 16 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 28,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
    },
    kindTag: { backgroundColor: colors.mossSoft },
    categoryTag: { backgroundColor: colors.well },
    tagText: { fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite },
    kindText: { fontFamily: FONTS.sansSemi, color: colors.moss },
    title: {
      fontFamily: FONTS.sansSemi,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: -0.3,
      color: colors.ink,
      padding: 0,
    },
    saveTitle: { alignSelf: 'flex-start', marginTop: 8 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 14,
      gap: 12,
    },
    whenHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    whenIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.mossSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    whenText: { flex: 1 },
    whenValue: { fontFamily: FONTS.sansSemi, fontSize: 17, lineHeight: 23, color: colors.ink },
    moveBlock: { gap: 8 },
    // The shared Chip carries its own right and bottom margins.
    chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: -8 },
    list: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      paddingHorizontal: 14,
    },
    pickRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule },
    lastRow: { borderBottomWidth: 0 },
    pickHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 8 },
    pickLabel: { flex: 1, gap: 2 },
    rowLabel: { fontFamily: FONTS.sans, fontSize: 16, color: colors.ink },
    rowValue: { fontFamily: FONTS.sans, fontSize: 15, color: colors.graphite, maxWidth: '50%' },
    pickBody: { paddingBottom: 14 },
    groupChoices: { gap: 12 },
    input: {
      fontFamily: FONTS.sans,
      fontSize: 16,
      color: colors.ink,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.input,
      backgroundColor: colors.surface,
    },
    spacer: { flexGrow: 1 },
    actions: { gap: 4, paddingTop: 8 },
    primary: { minHeight: 52 },
    pressed: { opacity: 0.6 },
  });
}
