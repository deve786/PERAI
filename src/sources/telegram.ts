/**
 * Telegram channel integration.
 */
import { getSourcesDb, uuid } from './client';
import { getClient, EXTRACT_MODEL, hasApiKey } from '@/ai/client';
import { currentUserId, getSupabase, isConfigured } from '@/sync/client';
import { getTelegramBridgeUrl } from '@/settings';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return typeof btoa !== 'undefined'
    ? btoa(binary)
    : Buffer.from(buffer).toString('base64');
}

/**
 * Runs Gemini Vision OCR on an image URL (such as a Telegram CDN photo).
 * Extracts text, schedules, timetables, and rules accurately in English & Malayalam.
 */
export async function ocrTelegramPhoto(photoUrl: string): Promise<string | null> {
  if (!hasApiKey()) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(photoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 500) return null;

    const base64 = arrayBufferToBase64(buf);
    const client = getClient();
    const candidateModels = Array.from(new Set([EXTRACT_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.5-flash']));
    let text: string | null = null;

    for (const model of candidateModels) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: [
            {
              text: `Extract all visible text, dates, times, schedules, passenger guidelines, locations, vessel names, and rules from this image accurately in English and Malayalam.
Format any tables or schedules as clean markdown tables.
If there is no readable text or it is just scenery, respond with "NO_TEXT".
Do not add opinions, introductory notes, or commentary.`,
            },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64,
              },
            },
          ],
        });

        const reply = response.text?.trim();
        if (reply && !/^(NO_TEXT|no text|no legible text)/i.test(reply)) {
          text = reply;
          break;
        }
      } catch (genErr) {
        console.warn(`[telegram-ocr] Generation with model ${model} failed, trying next candidate:`, genErr);
      }
    }

    return text;
  } catch (err) {
    console.warn('[telegram-ocr] Could not OCR photo:', err);
    return null;
  }
}

/**
 * On-demand OCR for a single stored photo message.
 * Extracts the image text using Gemini Vision, updates SQLite, and returns the extracted text.
 */
export async function ocrMessagePhoto(messageId: string, photoUrl: string): Promise<string | null> {
  const ocrText = await ocrTelegramPhoto(photoUrl);
  if (!ocrText) return null;

  const db = await getSourcesDb();
  const row = await db.getFirstAsync<{ message_text: string | null }>(
    'SELECT message_text FROM telegram_messages WHERE id = ?',
    [messageId]
  );

  const existingText = row?.message_text || '';
  // Remove any previous partial OCR block
  const cleanedText = existingText
    .replace(/\[(?:Extracted Poster\/Image Text|Extracted Poster|Image OCR Content)[^\]]*\]:[\s\S]*?(?=(?:\n\s*\[Photo:)|$)/gi, '')
    .trim();

  const hasPhotoTag = cleanedText.includes('[Photo:');
  const newText = cleanedText
    ? (hasPhotoTag
        ? `${cleanedText}\n\n[Extracted Poster/Image Text]:\n${ocrText}`
        : `${cleanedText}\n\n[Extracted Poster/Image Text]:\n${ocrText}\n[Photo: ${photoUrl}]`)
    : `[Extracted Poster/Image Text]:\n${ocrText}\n[Photo: ${photoUrl}]`;

  await db.runAsync(
    'UPDATE telegram_messages SET message_text = ? WHERE id = ?',
    [newText, messageId]
  );

  return ocrText;
}

/**
 * Scans all photo messages in a channel that don't have OCR text extracted yet,
 * extracts them with Gemini Vision in batches of 3, and updates the database.
 */
export async function ocrUnextractedPhotosForChannel(
  channelUsername: string,
  channelId?: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const db = await getSourcesDb();
  const clean = channelUsername.replace(/^@/, '').toLowerCase();
  const rows = await db.getAllAsync<{ id: string; message_id: number; message_text: string; media_path: string | null }>(
    `SELECT id, message_id, message_text, media_path
     FROM telegram_messages
     WHERE deleted = 0
       AND (media_type = 'photo' OR message_text LIKE '%[Photo:%')
       AND message_text NOT LIKE '%[Extracted Poster%'
       AND message_text NOT LIKE '%[Image OCR Content%'
       AND (
         channel_id = ?
         OR channel_id = ?
         OR channel_id = ?
         OR (channel_name IS NOT NULL AND LOWER(channel_name) LIKE ?)
       )
     ORDER BY message_date DESC`,
    [channelId || '', clean, `@${clean}`, `%${clean}%`]
  );

  if (rows.length === 0) return 0;

  let successCount = 0;
  for (let i = 0; i < rows.length; i += 3) {
    const chunk = rows.slice(i, i + 3);
    await Promise.all(
      chunk.map(async (row, chunkIdx) => {
        let photoUrl = row.media_path?.split('; ')[0]?.trim() || '';
        if (!photoUrl) {
          const m = row.message_text.match(/\[Photo:\s*([^\]]+)\]/i);
          if (m) photoUrl = m[1].trim();
        }
        if (photoUrl && photoUrl.startsWith('http')) {
          try {
            const ocr = await ocrTelegramPhoto(photoUrl);
            if (ocr) {
              const cleaned = row.message_text
                .replace(/\[(?:Extracted Poster\/Image Text|Extracted Poster|Image OCR Content)[^\]]*\]:[\s\S]*?(?=(?:\n\s*\[Photo:)|$)/gi, '')
                .trim();
              const hasPhotoTag = cleaned.includes('[Photo:');
              const updatedText = cleaned
                ? (hasPhotoTag
                    ? `${cleaned}\n\n[Extracted Poster/Image Text]:\n${ocr}`
                    : `${cleaned}\n\n[Extracted Poster/Image Text]:\n${ocr}\n[Photo: ${photoUrl}]`)
                : `[Extracted Poster/Image Text]:\n${ocr}\n[Photo: ${photoUrl}]`;
              await db.runAsync('UPDATE telegram_messages SET message_text = ? WHERE id = ?', [updatedText, row.id]);
              successCount++;
            }
          } catch (err) {
            console.warn(`[telegram-ocr] Failed to OCR row ${row.message_id}:`, err);
          }
        }
        onProgress?.(i + chunkIdx + 1, rows.length);
      })
    );
  }
  return successCount;
}

/**
 * Downloads and extracts attached documents (PDFs, manifests, sheets) via Telegram Bot API.
 * Feeds binary bytes to Gemini for cargo manifest and timetable extraction.
 */
