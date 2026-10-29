import { GoogleGenAI } from '@google/genai';
import { isQuotaError, quotaMessage } from './quota';

/**
 * Read the key injected by app.config.ts.
 *
 * Loaded lazily and guarded so this module also imports cleanly under plain
 * Node — that is what lets `scripts/test-ai.ts` exercise extraction and
 * question-answering outside the app.
 */
function keyFromExpoConstants(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default;
    return Constants?.expoConfig?.extra?.geminiApiKey ?? '';
  } catch {
    return '';
  }
}

export function getApiKey(): string {
  return (
    keyFromExpoConstants() ||
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  );
}

export function hasApiKey(): boolean {
  return getApiKey().trim().length > 0;
}

/** Raised when the app is misconfigured, so the UI can show setup help. */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'No Gemini API key configured. Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart with `npx expo start --clear`.'
    );
    this.name = 'MissingApiKeyError';
  }
}

let cached: GoogleGenAI | null = null;
let cachedKey = '';

export function getClient(): GoogleGenAI {
  const key = getApiKey();
  if (!key) throw new MissingApiKeyError();
  if (!cached || cachedKey !== key) {
    cached = new GoogleGenAI({ apiKey: key });
    cachedKey = key;
  }
  return cached;
}

/**
 * Both features run on flash-lite.
 *
 * Every Gemini model here is on the free tier — "free" is not a model, it is a
 * per-model quota. The newest flagship Flash has the tightest free allowance,
 * and this app makes one call per captured note, so the lite tier is both the
 * roomiest and an easy fit for the work: extraction is a short schema-bound
 * transform, and answering reasons over text it has already been handed.
 *
 * Raise ASK_MODEL if answers start missing totals or intervals; that costs
 * quota, so change it on its own rather than alongside EXTRACT_MODEL.
 */
export const EXTRACT_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_EXTRACT_MODEL || 'gemini-3.5-flash-lite';
export const ASK_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_ASK_MODEL || 'gemini-3.5-flash-lite';

let userSelectedModel: string | null = null;

export function setSelectedModelInMemory(model: string): void {
  userSelectedModel = model;
}

export function getEffectiveAskModel(): string {
  return (
    userSelectedModel ||
    process.env.EXPO_PUBLIC_GEMINI_ASK_MODEL ||
    'gemini-3.5-flash-lite'
  );
}

/** Free tier quota / rate limits tell us how long to wait. */
function retryDelayMs(err: unknown): number | null {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status !== 429 && !/quota|too_many_requests|rate limit/i.test(message)) {
    return null;
  }

  const suggested = message.match(/(?:retry|try again) in ([\d.]+)s/i);
  const seconds = suggested ? Number(suggested[1]) : 5;
  // Cap it: wait at least 1s and at most 15s so the UI remains responsive
  return Math.max(1, Math.min(Math.ceil(seconds) + 1, 15)) * 1000;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Call Gemini with a response schema and hand back the raw JSON text.
 * Both AI features need exactly this, so the request shape lives in one place.
 *
 * Retries once on a rate-limit response, because hitting the free tier's
 * per-minute cap is routine rather than exceptional.
 */
export async function requestJson(options: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: object;
  retries?: number;
}): Promise<string> {
  try {
    return await sendOnce(options);
  } catch (err) {
    const wait = retryDelayMs(err);
    const remaining = options.retries ?? 1;
    if (wait === null || remaining <= 0) throw err;

    await sleep(wait);
    return requestJson({ ...options, retries: remaining - 1 });
  }
}

/**
 * Send audio plus an instruction and get plain text back.
 *
 * Separate from requestJson because transcription wants prose, not a schema —
 * forcing JSON here would only invite the model to summarise rather than
 * transcribe. Retries on a rate limit the same way.
 */
export async function requestTextFromAudio(options: {
  model: string;
  system: string;
  prompt: string;
  audioBase64: string;
  mimeType: string;
  retries?: number;
}): Promise<string> {
  try {
    const interaction = await getClient().interactions.create({
      model: options.model,
      system_instruction: options.system,
      input: [
        { type: 'text', text: options.prompt },
        { type: 'audio', data: options.audioBase64, mime_type: options.mimeType },
      ],
    } as Parameters<GoogleGenAI['interactions']['create']>[0]);

    if (!interaction || typeof interaction !== 'object' || !('output_text' in interaction)) {
      throw new Error('Gemini returned a streaming response, which is not supported here.');
    }
    return interaction.output_text ?? '';
  } catch (err) {
    const wait = retryDelayMs(err);
    const remaining = options.retries ?? 1;
    if (wait === null || remaining <= 0) throw err;

    await sleep(wait);
    return requestTextFromAudio({ ...options, retries: remaining - 1 });
  }
}

/**
 * Ask a plain question and get plain text back, with no tools.
 *
 * There was a Google Search-grounded twin of this, used for checking spellings
 * against the live web. Every grounded request on this key was refused — a
 * free key has no search allowance — and each refusal cost about 35 seconds,
 * so it was removed rather than left as a slow dead end. If billing is ever
 * enabled it is worth bringing back for titles newer than the model.
 */
