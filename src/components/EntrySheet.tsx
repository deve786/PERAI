import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { deleteMemory, setMemoryStatus } from '../db/queries';
import { formatAmount, fullDateLabel, toSentence } from '../format';
import { reminderLabel, reminderTime } from '../reminderTime';
import { showSnackbar } from '../snackbarStore';
import { useTheme } from '../ThemeContext';
import { FONTS, type Colors } from '../theme';
import type { Memory } from '../types';
import { BottomSheet, SheetAction } from './BottomSheet';

interface Props {
  memory: Memory | null;
  onClose: () => void;
}

function capitalise(text: string) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * One entry, opened over the list rather than instead of it.
 *
 * Everything recorded about it, then the four things you would come here to
 * do: tick it off, change it, ask about it, or get rid of it. Editing still
 * opens the full screen — a sheet is for a look and a quick action, not a
 * form — and the list is right there behind it when you drag it away.
 */
export function EntrySheet({ memory, onClose }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  // The entry stays on the sheet while it slides away after closing.
  const [last, setLast] = useState(memory);
  if (memory && memory !== last) setLast(memory);
  const shown = memory ?? last;
  if (!shown) return null;

  return <EntrySheetBody memory={shown} open={memory !== null} onClose={onClose} router={router} colors={colors} styles={styles} />;
}

function EntrySheetBody({
  memory,
  open,
  onClose,
  router,
  colors,
  styles,
}: {
  memory: Memory;
  open: boolean;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
  colors: Colors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const done = memory.status !== 'active';
  const amount = formatAmount(memory.amount, memory.currency);
  const remindsAt = reminderTime(memory);
  type Fact = { icon: keyof typeof Ionicons.glyphMap; text: string };
  const candidates: (Fact | null)[] = [
    { icon: 'calendar-outline', text: fullDateLabel(memory.eventDate) },
    memory.location ? { icon: 'location-outline', text: memory.location } : null,
    memory.people ? { icon: 'people-outline', text: memory.people } : null,
    remindsAt ? { icon: 'alarm-outline', text: `Reminds you ${toSentence(reminderLabel(remindsAt))}` } : null,
    memory.groupName ? { icon: 'folder-outline', text: memory.groupName } : null,
  ];
  const facts = candidates.filter((fact): fact is Fact => fact !== null);

  const toggleDone = async () => {
    const before = memory.status;
    const after = done ? 'active' : 'done';
    onClose();
    await setMemoryStatus(memory.id, after);
    showSnackbar({
      message: after === 'done' ? `Marked done: ${memory.title}` : `Reopened: ${memory.title}`,
      onAction: () => void setMemoryStatus(memory.id, before),
    });
  };

  const remove = () => {
    onClose();
    // Held back until the Undo has gone, so taking it back is simply not doing it.
    showSnackbar({
      message: `Deleted ${memory.title}`,
      onCommit: () => deleteMemory(memory.id),
    });
  };

  return (
    <BottomSheet visible={open} onClose={onClose}>
      <View style={styles.head}>
        <Text style={[styles.title, done && styles.titleDone]}>{memory.title}</Text>
        {amount ? <Text style={styles.amount}>{amount}</Text> : null}
      </View>
      <Text style={styles.kind}>
        {[
          memory.type !== 'memory' ? capitalise(memory.type) : 'Note',
          memory.category ? capitalise(memory.category) : null,
          done ? 'Done' : memory.type === 'memory' ? null : 'Still to do',
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      <View style={styles.facts}>
        {facts.map((fact) => (
          <View key={fact.text} style={styles.fact}>
            <Ionicons name={fact.icon} size={16} color={colors.graphite} />
            <Text style={styles.factText}>{fact.text}</Text>
          </View>
        ))}
      </View>

      {memory.rawInput && memory.rawInput !== memory.title ? (
        <View style={styles.quote}>
          <Text style={styles.quoteLabel}>What you said</Text>
          <Text style={styles.quoteText}>{memory.rawInput}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {memory.type !== 'memory' ? (
          <SheetAction
            label={done ? 'Mark as not done' : 'Mark as done'}
            onPress={() => void toggleDone()}
            icon={<Ionicons name={done ? 'arrow-undo-outline' : 'checkmark-circle-outline'} size={22} color={colors.moss} />}
          />
        ) : null}
        <SheetAction
          label="Edit"
          hint="Change the title, date, amount or anything else"
          onPress={() => {
            onClose();
            router.push(`/entry/${memory.id}`);
          }}
          icon={<Ionicons name="create-outline" size={22} color={colors.graphite} />}
        />
        <SheetAction
          label="Ask about this"
          hint="Opens Ask with this entry already in the question"
          onPress={() => {
            onClose();
            router.push({ pathname: '/(tabs)/ask', params: { prefill: `About "${memory.title}": ` } });
          }}
          icon={<Ionicons name="sparkles-outline" size={22} color={colors.graphite} />}
        />
        <SheetAction
          label="Delete"
          destructive
          onPress={remove}
          icon={<Ionicons name="trash-outline" size={22} color={colors.alert} />}
        />
      </View>
    </BottomSheet>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 4 },
    title: { flex: 1, fontFamily: FONTS.sansSemi, fontSize: 20, lineHeight: 26, color: colors.ink },
    titleDone: { textDecorationLine: 'line-through', color: colors.graphite },
    amount: { fontFamily: FONTS.monoMedium, fontSize: 18, color: colors.ink },
    kind: { fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite, marginTop: 2 },
    facts: { gap: 8, marginTop: 14 },
    fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    factText: { flex: 1, fontFamily: FONTS.sans, fontSize: 15, color: colors.ink },
    quote: {
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.well,
      gap: 4,
    },
    quoteLabel: { fontFamily: FONTS.sansSemi, fontSize: 12, color: colors.graphite },
    quoteText: { fontFamily: FONTS.sans, fontSize: 14, lineHeight: 20, color: colors.ink },
    actions: { marginTop: 14, gap: 2 },
  });
}
