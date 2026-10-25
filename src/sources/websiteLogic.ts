/**
 * Pure website crawling and extraction logic.
 * Free of React Native / Expo imports so it can be tested and used anywhere.
 */

export interface ScrapedPage {
  url: string;
  title: string | null;
  content: string;
  depth: number;
}

/**
 * Extracts links pointing to pages under the same website / domain.
 * Filters out external domains, fragments, tracking params, and non-HTML assets.
 */
export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))[^>]*>/gi;
  let match: RegExpExecArray | null;

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return [];
  }

  while ((match = regex.exec(html)) !== null) {
    const rawHref = (match[1] || match[2] || match[3] || '').trim();
    if (
      !rawHref ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:')
    ) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, baseUrl);

      // Only HTTP or HTTPS
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        continue;
      }

      // Must be same hostname (same website)
      if (resolved.hostname.toLowerCase() !== parsedBase.hostname.toLowerCase()) {
        continue;
      }

      // Strip hash
      resolved.hash = '';

      // Strip tracking query parameters
      const searchParams = new URLSearchParams(resolved.search);
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid',
        'ref',
      ];
      trackingParams.forEach((p) => searchParams.delete(p));
      const cleanSearch = searchParams.toString();
      resolved.search = cleanSearch ? `?${cleanSearch}` : '';

      // Ignore binary / non-HTML file extensions
      const pathname = resolved.pathname.toLowerCase();
      if (
        /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz|rar|7z|exe|apk|dmg|iso|png|jpe?g|gif|webp|svg|ico|bmp|tiff|mp4|mp3|avi|mov|wmv|wav|flac|ogg|css|js|json|xml|woff2?|ttf|eot)$/i.test(
          pathname
        )
      ) {
        continue;
      }

      // Normalize trailing slash if not root
      let cleanUrl = resolved.toString();
      if (cleanUrl.endsWith('/') && resolved.pathname.length > 1) {
        cleanUrl = cleanUrl.slice(0, -1);
      }

      links.push(cleanUrl);
    } catch {
      // Ignore invalid URLs
    }
  }

  return Array.from(new Set(links));
}

/**
 * Extracts page title from HTML (<title> or <h1>).
 */
export function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();

  return null;
}

/**
 * Enhanced HTML text extraction.
 * Preserves paragraphs, line breaks, bullet lists, tables, and image descriptions.
 */
export function extractTextFromHtml(html: string): string {
  // Remove script, style, and svg tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  // Extract images with alt text
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
    .map((line) => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n');

  return text.trim();
}

/**
 * Normalizes input URL. Adds https:// if protocol is missing.
 */
export function normalizeWebsiteUrl(raw: string): string {
  let url = raw.trim();
  const tgMatch = url.match(/^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)\/?$/i);
  if (
    tgMatch &&
    tgMatch[1] &&
    tgMatch[1].toLowerCase() !== 's' &&
    !tgMatch[1].startsWith('+') &&
    tgMatch[1].toLowerCase() !== 'joinchat'
  ) {
    return `https://t.me/s/${tgMatch[1]}`;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  return url;
}

/**
 * Validates URL format.
 */
export function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }
  } catch {
    throw new Error('Invalid URL format');
  }
}

export interface ScrapedPageDetail {
  pageNumber: number;
  url: string;
  title: string;
  charCount: number;
  wordCount: number;
  content: string;
}

/**
 * Aggregates multiple scraped pages from a website into a coherent, structured text document.
 */