export async function downloadAndExtractTelegramFile(
  botToken: string,
  fileId: string,
  fileName?: string,
  mimeType?: string
): Promise<string | null> {
  if (!hasApiKey()) return null;
  try {
    const fileInfoRes = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
      API_TIMEOUT
    );
    if (!fileInfoRes.ok) return null;
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok || !fileInfo.result?.file_path) return null;

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
    const fileRes = await fetchWithTimeout(downloadUrl, 30000);
    if (!fileRes.ok) return null;
    const buf = await fileRes.arrayBuffer();
    if (!buf || buf.byteLength < 50) return null;

    const base64 = arrayBufferToBase64(buf);
    const client = getClient();
    const isPdf = (mimeType && mimeType.includes('pdf')) || (fileName && fileName.toLowerCase().endsWith('.pdf'));

    const response = await client.models.generateContent({
      model: EXTRACT_MODEL,
      contents: [
        {
          text: `Extract all text, cargo manifests, shipping tables, quantities, container numbers, island destination ports, passenger details, and remarks from this document completely.
Format any tables as clean markdown tables. Do not add commentary.`,
        },
        {
          inlineData: {
            mimeType: isPdf ? 'application/pdf' : (mimeType || 'application/pdf'),
            data: base64,
          },
        },
      ],
    });

    return response.text?.trim() || null;
  } catch (err) {
    console.warn('[telegram-doc] Could not extract document:', err);
    return null;
  }
}

/**
 * Downloads and extracts attached documents via the Telegram Media Bridge service.
 * Fetches raw PDF bytes from ${bridgeUrl}/download?channel=${channel}&post=${messageId}
 * and extracts all tables, manifests, and shipping data with Gemini.
 */
export async function downloadAndExtractTelegramFileViaBridge(
  bridgeUrl: string,
  channel: string,
  messageId: number,
  fileName?: string
): Promise<string | null> {
  if (!hasApiKey()) return null;
  const cleanBridge = bridgeUrl.trim().replace(/\/$/, '');
  const cleanChannel = channel.replace(/^@/, '').trim();
  if (!cleanBridge || !cleanChannel || !messageId) return null;

  try {
    const downloadUrl = `${cleanBridge}/download?channel=${encodeURIComponent(cleanChannel)}&post=${messageId}`;
    const fileRes = await fetchWithTimeout(downloadUrl, 45000);
    if (!fileRes.ok) {
      console.warn(`[telegram-bridge] Failed to fetch doc (${fileRes.status}): ${downloadUrl}`);
      return null;
    }

    const buf = await fileRes.arrayBuffer();
    if (!buf || buf.byteLength < 50) return null;

    const base64 = arrayBufferToBase64(buf);
    const client = getClient();
    const isPdf = !fileName || fileName.toLowerCase().endsWith('.pdf');

    const response = await client.models.generateContent({
      model: EXTRACT_MODEL,
      contents: [
        {
          text: `Extract all text, cargo manifests, shipping tables, quantities, container numbers, island destination ports, passenger details, and remarks from this document completely.
Format any tables as clean markdown tables. Do not add commentary.`,
        },
        {
          inlineData: {
            mimeType: isPdf ? 'application/pdf' : 'application/pdf',
            data: base64,
          },
        },
      ],
    });

    return response.text?.trim() || null;
  } catch (err) {
    console.warn('[telegram-bridge] Could not extract document via bridge:', err);
    return null;
  }
}

/**
 * Iterates through all document messages in a channel that have not yet had their inner
 * tables extracted and calls the Telegram Media Bridge to download and OCR them with Gemini.
 */
export async function extractUnextractedDocumentsForChannel(
  channelUsername: string,
  channelId: string,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const bridgeUrl = await getTelegramBridgeUrl();
  if (!bridgeUrl) {
    throw new Error('Telegram Media Bridge URL is not configured in Settings.');
  }
  const db = await getSourcesDb();
  const rows = await db.getAllAsync<{
    id: string;
    message_id: number;
    message_text: string;
    media_path: string | null;
  }>(
    `SELECT id, message_id, message_text, media_path FROM telegram_messages
     WHERE channel_id = ? AND media_type = 'document'
       AND message_text NOT LIKE '%[Extracted Document:%'
     ORDER BY message_id DESC`,
    [channelId]
  );

  if (rows.length === 0) return 0;
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const docName = row.media_path || 'document.pdf';
    try {
      const extracted = await downloadAndExtractTelegramFileViaBridge(
        bridgeUrl,
        channelUsername,
        row.message_id,
        docName
      );
      if (extracted) {
        const updatedText = row.message_text
          ? `${row.message_text}\n\n[Extracted Document: ${docName}]:\n${extracted}`
          : `[Extracted Document: ${docName}]:\n${extracted}`;
        await db.runAsync('UPDATE telegram_messages SET message_text = ? WHERE id = ?', [updatedText, row.id]);
        successCount++;
      }
    } catch (err) {
      console.warn(`[telegram-bridge] Failed to extract doc for row ${row.message_id}:`, err);
    }
    onProgress?.(i + 1, rows.length);
  }
  return successCount;
}

export interface TelegramChannel {
  id: string;
  channelUsername: string;
  channelName: string | null;
  lastMessageId: number | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  createdAt: string;
  messagesSaved?: number;
}

export interface TelegramMessage {
  id: string;
  channelId: string;
  channelName: string | null;
  messageId: number;
  messageText: string | null;
  messageDate: string;
  senderName: string | null;
  mediaType: 'photo' | 'video' | 'document' | 'none';
  mediaPath: string | null;
  syncedAt: string;
}

// Configuration
const API_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000; // 2 seconds

interface TelegramPost {
  message_id: number;
  chat: {
    id: number;
    title?: string;
    username?: string;
  };
  date: number;
  text?: string;
  caption?: string;
  author_signature?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
  video?: unknown;
  document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
}

interface TelegramApiResponse {
  ok: boolean;
  result?: Array<{
    update_id: number;
    channel_post?: TelegramPost;
    message?: TelegramPost;
  }>;
  description?: string;
}

function validateBotToken(token: string): void {
  if (!token || token.trim().length === 0) {
    throw new Error('Bot token is required');
  }
  if (!token.includes(':')) {
    throw new Error('Invalid bot token format');
  }
}

function validateChannelUsername(username: string): void {
  if (!username || username.trim().length === 0) {
    throw new Error('Channel username is required');
  }
  const normalized = username.startsWith('@') ? username : `@${username}`;
  if (!/^@[a-zA-Z0-9_]{5,32}$/.test(normalized)) {
    throw new Error('Invalid channel username format');
  }
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Telegram API request timed out');
    }
    throw err;
  }
}

