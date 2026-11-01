import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyboardLift } from '@/components/KeyboardLift';
import { useTheme } from '@/expense/theme';
import { ActionBar, Button, Chip, Field, Label, Row, T } from '@/expense/ui';
import { isBlankNote, noteCategories, UNSORTED, type Note } from '@/notesLogic';
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
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(note?.title ?? '');
    setBody(note?.body ?? '');
    setCategory(note?.category ?? initialCategory ?? UNSORTED);
    setPinned(note ? note.pinned === 1 : false);
    setAdding(false);
    setDraft('');
  }, [visible, note, initialCategory]);

  const cats = noteCategories([...all, { category }]).map((x) => x.name);
  const blank = isBlankNote({ title, body });

  const addCategory = () => {
    const name = draft.trim();
    if (!name) return;
    const existing = cats.find((n) => n.toLowerCase() === name.toLowerCase());
    setCategory(existing ?? name);
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
      await saveNote({ id: note?.id, title, body, category: typed || category, pinned });
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
            <Field label="Title (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Wi-Fi password, Gift ideas" containerStyle={{ marginBottom: 12 }} />
            <Field
              label="Note"
              value={body}
              onChangeText={setBody}
              placeholder="Write anything you want to keep"
              multiline
              autoFocus={!note}
              style={styles.body}
            />

            <Label>Category</Label>
            <View style={styles.chipRow}>
              {cats.map((name) => (
                <Chip key={name} label={name} active={category.toLowerCase() === name.toLowerCase()} onPress={() => setCategory(name)} />
              ))}
              {!adding ? <Chip label="New category" icon="add" onPress={() => setAdding(true)} /> : null}
            </View>
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
  body: { minHeight: 160, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 14 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