export function buildAggregatedWebsiteContent(
  seedUrl: string,
  pages: ScrapedPage[]
): { content: string; title: string | null } {
  if (pages.length === 0) {
    return { content: '', title: null };
  }

  const rootPage = pages.find((p) => p.depth === 0) || pages[0];
  let host = seedUrl;
  try {
    host = new URL(seedUrl).hostname;
  } catch {}
  const mainTitle = rootPage.title || host;
  const siteTitle = pages.length > 1 ? `${mainTitle} (${pages.length} pages)` : mainTitle;

  if (pages.length === 1) {
    const chars = pages[0].content.length;
    const words = pages[0].content.trim() ? pages[0].content.trim().split(/\s+/).length : 0;
    return {
      content: `================================================================================\nPAGE 1: ${mainTitle}\nURL: ${pages[0].url}\nDATA: ${chars.toLocaleString()} characters · ~${words.toLocaleString()} words\n================================================================================\n\n${pages[0].content}`,
      title: siteTitle,
    };
  }

  let text = `=== WEBSITE OVERVIEW ===\n`;
  text += `Root URL: ${seedUrl}\n`;
  text += `Total Pages Indexed: ${pages.length}\n`;
  text += `Pages Included:\n`;
  pages.forEach((p, idx) => {
    const chars = p.content.length;
    const words = p.content.trim() ? p.content.trim().split(/\s+/).length : 0;
    text += `• Page ${idx + 1}: ${p.title || p.url} (${p.url}) — ${chars.toLocaleString()} chars (~${words.toLocaleString()} words)\n`;
  });
  text += `\n`;

  pages.forEach((p, idx) => {
    const chars = p.content.length;
    const words = p.content.trim() ? p.content.trim().split(/\s+/).length : 0;
    text += `================================================================================\n`;
    text += `PAGE ${idx + 1}: ${p.title || 'Untitled Page'}\n`;
    text += `URL: ${p.url}\n`;
    text += `DATA: ${chars.toLocaleString()} characters · ~${words.toLocaleString()} words\n`;
    text += `================================================================================\n\n`;
    text += `${p.content}\n\n`;
  });

  return {
    content: text.trim(),
    title: siteTitle,
  };
}

/**
 * Parses individual scraped page details (URL, title, data size, and page content)
 * from aggregated website content.
 */
export function extractScrapedPages(content: string, fallbackUrl = ''): ScrapedPageDetail[] {
  const pages: ScrapedPageDetail[] = [];
  
  // Match header block:
  // ================================================================================
  // PAGE 1: Port Home
  // URL: https://port.gov
  // (optional DATA: ...)
  // ================================================================================
  const pageRegex = /={50,}\s*\nPAGE\s*(\d+):\s*([^\n]+)\s*\nURL:\s*([^\n]+)(?:\s*\nDATA:\s*[^\n]+)?\s*\n={50,}/gi;
  
  const matches: { index: number; length: number; pageNum: number; title: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pageRegex.exec(content)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      pageNum: parseInt(m[1], 10),
      title: m[2].trim(),
      url: m[3].trim(),
    });
  }

  if (matches.length === 0) {
    const trimmed = content.trim();
    if (!trimmed) return [];
    const words = trimmed.split(/\s+/).length;
    return [{
      pageNumber: 1,
      title: fallbackUrl ? fallbackUrl.replace(/^https?:\/\//i, '') : 'Page 1',
      url: fallbackUrl || '',
      charCount: trimmed.length,
      wordCount: words,
      content: trimmed,
    }];
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const contentStart = cur.index + cur.length;
    const contentEnd = (i + 1 < matches.length) ? matches[i + 1].index : content.length;
    const pageText = content.slice(contentStart, contentEnd).trim();
    const wordCount = pageText ? pageText.split(/\s+/).length : 0;

    pages.push({
      pageNumber: cur.pageNum,
      title: cur.title,
      url: cur.url,
      charCount: pageText.length,
      wordCount,
      content: pageText,
    });
  }

  return pages;
}

/**
 * Extracts relevant page sections or full content from aggregated website data
 * to supply the AI prompt with the most relevant information matching the question.
 */
export function extractRelevantWebsiteSnippets(
  content: string,
  query: string,
  maxChars = 8000
): string {
  if (!content) return '';
  if (content.length <= maxChars) return content;

  const pageDelimiter = /={20,}\nPAGE \d+:/;
  if (!pageDelimiter.test(content)) {
    return content.substring(0, maxChars) + '...';
  }

  const parts = content.split(/={20,}\n/);
  const overview = parts[0] || '';
  const pageBlocks = parts.slice(1);

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (keywords.length === 0) {
    return content.substring(0, maxChars) + '...';
  }

  const scoredPages = pageBlocks.map((block) => {
    const lower = block.toLowerCase();
    let score = 0;
    keywords.forEach((kw) => {
      let pos = 0;
      while ((pos = lower.indexOf(kw, pos)) !== -1) {
        score++;
        pos += kw.length;
      }
    });
    return { block, score };
  });

  const matching = scoredPages.filter((p) => p.score > 0);
  const pagesToInclude = matching.length > 0 ? matching : scoredPages;

  let assembled = overview.trim() + '\n\n';
  for (const item of pagesToInclude) {
    const addition = '========================================\n' + item.block.trim() + '\n\n';
    if (assembled.length + addition.length > maxChars) {
      if (assembled.length < maxChars) {
        assembled +=
          addition.substring(0, maxChars - assembled.length) +
          '\n... [Remaining subpages truncated]';
      }
      break;
    }
    assembled += addition;
  }

  return assembled.trim();
}
