import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChipRow } from '@/components/Chip';
import { TripSpending } from '@/components/TripSpending';
import { completeMemory, reopenMemory } from '@/complete';
import { deleteMemory, getMemory, rememberSpelling, updateMemory } from '@/db/queries';
import { fullDateLabel, hasStatedTime, timeLabel } from '@/format';
import { logOk } from '@/log';
import { showDialog } from '@/dialogStore';
import { syncReminders } from '@/reminders';
import { groupNames, normalizeGroupName } from '@/groups';
import { nextOccurrence } from '@/repeat';
import { useGroups } from '@/useGroups';
import { useMemories } from '@/useMemories';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import { CATEGORIES, MEMORY_TYPES, PRIORITIES, REPEATS, type Memory } from '@/types';

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
 * long-pressing a row on the Timeline or the Today screen.
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
      <View style={styles.center}>
        <Text style={type.label}>THIS ENTRY IS GONE</Text>
      </View>
    );
  }
  if (!memory) return <View style={styles.center} />;

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
  const when = hasStatedTime(entry.dateExpression)
    ? `${fullDateLabel(entry.eventDate)} · ${timeLabel(entry.eventDate)}`
    : fullDateLabel(entry.eventDate);
  const comesBack = entry.repeat
    ? fullDateLabel(nextOccurrence(entry.eventDate, entry.repeat))
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={() => void saveTitle()}
          style={styles.title}
          multiline
        />
        {/* Leaving the screen saves it too, but an edit you can see is
            pending should have something to press. */}
        {titleChanged ? (
          <Pressable onPress={() => void saveTitle()} hitSlop={10} style={styles.saveTitle}>
            <Text style={[type.label, styles.saveTitleText]}>SAVE TITLE</Text>
          </Pressable>
        ) : null}

        <View style={styles.field}>
          <Text style={type.label}>WHEN</Text>
          <Text style={type.body}>{when}</Text>

          <Text style={[type.stamp, { marginTop: 6, color: colors.mist }]}>QUICK SNOOZE</Text>
          <View style={styles.pushRow}>
            {SNOOZE_PRESETS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => void snoozeTo(option.calc())}
                style={({ pressed }) => [styles.push, pressed && styles.pressed]}
              >
                <Text style={[type.label, styles.pushText]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[type.stamp, { marginTop: 6, color: colors.mist }]}>SHIFT DATE</Text>
          <View style={styles.pushRow}>
            {PUSHES.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => void push(option.days)}
                style={({ pressed }) => [styles.push, pressed && styles.pressed]}
              >
                <Text style={[type.label, styles.pushText]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.stepRow}>
            <Pressable onPress={() => void push(-1)} hitSlop={8}>
              <Text style={[type.label, styles.step]}>A DAY EARLIER</Text>
            </Pressable>
            <Pressable onPress={() => void push(1)} hitSlop={8}>
              <Text style={[type.label, styles.step]}>A DAY LATER</Text>
            </Pressable>
          </View>
        </View>

        {/* An entry that covers days rather than a moment — a trip. Gives the
            Spending card below a span to gather expenses from. */}
        <View style={styles.field}>
          <Text style={type.label}>ENDS</Text>
          <Text style={type.body}>
            {entry.endDate ? fullDateLabel(entry.endDate) : 'Same day'}
          </Text>
          <View style={styles.pushRow}>
            {ENDS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => void setEnd(option.days)}
                style={({ pressed }) => [styles.push, pressed && styles.pressed]}
              >
                <Text style={[type.label, styles.pushText]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          {entry.endDate ? (
            <View style={styles.stepRow}>
              <Pressable onPress={() => void nudgeEnd(-1)} hitSlop={8}>
                <Text style={[type.label, styles.step]}>A DAY SHORTER</Text>
              </Pressable>
              <Pressable onPress={() => void nudgeEnd(1)} hitSlop={8}>
                <Text style={[type.label, styles.step]}>A DAY LONGER</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {entry.endDate ? <TripSpending memory={entry} /> : null}

        <View style={styles.field}>
          <Text style={type.label}>REPEATS</Text>
          <ChipRow
            options={REPEATS}
            value={entry.repeat}
            onChange={(value) => void patch({ repeat: value })}
            allLabel="Once"
          />
          {comesBack ? (
            <Text style={type.fine}>Ticking it off moves it to {comesBack}.</Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={type.label}>PRIORITY</Text>
          <ChipRow
            options={PRIORITIES}
            value={entry.priority}
            onChange={(value) => void patch({ priority: value })}
            allLabel="None"
          />
        </View>

        <View style={styles.field}>
          <Text style={type.label}>TYPE</Text>
          <ChipRow
            options={MEMORY_TYPES}
            value={entry.type}
            onChange={(value) => value && void patch({ type: value })}
            allLabel="—"
          />
        </View>

        <View style={styles.field}>
          <Text style={type.label}>CATEGORY</Text>
          <ChipRow
            options={CATEGORIES}
            value={entry.category}
            onChange={(value) => value && void patch({ category: value })}
            allLabel="—"
          />
        </View>

        {/* A group is only a name: picking one here is what puts this entry
            with the others, and clearing it takes it back out. */}
        <View style={styles.field}>
          <Text style={type.label}>GROUP</Text>
          {existingGroups.length > 0 ? (
            <ChipRow
              options={existingGroups}
              value={entry.groupName}
              onChange={(value) => void patch({ groupName: value })}
              allLabel="None"
            />
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
            style={styles.groupInput}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={async () => {
              if (struck) await reopenMemory(entry);
              else await completeMemory(entry);
              await load();
            }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={[type.label, styles.primaryText]}>
              {struck ? 'PUT IT BACK' : entry.repeat ? 'DONE FOR NOW' : 'DONE'}
            </Text>
          </Pressable>
          <Pressable onPress={confirmDelete} hitSlop={8}>
            <Text style={[type.label, styles.delete]}>DELETE</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={async () => {
            await saveTitle();
            router.back();
          }}
          hitSlop={8}
          style={styles.close}
        >
          <Text style={[type.label, styles.closeText]}>CLOSE</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.paper,
    },
    content: { padding: SPACE.page, paddingTop: 28, paddingBottom: 48, gap: 22 },
    title: {
      fontFamily: FONTS.sans,
      fontSize: 22,
      lineHeight: 30,
      color: colors.ink,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    field: { gap: 8 },
    groupInput: {
      fontFamily: FONTS.sans,
      fontSize: 15,
      color: colors.ink,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
      paddingVertical: 6,
    },
    pushRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    push: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.rule,
    },
    pushText: { color: colors.graphite },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    step: { color: colors.mist, paddingVertical: 4 },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
    },
    primary: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.moss,
    },
    primaryText: { color: colors.moss },
    delete: { color: colors.alert },
    pressed: { opacity: 0.5 },
    saveTitle: { alignSelf: 'flex-start', marginTop: -10 },
    saveTitleText: { color: colors.moss },
    close: { alignItems: 'center', paddingTop: 10 },
    closeText: { color: colors.mist },
  });
}
