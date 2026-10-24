/**
 * Telegram channel integration.
 */
import { getSourcesDb, uuid } from './client';
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

export async function addTelegramChannel(
  botToken: string,
  channelUsername: string
): Promise<TelegramChannel> {
  validateBotToken(botToken);
  validateChannelUsername(channelUsername);

  const db = await getSourcesDb();
  const now = new Date().toISOString();
  const id = uuid();

  // Verify we can access the channel
  try {
    const messages = await fetchTelegramMessages(botToken, channelUsername);

    if (messages.length === 0) {
      throw new Error('No messages found. Make sure the bot is added as an admin to the channel.');
    }

    const channelName = messages[0]?.channelName || channelUsername;
    const lastMessageId = messages.length > 0 ? Math.max(...messages.map(m => m.messageId)) : null;

    // Save channel
    await db.runAsync(
      `INSERT INTO telegram_channels (id, channel_username, channel_name, last_message_id, last_synced_at, auto_sync, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [id, channelUsername, channelName, lastMessageId, now, now]
    );

    // Save messages
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
  } catch (err) {
    throw new Error(`Could not add Telegram channel: ${err instanceof Error ? err.message : String(err)}`);
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

  const messages = await fetchTelegramMessages(
    botToken,
    channel.channel_username,
    channel.last_message_id || undefined
  );

  if (messages.length === 0) return 0;

  // Save new messages
  for (const msg of messages) {
    await db.runAsync(
      `INSERT OR IGNORE INTO telegram_messages (id, channel_id, channel_name, message_id, message_text, message_date, sender_name, media_type, media_path, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [msg.id, msg.channelId, msg.channelName, msg.messageId, msg.messageText, msg.messageDate, msg.senderName, msg.mediaType, msg.mediaPath, msg.syncedAt]
    );
  }

  // Update channel last sync
  const lastMessageId = Math.max(...messages.map(m => m.messageId));
  await db.runAsync(
    `UPDATE telegram_channels
     SET last_message_id = ?, last_synced_at = ?
     WHERE id = ?`,
    [lastMessageId, new Date().toISOString(), channelId]
  );

  return messages.length;
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

export async function searchTelegramMessages(query: string, limit = 50): Promise<TelegramMessage[]> {
  const db = await getSourcesDb();
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

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

