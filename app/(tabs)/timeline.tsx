import { useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, View } from 'react-native';
import { ChipRow } from '@/components/Chip';
import { MemoryRow } from '@/components/MemoryRow';
import { deleteMemory } from '@/db/queries';
import { groupByDay } from '@/format';
import { COLORS, GUTTER, SPACE, TYPE } from '@/theme';
import { CATEGORIES, MEMORY_TYPES, type Category, type MemoryType } from '@/types';
import { useMemories } from '@/useMemories';

export default function TimelineScreen() {
  const [category, setCategory] = useState<Category | null>(null);
  const [type, setType] = useState<MemoryType | null>(null);

  // Re-queries automatically on every write via addDatabaseChangeListener.
  const { memories, loading } = useMemories({ category, type });
  const sections = groupByDay(memories);
  const filtered = category !== null || type !== null;

  function confirmDelete(id: string, title: string) {
    Alert.alert('Delete this entry?', title, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteMemory(id) },
    ]);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.head}>
        <Text style={[TYPE.display, styles.title]}>Timeline</Text>
        <ChipRow options={CATEGORIES} value={category} onChange={setCategory} allLabel="All" />
        <ChipRow options={MEMORY_TYPES} value={type} onChange={setType} allLabel="Any" />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={
          sections.length === 0 ? styles.emptyContent : styles.listContent
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHead}>
            {/* Stated once, above the first scheduled day. */}
            {section.startsFuture ? (
              <Text style={[TYPE.label, styles.ahead]}>STILL TO COME</Text>
            ) : null}
            <Text style={[TYPE.label, section.isFuture && styles.futureDay]}>
              {section.title.toUpperCase()}
            </Text>
            <View style={styles.rule} />
          </View>
        )}
        renderItem={({ item }) => (
          <MemoryRow
            memory={item}
            gutter="time"
            onLongPress={() => confirmDelete(item.id, item.title)}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={TYPE.label}>
                {filtered ? 'NOTHING UNDER THIS MARK' : 'NOTHING RECORDED YET'}
              </Text>
              <Text style={[TYPE.body, styles.emptyText]}>
                {filtered
                  ? 'Clear a filter to see the rest of your record.'
                  : 'Write what happened on the Record tab. It will appear here, newest first.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.paper },
  head: { paddingTop: 68, paddingBottom: 10, gap: 10 },
  title: { paddingHorizontal: SPACE.page, marginBottom: 4 },
  listContent: { paddingHorizontal: SPACE.page, paddingBottom: 40 },
  emptyContent: { flexGrow: 1, paddingHorizontal: SPACE.page },
  dayHead: { paddingTop: 26, paddingBottom: 6, gap: 8 },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.rule,
    // Align the rule with the content column so the gutter stays open.
    marginLeft: GUTTER,
  },
  ahead: { color: COLORS.moss, marginBottom: 2 },
  futureDay: { color: COLORS.moss },
  empty: { flex: 1, justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyText: { maxWidth: 300 },
});
