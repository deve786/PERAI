import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardLift } from '@/components/KeyboardLift';
import { useTheme } from '@/expense/theme';
import { ActionBar, Button, Chip, Field, Label, Row, T } from '@/expense/ui';
import { addDays, fromStr, prettyDate, toStr, todayStr } from '@/expense/dates';
import { guessNoteCategory } from '@/ai/noteCategory';
import { addNoteDate, guessSource, isBlankNote, noteCategories, parseDates, removeNoteDate, summariseDates, UNSORTED, type Note } from '@/notesLogic';
import { saveNote } from '@/notesDb';

interface Props {
  visible: boolean;
  /** The note being edited, or null for a new one. */
  note: Note | null;
  /** Every note, to offer the categories already in use. */
  all: Note[];
  /** Category to start a new note in (the filter in view). */
  initialCategory?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (note: Note) => void;
}

/** Write or change a note: a title (optional), the text, and a category. */
export function NoteEditor({ visible, note, all, initialCategory, onClose, onSaved, onDelete }: Props) {
  const { c } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState(UNSORTED);
  const [pinned, setPinned] = useState(false);
  const [days, setDays] = useState<string[]>([todayStr()]);
  const [showPicker, setShowPicker] = useState(false);
  // The AI files a new note by its title until you pick a category yourself.
  const [guessing, setGuessing] = useState(false);
  const [aiNew, setAiNew] = useState(false);
  const autoPick = useRef(true);
  const seq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(note?.title ?? '');
    setBody(note?.body ?? '');
    setCategory(note?.category ?? initialCategory ?? UNSORTED);
    setPinned(note ? note.pinned === 1 : false);
    setDays(note ? parseDates(note.dates || note.note_date) : [todayStr()]);
    setShowPicker(false);
    setAdding(false);
    setDraft('');
    setGuessing(false);
    setAiNew(false);
    // A note you are reopening keeps the category you gave it.
    autoPick.current = !note && !initialCategory;
    seq.current += 1;
    if (debounce.current) clearTimeout(debounce.current);
  }, [visible, note, initialCategory]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    []
  );

  // While a new AI-suggested name is being edited it has its own box, not a chip per keystroke.
  const cats = noteCategories(aiNew ? all : [...all, { category }]).map((x) => x.name);

  /** Ask the AI where a note with this title belongs, once typing pauses. */
  const scheduleGuess = (nextTitle: string, nextBody: string) => {
    seq.current += 1;
    const mine = seq.current;
    if (debounce.current) clearTimeout(debounce.current);
    setGuessing(false);
    if (!autoPick.current) return;
    const source = guessSource({ title: nextTitle, body: nextBody });
    if (source.length < 3) return;
    debounce.current = setTimeout(async () => {
      setGuessing(true);
      const names = noteCategories(all).map((x) => x.name);
      const guess = await guessNoteCategory(source, names);
      if (mine !== seq.current) return;
      setGuessing(false);
      if (!guess || !autoPick.current) return;
      setCategory(guess.name);
      setAiNew(guess.kind === 'new');
    }, 900);
  };

  const pickCategory = (name: string) => {
    autoPick.current = false;
    seq.current += 1;
    if (debounce.current) clearTimeout(debounce.current);
    setGuessing(false);
    setAiNew(false);
    setCategory(name);
  };
  const blank = isBlankNote({ title, body });
  const summary = summariseDates(days, todayStr());

  const addCategory = () => {
    const name = draft.trim();
    if (!name) return;
    const existing = cats.find((n) => n.toLowerCase() === name.toLowerCase());
    pickCategory(existing ?? name);
    setAdding(false);
    setDraft('');
  };

  const save = async () => {
    if (blank || saving) return;
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      // Text typed in "New category" but not added yet still counts.
      const typed = adding ? draft.trim() : '';
      await saveNote({ id: note?.id, title, body, category: typed || category, pinned, dates: days });
      onSaved();
      onClose();
    } catch (err) {
      console.warn('Could not save the note:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardLift style={styles.backdrop}>
        <Pressable style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line }]} onPress={(e) => e.stopPropagation()}>
          <ActionBar
            title={note ? 'Edit note' : 'New note'}
            onCancel={onClose}
            actions={[{ label: saving ? 'Saving…' : 'Save', primary: true, onPress: save, disabled: blank || saving }]}
          />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Field
              label="Title"
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                scheduleGuess(t, body);
              }}
              placeholder="e.g. Wi-Fi password, Dentist visit"
              autoFocus={!note}
              containerStyle={{ marginBottom: 12 }}
            />
            <Field
              label="Description (optional)"
              value={body}
              onChangeText={(t) => {
                setBody(t);
                if (!title.trim()) scheduleGuess(title, t);
              }}
              placeholder="Leave empty to keep just the title and date"
              multiline
              style={styles.body}
            />

            <Label>{days.length > 1 ? `Dates · ${days.length} times` : 'Dates'}</Label>
            <T size={13} sub style={{ marginBottom: 8 }}>
              Add every day this happened, like each haircut. One date is fine too.
            </T>
            {days.length > 0 ? (
              <View style={styles.chipRow}>
                {days.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setDays((prev) => removeNoteDate(prev, d))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${prettyDate(d)}`}
                    style={({ pressed }) => [styles.dateChip, { backgroundColor: c.accentSoft, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <T size={14} weight="600" style={{ color: c.accent }}>{prettyDate(d)}</T>
                    <Ionicons name="close" size={14} color={c.accent} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {summary.count > 1 && summary.everyDays !== null ? (
              <T size={13} sub style={{ marginBottom: 8 }}>
                Last {prettyDate(summary.last!)} · about every {summary.everyDays} day{summary.everyDays === 1 ? '' : 's'}
              </T>
            ) : null}
            <View style={[styles.chipRow, { marginBottom: showPicker ? 0 : 12 }]}>
              <Chip label="+ Today" active={false} onPress={() => { setDays((p) => addNoteDate(p, todayStr())); setShowPicker(false); }} />
              <Chip label="+ Yesterday" active={false} onPress={() => { setDays((p) => addNoteDate(p, addDays(todayStr(), -1))); setShowPicker(false); }} />
              <Chip label="+ Pick a date" icon="calendar-outline" active={showPicker} onPress={() => setShowPicker((p) => !p)} />
            </View>
            {showPicker ? (
              <DateTimePicker
                value={fromStr(days[0] ?? todayStr())}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(e, d) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (d && e.type !== 'dismissed') setDays((p) => addNoteDate(p, toStr(d)));
                }}
              />
            ) : null}

            <Row style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <T size={14} weight="600">Category</T>
              {guessing ? (
                <Row style={{ gap: 5, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={c.sub} />
                  <T size={13} sub>Guessing with AI…</T>
                </Row>
              ) : null}
            </Row>
            <View style={styles.chipRow}>
              {cats.map((name) => (
                <Chip key={name} label={name} active={category.toLowerCase() === name.toLowerCase()} onPress={() => pickCategory(name)} />
              ))}
              {!adding ? <Chip label="New category" icon="add" onPress={() => setAdding(true)} /> : null}
            </View>
            {aiNew && !adding ? (
              <Field
                label="AI suggested a new category (edit if needed)"
                value={category}
                onChangeText={(t) => setCategory(t)}
                maxLength={30}
                containerStyle={{ marginTop: 8, marginBottom: 0 }}
              />
            ) : null}
            {adding ? (
              <Row style={{ gap: 8, marginTop: 4, alignItems: 'center' }}>
                <Field
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Category name"
                  containerStyle={{ flex: 1, marginBottom: 0 }}
                  autoFocus
                  onSubmitEditing={addCategory}
                />
                <Button title="Add" kind="ghost" disabled={!draft.trim()} onPress={addCategory} />
              </Row>
            ) : null}

            <Pressable
              onPress={() => setPinned((p) => !p)}
              accessibilityRole="switch"
              accessibilityState={{ checked: pinned }}
              style={({ pressed }) => [styles.pinRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={[styles.box, { borderColor: pinned ? c.accent : c.border, backgroundColor: pinned ? c.accent : 'transparent' }]}>
                {pinned ? <T size={13} weight="700" style={{ color: c.inkText }}>✓</T> : null}
              </View>
              <T size={15}>Pin to the top</T>
            </Pressable>

            {note ? (
              <Pressable
                onPress={() => onDelete(note)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <T size={16} weight="700" style={{ color: c.danger }}>Delete note</T>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>
      </KeyboardLift>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, overflow: 'hidden', maxHeight: '92%' },
  scroll: { padding: 20, paddingBottom: 36 },
  body: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, marginRight: 8, marginBottom: 8 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 14 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
