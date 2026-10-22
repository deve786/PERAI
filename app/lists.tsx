import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MemoryRow } from '@/components/MemoryRow';
import { completeMemory, reopenMemory } from '@/complete';
import { deleteMemory } from '@/db/queries';
import { useTheme } from '@/expense/theme';
import { Screen, T, TopBar } from '@/expense/ui';
import { listSections } from '@/lists';
import { logOk } from '@/log';
import { showDialog } from '@/dialogStore';
import type { Memory, MemoryType } from '@/types';
import { useMemories } from '@/useMemories';

/** Each list's mark. Identity colours, like a category's — readable on both themes. */
const MARKS: Partial<Record<MemoryType, { icon: keyof typeof Ionicons.glyphMap; color: string }>> = {
  play: { icon: 'game-controller-outline', color: '#7159C4' },
  watch: { icon: 'tv-outline', color: '#2E7DB8' },
  wish: { icon: 'bag-handle-outline', color: '#A8831F' },
};

/** "PLAYLIST" → "Playlist". */
function sentence(label: string) {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * What you mean to play, watch and buy.
 *
 * The record's three standing lists, kept apart from the Timeline because they
 * are not things that happened — they are things that have not happened yet,
 * and they stay until you tick them off. Tap an entry to mark it done (tap
 * again to undo), long-press to delete it.
 */
export default function ListsScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const { memories } = useMemories();
  const sections = listSections(memories);
  const anything = sections.some((section) => section.open.length + section.done.length > 0);

  function toggle(memory: Memory) {
    if (memory.status === 'active') void completeMemory(memory);
    else void reopenMemory(memory);
  }

  function confirmDelete(memory: Memory) {
    showDialog({
      title: 'Delete this entry?',
      message: memory.title,
      actions: [
        { label: 'Keep', cancel: true },
        {
          label: 'Delete',
          destructive: true,
          onPress: () => {
            void deleteMemory(memory.id);
            logOk('Deleted an entry', memory.title);
          },
        },
      ],
    });
  }

  return (
    <Screen>
      <TopBar title="Lists" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <T size={14} sub style={styles.intro}>
          Things you want to play, watch or buy — kept here, not on the Timeline.
        </T>

        {sections.map((section) => {
          const mark = MARKS[section.type] ?? { icon: 'list-outline' as const, color: c.accent };
          const items = [...section.open, ...section.done];
          return (
            <View key={section.type} style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
              <View style={styles.head}>
                <View style={[styles.mark, { backgroundColor: `${mark.color}22` }]}>
                  <Ionicons name={mark.icon} size={22} color={mark.color} />
                </View>
                <View style={styles.headText}>
                  <T size={16} weight="700">{sentence(section.label)}</T>
                  <T size={13} sub>{section.empty.replace(/\.$/, '')}</T>
                </View>
                <T size={14} sub tabular>{section.open.length}</T>
              </View>

              {items.length > 0 ? (
                <View style={[styles.items, { borderTopColor: c.line }]}>
                  {/* Rows draw a hairline under themselves; this hides the last one. */}
                  <View style={styles.itemsInner}>
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
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        {anything ? (
          <T size={13} sub style={styles.hint}>Tap to tick off · hold to delete</T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 12 },
  intro: { lineHeight: 20 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  mark: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, gap: 2 },
  items: { borderTopWidth: StyleSheet.hairlineWidth },
  itemsInner: { marginBottom: -1 },
  hint: { textAlign: 'center', marginTop: 4 },
});
