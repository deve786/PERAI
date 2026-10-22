import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DraftCard } from '@/components/DraftCard';
import { insertMemory, rememberSpelling } from '@/db/queries';
import { recordVoiceExpense } from '@/expense/voiceExpense';
import { logOk } from '@/log';
import { clearDrafts, removeDraft, updateDraft, usePendingDrafts } from '@/draftStore';
import { groupNames, normalizeGroupName, sameGroup } from '@/groups';
import { useGroups } from '@/useGroups';
import { useMemories } from '@/useMemories';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, SPACE, type Colors } from '@/theme';
import { Button, Chip, Empty, Screen, TopBar } from '@/expense/ui';

export default function PreviewScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const router = useRouter();
  const { rawInput, drafts } = usePendingDrafts();
  const [savedCount, setSavedCount] = useState(0);
  const dismissing = useRef(false);

  /** A group being typed, before it is put on the drafts. */
  const [groupDraft, setGroupDraft] = useState('');
  const { memories } = useMemories();
  const { empty: madeGroups } = useGroups();
  const existingGroups = groupNames(memories, madeGroups);
  /** The group they all share, or null when they differ or have none. */
  const sharedGroup =
    drafts.length > 0 && drafts.every((entry) => sameGroup(entry.draft.groupName, drafts[0].draft.groupName))
      ? drafts[0].draft.groupName
      : null;

  const applyGroup = (name: string | null) => {
    const next = name === sharedGroup ? null : name;
    for (const entry of drafts) updateDraft(entry.key, { groupName: next });
  };

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
    if (entry.draft.type === 'purchase' && entry.draft.amount !== null && entry.draft.amount > 0) {
      try {
        await recordVoiceExpense({
          title: entry.draft.title,
          category: entry.draft.category,
          eventDate: entry.draft.eventDate,
          amount: entry.draft.amount,
          rawInput,
        });
      } catch (err) {
        console.warn('Could not record expense from draft preview:', err);
      }
    }
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

  const heading = drafts.length === 1 ? 'One event found' : `${drafts.length} events found`;

  if (drafts.length === 0) {
    return (
      <Screen edges={['top', 'bottom']}>
        <TopBar title="Check before saving" />
        <Empty
          icon={savedCount > 0 ? 'checkmark' : 'document-text-outline'}
          title={
            savedCount > 0
              ? `${savedCount} ${savedCount === 1 ? 'entry' : 'entries'} kept`
              : 'Nothing to confirm'
          }
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title={heading} subtitle="Check each one before it goes into your record" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.said}>
            <Text style={type.fine}>You wrote</Text>
            <Text style={[type.body, styles.saidText]}>{rawInput}</Text>
          </View>

          {/* One group for everything in this note: a checklist said in one
              breath — "for the Kozhikode trip: book tickets, pack bags" — is
              kept together. Extraction fills this in when the note names one. */}
          <View style={styles.card}>
            <Text style={styles.cardHeading}>
              {drafts.length > 1 ? 'Group (all of them)' : 'Group'}
            </Text>
            {existingGroups.length > 0 ? (
              <View style={styles.chips}>
                <Chip
                  label="None"
                  active={sharedGroup === null}
                  onPress={() => applyGroup(null)}
                />
                {existingGroups.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    active={sharedGroup === name}
                    onPress={() => applyGroup(sharedGroup === name ? null : name)}
                  />
                ))}
              </View>
            ) : null}
            <TextInput
              value={groupDraft}
              onChangeText={setGroupDraft}
              onSubmitEditing={() => {
                applyGroup(normalizeGroupName(groupDraft));
                setGroupDraft('');
              }}
              placeholder={sharedGroup ? 'Move to another group…' : 'New group…'}
              placeholderTextColor={colors.mist}
              returnKeyType="done"
              accessibilityLabel="Group name"
              style={styles.groupInput}
            />
          </View>

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
            {drafts.length > 1 ? (
              <Button
                title={`Keep all ${drafts.length}`}
                icon="checkmark-done"
                onPress={() => void saveAll()}
              />
            ) : null}
            <Button title="Discard all" kind="danger" onPress={discardAll} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: SPACE.page, paddingTop: 16, paddingBottom: 48, gap: 14 },
    said: {
      gap: 4,
      backgroundColor: colors.mossSoft,
      borderRadius: RADIUS.card,
      padding: 14,
    },
    saidText: { color: colors.ink },
    card: {
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 14,
    },
    cardHeading: { fontFamily: FONTS.sansSemi, fontSize: 16, color: colors.ink },
    chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: -8 },
    groupInput: {
      fontFamily: FONTS.sans,
      fontSize: 16,
      color: colors.ink,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.input,
      backgroundColor: colors.surface,
    },
    bulk: { gap: 6, paddingTop: 6 },
  });
}
