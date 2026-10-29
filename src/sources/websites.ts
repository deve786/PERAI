/**
 * Website data scraping, multi-page crawling, and management.
 */
import { getSourcesDb, uuid } from './client';
import { tokenize } from '@/ai/retrieval';
import { savePublicTelegramChannel } from './telegram';
import {
  extractLinksFromHtml,
  extractTitle,
  extractTextFromHtml,
  normalizeWebsiteUrl,
  validateUrl,
  buildAggregatedWebsiteContent,
  extractScrapedPages,
  extractSpaPages,
  COMMON_SPA_PROBE_PATHS,
  type ScrapedPage,
  type ScrapedPageDetail,
} from './websiteLogic';
import { currentUserId, getSupabase, isConfigured } from '@/sync/client';

export interface WebsiteData {
  id: string;
  url: string;
  title: string | null;
  content: string;
  scrapedAt: string;
  lastUpdated: string;
  refreshInterval: number;
  autoRefresh: boolean;
  pages?: ScrapedPageDetail[];
}

export interface CrawlProgress {
  current: number;
  totalFound: number;
  currentUrl: string;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  timeout?: number;
  onProgress?: (progress: CrawlProgress) => void;
}

// Configuration
const FETCH_TIMEOUT = 20000; // 20 seconds per page
const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_CONTENT_LENGTH = 50;
const DEFAULT_MAX_PAGES = 30; // Scrapes all pages on the website up to 30 pages
const DEFAULT_MAX_DEPTH = 3;

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

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

/**
 * Deep multi-page crawler.
 * Discovers and scrapes all pages belonging to the website up to maxPages and maxDepth.
 */
