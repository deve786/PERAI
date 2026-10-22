import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addEmptyGroup } from '../db/queries';
import { normalizeGroupName } from '../groups';
import { logOk } from '../log';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, type Colors } from '../theme';

interface Props {
  /** Called with the name once it exists, e.g. to open it. */
  onCreated?: (name: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * Make a group with nothing in it yet.
 *
 * A group is normally just a name its entries carry, so one has to be able to
 * exist for the stretch between naming it and filling it — otherwise you
 * could only ever make a group by already having the work.
 */
export function NewGroupField({ onCreated, autoFocus, placeholder }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [name, setName] = useState('');
  const ready = name.trim().length > 0;

  async function create() {
    const clean = normalizeGroupName(name);
    if (!clean) return;
    setName('');
    await addEmptyGroup(clean);
    logOk('Made a group', clean);
    onCreated?.(clean);
  }

  return (
    <View style={styles.row}>
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={() => void create()}
        placeholder={placeholder ?? 'Name a new group…'}
        placeholderTextColor={colors.mist}
        returnKeyType="done"
        autoFocus={autoFocus}
        accessibilityLabel="New group name"
        style={styles.input}
      />
      <Pressable
        onPress={() => void create()}
        hitSlop={6}
        disabled={!ready}
        accessibilityRole="button"
        style={({ pressed }) => [styles.create, !ready && styles.off, pressed && styles.pressed]}
      >
        <Text style={styles.createText}>Create</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
      flex: 1,
      minHeight: 48,
      fontFamily: FONTS.sans,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.input,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    create: {
      minHeight: 48,
      paddingHorizontal: 18,
      borderRadius: RADIUS.button,
      backgroundColor: colors.mossFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    createText: { fontFamily: FONTS.sansSemi, fontSize: 15, color: colors.onAccent },
    off: { opacity: 0.4 },
    pressed: { opacity: 0.7 },
  });
}
