import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CHANGELOG } from '@/expense/changelog';
import { fromStr, monthName } from '@/expense/dates';
import { useTheme } from '@/expense/theme';
import { Divider, Header, Row, Screen, T } from '@/expense/ui';

function formatDate(s: string) {
  const d = fromStr(s);
  return `${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`;
}

export default function WhatsNew() {
  const router = useRouter();
  const { c } = useTheme();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }}>
        <Header title="What's New" onClose={() => router.back()} />

        {CHANGELOG.map((entry, i) => (
          <View key={entry.version} style={{ marginTop: i === 0 ? 8 : 26 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Row style={{ gap: 8 }}>
                <T size={16} weight="700">Version {entry.version}</T>
                {i === 0 && (
                  <View style={{ backgroundColor: c.accentSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <T size={11} weight="700" style={{ color: c.accent }}>LATEST</T>
                  </View>
                )}
              </Row>
              <T size={12.5} faint>{formatDate(entry.date)}</T>
            </Row>
            <Divider style={{ marginTop: 10, marginBottom: 10 }} />
            {entry.highlights.map((h, hi) => (
              <T key={hi} size={14} style={{ marginTop: hi === 0 ? 0 : 8, lineHeight: 20 }}>
                •  {h}
              </T>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
