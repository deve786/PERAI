/**
 * Website data scraping and management.
 */
import { getSourcesDb, uuid } from './client';
import { savePublicTelegramChannel } from './telegram';
export interface WebsiteData {
  id: string;
  url: string;
  title: string | null;
  content: string;
  scrapedAt: string;
  lastUpdated: string;
  refreshInterval: number;
  autoRefresh: boolean;
}

// Configuration
const FETCH_TIMEOUT = 30000; // 30 seconds
const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_CONTENT_LENGTH = 100;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

/**
 * Enhanced HTML text extraction.
 * Preserves paragraphs, line breaks, bullet lists, tables, and image descriptions.
 */
function extractTextFromHtml(html: string): string {
  // Remove script, style, and svg tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  // Extract images with alt text or descriptive attribute
  text = text.replace(/<img[^>]*alt="([^"]+)"[^>]*>/gi, ' [Image: $1] ');

  // Preserve line breaks and block element spacing
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|article|section|header|footer)>/gi, '\n');
  text = text.replace(/<(td|th)[^>]*>/gi, ' | ');
  text = text.replace(/<li[^>]*>/gi, '• ');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean lines: trim each line and preserve meaningful paragraph breaks
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n');

  return text.trim();
}

export function parseTelegramChannel(url: string): string | null {
  const match = url.trim().match(/^(?:https?:\/\/)?t\.me\/(?:s\/)?([a-zA-Z0-9_]+)(?:\/|\?.*)?$/i);
  if (match && match[1]) {
    const ch = match[1].toLowerCase();
    if (ch !== 's' && ch !== 'joinchat' && !ch.startsWith('+')) {
      return match[1];
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();

  return null;
}

function normalizeWebsiteUrl(raw: string): string {
  let url = raw.trim();
  const tgMatch = url.match(/^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)\/?$/i);
  if (tgMatch && tgMatch[1] && tgMatch[1].toLowerCase() !== 's' && !tgMatch[1].startsWith('+') && tgMatch[1].toLowerCase() !== 'joinchat') {
    return `https://t.me/s/${tgMatch[1]}`;
  }
  return url;
}

function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }
  } catch {
    throw new Error('Invalid URL format');
  }
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  }
}

async function scrapeWithRetry(url: string, retries = MAX_RETRIES): Promise<WebsiteData> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }

      const response = await fetchWithTimeout(url, FETCH_TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      if (html.length > MAX_CONTENT_SIZE) {
        throw new Error(`Content too large (${(html.length / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_CONTENT_SIZE / 1024 / 1024}MB`);
      }

      const title = extractTitle(html);
      let content = extractTextFromHtml(html);

      // If text extraction yielded very little content (e.g. JS-heavy or heavily structured site),
      // fallback to extracting raw body text or placeholder info instead of hard failing.
      if (content.length < MIN_CONTENT_LENGTH) {
        if (html.length > 50) {
          // Fallback: use whatever raw text or meta description / title we can grab
          content = title ? `Website Title: ${title}\nURL: ${url}\n(Note: This website relies heavily on JavaScript or dynamic rendering. Basic content extracted: ${content})` : `Website URL: ${url}\n(Content could not be fully parsed as static HTML).`;
        } else {
          throw new Error('Not enough content extracted - website may require JavaScript or be mostly images');
        }
      }

      const now = new Date().toISOString();

      return {
        id: uuid(),
        url,
        title,
        content,
        scrapedAt: now,
        lastUpdated: now,
        refreshInterval: 86400, // 24 hours
        autoRefresh: true,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on certain errors
      if (lastError.message.includes('Invalid URL') ||
          lastError.message.includes('Only HTTP') ||
          lastError.message.includes('Content too large')) {
        throw lastError;
      }
    }
  }

  throw new Error(`Failed to scrape ${url} after ${retries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
}

export async function scrapeWebsite(url: string): Promise<WebsiteData> {
  const tgChannel = parseTelegramChannel(url);
  if (tgChannel) {
    const tgRes = await savePublicTelegramChannel(tgChannel);
    const now = new Date().toISOString();
    return {
      id: uuid(),
      url: `https://t.me/s/${tgChannel}`,
      title: tgRes.channel.channelName || `@${tgChannel}`,
      content: tgRes.summary,
      scrapedAt: now,
      lastUpdated: now,
      refreshInterval: 86400,
      autoRefresh: true,
    };
  }

  const normalized = normalizeWebsiteUrl(url);
  validateUrl(normalized);
  return scrapeWithRetry(normalized);
}

