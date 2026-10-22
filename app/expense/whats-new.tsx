import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CHANGELOG } from '@/expense/changelog';
import { fromStr, monthName } from '@/expense/dates';
import { useTheme } from '@/expense/theme';
import { Card, ListCard, Row, Screen, T, TopBar } from '@/expense/ui';

function formatDate(s: string) {
  const d = fromStr(s);
  return `${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`;
}

type Kind = 'new' | 'fixed';

/** Highlights aren't typed; a leading "Fixed:" marks a fix, anything else is new. */
function parse(highlight: string): { kind: Kind; text: string } {
  const m = /^fixed\s*[:—-]\s*/i.exec(highlight);
  if (!m) return { kind: 'new', text: highlight };
  const rest = highlight.slice(m[0].length);
  return { kind: 'fixed', text: rest.charAt(0).toUpperCase() + rest.slice(1) };
}

function Tag({ kind }: { kind: Kind }) {
  const { c } = useTheme();
  const fixed = kind === 'fixed';
  return (
    <View style={[styles.tag, { backgroundColor: fixed ? c.well : c.accentSoft }]}>
      <T size={12} weight="600" style={{ color: fixed ? c.sub : c.accent }}>{fixed ? 'Fixed' : 'New'}</T>
    </View>
  );
}

function Items({ highlights }: { highlights: string[] }) {
  return (
    <View style={{ gap: 12 }}>
      {highlights.map((h, i) => {
        const { kind, text } = parse(h);
        return (
          <Row key={i} style={{ alignItems: 'flex-start', gap: 10 }}>
            <Tag kind={kind} />
            <T size={15} style={{ flex: 1, lineHeight: 22 }}>{text}</T>
          </Row>
        );
      })}
    </View>
  );
}

export default function WhatsNew() {
  const router = useRouter();
  const { c } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [latest, ...older] = CHANGELOG;

  return (
    <Screen>
      <TopBar title="What's new" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 40 }}>
        {latest ? (
          <Card style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between', gap: 10 }}>
              <T size={20} weight="700" style={{ flex: 1 }}>Version {latest.version}</T>
              <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
                <T size={13} weight="600" style={{ color: c.accent }}>Latest</T>
              </View>
            </Row>
            <T size={14} sub style={{ marginBottom: 12 }}>{formatDate(latest.date)}</T>
            <Items highlights={latest.highlights} />
          </Card>
        ) : null}

        {older.length > 0 ? (
          <>
            <T size={14} weight="600" sub style={{ marginTop: 24, marginBottom: 6 }}>Earlier</T>
            <ListCard>
              {older.map((entry, i) => {
                const expanded = open === entry.version;
                const last = i === older.length - 1;
                return (
                  <View
                    key={entry.version}
                    style={{ borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}
                  >
                    <Pressable
                      onPress={() => setOpen(expanded ? null : entry.version)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`Version ${entry.version}`}
                      style={({ pressed }) => [styles.olderRow, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Row style={{ gap: 8 }}>
                          <T size={16} weight="700" tabular>{entry.version}</T>
                          <T size={13} sub>{formatDate(entry.date)}</T>
                        </Row>
                        {!expanded && entry.highlights[0] ? (
                          <T size={14} sub numberOfLines={1} style={{ marginTop: 2 }}>
                            {parse(entry.highlights[0]).text}
                          </T>
                        ) : null}
                      </View>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.faint} />
                    </Pressable>
                    {expanded ? (
                      <View style={{ paddingBottom: 14 }}>
                        <Items highlights={entry.highlights} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ListCard>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 1 },
  olderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
});
