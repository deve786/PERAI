import { extractPaymentFromTextOffline } from '../paymentTextOffline';
import type { ScannedPayment } from './ocr';

/**
 * On-device offline image OCR using Google ML Kit (Android) / Apple Vision (iOS).
 * Extracts text directly from image pixels without internet, then parses the
 * UPI payment card details (amount, payee, date, bank).
 */
export async function scanPaymentImageOffline(
  fileUri: string,
  categoryNames: string[] = []
): Promise<ScannedPayment | null> {
  try {
    const { extractTextFromImage, isSupported } = await import('@zhanziyang/expo-text-extractor');
    if (!isSupported) {
      console.warn('[scanPaymentImageOffline] Text extraction is not supported on this device/runtime.');
      return null;
    }

    // Google ML Kit on Android reads the image locally on device
    const lines = await extractTextFromImage(fileUri);
    if (!lines || lines.length === 0) return null;

    const fullText = lines.join('\n');
    const parsed = extractPaymentFromTextOffline(fullText, categoryNames);
    if (parsed.amount > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('[scanPaymentImageOffline] On-device ML Kit OCR error:', err);
  }
  return null;
}
