import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DraftCard } from '@/components/DraftCard';
import { insertMemory, rememberSpelling } from '@/db/queries';
import { logOk } from '@/log';
import { clearDrafts, removeDraft, updateDraft, usePendingDrafts } from '@/draftStore';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';

export default function PreviewScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const router = useRouter();
  const { rawInput, drafts } = usePendingDrafts();
  const [savedCount, setSavedCount] = useState(0);
  const dismissing = useRef(false);

  // Close once every card has been dealt with, but only if we ever had cards —
  // otherwise the screen would dismiss itself before the store is populated.
  const hadDrafts = useRef(false);
  if (drafts.length > 0) hadDrafts.current = true;

  useEffect(() => {
    if (hadDrafts.current && drafts.length === 0 && !dismissing.current) {
      dismissing.current = true;
      clearDrafts();
      router.back();
    }
  }, [drafts.length, router]);

  // What each title looked like before it was edited here. A title corrected
  // by hand is the best spelling there is — better than any search — so it is
  // remembered and applied to every later note (see src/dictionary.ts).
  const originalTitles = useRef(new Map<string, string>());
  for (const entry of drafts) {
    if (!originalTitles.current.has(entry.key)) {
      originalTitles.current.set(entry.key, entry.draft.title);
    }
  }

  async function keep(entry: (typeof drafts)[number]) {
    const before = originalTitles.current.get(entry.key);
    if (before && before !== entry.draft.title) {
      await rememberSpelling(before, entry.draft.title, 'user');
      logOk('Learned your spelling', `${before} → ${entry.draft.title}`);
    }
    await insertMemory(entry.draft, rawInput);
  }

  async function save(key: string) {
    const entry = drafts.find((item) => item.key === key);
    if (!entry) return;
    await keep(entry);
    setSavedCount((count) => count + 1);
    removeDraft(key);
  }

  function discardAll() {
    clearDrafts();
    router.back();
  }

  async function saveAll() {
    // Sequential, not Promise.all: each insert fires a change event, and the
    // ordering keeps the Timeline's refreshes coherent.
    for (const entry of drafts) {
      await keep(entry);
    }
    setSavedCount((count) => count + drafts.length);
    clearDrafts();
    router.back();
  }

  if (drafts.length === 0) {
    return (
      <View style={styles.done}>
        <Text style={type.label}>
          {savedCount > 0
            ? `${savedCount} ${savedCount === 1 ? 'ENTRY' : 'ENTRIES'} KEPT`
            : 'NOTHING TO CONFIRM'}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.said}>
          <Text style={type.label}>YOU WROTE</Text>
          <Text style={[type.body, styles.saidText]}>{rawInput}</Text>
        </View>

        <Text style={type.display}>
          {drafts.length === 1
            ? 'One event found'
            : `${drafts.length} events found`}
        </Text>
        <Text style={[type.body, styles.lead]}>
          Check each one before it goes into your record. Edit anything that is
          wrong.
        </Text>

        {drafts.map((entry, index) => (
          <DraftCard
            key={entry.key}
            draft={entry.draft}
            index={index}
            total={drafts.length}
            onChange={(patch) => updateDraft(entry.key, patch)}
            onSave={() => void save(entry.key)}
            onDiscard={() => removeDraft(entry.key)}
          />
        ))}

        <View style={styles.bulk}>
          <Pressable onPress={discardAll} hitSlop={6} style={styles.bulkGhost}>
            <Text style={[type.label, styles.bulkGhostText]}>DISCARD ALL</Text>
          </Pressable>
          {drafts.length > 1 ? (
            <Pressable onPress={() => void saveAll()} style={styles.bulkAll}>
              <Text style={[type.label, styles.bulkAllText]}>
                KEEP ALL {drafts.length}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 28, paddingBottom: 48, gap: 14 },
    said: {
      gap: 7,
      borderLeftWidth: 2,
      borderLeftColor: colors.moss,
      paddingLeft: 12,
      marginBottom: 8,
    },
    saidText: { color: colors.ink },
    lead: { marginTop: -6, marginBottom: 4, maxWidth: 330 },
    bulk: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
    bulkGhost: { paddingVertical: 10, paddingRight: 16 },
    bulkGhostText: { color: colors.mist },
    bulkAll: {
      marginLeft: 'auto',
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.moss,
    },
    bulkAllText: { color: colors.moss },
    done: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.paper,
    },
  });
}