export async function fetchTelegramMessages(
  botToken: string,
  channelUsername: string,
  lastMessageId?: number
): Promise<TelegramMessage[]> {
  validateBotToken(botToken);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }

      const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
      const response = await fetchWithTimeout(url, API_TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TelegramApiResponse = await response.json();

      if (!data.ok) {
        const description = data.description || 'Telegram API error';
        if (description.includes('Unauthorized') || description.includes('Not Found')) {
          throw new Error('Invalid bot token or bot not added to channel');
        }
        throw new Error(description);
      }

      const messages: TelegramMessage[] = [];

      if (!data.result) return messages;

      for (const update of data.result) {
        const msg = update.channel_post || update.message;
        if (!msg) continue;

        // Skip if we've already processed this message
        if (lastMessageId && msg.message_id <= lastMessageId) continue;

        let fullText = msg.text || msg.caption || '';
        let mediaType: 'photo' | 'video' | 'document' | 'none' = 'none';
        let mediaPath: string | null = null;

        // If message has an attached document (e.g. Cargo manifest PDF, shipping schedule)
        if (msg.document && msg.document.file_id) {
          mediaType = 'document';
          mediaPath = msg.document.file_name || 'document';
          try {
            const docText = await downloadAndExtractTelegramFile(
              botToken,
              msg.document.file_id,
              msg.document.file_name,
              msg.document.mime_type
            );
            if (docText) {
              const label = msg.document.file_name
                ? `[Attached Cargo/Document Content: ${msg.document.file_name}]`
                : '[Attached Cargo/Document Content]';
              fullText = fullText ? `${fullText}\n\n${label}:\n${docText}` : `${label}:\n${docText}`;
            }
          } catch (docErr) {
            console.warn('[telegram] Error extracting attached document:', docErr);
          }
        } else if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
          // If message has photo(s), pick the highest resolution
          mediaType = 'photo';
          const highestPhoto = msg.photo[msg.photo.length - 1];
          if (highestPhoto && highestPhoto.file_id) {
            try {
              const fileInfoRes = await fetchWithTimeout(
                `https://api.telegram.org/bot${botToken}/getFile?file_id=${highestPhoto.file_id}`,
                API_TIMEOUT
              );
              if (fileInfoRes.ok) {
                const fileInfo = await fileInfoRes.json();
                if (fileInfo.ok && fileInfo.result?.file_path) {
                  const photoUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
                  mediaPath = photoUrl;
                  const photoOcr = await ocrTelegramPhoto(photoUrl);
                  if (photoOcr) {
                    fullText = fullText
                      ? `${fullText}\n\n[Extracted Poster/Photo Text]:\n${photoOcr}`
                      : `[Extracted Poster/Photo Text]:\n${photoOcr}`;
                  }
                }
              }
            } catch (pErr) {
              console.warn('[telegram] Photo OCR error:', pErr);
            }
          }
        } else if (msg.video) {
          mediaType = 'video';
        }

        messages.push({
          id: uuid(),
          channelId: String(msg.chat.id),
          channelName: msg.chat.title || msg.chat.username || channelUsername,
          messageId: msg.message_id,
          messageText: fullText,
          messageDate: new Date(msg.date * 1000).toISOString(),
          senderName: msg.author_signature || 'Channel',
          mediaType,
          mediaPath,
          syncedAt: new Date().toISOString(),
        });
      }

      return messages;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on auth errors
      if (lastError.message.includes('Invalid bot token') ||
          lastError.message.includes('Unauthorized')) {
        throw lastError;
      }
    }
  }

  throw new Error(`Failed to fetch Telegram messages after ${MAX_RETRIES + 1} attempts: ${lastError?.message || 'Unknown error'}`);
}

export interface PublicTelegramResult {
  channelName: string;
  channelUsername: string;
  messages: TelegramMessage[];
  formattedSummary: string;
  fetchError?: Error;
}

export interface FetchPublicTelegramOptions {
  lastMessageId?: number;
  daysToScrape?: number;
  maxPages?: number;
  maxPhotosToOcr?: number;
  bridgeUrl?: string;
}

/**
 * Generates structured voyage and cargo insights from a document title and post caption.
 */
export function extractDocumentAbstract(title: string, postText = ''): string {
  const combined = `${title} ${postText}`;

  // Vessel identification
  let vessel = 'Lakshadweep Port Vessel';
  if (/A\.?\s*Sea|Arabian\s*Sea/i.test(combined)) vessel = 'MV Arabian Sea';
  else if (/Lakshadweep\s*Sea|L\.?\s*Sea/i.test(combined)) vessel = 'MV Lakshadweep Sea';
  else if (/Lagoons/i.test(combined)) vessel = 'MV Lagoons';
  else if (/Corals/i.test(combined)) vessel = 'MV Corals';
  else if (/Sagar\s*Samraj/i.test(combined)) vessel = 'MV Sagar Samraj';
  else if (/Sagar\s*Yuvaraj/i.test(combined)) vessel = 'MV Sagar Yuvaraj';
  else if (/Laccadives/i.test(combined)) vessel = 'MV Laccadives';
  else if (/Thinnakara/i.test(combined)) vessel = 'MV Thinnakara';
  else if (/Elikalpeni/i.test(combined)) vessel = 'MV Elikalpeni';
  else if (/HSC/i.test(combined)) vessel = 'High Speed Craft (HSC)';

  // Document category
  let category = 'Port Document';
  if (/cargo\s*abstract/i.test(combined)) category = 'Cargo Abstract / Manifest';
  else if (/passenger\s*abstract/i.test(combined)) category = 'Passenger Abstract / Berth List';
  else if (/eq\s*list/i.test(combined)) category = 'Vessel Equipment List / Material Inventory';
  else if (/HSC/i.test(combined)) category = 'High Speed Craft Timetable';
  else if (/schedule|timings|timing/i.test(combined)) category = 'Vessel Voyage Schedule';
  else if (/circular|notice|order/i.test(combined)) category = 'Port Circular / Notice';

  // Dates
  const dateMatch = combined.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})|(\d{1,2}(?:\s*(?:&|and)\s*\d{1,2})?)/i);
  const dateStr = dateMatch ? dateMatch[0] : '';

  // Ports
  const ports: string[] = [];
  if (/kochi|cochin/i.test(combined)) ports.push('Kochi');
  if (/beypore|calicut/i.test(combined)) ports.push('Beypore');
  if (/kavaratti|kvt/i.test(combined)) ports.push('Kavaratti');
  if (/agatti|agt/i.test(combined)) ports.push('Agatti');
  if (/androth|and/i.test(combined)) ports.push('Androth');
  if (/minicoy|mcy/i.test(combined)) ports.push('Minicoy');
  if (/kalpeni|klp/i.test(combined)) ports.push('Kalpeni');
  if (/amini|amn/i.test(combined)) ports.push('Amini');
  if (/kadmat|kdt/i.test(combined)) ports.push('Kadmat');
  if (/kiltan|klt/i.test(combined)) ports.push('Kiltan');
  if (/chetlat|cht/i.test(combined)) ports.push('Chetlat');

  const lines = [
    `• File: ${title}`,
    `• Category: ${category}`,
    `• Vessel: ${vessel}`,
  ];
  if (dateStr) lines.push(`• Date / Reference: ${dateStr}`);
  if (ports.length > 0) lines.push(`• Ports Involved: ${ports.join(', ')}`);
  lines.push(`• File Details: Official port PDF document. Itemized rows are contained inside the PDF attachment.`);

  return lines.join('\n');
}