export async function crawlWebsite(
  rawUrl: string,
  options: CrawlOptions = {}
): Promise<WebsiteData> {
  const {
    maxPages = DEFAULT_MAX_PAGES,
    maxDepth = DEFAULT_MAX_DEPTH,
    timeout = FETCH_TIMEOUT,
    onProgress,
  } = options;

  const normalized = normalizeWebsiteUrl(rawUrl);
  validateUrl(normalized);

  const tgChannel = parseTelegramChannel(normalized);
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

  const queue: { url: string; depth: number }[] = [{ url: normalized, depth: 0 }];
  const visited = new Set<string>([normalized]);
  const pages: ScrapedPage[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const next = queue.shift();
    if (!next) break;

    onProgress?.({
      current: pages.length + 1,
      totalFound: visited.size,
      currentUrl: next.url,
    });

    try {
      const response = await fetchWithTimeout(next.url, timeout);
      if (!response.ok) {
        continue;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain')) {
        continue;
      }

      const html = await response.text();
      if (!html || html.length > MAX_CONTENT_SIZE) {
        continue;
      }

      let title = extractTitle(html);
      let content = extractTextFromHtml(html);

      // If at root page (next.depth === 0), also check for modern SPA embedded pages
      // (Turbopack, Next.js, i18n client dictionaries, live alerts/announcement APIs)
      if (next.depth === 0) {
        try {
          const spaPages = await extractSpaPages(html, next.url, async (fetchUrl) => {
            try {
              const r = await fetchWithTimeout(fetchUrl, 10000);
              return r.ok ? await r.text() : '';
            } catch {
              return '';
            }
          });

          for (const sp of spaPages) {
            if (sp.url === next.url && sp.content.length > content.length) {
              // Better content for root page from SPA dictionary
              content = sp.content;
              if (sp.title) title = sp.title;
            } else if (!visited.has(sp.url) && sp.content.length >= MIN_CONTENT_LENGTH) {
              visited.add(sp.url);
              pages.push(sp);
            }
          }
        } catch (err) {
          console.warn('SPA extraction note:', err);
        }
      }

      if (content.length < MIN_CONTENT_LENGTH) {
        if (html.length > 50) {
          content = title
            ? `Page Title: ${title}\nURL: ${next.url}\n(Content extracted: ${content})`
            : `URL: ${next.url}\n(Content could not be fully parsed as static HTML).`;
        }
      }

      // Check if page with this URL was already added
      const existingIdx = pages.findIndex(p => p.url === next.url);
      if (existingIdx !== -1) {
        if (content.length > pages[existingIdx].content.length) {
          pages[existingIdx] = {
            url: next.url,
            title: title || pages[existingIdx].title,
            content,
            depth: next.depth,
          };
        }
      } else if (content.length >= MIN_CONTENT_LENGTH || pages.length === 0) {
        pages.push({
          url: next.url,
          title,
          content,
          depth: next.depth,
        });
      }

      // Discover internal links if depth and page limits allow
      if (next.depth < maxDepth && visited.size < maxPages * 3) {
        const foundLinks = extractLinksFromHtml(html, next.url);
        for (const link of foundLinks) {
          if (!visited.has(link) && visited.size < maxPages * 3) {
            visited.add(link);
            queue.push({ url: link, depth: next.depth + 1 });
          }
        }

        // If very few links found (SPA with client-side router navigation), probe common SPA paths
        if (next.depth === 0 && foundLinks.length < 3) {
          try {
            const baseOrigin = new URL(next.url).origin;
            for (const probePath of COMMON_SPA_PROBE_PATHS) {
              const candidate = `${baseOrigin}${probePath}`;
              if (!visited.has(candidate) && visited.size < maxPages * 3) {
                visited.add(candidate);
                queue.push({ url: candidate, depth: 1 });
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn(`Failed to crawl ${next.url}:`, err);
      if (pages.length === 0 && queue.length === 0) {
        throw new Error(`Failed to scrape ${next.url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Polite throttle between requests
    if (queue.length > 0 && pages.length < maxPages) {
      await new Promise(r => setTimeout(r, 60));
    }
  }

  if (pages.length === 0) {
    throw new Error(`Could not extract any content from ${normalized}`);
  }

  const { content: aggregatedContent, title: aggregatedTitle } = buildAggregatedWebsiteContent(normalized, pages);
  const now = new Date().toISOString();

  return {
    id: uuid(),
    url: normalized,
    title: aggregatedTitle,
    content: aggregatedContent,
    scrapedAt: now,
    lastUpdated: now,
    refreshInterval: 86400, // 24 hours
    autoRefresh: true,
  };
}

export async function scrapeWebsite(
  url: string,
  onProgress?: (p: CrawlProgress) => void
): Promise<WebsiteData> {
  return crawlWebsite(url, { onProgress });
}

export async function addWebsite(
  url: string,
  onProgress?: (p: CrawlProgress) => void
): Promise<WebsiteData> {
  const data = await crawlWebsite(url, { onProgress });
  const db = await getSourcesDb();

  await db.runAsync(
    `INSERT INTO website_data (id, url, title, content, scraped_at, last_updated, refresh_interval, auto_refresh, dirty, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
     ON CONFLICT(url) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       last_updated = excluded.last_updated,
       deleted = 0,
       dirty = 1`,
    [data.id, data.url, data.title, data.content, data.scrapedAt, data.lastUpdated, data.refreshInterval, data.autoRefresh ? 1 : 0]
  );

  return {
    ...data,
    pages: extractScrapedPages(data.content, data.url),
  };
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
    pages: extractScrapedPages(row.content, row.url),
  }));
}

export async function refreshWebsite(
  id: string,
  onProgress?: (p: CrawlProgress) => void
): Promise<WebsiteData> {
  const db = await getSourcesDb();

  const existing = await db.getFirstAsync<{ url: string; refresh_interval: number; auto_refresh: number }>(
    'SELECT url, refresh_interval, auto_refresh FROM website_data WHERE id = ? AND deleted = 0',
    [id]
  );

  if (!existing) throw new Error('Website not found');

  const data = await crawlWebsite(existing.url, { onProgress });

  await db.runAsync(
    `UPDATE website_data
     SET title = ?, content = ?, last_updated = ?, deleted = 0, dirty = 1
     WHERE id = ?`,
    [data.title, data.content, data.lastUpdated, id]
  );

  return {
    ...data,
    id,
    refreshInterval: existing.refresh_interval,
    autoRefresh: existing.auto_refresh === 1,
    pages: extractScrapedPages(data.content, existing.url),
  };
}

export async function deleteWebsite(id: string): Promise<void> {
  const db = await getSourcesDb();
  // 1. Delete locally from SQLite
  await db.runAsync('DELETE FROM website_data WHERE id = ?', [id]);

  // 2. Delete from Supabase cloud
  try {
    if (isConfigured()) {
      const supabase = getSupabase();
      await supabase.from('website_data').delete().eq('id', id);
    }
  } catch (err) {
    console.warn('Cloud deleteWebsite error:', err);
  }
}

export async function clearAllWebsites(): Promise<number> {
  const db = await getSourcesDb();
  // 1. Delete all locally from SQLite
  const res = await db.runAsync('DELETE FROM website_data');

  // 2. Delete all for user in Supabase cloud
  try {
    if (isConfigured()) {
      const userId = await currentUserId();
      if (userId) {
        const supabase = getSupabase();
        await supabase.from('website_data').delete().eq('user_id', userId);
      }
    }
  } catch (err) {
    console.warn('Cloud clearAllWebsites error:', err);
  }

  return res.changes;
}

/**
 * Find the tracked pages worth putting in front of the model.
 *
 * Scored by how many distinct search terms each page contains, rather than
 * returning any page that happened to contain one common word.
 */
export async function searchWebsiteContent(query: string, limit = 10): Promise<WebsiteData[]> {
  const db = await getSourcesDb();
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const score = terms
    .map(() => '(CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END) + (CASE WHEN LOWER(title) LIKE ? THEN 1 ELSE 0 END)')
    .join(' + ');
  const params = terms.flatMap((k) => [`%${k}%`, `%${k}%`]);

  const rows = await db.getAllAsync<{
    id: string;
    url: string;
    title: string | null;
    content: string;
    scraped_at: string;
    last_updated: string;
    refresh_interval: number;
    auto_refresh: number;
    hits: number;
  }>(
    `SELECT id, url, title, content, scraped_at, last_updated, refresh_interval, auto_refresh, (${score}) AS hits
     FROM website_data
     WHERE deleted = 0 AND (${score}) > 0
     ORDER BY hits DESC
     LIMIT ?`,
    [...params, ...params, limit]
  );

  if (rows.length === 0) return [];

  const best = rows[0].hits;
  const threshold = Math.max(1, Math.ceil(best / 2));

  return rows
    .filter((row) => row.hits >= threshold)
    .map(row => ({
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
