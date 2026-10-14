import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_COLORS, addCategory, deleteCategory, listCategories, type Category } from '@/expense/db';
import { radius, useTheme } from '@/expense/theme';
import { Button, ConfirmDialog, Divider, Field, Header, IconDot, Row, Screen, Section, T } from '@/expense/ui';

const ICONS = [
  'cafe-outline', 'fitness-outline', 'airplane-outline', 'school-outline', 'paw-outline',
  'gift-outline', 'phone-portrait-outline', 'construct-outline', 'game-controller-outline', 'cart-outline',
];

export default function Categories() {
  const { c } = useTheme();
  const router = useRouter();
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const load = useCallback(async () => setCats(await listCategories()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    const n = name.trim();
    if (!n) return;
    if (cats.some((k) => k.name.toLowerCase() === n.toLowerCase())) {
      Alert.alert('That name is taken', 'Pick a different one.');
      return;
    }
    await addCategory(n, icon, color);
    setName('');
    load();
  }

  function remove(k: Category) {
    if (k.name === 'Other') {
      Alert.alert('Keep this one', '"Other" catches expenses from deleted categories.');
      return;
    }
    setToDelete(k);
  }

  async function confirmRemove() {
    if (!toDelete) return;
    await deleteCategory(toDelete.id);
    setToDelete(null);
    load();
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Header title="Categories" onClose={() => router.back()} />

        <Divider />
        {cats.map((k) => (
          <Row key={k.id} style={{ paddingVertical: 11, gap: 13, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <IconDot icon={k.icon} color={k.color} />
            <T size={15} weight="600" style={{ flex: 1 }}>{k.name}</T>
            <Pressable onPress={() => remove(k)} hitSlop={12} accessibilityLabel={`Delete ${k.name}`}>
              <Ionicons name="trash-outline" size={19} color={c.faint} />
            </Pressable>
          </Row>
        ))}

        <Section title="Add a category" />
        <Field value={name} onChangeText={setName} placeholder="Name" maxLength={30} />

        <T size={13} sub style={{ marginBottom: 10 }}>Icon</T>
        <Row style={{ flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {ICONS.map((i) => (
            <Pressable
              key={i}
              onPress={() => setIcon(i)}
              accessibilityLabel={`Icon ${i}`}
              style={{ borderRadius: radius.md, borderWidth: 2, borderColor: icon === i ? c.text : 'transparent' }}
            >
              <IconDot icon={i} color={color} size={42} />
            </Pressable>
          ))}
        </Row>

        <T size={13} sub style={{ marginBottom: 10 }}>Colour</T>
        <Row style={{ flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          {CATEGORY_COLORS.map((col) => (
            <Pressable
              key={col}
              onPress={() => setColor(col)}
              accessibilityLabel={`Colour ${col}`}
              style={{
                width: 30, height: 30, borderRadius: 15, backgroundColor: col,
                borderWidth: 3, borderColor: color === col ? c.text : 'transparent',
              }}
            />
          ))}
        </Row>

        <Button title="Add category" onPress={add} disabled={!name.trim()} />
        <View style={{ height: 20 }} />
      </ScrollView>
      <ConfirmDialog
        visible={toDelete !== null}
        title={`Delete ${toDelete?.name}?`}
        message='Its expenses move to "Other".'
        onConfirm={confirmRemove}
        onCancel={() => setToDelete(null)}
      />
    </Screen>
  );
}