export async function fetchPublicTelegramChannel(
  username: string,
  options: FetchPublicTelegramOptions | number = 21,
  legacyMaxPages = 12,
  legacyMaxPhotosToOcr = 50
): Promise<PublicTelegramResult> {
  const opts: FetchPublicTelegramOptions = typeof options === 'number'
    ? { daysToScrape: options, maxPages: legacyMaxPages, maxPhotosToOcr: legacyMaxPhotosToOcr }
    : options;

  const {
    lastMessageId,
    daysToScrape = lastMessageId ? 0 : 21,
    maxPages = lastMessageId ? 3 : 12,
    maxPhotosToOcr = 50,
  } = opts;

  const clean = username.replace(/^@/, '').replace(/^(?:https?:\/\/)?t\.me\/(?:s\/)?/, '').replace(/\/$/, '').trim();
  let nextUrl: string | null = `https://t.me/s/${clean}`;
  const cutoffTime = daysToScrape > 0 ? Date.now() - daysToScrape * 24 * 60 * 60 * 1000 : 0;
  let reachedCutoff = false;

  const rawMessages: Array<{
    postPath: string;
    messageId: number;
    date: string;
    text: string;
    mediaType: 'photo' | 'video' | 'document' | 'none';
    mediaPath: string | null;
    photos: string[];
    docInfo: string | null;
    docLink: string | null;
    ocrText?: string | null;
  }> = [];

  let channelTitle = clean;
  let page = 0;
  let fetchError: Error | undefined = undefined;

  // 1. Try fetching via Telegram Media Bridge if configured
  const bridgeUrl = (opts.bridgeUrl || (await getTelegramBridgeUrl())).trim().replace(/\/$/, '');
  let bridgeSucceeded = false;

  if (bridgeUrl) {
    try {
      const minId = lastMessageId || 0;
      const bridgeRes = await fetchWithTimeout(
        `${bridgeUrl}/messages?channel=${encodeURIComponent(clean)}&limit=50&min_id=${minId}`,
        15000
      );
      if (bridgeRes.ok) {
        const bridgeData = await bridgeRes.json();
        if (bridgeData && Array.isArray(bridgeData.messages) && bridgeData.messages.length > 0) {
          bridgeSucceeded = true;
          channelTitle = bridgeData.channel || clean;
          for (const m of bridgeData.messages) {
            rawMessages.push({
              postPath: `${clean}/${m.message_id}`,
              messageId: m.message_id,
              date: m.date || new Date().toISOString(),
              text: m.text || '',
              mediaType: m.media_type || 'none',
              mediaPath: m.media_path || null,
              photos: [],
              docInfo: m.doc_info || null,
              docLink: `https://t.me/${clean}/${m.message_id}`,
            });
          }
        }
      }
    } catch (bridgeErr) {
      console.warn('[telegram-bridge] Could not fetch messages from bridge:', bridgeErr);
    }
  }

  // 2. If bridge was not used or yielded 0 messages, fall back to public preview scraping
  if (!bridgeSucceeded) {
    while (nextUrl && page < maxPages && !reachedCutoff) {
      page++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res: Response = await fetch(nextUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          if (page === 1) fetchError = new Error(`Telegram preview returned HTTP ${res.status}`);
          break;
        }
        const html: string = await res.text();

        const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/i) || html.match(/<title>([^<]*)<\/title>/i);
        if (titleMatch && titleMatch[1]) channelTitle = titleMatch[1].trim();

        let foundKnownOnThisPage = false;
        const blocks = html.split('<div class="tgme_widget_message_wrap');
        for (let i = 1; i < blocks.length; i++) {
          const b = blocks[i];
          const postMatch = b.match(/data-post="([^"]*)"/);
          const postPath = postMatch ? postMatch[1] : '';
          const msgNum = parseInt(postPath.split('/').pop() || '0', 10);
          const dateMatch = b.match(/<time datetime="([^"]*)"/);
          const msgDateStr = dateMatch ? dateMatch[1] : '';
          const msgDate = msgDateStr || new Date().toISOString();
          const msgDateMs = msgDateStr ? new Date(msgDateStr).getTime() : 0;

          if (cutoffTime > 0 && msgDateMs > 0 && msgDateMs < cutoffTime) {
            reachedCutoff = true;
            continue;
          }

          // Incremental check: if this message is already known (messageId <= lastMessageId),
          // we skip it and note that we have reached the known historical messages.
          if (lastMessageId && msgNum > 0 && msgNum <= lastMessageId) {
            foundKnownOnThisPage = true;
            continue;
          }

          const textMatch = b.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
          let text = '';
          if (textMatch) {
            text = textMatch[1]
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
          }

          const photos = [...b.matchAll(/background-image:url\('([^']*)'\)/g)]
            .map(m => m[1])
            .filter(u => !u.includes('/emoji/'));

          // Match Telegram document attachments (PDFs, abstracts, manifests)
          const docTitleMatch = b.match(/<div class="[^"]*tgme_widget_message_document_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          const docExtraMatch = b.match(/<div class="[^"]*tgme_widget_message_document_extra[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          const docWrapMatch = b.match(/<a class="[^"]*tgme_widget_message_document_wrap[^"]*"[^>]*href="([^"]*)"/i);
          let docInfo: string | null = null;
          let docLink: string | null = null;
          if (docTitleMatch) {
            const rawDocTitle = docTitleMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
            const rawDocExtra = docExtraMatch ? docExtraMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            docInfo = rawDocTitle + (rawDocExtra ? ` (${rawDocExtra})` : '');
            docLink = docWrapMatch ? docWrapMatch[1] : (postPath ? `https://t.me/${postPath}` : null);
          }

          const videoMatch = b.match(/<video[^>]*src="([^"]*)"/i);
          const videoThumb = b.match(/class="[^"]*tgme_widget_message_video_thumb[^"]*"[^>]*style="background-image:url\('([^']*)'\)"/i);
          const videoUrl = videoMatch ? videoMatch[1] : (videoThumb ? videoThumb[1] : null);

          let mediaType: 'photo' | 'video' | 'document' | 'none' = 'none';
          let mediaPath: string | null = null;
          if (photos.length > 0) {
            mediaType = 'photo';
            mediaPath = photos.join('; ');
          } else if (docInfo) {
            mediaType = 'document';
            mediaPath = docInfo;
          } else if (videoUrl) {
            mediaType = 'video';
            mediaPath = videoUrl;
          }

          if (text || mediaPath) {
            rawMessages.push({
              postPath,
              messageId: msgNum,
              date: msgDate,
              text,
              mediaType,
              mediaPath,
              photos,
              docInfo,
              docLink,
            });
          }
        }

        // If we hit already-synced messages on this page, do not paginate backwards
        if (lastMessageId && foundKnownOnThisPage) {
          reachedCutoff = true;
        }

        if (reachedCutoff) break;

        const prevMatch = html.match(/href="([^"]*\?before=[^"]*)"/i);
        if (prevMatch && prevMatch[1]) {
          nextUrl = 'https://t.me' + prevMatch[1];
        } else {
          nextUrl = null;
        }
      } catch (err) {
        if (page === 1) fetchError = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }
  }

  const unique: Array<{
    postPath: string;
    messageId: number;
    date: string;
    text: string;
    mediaType: 'photo' | 'video' | 'document' | 'none';
    mediaPath: string | null;
    photos: string[];
    docInfo: string | null;
    docLink: string | null;
    ocrText?: string | null;
  }> = [];
  const seen = new Set<string | number>();
  for (const m of rawMessages) {
    const key = m.messageId || m.postPath || (m.date + m.text);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }

  unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Attach extracted abstract and document link to document messages
  for (const m of unique) {
    if (m.docInfo) {
      const details = extractDocumentAbstract(m.docInfo, m.text);
      const docBlock = `[Attached Cargo/Document Details]:\n${details}${m.docLink ? `\n[Document Link: ${m.docLink}]` : ''}`;
      m.text = m.text ? `${m.text}\n\n${docBlock}` : docBlock;
    }
  }

  // OCR attached photos in controlled parallel batches of 3
  const photosToOcr = unique.filter(m => m.photos && m.photos.length > 0).slice(0, maxPhotosToOcr);
  if (photosToOcr.length > 0) {
    for (let i = 0; i < photosToOcr.length; i += 3) {
      const batch = photosToOcr.slice(i, i + 3);
      await Promise.all(
        batch.map(async (m) => {
          try {
            const ocrResult = await ocrTelegramPhoto(m.photos[0]);
            if (ocrResult) {
              m.ocrText = ocrResult;
              m.text = m.text
                ? `${m.text}\n\n[Extracted Poster/Image Text]:\n${ocrResult}`
                : `[Extracted Poster/Image Text]:\n${ocrResult}`;
            }
          } catch (e) {
            console.warn('[telegram-ocr] Parallel OCR error:', e);
          }
        })
      );
    }
  }

  // Extract attached documents via Telegram Media Bridge if configured
  const effectiveBridgeUrl = (opts.bridgeUrl || (await getTelegramBridgeUrl())).trim().replace(/\/$/, '');
  if (effectiveBridgeUrl) {
    const docsToExtract = unique.filter(m => m.mediaType === 'document' && m.messageId > 0);
    for (const m of docsToExtract) {
      try {
        const docText = await downloadAndExtractTelegramFileViaBridge(
          effectiveBridgeUrl,
          clean,
          m.messageId,
          m.docInfo || undefined
        );
        if (docText) {
          const docLabel = m.docInfo || 'Attached Document';
          m.text = m.text
            ? `${m.text}\n\n[Extracted Document: ${docLabel}]:\n${docText}`
            : `[Extracted Document: ${docLabel}]:\n${docText}`;
        }
      } catch (docErr) {
        console.warn(`[telegram-bridge] Could not extract doc for post ${m.messageId}:`, docErr);
      }
    }
  }

  const now = new Date().toISOString();
  const messages: TelegramMessage[] = unique.map(m => ({
    id: uuid(),
    channelId: clean,
    channelName: channelTitle,
    messageId: m.messageId,
    messageText: m.text,
    messageDate: m.date,
    senderName: channelTitle,
    mediaType: m.mediaType,
    mediaPath: m.mediaPath,
    syncedAt: now,
  }));

  const lines: string[] = [
    `Telegram Channel: ${channelTitle} (@${clean})`,
    `Total Messages Scraped: ${messages.length}`,
    `Scraped At: ${now}`,
    `----------------------------------------`,
  ];

  for (const m of unique) {
    lines.push(`\n[${m.date}] Post #${m.messageId}`);
    if (m.text) lines.push(m.text);
    if (m.photos.length > 0) {
      lines.push(`[Attached Photos (${m.photos.length})]:\n${m.photos.join('\n')}`);
      if (m.ocrText) {
        lines.push(`[Image OCR Content]:\n${m.ocrText}`);
      }
    }
    if (m.docInfo) {
      lines.push(`[Attached Document]: ${m.docInfo}`);
    }
    lines.push('----------------------------------------');
  }

  return {
    channelName: channelTitle,
    channelUsername: `@${clean}`,
    messages,
    formattedSummary: lines.join('\n'),
    fetchError,
  };
}

