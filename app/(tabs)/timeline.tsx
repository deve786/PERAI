import { useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, View } from 'react-native';
import { ChipRow } from '@/components/Chip';
import { MemoryRow } from '@/components/MemoryRow';
import { deleteMemory } from '@/db/queries';
import { groupByDay } from '@/format';
import { useTheme } from '@/ThemeContext';
import { GUTTER, SPACE, type Colors } from '@/theme';
import { CATEGORIES, MEMORY_TYPES, type Category, type MemoryType } from '@/types';
import { useMemories } from '@/useMemories';

export default function TimelineScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const [category, setCategory] = useState<Category | null>(null);
  // Named to avoid colliding with the theme's own `type` (the mono/sans scale).
  const [typeFilter, setTypeFilter] = useState<MemoryType | null>(null);

  // Re-queries automatically on every write via addDatabaseChangeListener.
  const { memories, loading } = useMemories({ category, type: typeFilter });
  const sections = groupByDay(memories);
  const filtered = category !== null || typeFilter !== null;

  function confirmDelete(id: string, title: string) {
    Alert.alert('Delete this entry?', title, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteMemory(id) },
    ]);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.head}>
        <Text style={[type.display, styles.title]}>Timeline</Text>
        <ChipRow options={CATEGORIES} value={category} onChange={setCategory} allLabel="All" />
        <ChipRow options={MEMORY_TYPES} value={typeFilter} onChange={setTypeFilter} allLabel="Any" />
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
              <Text style={[type.label, styles.ahead]}>STILL TO COME</Text>
            ) : null}
            <Text style={[type.label, section.isFuture && styles.futureDay]}>
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
              <Text style={type.label}>
                {filtered ? 'NOTHING UNDER THIS MARK' : 'NOTHING RECORDED YET'}
              </Text>
              <Text style={[type.body, styles.emptyText]}>
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

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    head: { paddingTop: 68, paddingBottom: 10, gap: 10 },
    title: { paddingHorizontal: SPACE.page, marginBottom: 4 },
    listContent: { paddingHorizontal: SPACE.page, paddingBottom: 40 },
    emptyContent: { flexGrow: 1, paddingHorizontal: SPACE.page },
    dayHead: { paddingTop: 26, paddingBottom: 6, gap: 8 },
    rule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.rule,
      // Align the rule with the content column so the gutter stays open.
      marginLeft: GUTTER,
    },
    ahead: { color: colors.moss, marginBottom: 2 },
    futureDay: { color: colors.moss },
    empty: { flex: 1, justifyContent: 'center', gap: 10, paddingBottom: 60 },
    emptyText: { maxWidth: 300 },
  });
}
