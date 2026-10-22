import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSupabase, isConfigured } from '@/expense/sync/client';
import { useSync } from '@/expense/sync/useSync';
import { exportCsv } from '@/expense/csv';
import { showDialog } from '@/dialogStore';
import { useTheme } from '@/expense/theme';
import { Button, Card, Field, ListCard, ListRow, Screen, T, TopBar } from '@/expense/ui';
import { KeyboardLift } from '@/components/KeyboardLift';

function formatLastSynced(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** Round tinted icon beside a title and a line or two of explanation. */
function StatusCard({ icon, tone, title, children }: {
  icon: keyof typeof Ionicons.glyphMap; tone: string; title: string; children: React.ReactNode;
}) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 18 }}>
      <View style={{
        width: 46, height: 46, borderRadius: 23, backgroundColor: `${tone}22`,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon} size={22} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T size={17} weight="700">{title}</T>
        {children}
      </View>
    </Card>
  );
}

export default function AccountScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const sync = useSync();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const signedIn = sync.email !== null;

  async function signIn() {
    const address = email.trim();
    if (!address || password.length === 0 || busy) return;

    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const auth = getSupabase().auth;
      const attempt = await auth.signInWithPassword({ email: address, password });

      if (attempt.error) {
        // No account yet is the ordinary case the first time.
        const created = await auth.signUp({ email: address, password });
        if (created.error) throw new Error(created.error.message);
        if (!created.data.session) {
          setNotice('Check your email to confirm the address, then sign in again.');
          return;
        }
      }

      setPassword('');
      await sync.syncNow();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await getSupabase().auth.signOut();
      await sync.refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function exportExpenses() {
    try {
      const n = await exportCsv();
      if (n === 0) showDialog({ title: 'Nothing to export', message: 'Add some expenses first.' });
    } catch (e) {
      showDialog({ title: 'Export failed', message: String(e instanceof Error ? e.message : e) });
    }
  }

  return (
    <Screen>
      <TopBar title="Backup" onBack={() => router.back()} />
      <KeyboardLift style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 18, paddingBottom: 40, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {!isConfigured() ? (
            <StatusCard icon="phone-portrait-outline" tone={c.warn} title="Stored on this phone only">
              <T size={14} sub style={{ lineHeight: 20 }}>
                No backup service is set up in this build, so your data stays on this device only.
              </T>
            </StatusCard>
          ) : signedIn ? (
            <>
              <StatusCard
                icon={sync.pending === 0 ? 'cloud-done-outline' : 'cloud-upload-outline'}
                tone={c.accent}
                title={sync.pending === 0 ? 'Backed up' : 'Backing up'}
              >
                <T size={14} sub style={{ lineHeight: 20 }}>
                  Everything you record is copied to your account, so a lost or wiped phone does not
                  take your data with it.
                </T>
              </StatusCard>

              <ListCard>
                <ListRow label="Email" right={<T size={15} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{sync.email}</T>} />
                <ListRow label="Last backed up" value={sync.lastAt ? formatLastSynced(sync.lastAt) : 'Never'} />
                <ListRow label="Pending changes" value={String(sync.pending)} last />
              </ListCard>

              {sync.error ? <T size={14} style={{ color: c.danger, lineHeight: 20 }}>{sync.error}</T> : null}

              <View style={{ gap: 10 }}>
                <Button
                  title={sync.state === 'syncing' ? 'Backing up…' : 'Back up now'}
                  icon="cloud-upload-outline"
                  onPress={() => void sync.syncNow()}
                  disabled={busy || sync.state === 'syncing'}
                />
                <Button title="Sign out" kind="ghost" onPress={() => void signOut()} disabled={busy} />
              </View>
            </>
          ) : (
            <>
              <StatusCard icon="cloud-offline-outline" tone={c.sub} title="Not backed up">
                <T size={14} sub style={{ lineHeight: 20 }}>
                  Sign in to keep a copy of your data off this phone. The same email and password gets
                  you back in after a reinstall.
                </T>
              </StatusCard>

              <View>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>

              {notice ? <T size={14} sub style={{ lineHeight: 20 }}>{notice}</T> : null}
              {problem ? <T size={14} style={{ color: c.danger, lineHeight: 20 }}>{problem}</T> : null}

              <Button title={busy ? 'One moment…' : 'Sign in'} onPress={() => void signIn()} disabled={busy} />
            </>
          )}

          <View>
            <T size={14} weight="600" sub style={{ marginTop: 4, marginBottom: 6 }}>Keep a copy yourself</T>
            <ListCard>
              <ListRow
                icon="download-outline"
                iconColor={c.accent}
                label="Export expenses"
                sub="A CSV file you can save or share"
                onPress={() => void exportExpenses()}
                chevron={false}
                last
              />
            </ListCard>
          </View>
        </ScrollView>
      </KeyboardLift>
    </Screen>
  );
}
