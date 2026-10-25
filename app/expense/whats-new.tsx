import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CHANGELOG } from '@/expense/changelog';
import { fromStr, monthName } from '@/expense/dates';
import { useTheme } from '@/expense/theme';
import { Card, ListCard, Row, Screen, T, TopBar } from '@/expense/ui';

function formatDateTime(dateStr: string, timeStr?: string) {
  const d = fromStr(dateStr.split('T')[0]);
  const formatted = `${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`;
  if (timeStr) {
    return `${formatted} · ${timeStr}`;
  }
  return formatted;
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
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Row style={{ alignItems: 'baseline', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                <T size={20} weight="700">v{latest.version}</T>
                {latest.build ? (
                  <T size={14} weight="600" style={{ color: c.accent }}>Build {latest.build}</T>
                ) : null}
              </Row>
              <Row style={{ gap: 6, alignItems: 'center' }}>
                {latest.type ? (
                  <View style={[styles.badge, { backgroundColor: latest.type === 'ota' ? `${c.good}20` : `${c.accent}20` }]}>
                    <T size={12} weight="700" style={{ color: latest.type === 'ota' ? c.good : c.accent }}>
                      {latest.type === 'ota' ? 'OTA Update' : 'New Build'}
                    </T>
                  </View>
                ) : null}
                <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
                  <T size={13} weight="600" style={{ color: c.accent }}>Latest</T>
                </View>
              </Row>
            </Row>
            <Row style={{ alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Ionicons name="time-outline" size={14} color={c.sub} />
              <T size={13} sub>{formatDateTime(latest.date, latest.time)}</T>
            </Row>
            <Items highlights={latest.highlights} />
          </Card>
        ) : null}

        {older.length > 0 ? (
          <>
            <T size={14} weight="600" sub style={{ marginTop: 24, marginBottom: 6 }}>Earlier</T>
            <ListCard>
              {older.map((entry, i) => {
                const key = `${entry.version}-${entry.build ?? i}`;
                const expanded = open === key;
                const last = i === older.length - 1;
                return (
                  <View
                    key={key}
                    style={{ borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}
                  >
                    <Pressable
                      onPress={() => setOpen(expanded ? null : key)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`Version ${entry.version}${entry.build ? ` build ${entry.build}` : ''}`}
                      style={({ pressed }) => [styles.olderRow, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Row style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <T size={16} weight="700" tabular>v{entry.version}</T>
                          {entry.build ? (
                            <T size={13} weight="600" style={{ color: c.accent }}>Build {entry.build}</T>
                          ) : null}
                          {entry.type ? (
                            <View style={[styles.badge, { paddingVertical: 1, paddingHorizontal: 7, backgroundColor: entry.type === 'ota' ? `${c.good}15` : `${c.accent}15` }]}>
                              <T size={11} weight="600" style={{ color: entry.type === 'ota' ? c.good : c.accent }}>
                                {entry.type === 'ota' ? 'OTA' : 'Build'}
                              </T>
                            </View>
                          ) : null}
                          <Row style={{ alignItems: 'center', gap: 4 }}>
                            <Ionicons name="time-outline" size={12} color={c.sub} />
                            <T size={12} sub>{formatDateTime(entry.date, entry.time)}</T>
                          </Row>
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
