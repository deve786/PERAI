import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { deleteMemory, setMemoryStatus } from '@/db/queries';
import { listSections } from '@/lists';
import { logOk } from '@/log';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { useMemories } from '@/useMemories';

/**
 * What you mean to play, watch and buy.
 *
 * The record's three standing lists, kept apart from the Timeline because they
 * are not things that happened — they are things that have not happened yet,
 * and they stay until you tick them off. Tap an entry to mark it done (tap
 * again to undo), long-press to delete it.
 */
export default function ListsScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const { memories, loading } = useMemories();
  const sections = listSections(memories);
  const anything = sections.some((section) => section.open.length + section.done.length > 0);

  function toggle(memory: Memory) {
    const next = memory.status === 'active' ? 'done' : 'active';
    void setMemoryStatus(memory.id, next);
    logOk(next === 'done' ? 'Ticked off' : 'Put back on the list', memory.title);
  }

  function confirmDelete(memory: Memory) {
    Alert.alert('Delete this entry?', memory.title, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMemory(memory.id);
          logOk('Deleted an entry', memory.title);
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={type.display}>Lists</Text>

      {sections.map((section) => (
        <Section
          key={section.type}
          label={
            section.open.length > 0
              ? `${section.label}  ·  ${section.open.length}`
              : section.label
          }
        >
          {section.open.length === 0 && section.done.length === 0 ? (
            <Text style={[type.fine, styles.empty]}>{section.empty}</Text>
          ) : null}

          {section.open.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              gutter="date"
              showAdded={false}
              onPress={() => toggle(memory)}
              onLongPress={() => confirmDelete(memory)}
            />
          ))}

          {section.done.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              gutter="date"
              showAdded={false}
              struck
              onPress={() => toggle(memory)}
              onLongPress={() => confirmDelete(memory)}
            />
          ))}
        </Section>
      ))}

      {!loading && !anything ? (
        <Text style={[type.body, styles.intro]}>
          Anything you say you want to play, watch or buy is kept here instead
          of the Timeline, because it has not happened yet.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 68, paddingBottom: 48, gap: 26 },
    empty: { paddingVertical: 8 },
    intro: { maxWidth: 320, marginTop: 4 },
  });
}
