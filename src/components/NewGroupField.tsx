import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addEmptyGroup } from '../db/queries';
import { normalizeGroupName } from '../groups';
import { logOk } from '../log';
import { useTheme } from '../ThemeContext';
import { FONTS, type Colors } from '../theme';

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
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const [name, setName] = useState('');

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
        style={styles.input}
      />
      <Pressable onPress={() => void create()} hitSlop={10} disabled={!name.trim()}>
        <Text style={[type.label, name.trim() ? styles.on : styles.off]}>CREATE</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    input: { flex: 1, fontFamily: FONTS.sans, fontSize: 15, color: colors.ink, paddingVertical: 8 },
    on: { color: colors.moss },
    off: { color: colors.mist },
  });
}
