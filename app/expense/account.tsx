import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getSupabase, isConfigured } from '@/expense/sync/client';
import { useSync } from '@/expense/sync/useSync';
import { useTheme } from '@/expense/theme';
import { Button, Divider, Field, Header, Row, Screen, Section, T } from '@/expense/ui';

function formatLastSynced(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
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

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Header title="Backup" onClose={() => router.back()} />

          {!isConfigured() ? (
            <T size={14} sub style={{ lineHeight: 20 }}>
              No backup service is set up in this build, so your data stays on this device only.
            </T>
          ) : signedIn ? (
            <>
              <T size={14} sub style={{ lineHeight: 20 }}>
                Everything you record is copied to your account, so a lost or wiped phone does not take your data with it.
              </T>

              <Section title="Signed in" />
              <Divider />
              <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
                <T size={14} sub>Email</T>
                <T size={14} weight="600">{sync.email}</T>
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
                <T size={14} sub>Last backed up</T>
                <T size={14} weight="600">{sync.lastAt ? formatLastSynced(sync.lastAt) : 'Never'}</T>
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
                <T size={14} sub>Pending changes</T>
                <T size={14} weight="600">{sync.pending}</T>
              </Row>

              {sync.error ? <T size={13} style={{ color: c.danger, marginTop: 14 }}>{sync.error}</T> : null}

              <Button
                title={sync.state === 'syncing' ? 'Backing up…' : 'Back up now'}
                icon="cloud-upload-outline"
                onPress={() => void sync.syncNow()}
                disabled={busy || sync.state === 'syncing'}
                style={{ marginTop: 20 }}
              />
              <Button
                title="Sign out"
                kind="ghost"
                onPress={() => void signOut()}
                disabled={busy}
                style={{ marginTop: 10 }}
              />
            </>
          ) : (
            <>
              <T size={14} sub style={{ lineHeight: 20 }}>
                Sign in to keep a copy of your data off this phone. The same email and password gets you back in after a reinstall.
              </T>

              <View style={{ marginTop: 20 }}>
                <Field
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <Field
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>

              {notice ? <T size={13} sub style={{ marginBottom: 10 }}>{notice}</T> : null}
              {problem ? <T size={13} style={{ color: c.danger, marginBottom: 10 }}>{problem}</T> : null}

              <Button title={busy ? 'One moment…' : 'Sign in'} onPress={() => void signIn()} disabled={busy} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
