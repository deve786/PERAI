/**
 * Telegram channel integration.
 */
import { getSourcesDb, uuid } from './client';
import { getClient, EXTRACT_MODEL, hasApiKey } from '@/ai/client';

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
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(photoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 1000) return null;

    const base64 = arrayBufferToBase64(buf);
    const client = getClient();
    const response = await client.models.generateContent({
      model: EXTRACT_MODEL,
      contents: [
        {
          text: `Extract all visible text, dates, times, schedules, passenger guidelines, locations, vessel names, and rules from this image accurately in English and Malayalam.
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

    const text = response.text?.trim();
    if (!text || /^(NO_TEXT|no text|no legible text)/i.test(text)) {
      return null;
    }
    return text;
  } catch (err) {
    console.warn('[telegram-ocr] Could not OCR photo:', err);
    return null;
  }
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

interface TelegramApiResponse {
  ok: boolean;
  result?: Array<{
    update_id: number;
    channel_post?: {
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
      photo?: unknown[];
      video?: unknown;
      document?: unknown;
    };
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
        if (update.channel_post) {
          const msg = update.channel_post;

          // Skip if we've already processed this message
          if (lastMessageId && msg.message_id <= lastMessageId) continue;

          messages.push({
            id: uuid(),
            channelId: String(msg.chat.id),
            channelName: msg.chat.title || msg.chat.username || channelUsername,
            messageId: msg.message_id,
            messageText: msg.text || msg.caption || '',
            messageDate: new Date(msg.date * 1000).toISOString(),
            senderName: msg.author_signature || 'Channel',
            mediaType: msg.photo ? 'photo' : msg.video ? 'video' : msg.document ? 'document' : 'none',
            mediaPath: null,
            syncedAt: new Date().toISOString(),
          });
        }
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
}

export interface FetchPublicTelegramOptions {
  lastMessageId?: number;
  daysToScrape?: number;
  maxPages?: number;
  maxPhotosToOcr?: number;
}

export async function fetchPublicTelegramChannel(
  username: string,
  options: FetchPublicTelegramOptions | number = 21,
  legacyMaxPages = 12,
  legacyMaxPhotosToOcr = 2
): Promise<PublicTelegramResult> {
  const opts: FetchPublicTelegramOptions = typeof options === 'number'
    ? { daysToScrape: options, maxPages: legacyMaxPages, maxPhotosToOcr: legacyMaxPhotosToOcr }
    : options;

  const {
    lastMessageId,
    daysToScrape = lastMessageId ? 0 : 21,
    maxPages = lastMessageId ? 3 : 12,
    maxPhotosToOcr = 2,
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
    ocrText?: string | null;
  }> = [];

  let channelTitle = clean;
  let page = 0;

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

      if (!res.ok) break;
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

        const docTitle = b.match(/<div class="tgme_widget_message_document_title">([^<]*)<\/div>/);
        const docExtra = b.match(/<div class="tgme_widget_message_document_extra">([^<]*)<\/div>/);
        const docInfo = docTitle ? `${docTitle[1].trim()}${docExtra ? ` (${docExtra[1].trim()})` : ''}` : null;

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
    } catch {
      break;
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

  // OCR the latest attached photos (up to maxPhotosToOcr) concurrently in parallel
  const photosToOcr = unique.filter(m => m.photos && m.photos.length > 0).slice(0, maxPhotosToOcr);
  if (photosToOcr.length > 0) {
    await Promise.all(
      photosToOcr.map(async (m) => {
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
  };
}

export async function savePublicTelegramChannel(
  username: string,
  lastMessageId?: number
): Promise<{ channel: TelegramChannel; messagesCount: number; summary: string }> {
  const clean = username.replace(/^@/, '').replace(/^(?:https?:\/\/)?t\.me\/(?:s\/)?/, '').replace(/\/$/, '').trim();
  const db = await getSourcesDb();

  // If lastMessageId not explicitly passed, inspect existing channel in DB
  let effectiveLastId = lastMessageId;
  let existingChannelId: string | null = null;
  if (!effectiveLastId) {
    const existing = await db.getFirstAsync<{ id: string; last_message_id: number | null }>(
      'SELECT id, last_message_id FROM telegram_channels WHERE channel_username = ? OR channel_username = ?',
      [`@${clean}`, clean]
    );
    if (existing) {
      existingChannelId = existing.id;
      if (existing.last_message_id) {
        effectiveLastId = existing.last_message_id;
      }
    }
  }

  const result = await fetchPublicTelegramChannel(username, { lastMessageId: effectiveLastId });
  const now = new Date().toISOString();

  // If already up to date (no new messages found)
  if (result.messages.length === 0 && effectiveLastId) {
    await db.runAsync(
      `UPDATE telegram_channels
       SET last_synced_at = ?
       WHERE channel_username = ? OR channel_username = ?`,
      [now, `@${clean}`, clean]
    );

    return {
      channel: {
        id: existingChannelId || uuid(),
        channelUsername: `@${clean}`,
        channelName: result.channelName,
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

  const channelId = existingChannelId || uuid();
  const newMaxId = Math.max(...result.messages.map(m => m.messageId));
  const finalLastMessageId = effectiveLastId ? Math.max(effectiveLastId, newMaxId) : newMaxId;

  await db.runAsync(
    `INSERT INTO telegram_channels (id, channel_username, channel_name, last_message_id, last_synced_at, auto_sync, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(channel_username) DO UPDATE SET
       channel_name = excluded.channel_name,
       last_message_id = excluded.last_message_id,
       last_synced_at = excluded.last_synced_at`,
    [channelId, result.channelUsername, result.channelName, finalLastMessageId, now, now]
  );

  await db.withTransactionAsync(async () => {
    for (const msg of result.messages) {
      let fullText = msg.messageText || '';
      if (msg.mediaType === 'photo' && msg.mediaPath) {
        fullText = fullText ? `${fullText}\n[Photo: ${msg.mediaPath}]` : `[Photo: ${msg.mediaPath}]`;
      } else if (msg.mediaType === 'document' && msg.mediaPath) {
        fullText = fullText ? `${fullText}\n[Document: ${msg.mediaPath}]` : `[Document: ${msg.mediaPath}]`;
      } else if (msg.mediaType === 'video' && msg.mediaPath) {
        fullText = fullText ? `${fullText}\n[Video: ${msg.mediaPath}]` : `[Video: ${msg.mediaPath}]`;
      }

      await db.runAsync(
        `INSERT OR REPLACE INTO telegram_messages (id, channel_id, channel_name, message_id, message_text, message_date, sender_name, media_type, media_path, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [msg.id, msg.channelId, msg.channelName, msg.messageId, fullText, msg.messageDate, msg.senderName, msg.mediaType, msg.mediaPath, msg.syncedAt]
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
  const id = uuid();

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
        [msg.id, msg.channelId, msg.channelName, msg.messageId, msg.messageText, msg.messageDate, msg.senderName, msg.mediaType, msg.mediaPath, msg.syncedAt]
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
        [msg.id, msg.channelId, msg.channelName, msg.messageId, msg.messageText, msg.messageDate, msg.senderName, msg.mediaType, msg.mediaPath, msg.syncedAt]
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

  // Get channel's messages
  const channelData = await db.getFirstAsync<{ channel_username: string }>(
    'SELECT channel_username FROM telegram_channels WHERE id = ?',
    [id]
  );

  if (channelData) {
    // Delete messages
    await db.runAsync(
      'DELETE FROM telegram_messages WHERE channel_id IN (SELECT channel_id FROM telegram_channels WHERE id = ?)',
      [id]
    );
  }

  // Delete channel
  await db.runAsync('DELETE FROM telegram_channels WHERE id = ?', [id]);
}

export async function clearAllTelegramData(): Promise<void> {
  const db = await getSourcesDb();
  await db.runAsync('DELETE FROM telegram_messages');
  await db.runAsync('DELETE FROM telegram_channels');
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

export async function getChannelMessageCounts(): Promise<Record<string, number>> {
  const db = await getSourcesDb();
  const rows = await db.getAllAsync<{ channel_id: string; channel_name: string | null; count: number }>(
    `SELECT channel_id, channel_name, COUNT(*) as count
     FROM telegram_messages
     WHERE deleted = 0
     GROUP BY channel_id, channel_name`
  );
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.channel_id) {
      result[row.channel_id] = (result[row.channel_id] || 0) + row.count;
    }
    if (row.channel_name) {
      const lower = row.channel_name.toLowerCase();
      result[lower] = (result[lower] || 0) + row.count;
    }
  }
  return result;
}

export async function getChannelMessageCount(channelUsername: string, channelId?: string): Promise<number> {
  const db = await getSourcesDb();
  const clean = channelUsername.replace(/^@/, '').toLowerCase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM telegram_messages
     WHERE deleted = 0 AND (
       channel_id = ?
       OR channel_name = ?
       OR LOWER(channel_name) LIKE ?
       OR LOWER(channel_name) LIKE ?
     )`,
    [channelId || '', channelUsername, `%${clean}%`, `%${channelUsername}%`]
  );
  return row?.count || 0;
}

export async function getChannelMessages(channelUsername: string, channelId?: string, limit = 50): Promise<TelegramMessage[]> {
  const db = await getSourcesDb();
  const clean = channelUsername.replace(/^@/, '').toLowerCase();
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
       OR channel_name = ?
       OR LOWER(channel_name) LIKE ?
       OR LOWER(channel_name) LIKE ?
     )
     ORDER BY message_date DESC
     LIMIT ?`,
    [channelId || '', channelUsername, `%${clean}%`, `%${channelUsername}%`, limit]
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