export async function requestText(options: {
  model: string;
  system: string;
  user: string;
  retries?: number;
}): Promise<string> {
  try {
    const interaction = await getClient().interactions.create({
      model: options.model,
      system_instruction: options.system,
      input: options.user,
    } as Parameters<GoogleGenAI['interactions']['create']>[0]);

    if (!interaction || typeof interaction !== 'object' || !('output_text' in interaction)) {
      throw new Error('Gemini returned a streaming response, which is not supported here.');
    }
    return interaction.output_text ?? '';
  } catch (err) {
    const wait = retryDelayMs(err);
    const remaining = options.retries ?? 0;
    if (wait === null || remaining <= 0) throw err;

    await sleep(wait);
    return requestText({ ...options, retries: remaining - 1 });
  }
}

/**
 * A fixed seed, so the same question over the same records gives the same
 * answer twice.
 *
 * Asking "how much were the tickets in Minicoy" twice used to return two
 * different totals, which is worse than either being wrong: there was no way
 * to tell which one to believe. Sampling is still not strictly deterministic,
 * but it no longer wanders between runs for no reason. Extraction and
 * answering both want the predictable end of the range, never the creative one.
 */
const DECODE_SEED = 7;

let groqApiKeyInMemory: string | null = null;

export function setGroqApiKeyInMemory(key: string): void {
  groqApiKeyInMemory = key;
}

export function getGroqApiKey(): string {
  if (groqApiKeyInMemory && groqApiKeyInMemory.trim().length > 0) {
    return groqApiKeyInMemory.trim();
  }
  return process.env.EXPO_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY || '';
}

export function isGroqModel(model: string): boolean {
  return (
    model.startsWith('llama-') ||
    model.startsWith('mixtral-') ||
    model.startsWith('deepseek-') ||
    model.startsWith('qwen') ||
    model.startsWith('openai/') ||
    model.includes('gpt-oss') ||
    model.includes('orpheus')
  );
}

async function sendGroqOnce(options: {
  model: string;
  system: string;
  user: string;
  schema: object;
}): Promise<string> {
  const key = getGroqApiKey();
  if (!key) {
    throw new Error('Groq API key is not configured. Add EXPO_PUBLIC_GROQ_API_KEY in .env or set it in Settings.');
  }

  const promptWithSchema = `${options.user}\n\nIMPORTANT: You must output ONLY a valid JSON object matching this schema:\n${JSON.stringify(options.schema, null, 2)}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: promptWithSchema },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      seed: DECODE_SEED,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '{}';
}

async function sendOnce(options: {
  model: string;
  system: string;
  user: string;
  schema: object;
}): Promise<string> {
  if (isGroqModel(options.model)) {
    try {
      return await sendGroqOnce(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Groq model ${options.model} call failed:`, msg);
      if (options.model !== 'qwen/qwen3.8-27b') {
        try {
          return await sendGroqOnce({ ...options, model: 'qwen/qwen3.8-27b' });
        } catch {}
      }
      if (hasApiKey()) {
        try {
          return await sendGeminiOnce({ ...options, model: ASK_MODEL });
        } catch {}
      }
      throw err;
    }
  }

  return sendGeminiOnce(options);
}

async function sendGeminiOnce(options: {
  model: string;
  system: string;
  user: string;
  schema: object;
}): Promise<string> {
  const interaction = await getClient().interactions.create({
    model: options.model,
    system_instruction: options.system,
    input: options.user,
    generation_config: { seed: DECODE_SEED },
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: options.schema as Record<string, unknown>,
    },
  } as Parameters<GoogleGenAI['interactions']['create']>[0]);

  // create() is typed as interaction-or-stream; we never request streaming, so
  // narrow rather than cast blindly — a stream here would mean a real bug.
  if (!interaction || typeof interaction !== 'object' || !('output_text' in interaction)) {
    throw new Error('Gemini returned a streaming response, which is not supported here.');
  }

  return interaction.output_text ?? '';
}

/**
 * Turn any SDK/network failure into a short sentence we can render inline.
 * The UI never shows a raw stack trace.
 */
export function describeError(err: unknown): string {
  if (err instanceof MissingApiKeyError) return err.message;

  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;

  if (/Groq API error/i.test(message) || /groq/i.test(message)) {
    if (/401|invalid_api_key/i.test(message)) {
      return 'Groq API key was rejected. Please check your key in Settings.';
    }
    if (/429|rate_limit/i.test(message)) {
      return 'Groq rate limit reached. Please wait a moment and try again.';
    }
    return message;
  }

  if (status === 401 || status === 403 || /API key/i.test(message)) {
    return 'That API key was rejected. Check EXPO_PUBLIC_GEMINI_API_KEY.';
  }
  if (status === 429 || isQuotaError(message)) return quotaMessage(message);
  if (/fetch|network|ENOTFOUND|ECONNREFUSED/i.test(message)) {
    return 'Could not reach AI provider. Check your network connection.';
  }
  return message || 'Something went wrong.';
}