export async function savePublicTelegramChannel(
  username: string,
  lastMessageId?: number
): Promise<{ channel: TelegramChannel; messagesCount: number; summary: string }> {
  const clean = username.replace(/^@/, '').replace(/^(?:https?:\/\/)?t\.me\/(?:s\/)?/, '').replace(/\/$/, '').trim();
  const db = await getSourcesDb();

  // Always find existing channel by handle to preserve its exact channel ID
  const existing = await db.getFirstAsync<{ id: string; last_message_id: number | null; channel_name: string | null }>(
    'SELECT id, last_message_id, channel_name FROM telegram_channels WHERE LOWER(channel_username) = ? OR LOWER(channel_username) = ?',
    [`@${clean.toLowerCase()}`, clean.toLowerCase()]
  );
  const channelId = existing?.id || uuid();

  // Heal any orphaned rows first so maxStored includes all previously saved messages for this channel
  if (channelId) {
    try {
      await db.runAsync(
        `UPDATE telegram_messages
         SET channel_id = ?
         WHERE channel_id != ? AND (
           LOWER(channel_id) = ?
           OR LOWER(channel_id) = ?
           OR (channel_name IS NOT NULL AND (
             channel_name = ?
             OR LOWER(channel_name) = ?
             OR LOWER(channel_name) LIKE ?
           ))
         )`,
        [channelId, channelId, clean.toLowerCase(), `@${clean.toLowerCase()}`, existing?.channel_name || '', (existing?.channel_name || '').toLowerCase(), `%${clean.toLowerCase()}%`]
      );
    } catch {}
  }

  // Find the actual highest message_id stored in telegram_messages for this channel
  // This ensures that if last_message_id was bumped previously without saving messages, we recover automatically
  const maxStored = await db.getFirstAsync<{ max_id: number | null }>(
    `SELECT MAX(message_id) as max_id FROM telegram_messages
     WHERE deleted = 0 AND (
       channel_id = ?
       OR channel_id = ?
       OR channel_id = ?
       OR (channel_name IS NOT NULL AND (
         channel_name = ?
         OR LOWER(channel_name) = ?
         OR LOWER(channel_name) LIKE ?
       ))
     )`,
    [channelId, `@${clean}`, clean, existing?.channel_name || '', (existing?.channel_name || '').toLowerCase(), `%${clean.toLowerCase()}%`]
  );

  let effectiveLastId: number | undefined = undefined;
  if (maxStored?.max_id && maxStored.max_id > 0) {
    // If we already have messages in DB, use the actual highest stored message ID
    // If lastMessageId was passed and is smaller, use that so no messages are missed
    effectiveLastId = (lastMessageId && lastMessageId < maxStored.max_id) ? lastMessageId : maxStored.max_id;
  } else {
    // If no messages stored yet, fetch fresh messages without skipping
    effectiveLastId = undefined;
  }

  const result = await fetchPublicTelegramChannel(username, { lastMessageId: effectiveLastId });
  const now = new Date().toISOString();

  // If a network error occurred and no messages could be fetched, report it clearly
  if (result.fetchError && result.messages.length === 0) {
    throw new Error(`Could not reach Telegram: ${result.fetchError.message}`);
  }

  // If already up to date (no new messages found)
  if (result.messages.length === 0 && effectiveLastId) {
    await db.runAsync(
      `UPDATE telegram_channels
       SET last_synced_at = ?
       WHERE id = ? OR channel_username = ? OR channel_username = ?`,
      [now, channelId, `@${clean}`, clean]
    );

    return {
      channel: {
        id: channelId,
        channelUsername: `@${clean}`,
        channelName: existing?.channel_name || result.channelName,
        lastMessageId: effectiveLastId,
        lastSyncedAt: now,
        autoSync: true,
        createdAt: now,
        messagesSaved: 0,
      },
      messagesCount: 0,
      summary: `Channel @${clean} is already up to date. (0 new messages)`,
    };
  }

  if (result.messages.length === 0) {
    throw new Error(`Could not find any messages for channel @${clean}. Check if the channel is public.`);
  }

  const newMaxId = Math.max(...result.messages.map(m => m.messageId));
  const finalLastMessageId = effectiveLastId ? Math.max(effectiveLastId, newMaxId) : newMaxId;

  const cleanUsername = clean.toLowerCase();
  await db.runAsync(
    `INSERT INTO telegram_channels (id, channel_username, channel_name, last_message_id, last_synced_at, auto_sync, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(channel_username) DO UPDATE SET
       channel_name = excluded.channel_name,
       last_message_id = excluded.last_message_id,
       last_synced_at = excluded.last_synced_at`,
    [channelId, `@${cleanUsername}`, result.channelName, finalLastMessageId, now, now]
  );

  // Clean up any un-prefixed duplicate channel record if present
  try {
    await db.runAsync(
      `DELETE FROM telegram_channels WHERE id != ? AND LOWER(channel_username) = ?`,
      [channelId, cleanUsername]
    );
  } catch {}

  // Heal any orphaned rows in telegram_messages that may have been saved under stray UUIDs or clean handle
  await db.runAsync(
    `UPDATE telegram_messages
     SET channel_id = ?
     WHERE channel_id != ? AND (
       LOWER(channel_id) = ?
       OR LOWER(channel_id) = ?
       OR (channel_name IS NOT NULL AND channel_name = ?)
     )`,
    [channelId, channelId, clean.toLowerCase(), `@${clean.toLowerCase()}`, result.channelName]
  );

  await db.withTransactionAsync(async () => {
    for (const msg of result.messages) {
      let fullText = msg.messageText || '';
      if (msg.mediaType === 'photo' && msg.mediaPath) {
        if (!fullText.includes('[Photo:')) {
          fullText = fullText ? `${fullText}\n[Photo: ${msg.mediaPath}]` : `[Photo: ${msg.mediaPath}]`;
        }
      } else if (msg.mediaType === 'document' && msg.mediaPath) {
        if (!fullText.includes('[Document:')) {
          fullText = fullText ? `${fullText}\n[Document: ${msg.mediaPath}]` : `[Document: ${msg.mediaPath}]`;
        }
      } else if (msg.mediaType === 'video' && msg.mediaPath) {
        if (!fullText.includes('[Video:')) {
          fullText = fullText ? `${fullText}\n[Video: ${msg.mediaPath}]` : `[Video: ${msg.mediaPath}]`;
        }
      }

      await db.runAsync(
        `INSERT OR REPLACE INTO telegram_messages (id, channel_id, channel_name, message_id, message_text, message_date, sender_name, media_type, media_path, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [msg.id, channelId, result.channelName, msg.messageId, fullText, msg.messageDate, msg.senderName, msg.mediaType, msg.mediaPath, msg.syncedAt]
      );
    }
  });

  const savedChannel: TelegramChannel = {
    id: channelId,
    channelUsername: result.channelUsername,
    channelName: result.channelName,
    lastMessageId: finalLastMessageId,
    lastSyncedAt: now,
    autoSync: true,
    createdAt: now,
    messagesSaved: result.messages.length,
  };

  return {
    channel: savedChannel,
    messagesCount: result.messages.length,
    summary: result.formattedSummary,
  };
}

export async function addTelegramChannel(
  botToken: string,
  channelUsername: string
): Promise<TelegramChannel> {
  const cleanUsername = channelUsername.replace(/^@/, '').replace(/^(?:https?:\/\/)?t\.me\/(?:s\/)?/, '').replace(/\/$/, '').trim();

  // If no bot token provided, scrape public channel directly
  if (!botToken || !botToken.trim() || !botToken.includes(':')) {
    const res = await savePublicTelegramChannel(cleanUsername);
    return res.channel;
  }

  validateChannelUsername(channelUsername);

  const db = await getSourcesDb();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM telegram_channels WHERE LOWER(channel_username) = ? OR LOWER(channel_username) = ?',
    [`@${cleanUsername.toLowerCase()}`, cleanUsername.toLowerCase()]
  );
  const id = existing?.id || uuid();

  try {
    const messages = await fetchTelegramMessages(botToken, channelUsername);

    if (messages.length === 0) {
      const res = await savePublicTelegramChannel(cleanUsername);
      return res.channel;
    }

    const channelName = messages[0]?.channelName || channelUsername;
    const lastMessageId = messages.length > 0 ? Math.max(...messages.map(m => m.messageId)) : null;

    await db.runAsync(
      `INSERT INTO telegram_channels (id, channel_username, channel_name, last_message_id, last_synced_at, auto_sync, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(channel_username) DO UPDATE SET
         channel_name = excluded.channel_name,
         last_message_id = COALESCE(excluded.last_message_id, telegram_channels.last_message_id),
         last_synced_at = excluded.last_synced_at`,
      [id, channelUsername, channelName, lastMessageId, now, now]
    );

    for (const msg of messages) {
      await db.runAsync(
        `INSERT OR IGNORE INTO telegram_messages (id, channel_id, channel_name, message_id, message_text, message_date, sender_name, media_type, media_path, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [msg.id, id, msg.channelName, msg.messageId, msg.messageText, msg.messageDate, msg.senderName, msg.mediaType, msg.mediaPath, msg.syncedAt]
      );
    }

    return {
      id,
      channelUsername,
      channelName,
      lastMessageId,
      lastSyncedAt: now,
      autoSync: true,
      createdAt: now,
      messagesSaved: messages.length,
    };
  } catch {
    const res = await savePublicTelegramChannel(cleanUsername);
    return res.channel;
  }
}

export async function listTelegramChannels(): Promise<TelegramChannel[]> {
  const db = await getSourcesDb();
  const rows = await db.getAllAsync<{
    id: string;
    channel_username: string;
    channel_name: string | null;
    last_message_id: number | null;
    last_synced_at: string | null;
    auto_sync: number;
    created_at: string;
  }>(
    `SELECT id, channel_username, channel_name, last_message_id, last_synced_at, auto_sync, created_at
     FROM telegram_channels
     ORDER BY created_at DESC`
  );

  return rows.map(row => ({
    id: row.id,
    channelUsername: row.channel_username,
    channelName: row.channel_name,
    lastMessageId: row.last_message_id,
    lastSyncedAt: row.last_synced_at,
    autoSync: row.auto_sync === 1,
    createdAt: row.created_at,
  }));
}

export async function syncTelegramChannel(
  botToken: string,
  channelId: string
): Promise<number> {
  const db = await getSourcesDb();

  const channel = await db.getFirstAsync<{
    channel_username: string;
    last_message_id: number | null;
  }>(
    'SELECT channel_username, last_message_id FROM telegram_channels WHERE id = ?',
    [channelId]
  );

  if (!channel) throw new Error('Channel not found');

  if (!botToken || !botToken.trim() || !botToken.includes(':')) {
    const res = await savePublicTelegramChannel(channel.channel_username, channel.last_message_id ?? undefined);
    // Also backfill any remaining unextracted photos in this channel
    try {
      await ocrUnextractedPhotosForChannel(channel.channel_username, channelId);
    } catch (e) {
      console.warn('[telegram] Photo backfill OCR error:', e);
    }
    // Also backfill any unextracted documents via bridge if configured
    try {
      const bridge = await getTelegramBridgeUrl();
      if (bridge) {
        await extractUnextractedDocumentsForChannel(channel.channel_username, channelId);
      }
    } catch (e) {
      console.warn('[telegram] Doc backfill error:', e);
    }
    return res.messagesCount;
  }

  try {
    const messages = await fetchTelegramMessages(
      botToken,
      channel.channel_username,
      channel.last_message_id || undefined
    );

    if (messages.length === 0) {
      // Up to date
      await db.runAsync(
        'UPDATE telegram_channels SET last_synced_at = ? WHERE id = ?',
        [new Date().toISOString(), channelId]
      );
      return 0;
    }

    for (const msg of messages) {
      await db.runAsync(
        `INSERT OR IGNORE INTO telegram_messages (id, channel_id, channel_name, message_id, message_text, message_date, sender_name, media_type, media_path, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [msg.id, channelId, msg.channelName, msg.messageId, msg.messageText, msg.messageDate, msg.senderName, msg.mediaType, msg.mediaPath, msg.syncedAt]
      );
    }

    const lastMessageId = Math.max(...messages.map(m => m.messageId));
    await db.runAsync(
      `UPDATE telegram_channels
       SET last_message_id = ?, last_synced_at = ?
       WHERE id = ?`,
      [lastMessageId, new Date().toISOString(), channelId]
    );

    return messages.length;
  } catch {
    const res = await savePublicTelegramChannel(channel.channel_username, channel.last_message_id ?? undefined);
    return res.messagesCount;
  }
}

/**
 * Incrementally syncs all active Telegram channels (auto_sync = 1).
 * Only fetches new messages since the last synced message ID, saving bandwidth and battery.
 */
export async function syncAllActiveTelegramChannels(
  botToken?: string
): Promise<{ syncedChannels: number; newMessagesTotal: number }> {
  const db = await getSourcesDb();
  const channels = await db.getAllAsync<{
    id: string;
    channel_username: string;
    last_message_id: number | null;
    auto_sync: number;
  }>('SELECT id, channel_username, last_message_id, auto_sync FROM telegram_channels WHERE auto_sync = 1');

  let newMessagesTotal = 0;
  for (const ch of channels) {
    try {
      const count = await syncTelegramChannel(botToken || '', ch.id);
      newMessagesTotal += count;
    } catch (e) {
      console.warn(`[telegram-auto-sync] Failed to sync ${ch.channel_username}:`, e);
    }
  }

  return {
    syncedChannels: channels.length,
    newMessagesTotal,
  };
}

export async function deleteTelegramChannel(id: string): Promise<void> {
  const db = await getSourcesDb();

  const channelData = await db.getFirstAsync<{ channel_username: string; channel_name: string | null }>(
    'SELECT channel_username, channel_name FROM telegram_channels WHERE id = ?',
    [id]
  );

  if (channelData) {
    const clean = channelData.channel_username.replace(/^@/, '').toLowerCase();
    const title = channelData.channel_name || '';
    await db.runAsync(
      `DELETE FROM telegram_messages 
       WHERE channel_id = ? 
          OR channel_id = ? 
          OR channel_id = ? 
          OR channel_id = ?
          OR (channel_name IS NOT NULL AND channel_name = ?)`,
      [id, clean, `@${clean}`, channelData.channel_username, title]
    );
  } else {
    await db.runAsync('DELETE FROM telegram_messages WHERE channel_id = ?', [id]);
  }

  await db.runAsync('DELETE FROM telegram_channels WHERE id = ?', [id]);

  if (isConfigured()) {
    try {
      const supabase = getSupabase();
      const userId = await currentUserId();
      if (userId) {
        await supabase.from('telegram_channels').delete().eq('id', id).eq('user_id', userId);
      }
    } catch (err) {
      console.warn('[telegram] Failed to delete channel from Supabase:', err);
    }
  }
}

export async function clearAllTelegramData(): Promise<void> {
  const db = await getSourcesDb();
  await db.runAsync('DELETE FROM telegram_messages');
  await db.runAsync('DELETE FROM telegram_channels');

  if (isConfigured()) {
    try {
      const supabase = getSupabase();
      const userId = await currentUserId();
      if (userId) {
        await supabase.from('telegram_channels').delete().eq('user_id', userId);
      }
    } catch (err) {
      console.warn('[telegram] Failed to clear channels from Supabase:', err);
    }
  }
}

const ISLAND_PORT_ALIASES: Record<string, string[]> = {
  androth: ['and', 'andrott'],
  androt: ['and', 'androth'],
  kalpeni: ['klp'],
  kavaratti: ['kvt'],
  agatti: ['agt'],
  amini: ['amn'],
  kadmat: ['kdm', 'kadmath'],
  kadmath: ['kdm', 'kadmat'],
  kiltan: ['klt'],
  chetlat: ['cht'],
  bitra: ['btr'],
  minicoy: ['mcy'],
  cochin: ['kochi'],
  kochi: ['cochin'],
};

export async function searchTelegramMessages(query: string, limit = 50): Promise<TelegramMessage[]> {
  const db = await getSourcesDb();
  const rawWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const keywordsSet = new Set<string>();

  for (const w of rawWords) {
    if (w.length > 2) keywordsSet.add(w);
    if (w === 'shiip') keywordsSet.add('ship');
    const aliases = ISLAND_PORT_ALIASES[w];
    if (aliases) {
      aliases.forEach(a => keywordsSet.add(a));
    }
  }

  const keywords = Array.from(keywordsSet);
  if (keywords.length === 0) return [];

  const conditions = keywords.map(() => 'LOWER(message_text) LIKE ?').join(' OR ');
  const params = keywords.map(k => `%${k}%`);

  const rows = await db.getAllAsync<{
    id: string;
    channel_id: string;
    channel_name: string | null;
    message_id: number;
    message_text: string | null;
    message_date: string;
    sender_name: string | null;
    media_type: string;
    media_path: string | null;
    synced_at: string;
  }>(
    `SELECT id, channel_id, channel_name, message_id, message_text, message_date, sender_name, media_type, media_path, synced_at
     FROM telegram_messages
     WHERE deleted = 0 AND (${conditions})
     ORDER BY message_date DESC
     LIMIT ?`,
    [...params, limit]
  );

  return rows.map(row => ({
    id: row.id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    messageId: row.message_id,
    messageText: row.message_text,
    messageDate: row.message_date,
    senderName: row.sender_name,
    mediaType: row.media_type as TelegramMessage['mediaType'],
    mediaPath: row.media_path,
    syncedAt: row.synced_at,
  }));
}

export async function getTelegramMessageCount(): Promise<number> {
  const db = await getSourcesDb();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM telegram_messages WHERE deleted = 0'
  );
  return result?.count || 0;
}

export interface ChannelMediaStats {
  total: number;
  textCount: number;
  photoCount: number;
  docCount: number;
  videoCount: number;
}

export async function getChannelMediaStats(
  channelUsername: string,
  channelId?: string
): Promise<ChannelMediaStats> {
  const db = await getSourcesDb();
  const clean = channelUsername.replace(/^@/, '').toLowerCase();
  const channelRecord = await db.getFirstAsync<{ id: string; channel_username: string; channel_name: string | null }>(
    `SELECT id, channel_username, channel_name FROM telegram_channels 
     WHERE id = ? OR LOWER(channel_username) = ? OR LOWER(channel_username) = ?`,
    [channelId || '', `@${clean}`, clean]
  );
  const matchedId = channelRecord?.id || channelId || '';
  const matchedUsername = channelRecord?.channel_username?.replace(/^@/, '').toLowerCase() || clean;
  const matchedTitle = channelRecord?.channel_name || '';

  // Heal any orphaned rows in telegram_messages so counts reflect all messages
  if (matchedId) {
    try {
      await db.runAsync(
        `UPDATE telegram_messages
         SET channel_id = ?
         WHERE channel_id != ? AND (
           LOWER(channel_id) = ?
           OR LOWER(channel_id) = ?
           OR (channel_name IS NOT NULL AND (
             channel_name = ?
             OR LOWER(channel_name) = ?
             OR LOWER(channel_name) LIKE ?
           ))
         )`,
        [matchedId, matchedId, clean, `@${clean}`, matchedTitle, matchedTitle.toLowerCase(), `%${matchedUsername}%`]
      );
    } catch {}
  }

  const row = await db.getFirstAsync<{
    total: number;
    photo_count: number;
    doc_count: number;
    video_count: number;
  }>(
    `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN media_type = 'photo' OR message_text LIKE '%[Photo%' OR message_text LIKE '%[Extracted Poster%' OR message_text LIKE '%[Image OCR Content%' THEN 1 ELSE 0 END) as photo_count,
       SUM(CASE WHEN media_type = 'document' OR message_text LIKE '%[Document%' OR message_text LIKE '%[Attached Cargo%' OR message_text LIKE '%[Attached Document%' THEN 1 ELSE 0 END) as doc_count,
       SUM(CASE WHEN media_type = 'video' OR message_text LIKE '%[Video%' THEN 1 ELSE 0 END) as video_count
     FROM telegram_messages
     WHERE deleted = 0 AND (
       channel_id = ?
       OR channel_id = ?
       OR channel_id = ?
       OR channel_id = ?
       OR (channel_name IS NOT NULL AND (
         channel_name = ?
         OR LOWER(channel_name) = ?
         OR LOWER(channel_name) LIKE ?
       ))
     )`,
    [matchedId, clean, `@${clean}`, matchedUsername, matchedTitle, matchedTitle.toLowerCase(), `%${matchedUsername}%`]
  );

  const total = row?.total || 0;
  const photoCount = row?.photo_count || 0;
  const docCount = row?.doc_count || 0;
  const videoCount = row?.video_count || 0;
  const textCount = Math.max(0, total - (photoCount + docCount + videoCount));

  return {
    total,
    textCount,
    photoCount,
    docCount,
    videoCount,
  };
}

export async function getAllChannelMediaStats(): Promise<Record<string, ChannelMediaStats>> {
  const db = await getSourcesDb();
  const channels = await db.getAllAsync<{ id: string; channel_username: string; channel_name: string | null }>(
    'SELECT id, channel_username, channel_name FROM telegram_channels'
  );
  const result: Record<string, ChannelMediaStats> = {};
  for (const ch of channels) {
    const stats = await getChannelMediaStats(ch.channel_username, ch.id);
    result[ch.id] = stats;
    result[ch.channel_username.toLowerCase()] = stats;
    result[ch.channel_username.replace(/^@/, '').toLowerCase()] = stats;
  }
  return result;
}

export async function getChannelMessageCounts(): Promise<Record<string, number>> {
  const statsMap = await getAllChannelMediaStats();
  const result: Record<string, number> = {};
  for (const [key, stats] of Object.entries(statsMap)) {
    result[key] = stats.total;
  }
  return result;
}

export async function getChannelMessageCount(channelUsername: string, channelId?: string): Promise<number> {
  const stats = await getChannelMediaStats(channelUsername, channelId);
  return stats.total;
}

export async function getChannelMessages(channelUsername: string, channelId?: string, limit = 100): Promise<TelegramMessage[]> {
  const db = await getSourcesDb();
  const clean = channelUsername.replace(/^@/, '').toLowerCase();
  const channelRecord = await db.getFirstAsync<{ id: string; channel_username: string; channel_name: string | null }>(
    `SELECT id, channel_username, channel_name FROM telegram_channels 
     WHERE id = ? OR LOWER(channel_username) = ? OR LOWER(channel_username) = ?`,
    [channelId || '', `@${clean}`, clean]
  );
  const matchedId = channelRecord?.id || channelId || '';
  const matchedUsername = channelRecord?.channel_username?.replace(/^@/, '').toLowerCase() || clean;
  const matchedTitle = channelRecord?.channel_name || '';

  // Heal any orphaned rows in telegram_messages so they are normalized to matchedId
  if (matchedId) {
    try {
      await db.runAsync(
        `UPDATE telegram_messages
         SET channel_id = ?
         WHERE channel_id != ? AND (
           LOWER(channel_id) = ?
           OR LOWER(channel_id) = ?
           OR (channel_name IS NOT NULL AND channel_name = ?)
         )`,
        [matchedId, matchedId, clean, `@${clean}`, matchedTitle]
      );
    } catch {}
  }

  const rows = await db.getAllAsync<{
    id: string;
    channel_id: string;
    channel_name: string | null;
    message_id: number;
    message_text: string | null;
    message_date: string;
    sender_name: string | null;
    media_type: string;
    media_path: string | null;
    synced_at: string;
  }>(
    `SELECT id, channel_id, channel_name, message_id, message_text, message_date, sender_name, media_type, media_path, synced_at
     FROM telegram_messages
     WHERE deleted = 0 AND (
       channel_id = ?
       OR channel_id = ?
       OR channel_id = ?
       OR channel_id = ?
       OR (channel_name IS NOT NULL AND (
         channel_name = ?
         OR LOWER(channel_name) = ?
         OR LOWER(channel_name) LIKE ?
       ))
     )
     ORDER BY message_id DESC, message_date DESC
     LIMIT ?`,
    [matchedId, clean, `@${clean}`, matchedUsername, matchedTitle, matchedTitle.toLowerCase(), `%${matchedUsername}%`, limit]
  );

  return rows.map(r => ({
    id: r.id,
    channelId: r.channel_id,
    channelName: r.channel_name,
    messageId: r.message_id,
    messageText: r.message_text,
    messageDate: r.message_date,
    senderName: r.sender_name,
    mediaType: r.media_type as TelegramMessage['mediaType'],
    mediaPath: r.media_path,
    syncedAt: r.synced_at,
  }));
}


