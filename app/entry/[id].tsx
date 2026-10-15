import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { completeMemory, reopenMemory } from '@/complete';
import { deleteMemory, getMemory, rememberSpelling, updateMemory } from '@/db/queries';
import { fullDateLabel, hasStatedTime, timeLabel } from '@/format';
import { logOk } from '@/log';
import { syncReminders } from '@/reminders';
import { nextOccurrence } from '@/repeat';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import { CATEGORIES, MEMORY_TYPES, PRIORITIES, REPEATS, type Memory } from '@/types';

/** Quick snooze presets covering hours, start-of-day, weekends and next week */
const SNOOZE_PRESETS: { label: string; calc: () => { date: Date; desc: string } }[] = [
  {
    label: '+3 HOURS',
    calc: () => ({ date: new Date(Date.now() + 3 * 3600 * 1000), desc: 'in 3 hours' }),
  },
  {
    label: 'TOMORROW 9AM',
    calc: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return { date: d, desc: 'tomorrow at 9:00 AM' };
    },
  },
  {
    label: 'WEEKEND',
    calc: () => {
      const d = new Date();
      const diff = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return { date: d, desc: 'Saturday at 9:00 AM' };
    },
  },
  {
    label: 'NEXT WEEK',
    calc: () => {
      const d = new Date();
      const diff = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return { date: d, desc: 'next Monday at 9:00 AM' };
    },
  },
];

/** Moving an entry on: the handful of answers that cover almost every case. */
const PUSHES: { label: string; days: number }[] = [
  { label: '+1 DAY', days: 1 },
  { label: '+3 DAYS', days: 3 },
  { label: '+7 DAYS', days: 7 },
];

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
    Alert.alert('Delete this entry?', entry.title, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMemory(entry.id);
          logOk('Deleted an entry', entry.title);
          router.back();
        },
      },
    ]);
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

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close}>
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
    close: { alignItems: 'center', paddingTop: 10 },
    closeText: { color: colors.mist },
  });
}
