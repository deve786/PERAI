import { GoogleGenAI } from '@google/genai';
import { addAiLog } from './logger';

/**
 * Calls Gemini directly from the app — same approach as the PERAI project:
 * no backend, the key ships inside the JS bundle via EXPO_PUBLIC_GEMINI_API_KEY.
 * That trades key secrecy (it's extractable from the installed app) for not
 * needing to deploy and maintain a separate proxy. Fine for personal use.
 */

export function getApiKey(): string {
  return (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim();
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

/** Raised when the app is misconfigured, so the UI can show setup help. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('No Gemini API key configured. Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart with `npx expo start --clear`.');
    this.name = 'MissingApiKeyError';
  }
}

let cached: GoogleGenAI | null = null;
let cachedKey = '';

function getClient(): GoogleGenAI {
  const key = getApiKey();
  if (!key) throw new MissingApiKeyError();
  if (!cached || cachedKey !== key) {
    cached = new GoogleGenAI({ apiKey: key });
    cachedKey = key;
  }
  return cached;
}

/**
 * On the free tier this app makes one call per question, so flash-lite — the
 * roomiest free quota — is plenty; it only reasons over text it's already
 * been handed. Raise EXPO_PUBLIC_GEMINI_ASK_MODEL if answers start missing
 * figures.
 */
export const ASK_MODEL = process.env.EXPO_PUBLIC_GEMINI_ASK_MODEL || 'gemini-3.8-flash';

/** Gemini's free tier is capped per minute; it tells us how long to wait. */
function retryDelayMs(err: unknown): number | null {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status !== 429 && !/quota|too_many_requests|rate limit/i.test(message)) return null;
  const suggested = message.match(/retry in ([\d.]+)s/i);
  const seconds = suggested ? Number(suggested[1]) : 20;
  // Cap it: a user staring at a spinner will not wait a full minute.
  return Math.min(Math.ceil(seconds) + 1, 30) * 1000;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Ask a plain question and get plain text back, with no tools.
 * Retries once on a rate-limit response, since hitting the free tier's
 * per-minute cap is routine rather than exceptional.
 */
export async function requestText(options: { model: string; system: string; user: string; retries?: number }): Promise<string> {
  try {
    const interaction = await getClient().interactions.create({
      model: options.model,
      system_instruction: options.system,
      input: options.user,
    } as Parameters<GoogleGenAI['interactions']['create']>[0]);

    if (!interaction || typeof interaction !== 'object' || !('output_text' in interaction)) {
      throw new Error('Gemini returned a streaming response, which is not supported here.');
    }
    return (interaction as { output_text?: string }).output_text ?? '';
  } catch (err) {
    const wait = retryDelayMs(err);
    const remaining = options.retries ?? 1;
    if (wait === null || remaining <= 0) throw err;
    await sleep(wait);
    return requestText({ ...options, retries: remaining - 1 });
  }
}

/** Turns any SDK/network failure into a short sentence — the UI never shows a raw stack trace. */
export function describeError(err: unknown): string {
  if (err instanceof MissingApiKeyError) return err.message;

  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;

  if (status === 401 || status === 403 || /API key/i.test(message)) {
    return 'That API key was rejected. Check EXPO_PUBLIC_GEMINI_API_KEY.';
  }
  if (status === 429 || /quota|too_many_requests|rate limit/i.test(message)) {
    return 'Hit the free-tier rate limit — try again in a moment.';
  }
  if (/fetch|network|ENOTFOUND|ECONNREFUSED/i.test(message)) {
    return 'Could not reach Gemini. Check your network connection.';
  }
  return message || 'Something went wrong.';
}

export async function testAiConnection(): Promise<{ ok: boolean; message: string }> {
  if (!hasApiKey()) {
    const msg = 'No Gemini API key configured. Check EXPO_PUBLIC_GEMINI_API_KEY in .env.';
    addAiLog({
      type: 'test',
      status: 'error',
      error: msg,
      model: ASK_MODEL,
    });
    return { ok: false, message: msg };
  }

  try {
    const res = await requestText({
      model: ASK_MODEL,
      system: 'You are an AI assistant. Reply with "OK" and nothing else.',
      user: 'Ping',
      retries: 0,
    });
    const msg = `Connected successfully! Response: "${res.trim()}"`;
    addAiLog({
      type: 'test',
      status: 'success',
      result: msg,
      model: ASK_MODEL,
    });
    return { ok: true, message: msg };
  } catch (err) {
    const msg = describeError(err);
    addAiLog({
      type: 'test',
      status: 'error',
      error: msg,
      model: ASK_MODEL,
    });
    return { ok: false, message: msg };
  }
}