export async function addWebsite(url: string): Promise<WebsiteData> {
  const normalized = normalizeWebsiteUrl(url);
  const data = await scrapeWebsite(normalized);
  const db = await getSourcesDb();

  await db.runAsync(
    `INSERT INTO website_data (id, url, title, content, scraped_at, last_updated, refresh_interval, auto_refresh)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       last_updated = excluded.last_updated`,
    [data.id, data.url, data.title, data.content, data.scrapedAt, data.lastUpdated, data.refreshInterval, data.autoRefresh ? 1 : 0]
  );

  return data;
}

export async function listWebsites(): Promise<WebsiteData[]> {
  const db = await getSourcesDb();
  const rows = await db.getAllAsync<{
    id: string;
    url: string;
    title: string | null;
    content: string;
    scraped_at: string;
    last_updated: string;
    refresh_interval: number;
    auto_refresh: number;
  }>(
    `SELECT id, url, title, content, scraped_at, last_updated, refresh_interval, auto_refresh
     FROM website_data
     WHERE deleted = 0
     ORDER BY last_updated DESC`
  );

  return rows.map(row => ({
    id: row.id,
    url: row.url,
    title: row.title,
    content: row.content,
    scrapedAt: row.scraped_at,
    lastUpdated: row.last_updated,
    refreshInterval: row.refresh_interval,
    autoRefresh: row.auto_refresh === 1,
  }));
}

export async function refreshWebsite(id: string): Promise<WebsiteData> {
  const db = await getSourcesDb();

  const existing = await db.getFirstAsync<{ url: string; refresh_interval: number; auto_refresh: number }>(
    'SELECT url, refresh_interval, auto_refresh FROM website_data WHERE id = ? AND deleted = 0',
    [id]
  );

  if (!existing) throw new Error('Website not found');

  const data = await scrapeWebsite(existing.url);

  await db.runAsync(
    `UPDATE website_data
     SET title = ?, content = ?, last_updated = ?
     WHERE id = ?`,
    [data.title, data.content, data.lastUpdated, id]
  );

  return {
    ...data,
    id,
    refreshInterval: existing.refresh_interval,
    autoRefresh: existing.auto_refresh === 1,
  };
}

export async function deleteWebsite(id: string): Promise<void> {
  const db = await getSourcesDb();
  await db.runAsync('UPDATE website_data SET deleted = 1 WHERE id = ?', [id]);
}

export async function searchWebsiteContent(query: string, limit = 10): Promise<WebsiteData[]> {
  const db = await getSourcesDb();
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (keywords.length === 0) return [];

  const conditions = keywords.map(() => '(LOWER(content) LIKE ? OR LOWER(title) LIKE ?)').join(' OR ');
  const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

  const rows = await db.getAllAsync<{
    id: string;
    url: string;
    title: string | null;
    content: string;
    scraped_at: string;
    last_updated: string;
    refresh_interval: number;
    auto_refresh: number;
  }>(
    `SELECT id, url, title, content, scraped_at, last_updated, refresh_interval, auto_refresh
     FROM website_data
     WHERE deleted = 0 AND (${conditions})
     LIMIT ?`,
    [...params, limit]
  );

  return rows.map(row => ({
    id: row.id,
    url: row.url,
    title: row.title,
    content: row.content,
    scrapedAt: row.scraped_at,
    lastUpdated: row.last_updated,
    refreshInterval: row.refresh_interval,
    autoRefresh: row.auto_refresh === 1,
  }));
}

export async function refreshStaleWebsites(): Promise<number> {
  const db = await getSourcesDb();
  const now = Date.now();
  let refreshed = 0;

  const stale = await db.getAllAsync<{ id: string; url: string; last_updated: string; refresh_interval: number }>(
    `SELECT id, url, last_updated, refresh_interval
     FROM website_data
     WHERE deleted = 0 AND auto_refresh = 1`
  );

  for (const site of stale) {
    const lastUpdate = new Date(site.last_updated).getTime();
    const intervalMs = site.refresh_interval * 1000;

    if (now - lastUpdate >= intervalMs) {
      try {
        await refreshWebsite(site.id);
        refreshed++;
      } catch (err) {
        console.warn(`Failed to refresh ${site.url}:`, err);
      }
    }
  }

  return refreshed;
}
