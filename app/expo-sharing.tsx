import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useIncomingShare, type ResolvedSharePayload } from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { describeError } from '@/ai/client';
import { extractPaymentFromText, scanPaymentWithAI, type ScannedPayment } from '@/expense/ai/ocr';
import { recordSharedPayment, recordSharedPaymentMemory } from '@/expense/sharedPayment';
import { logFail, logOk } from '@/log';
import { markShareBusy } from '@/shareProcessingStore';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';

/** However long reading a payment genuinely takes, it should never look stuck past this. */
const READ_TIMEOUT_MS = 25000;

/**
 * Where a payment shared from another app lands — GPay's Share on a payment,
 * chiefly. Expo's own share receiver opens this as an ordinary screen (via
 * the perai://expo-sharing link), so reading the share happens on a real
 * page of the app and finishes by replacing it with the new expense: a plain
 * navigation, the same as opening an expense anywhere else.
 *
 * GPay sends an image of the payment card, read with the payment OCR; shared
 * text goes through the same extraction run on words. The payment is filed
 * as an Expense and as an already-done purchase in the Record.
 */
export default function SharedPaymentScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { sharedPayloads, resolvedSharedPayloads, isResolving, error, clearSharedPayloads } =
    useIncomingShare();
  const [failure, setFailure] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (resolvedSharedPayloads.length === 0) return;
    const key = resolvedSharedPayloads.map((p) => p.value).join('|');
    // Once per share: a re-render, or coming back to the app, must never file
    // the same payment twice.
    if (handled.current === key) return;
    handled.current = key;

    // An image takes priority: GPay can tag caption text ("Shared via Google
    // Pay") alongside the payment card itself.
    const payload =
      resolvedSharedPayloads.find((p) => p.contentType === 'image' && p.contentUri) ??
      resolvedSharedPayloads[0];

    void (async () => {
      setFailure(null);
      markShareBusy();
      try {
        const scanned = await withTimeout(
          readPayment(payload),
          READ_TIMEOUT_MS,
          'Reading the payment took too long. Check your connection and try sharing it again.'
        );
        if (!(scanned.amount > 0)) {
          throw new Error("The share didn't have a clear amount in it — add it by hand instead.");
        }
        const added = await recordSharedPayment(scanned);
        await recordSharedPaymentMemory(scanned).catch((err) => {
          // The expense already landed — a failed Record entry is worth
          // knowing about but shouldn't undo it or stop it opening.
          logFail('Added the expense, but could not also file it to Record', describeError(err));
        });
        logOk('Added an expense from a share', `${added.title} · ${added.amount}`);
        clearSharedPayloads();
        router.replace({ pathname: '/expense/expense', params: { id: String(added.id) } });
      } catch (err) {
        clearSharedPayloads();
        logFail('Could not file a shared payment', describeError(err));
        setFailure(describeError(err));
      }
    })();
  }, [resolvedSharedPayloads, clearSharedPayloads, router]);

  const nothingShared = sharedPayloads.length === 0 && !isResolving;
  const message =
    failure ?? error?.message ?? (nothingShared ? 'Nothing was shared to add.' : null);

  return (
    <View style={styles.page}>
      {message ? (
        <View style={styles.block}>
          <Text style={[type.label, styles.alert]}>COULD NOT READ THAT PAYMENT</Text>
          <Text style={[type.body, styles.ink]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable onPress={() => router.replace('/')} hitSlop={8}>
              <Text style={[type.label, styles.quiet]}>BACK</Text>
            </Pressable>
            <Pressable onPress={() => router.replace('/expense/expense')} hitSlop={8}>
              <Text style={[type.label, styles.ink]}>ADD BY HAND</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <ActivityIndicator color={colors.moss} />
          <Text style={[type.body, styles.ink]}>Reading the shared payment…</Text>
        </View>
      )}
    </View>
  );
}

/** GPay's file arrives as a "file:/…" URI (one slash); the file API wants "file:///…". */
const toFileUri = (uri: string) => uri.replace(/^file:\/(?!\/)/, 'file:///');

async function readPayment(payload: ResolvedSharePayload): Promise<ScannedPayment> {
  if (payload.contentType === 'image' && payload.contentUri) {
    const base64 = await new File(toFileUri(payload.contentUri)).base64();
    return scanPaymentWithAI(base64, payload.contentMimeType ?? payload.mimeType ?? 'image/jpeg');
  }
  return extractPaymentFromText(payload.value);
}

/** Rejects with `message` if `promise` hasn't settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: colors.paper,
      justifyContent: 'center',
      padding: SPACE.page,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
    block: {
      gap: 12,
      borderLeftWidth: 2,
      borderLeftColor: colors.alert,
      paddingLeft: 14,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 22, paddingTop: 8 },
    alert: { color: colors.alert },
    ink: { color: colors.ink },
    quiet: { color: colors.mist },
  });
}
