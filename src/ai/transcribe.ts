import { File } from 'expo-file-system';
import { EXTRACT_MODEL, requestTextFromAudio } from './client';

/**
 * Speech to text.
 *
 * Deliberately stops at text: the transcript goes into the same input box you
 * would have typed into, so you can correct a mis-hearing before it becomes a
 * memory. Extraction and storage never learn that audio was involved, which is
 * what keeps this swappable — an on-device recogniser could replace this file
 * without touching anything else.
 */

export class TranscriptionError extends Error {
  constructor(message = "Didn't catch that — try again, a little closer.") {
    super(message);
    this.name = 'TranscriptionError';
  }
}

const SYSTEM_PROMPT = `You transcribe short voice notes a person records about their own day.

Write down exactly what they said, as plain text. Do not summarise, translate,
rephrase, answer, or add commentary. Do not wrap the text in quotes.

Numbers spoken as words that name an amount should be written as digits
("twelve hundred rupees" -> "1200 rupees"). Keep names and place names as
spoken. Use ordinary sentence punctuation.

If the audio contains no intelligible speech, reply with exactly: NO_SPEECH`;

/** Map a recording's file extension to a MIME type Gemini accepts. */
function mimeTypeFor(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'm4a':
      return 'audio/m4a';
    case 'mp4':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'wav':
      return 'audio/wav';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    case '3gp':
      return 'audio/3gpp';
    default:
      // The recorder's HIGH_QUALITY preset produces m4a on both platforms.
      return 'audio/m4a';
  }
}

/**
 * Transcribe a recording.
 *
 * @param uri file URI produced by the recorder
 * @returns   what was said, trimmed
 */
export async function transcribeRecording(uri: string): Promise<string> {
  let audioBase64: string;
  try {
    audioBase64 = await new File(uri).base64();
  } catch {
    throw new TranscriptionError('Could not read the recording.');
  }

  if (!audioBase64) throw new TranscriptionError();

  const raw = await requestTextFromAudio({
    model: EXTRACT_MODEL,
    system: SYSTEM_PROMPT,
    prompt: 'Transcribe this voice note.',
    audioBase64,
    mimeType: mimeTypeFor(uri),
  });

  const text = raw.trim().replace(/^["“]|["”]$/g, '').trim();

  if (!text || text === 'NO_SPEECH') throw new TranscriptionError();
  return text;
}
