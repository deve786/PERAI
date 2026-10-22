import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { logFail, logOk } from '@/log';
import { getSupabase, isConfigured } from '@/sync/client';
import { useSync } from '@/sync/useSync';
import { timeLabel, shortDate } from '@/format';
import { useTheme } from '@/expense/theme';
import { Button, Card, Field, Row, Screen, T, TopBar } from '@/expense/ui';

/** Round tinted icon beside a title and a line or two of explanation. */
function StatusCard({ icon, tone, title, children }: {
  icon: keyof typeof Ionicons.glyphMap; tone: string; title: string; children: ReactNode;
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

/**
 * The backup account.
 *
 * One email and password: the same button signs in, or makes the account if
 * there is not one yet, because on a personal app the distinction is noise.
 * Once signed in this is a status screen — what is waiting, when it last went
 * up — since sync otherwise happens with nothing to press.
 */
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
      logOk('Signed in for backup', address);
      await sync.syncNow();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logFail('Could not sign in', reason);
      setProblem(reason);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await getSupabase().auth.signOut();
      logOk('Signed out of backup');
      await sync.refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  const lastLine = sync.lastAt
    ? `Last backed up ${shortDate(sync.lastAt)}, ${timeLabel(sync.lastAt)}`
    : 'Not backed up yet';

  return (
    <Screen>
      <TopBar title="Record backup" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 18, paddingBottom: 40, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {!isConfigured() ? (
            <StatusCard icon="phone-portrait-outline" tone={c.warn} title="Stored on this phone only">
              <T size={14} sub style={{ lineHeight: 20 }}>
                No backup service is set up in this build, so your record stays on this phone only.
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
                  take your record with it.
                </T>
              </StatusCard>

              <Card style={{ gap: 10 }}>
                <Row style={{ justifyContent: 'space-between', gap: 12 }}>
                  <T size={14} sub>Signed in</T>
                  <T size={15} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{sync.email}</T>
                </Row>
                <T size={15}>{lastLine}</T>
                <T size={14} sub>
                  {sync.pending === 0
                    ? 'Everything here has been backed up.'
                    : `${sync.pending} ${sync.pending === 1 ? 'change is' : 'changes are'} waiting to go up.`}
                </T>
              </Card>

              {sync.error ? <T size={14} style={{ color: c.danger, lineHeight: 20 }}>{sync.error}</T> : null}

              <View style={{ gap: 10 }}>
                <Button
                  title={sync.state === 'syncing' ? 'Backing up…' : 'Back up now'}
                  icon="cloud-upload-outline"
                  onPress={() => void sync.syncNow()}
                  disabled={busy}
                />
                <Button title="Sign out" kind="ghost" onPress={() => void signOut()} disabled={busy} />
              </View>
            </>
          ) : (
            <>
              <StatusCard icon="cloud-offline-outline" tone={c.sub} title="Not backed up">
                <T size={14} sub style={{ lineHeight: 20 }}>
                  Sign in to keep a copy of your record off this phone. The same email and password
                  gets you back in after a reinstall.
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
