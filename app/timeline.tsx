import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { groupByDay } from '@/format';
import { completeMemory, reopenMemory } from '@/complete';
import { FONTS, radius, useTheme } from '@/expense/theme';
import { Chip, Empty, ListRow, Screen, T, TopBar } from '@/expense/ui';
import { isStruck, sinkStruck } from '@/strike';
import { CATEGORIES, type Category, type Memory, type MemoryType } from '@/types';
import { useMemories } from '@/useMemories';

/** The kind chips, in the order people reach for them. */
const KINDS: { type: MemoryType; label: string }[] = [
  { type: 'task', label: 'Tasks' },
  { type: 'reminder', label: 'Reminders' },
  { type: 'memory', label: 'Memories' },
  { type: 'purchase', label: 'Purchases' },
  { type: 'appointment', label: 'Appointments' },
  { type: 'play', label: 'Playlist' },
  { type: 'watch', label: 'Watchlist' },
  { type: 'wish', label: 'Wishlist' },
];

/** "Personal Care" → "Personal care". */
function sentence(label: string) {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Does the entry mention every word typed? Title, people, place, tags, group, category. */
function matches(memory: Memory, words: string[]) {
  const haystack = [
    memory.title,
    memory.people,
    memory.location,
    memory.tags,
    memory.groupName,
    memory.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function DayGap() {
  return <View style={styles.gap} />;
}

export default function TimelineScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const [category, setCategory] = useState<Category | null>(null);
  const [typeFilter, setTypeFilter] = useState<MemoryType | null>(null);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);

  // Re-queries automatically on every write via addDatabaseChangeListener.
  const { memories, loading } = useMemories({ category, type: typeFilter });
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length > 0 ? memories.filter((memory) => matches(memory, words)) : memories;
  const filtered = category !== null || typeFilter !== null || words.length > 0;

  // Struck entries — ticked off, or past the moment they were for — sit under
  // the rest of their day rather than in the middle of what is still open.
  const now = new Date();
  const sections = groupByDay(shown, now).map((section) => ({
    ...section,
    data: sinkStruck(section.data, now),
  }));

  function toggle(memory: Memory) {
    // completeMemory knows what to do with a repeating entry: move it on
    // rather than close it.
    if (memory.status === 'active') void completeMemory(memory);
    else void reopenMemory(memory);
  }

  const header = (
    <View style={styles.head}>
      <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={18} color={c.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search everything you recorded"
          placeholderTextColor={c.faint}
          returnKeyType="search"
          accessibilityLabel="Search"
          style={[styles.searchInput, { color: c.text }]}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={c.faint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
        <Chip label="All" active={typeFilter === null} onPress={() => setTypeFilter(null)} />
        {KINDS.map((kind) => (
          <Chip
            key={kind.type}
            label={kind.label}
            active={typeFilter === kind.type}
            onPress={() => setTypeFilter(typeFilter === kind.type ? null : kind.type)}
          />
        ))}
      </ScrollView>

      <Pressable
        onPress={() => setPicking(true)}
        accessibilityRole="button"
        accessibilityLabel={`Category: ${category ? sentence(category) : 'All'}`}
        style={({ pressed }) => [
          styles.dropdown,
          { backgroundColor: c.card, borderColor: category ? c.text : c.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <T size={14}>
          Category: <T size={14} weight="700">{category ? sentence(category) : 'All'}</T>
        </T>
        <Ionicons name="chevron-down" size={15} color={c.sub} />
      </Pressable>
    </View>
  );

  return (
    <Screen>
      <TopBar title="Timeline" onBack={() => router.back()} />

      <FlatList
        data={sections}
        keyExtractor={(section) => section.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        contentContainerStyle={sections.length === 0 ? styles.emptyContent : styles.listContent}
        ItemSeparatorComponent={DayGap}
        renderItem={({ item: section }) => (
          <View style={styles.day}>
            {/* Stated once, above the first scheduled day. */}
            {section.startsFuture ? (
              <T size={13} weight="700" style={[styles.ahead, { color: c.accent }]}>Still to come</T>
            ) : null}
            <Section label={section.title} tone={section.isFuture ? 'ahead' : undefined}>
              {section.data.map((item) => (
                <MemoryRow
                  key={item.id}
                  memory={item}
                  gutter="time"
                  struck={isStruck(item, now)}
                  onPress={() => toggle(item)}
                  onLongPress={() => router.push(`/entry/${item.id}`)}
                />
              ))}
            </Section>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : filtered ? (
            <Empty
              icon="search-outline"
              title="Nothing matches"
              hint="Clear the search or a filter to see the rest of your record."
              action={{
                label: 'Clear filters',
                onPress: () => {
                  setQuery('');
                  setTypeFilter(null);
                  setCategory(null);
                },
              }}
            />
          ) : (
            <Empty
              icon="time-outline"
              title="Nothing recorded yet"
              hint="Write what happened on the Record tab. It will appear here, newest first."
            />
          )
        }
      />

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { backgroundColor: c.card, borderColor: c.line }]}
          >
            <T size={17} weight="700" style={styles.sheetTitle}>Category</T>
            {[null, ...CATEGORIES].map((option, i, all) => {
              const on = option === category;
              return (
                <ListRow
                  key={option ?? 'all'}
                  label={option ? sentence(option) : 'All'}
                  chevron={false}
                  last={i === all.length - 1}
                  right={on ? <Ionicons name="checkmark" size={20} color={c.accent} /> : undefined}
                  onPress={() => {
                    setCategory(option);
                    setPicking(false);
                  }}
                />
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 12, paddingBottom: 18 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontFamily: FONTS.sans, fontSize: 15, paddingVertical: 10 },
  // Bleed the chip row to the screen edges so it scrolls under the gutter.
  chipScroll: { marginHorizontal: -20, marginBottom: -8 },
  chips: { paddingHorizontal: 20 },
  dropdown: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  emptyContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 14 },
  gap: { height: 18 },
  day: { gap: 6 },
  ahead: { marginBottom: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sheetTitle: { marginBottom: 4 },
});
