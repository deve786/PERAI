import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listShopNames } from './db';
import { useTheme } from './theme';
import { Field, Label, T } from './ui';

/**
 * "Shop name" on the expense form. Type it once and it's saved with the
 * expense; from then on the shop shows in a dropdown under the box, narrowed
 * as you type, so the same shop is one tap instead of retyping.
 */
export function ShopPicker({ value, onChange }: { value: string; onChange: (shop: string) => void }) {
  const { c } = useTheme();
  const [names, setNames] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    listShopNames()
      .then(setNames)
      .catch(() => setNames([]));
  }, []);

  const needle = value.trim().toLowerCase();
  const matches = useMemo(
    () => names.filter((n) => n.toLowerCase().includes(needle) && n.toLowerCase() !== needle).slice(0, 8),
    [names, needle]
  );

  return (
    <>
      <Label style={{ marginTop: 20 }}>Shop name</Label>
      <Field
        value={value}
        onChangeText={onChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Lulu Hypermarket"
        autoCapitalize="words"
        containerStyle={{ marginBottom: 0 }}
      />
      {open && matches.length > 0 ? (
        <View
          style={{
            marginTop: 4,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {matches.map((name, i) => (
            <Pressable
              key={name}
              onPress={() => {
                onChange(name);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Use shop ${name}`}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.border,
              }}
            >
              <Ionicons name="storefront-outline" size={18} color={c.sub} />
              <T size={15}>{name}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
}
