import React, { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '@/expense/theme';
import { Chip, Screen, T, Title } from '@/expense/ui';
import { askBot, chatConfigured, type ChatMsg } from '@/expense/chatApi';

type Bubble = ChatMsg & { failed?: boolean };

const SUGGESTIONS = [
  'How much did I spend this month?',
  'What was my biggest expense last month?',
  'Compare this month with last month',
  'Where am I spending the most?',
];

export default function Chat() {
  const { c, symbol, budget } = useTheme();
  const [msgs, setMsgs] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<Bubble>>(null);
  const configured = chatConfigured();

  async function send(q?: string) {
    const content = (q ?? text).trim();
    if (!content || busy) return;
    const next: Bubble[] = [...msgs, { role: 'user', content }];
    setMsgs(next);
    setText('');
    setBusy(true);
    try {
      const history: ChatMsg[] = next.filter((m) => !m.failed).map(({ role, content: c2 }) => ({ role, content: c2 }));
      const reply = await askBot(history, symbol, budget);
      setMsgs([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMsgs([...next, {
        role: 'assistant',
        content: e instanceof Error ? e.message : 'Something went wrong.',
        failed: true,
      }]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  const canSend = !busy && text.trim().length > 0;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
          <Title>Ask</Title>
          <T size={14} sub style={{ marginTop: 3 }}>Questions about your own spending.</T>
        </View>

        {!configured && (
          <View style={{ marginHorizontal: 20, marginTop: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
            <T size={14} weight="600">Not connected yet</T>
            <T size={13.5} sub style={{ marginTop: 4, lineHeight: 19 }}>
              Add a free Gemini key as EXPO_PUBLIC_GEMINI_API_KEY in .env, then restart with npx expo start --clear.
            </T>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 20, gap: 18 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ marginTop: 8 }}>
              <T size={14} sub style={{ marginBottom: 12 }}>Try asking</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {SUGGESTIONS.map((s) => <Chip key={s} label={s} onPress={() => send(s)} />)}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            if (item.role === 'user') {
              return (
                <View style={{
                  alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: c.ink,
                  borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 14,
                }}>
                  <T size={15} style={{ color: c.inkText, lineHeight: 21 }}>{item.content}</T>
                </View>
              );
            }
            // Replies read as prose, not as chat chrome.
            return (
              <T size={15.5} style={{ lineHeight: 23, color: item.failed ? c.danger : c.text, paddingRight: 8 }}>
                {item.content}
              </T>
            );
          }}
          ListFooterComponent={busy ? <ActivityIndicator style={{ alignSelf: 'flex-start' }} color={c.faint} /> : null}
          keyboardShouldPersistTaps="handled"
        />

        <View style={{
          flexDirection: 'row', alignItems: 'flex-end', gap: 10,
          paddingHorizontal: 16, paddingVertical: 12,
          borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg,
        }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask about your spending"
            placeholderTextColor={c.faint}
            multiline
            style={{
              flex: 1, maxHeight: 110, backgroundColor: c.card, borderWidth: 1, borderColor: c.line,
              borderRadius: radius.lg, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
              fontSize: 16, color: c.text,
            }}
          />
          <Pressable
            onPress={() => send()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{
              width: 44, height: 44, borderRadius: 22, backgroundColor: c.ink,
              alignItems: 'center', justifyContent: 'center', opacity: canSend ? 1 : 0.3,
            }}
          >
            <Ionicons name="arrow-up" size={21} color={c.inkText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
