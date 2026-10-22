import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { findOrCreateTaggedPlace, listTaggedPlaces, type TaggedPlace } from './db';
import { useTheme } from './theme';
import { Button, Chip, Field, Label, Row } from './ui';

/**
 * "Place" on the expense and income forms — works like the
 * tagged person: places used before show as chips, "Add place" types a
 * new one, and it's saved so it shows up as a chip next time.
 *
 * `onDraft` reports text typed but not yet added, so saving the form with
 * the box still open keeps that place too — the same as the person field.
 */
export function PlacePicker({
  value,
  onChange,
  onDraft,
}: {
  value: string;
  onChange: (place: string) => void;
  onDraft: (text: string) => void;
}) {
  const { c } = useTheme();
  const [saved, setSaved] = useState<TaggedPlace[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    listTaggedPlaces()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);

  const typeDraft = (text: string) => {
    setDraft(text);
    onDraft(text);
  };

  const closeAdd = () => {
    setAdding(false);
    typeDraft('');
  };

  async function add() {
    const name = draft.trim();
    if (!name) return;
    await findOrCreateTaggedPlace(name);
    onChange(name);
    if (!saved.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setSaved((prev) => [...prev, { id: name, name }].sort((a, b) => a.name.localeCompare(b.name)));
    }
    closeAdd();
  }

  // A place set on an older entry that isn't in the saved list still shows
  // as a selected chip, so editing never hides it.
  const chips =
    value.trim() && !saved.some((p) => p.name.toLowerCase() === value.trim().toLowerCase())
      ? [...saved, { id: `current:${value}`, name: value.trim() }]
      : saved;

  return (
    <>
      <Label style={{ marginTop: 20 }}>Place</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        {chips.map((p) => {
          const active = value.toLowerCase() === p.name.toLowerCase();
          return (
            <Chip
              key={p.id}
              label={p.name}
              icon="location-outline"
              active={active}
              onPress={() => onChange(active ? '' : p.name)}
            />
          );
        })}
        {!adding && <Chip label="Add place" icon="add" active={false} onPress={() => setAdding(true)} />}
      </View>

      {adding && (
        <Row style={{ gap: 8, marginTop: 4, marginBottom: 4, alignItems: 'center' }}>
          <Field
            value={draft}
            onChangeText={typeDraft}
            placeholder="Place (e.g. Lulu Mall, Kochi)"
            containerStyle={{ flex: 1, marginBottom: 0 }}
            autoFocus
          />
          <Button title="Add" kind="ghost" disabled={!draft.trim()} onPress={add} />
          <Pressable
            hitSlop={8}
            onPress={closeAdd}
            accessibilityLabel="Cancel add place"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={20} color={c.sub} />
          </Pressable>
        </Row>
      )}
    </>
  );
}
