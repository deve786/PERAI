import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { NoteEditor } from '@/components/NoteEditor';
import { deleteNote, listNotes } from '@/notesDb';
import { prettyDate } from '@/expense/dates';
import { noteCategories, notePreview, noteTitle, visibleNotes, type Note } from '@/notesLogic';
import { showSnackbar } from '@/snackbarStore';
import { FONTS, radius, useTheme } from '@/expense/theme';
import { Chip, Empty, PillButton, Row, Screen, T, TopBar } from '@/expense/ui';


/** Notes to keep, sorted by category. Nothing here is a task and nothing reminds you. */
export default function NotesScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ new?: string }>();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [open, setOpen] = useState(false);
  // Notes deleted but still within the Undo window.
  const [hidden, setHidden] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setNotes(await listNotes());
    } catch (err) {
      console.warn('Could not load notes:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Opened from the Record shortcuts: go straight to a blank note.
      if (params.new === '1') {
        setEditing(null);
        setOpen(true);
        router.setParams({ new: undefined });
      }
    }, [load, params.new, router])
  );

  const shown = useMemo(() => notes.filter((n) => !hidden.includes(n.id)), [notes, hidden]);
  const cats = useMemo(() => noteCategories(shown).filter((x) => x.count > 0), [shown]);
  const list = useMemo(() => visibleNotes(shown, { category, query: q }), [shown, category, q]);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const remove = (note: Note) => {
    setOpen(false);
    setHidden((h) => [...h, note.id]);
    showSnackbar({
      message: 'Note deleted',
      onAction: () => setHidden((h) => h.filter((id) => id !== note.id)),
      onCommit: async () => {
        await deleteNote(note.id);
        setHidden((h) => h.filter((id) => id !== note.id));
        void load();
      },
    });
  };

  return (
    <Screen>
      <TopBar title="Notes" onBack={() => router.back()} right={<PillButton label="+ New" tone={c.accent} onPress={openNew} />} />
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          shown.length > 0 ? (
            <View style={{ gap: 12, marginBottom: 4 }}>
              <Row style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
                <Ionicons name="search" size={18} color={c.sub} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search your notes"
                  placeholderTextColor={c.faint}
                  accessibilityLabel="Search notes"
                  style={{ flex: 1, fontFamily: FONTS.sans, fontSize: 15, color: c.text, paddingVertical: 10 }}
                />
                {q ? (
                  <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={c.faint} />
                  </Pressable>
                ) : null}
              </Row>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
                <Chip label={`All ${shown.length}`} active={category === null} onPress={() => setCategory(null)} />
                {cats.map((x) => (
                  <Chip
                    key={x.name}
                    label={`${x.name} ${x.count}`}
                    active={category?.toLowerCase() === x.name.toLowerCase()}
                    onPress={() => setCategory(x.name)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null
        }
        renderItem={({ item: n }) => {
          const preview = notePreview(n);
          return (
            <Pressable
              onPress={() => {
                setEditing(n);
                setOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open note ${noteTitle(n)}`}
              style={({ pressed }) => [styles.card, { backgroundColor: c.card, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}
            >
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <T size={16} weight="700" numberOfLines={1} style={{ flex: 1 }}>{noteTitle(n)}</T>
                {n.pinned === 1 ? <Ionicons name="pin" size={14} color={c.accent} /> : null}
              </Row>
              {preview ? <T size={14} sub numberOfLines={3} style={{ marginTop: 4, lineHeight: 20 }}>{preview}</T> : null}
              <Row style={{ marginTop: 10, gap: 8, alignItems: 'center' }}>
                <View style={[styles.tag, { backgroundColor: c.accentSoft }]}>
                  <T size={12} weight="600" style={{ color: c.accent }}>{n.category}</T>
                </View>
                <T size={12} sub>{prettyDate(n.note_date)}</T>
              </Row>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loaded ? (
            shown.length === 0 ? (
              <Empty
                icon="document-text-outline"
                title="No notes yet"
                hint="Write down anything you want to keep. Give it a category so it is easy to find."
                action={{ label: 'Write a note', onPress: openNew }}
              />
            ) : (
              <Empty icon="search-outline" title="No notes match" hint="Try another word or category." />
            )
          ) : null
        }
      />

      <NoteEditor
        visible={open}
        note={editing}
        all={shown}
        initialCategory={category}
        onClose={() => setOpen(false)}
        onSaved={load}
        onDelete={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48, gap: 10 },
  search: { gap: 10, minHeight: 46, paddingHorizontal: 14, borderWidth: 1, borderRadius: radius.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
});
