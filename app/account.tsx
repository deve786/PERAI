import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { logFail, logOk } from '@/log';
import { getSupabase, isConfigured } from '@/sync/client';
import { useSync } from '@/sync/useSync';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import { timeLabel, shortDate } from '@/format';

/**
 * The backup account.
 *
 * One email and password: the same button signs in, or makes the account if
 * there is not one yet, because on a personal app the distinction is noise.
 * Once signed in this is a status screen — what is waiting, when it last went
 * up — since sync otherwise happens with nothing to press.
 */
export default function AccountScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
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
    ? `LAST BACKED UP ${shortDate(sync.lastAt).toUpperCase()}, ${timeLabel(sync.lastAt)}`
    : 'NOT BACKED UP YET';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={type.display}>Backup</Text>

        {!isConfigured() ? (
          <Text style={[type.body, styles.lead]}>
            No backup service is set up in this build, so your record stays on
            this phone only.
          </Text>
        ) : signedIn ? (
          <>
            <Text style={[type.body, styles.lead]}>
              Everything you record is copied to your account, so a lost or wiped
              phone does not take your record with it.
            </Text>

            <View style={styles.status}>
              <Text style={type.label}>SIGNED IN</Text>
              <Text style={type.body}>{sync.email}</Text>
            </View>

            <View style={styles.status}>
              <Text style={type.label}>{lastLine}</Text>
              <Text style={type.body}>
                {sync.pending === 0
                  ? 'Everything here has been backed up.'
                  : `${sync.pending} ${sync.pending === 1 ? 'change is' : 'changes are'} waiting to go up.`}
              </Text>
            </View>

            {sync.error ? <Text style={[type.body, styles.problem]}>{sync.error}</Text> : null}

            <View style={styles.actions}>
              <Pressable onPress={() => void sync.syncNow()} disabled={busy} hitSlop={8}>
                <Text style={[type.label, styles.action]}>
                  {sync.state === 'syncing' ? 'BACKING UP…' : 'BACK UP NOW'}
                </Text>
              </Pressable>
              <Pressable onPress={() => void signOut()} disabled={busy} hitSlop={8}>
                <Text style={[type.label, styles.signOut]}>SIGN OUT</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[type.body, styles.lead]}>
              Sign in to keep a copy of your record off this phone. The same
              email and password gets you back in after a reinstall.
            </Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.mist}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.mist}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            {notice ? <Text style={[type.body, styles.notice]}>{notice}</Text> : null}
            {problem ? <Text style={[type.body, styles.problem]}>{problem}</Text> : null}

            <Pressable
              onPress={() => void signIn()}
              disabled={busy}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={[type.label, styles.primaryText]}>
                {busy ? 'ONE MOMENT…' : 'SIGN IN'}
              </Text>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Text style={[type.label, styles.signOut]}>CLOSE</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 28, paddingBottom: 48, gap: 18 },
    lead: { maxWidth: 340, marginTop: -6 },
    input: {
      fontFamily: FONTS.sans,
      fontSize: 17,
      color: colors.ink,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    status: { gap: 4, borderLeftWidth: 2, borderLeftColor: colors.moss, paddingLeft: 12 },
    actions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6 },
    action: { color: colors.moss },
    signOut: { color: colors.mist },
    notice: { color: colors.graphite },
    problem: { color: colors.alert },
    primary: {
      marginTop: 4,
      paddingVertical: 12,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.moss,
      alignItems: 'center',
    },
    primaryText: { color: colors.moss },
    pressed: { opacity: 0.5 },
    close: { alignItems: 'center', paddingTop: 12 },
  });
}
