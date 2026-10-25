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

export const COMMON_SPA_PROBE_PATHS = [
  '/faq',
  '/cancellation-policy',
  '/alert-announcements',
  '/circular-announcements',
  '/about',
  '/about-us',
  '/about-lakshadweep',
  '/about-irctc',
  '/terms',
  '/terms-conditions',
  '/privacy',
  '/privacy-policy',
  '/contact',
  '/contact-us',
  '/help',
  '/support',
  '/help-support',
  '/boarding-steps',
  '/schedule',
  '/booking',
  '/services',
  '/gallery',
];

/**
 * Extracts links pointing to pages under the same website / domain.
 * Supports standard <a> tags, <link> tags, routerLink/data-href attributes,
 * and client-side route paths inside scripts.
 * Filters out external domains, fragments, tracking params, and non-HTML assets.
 */
export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return [];
  }

  const considerHref = (rawHref: string) => {
    const trimmed = (rawHref || '').trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('javascript:') ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:')
    ) {
      return;
    }

    try {
      const resolved = new URL(trimmed, baseUrl);

      // Only HTTP or HTTPS
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return;
      }

      // Must be same hostname (same website)
      if (resolved.hostname.toLowerCase() !== parsedBase.hostname.toLowerCase()) {
        return;
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
        return;
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
  };

  // 1. Standard <a> tags
  const aRegex = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = aRegex.exec(html)) !== null) {
    considerHref(match[1] || match[2] || match[3]);
  }

  // 2. Canonical and alternate <link> tags
  const linkRegex = /<link\b[^>]*?\brel\s*=\s*["'](?:canonical|alternate)["'][^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    considerHref(match[1] || match[2]);
  }

  // 3. SPA router attributes: routerLink, data-href, data-url, to
  const spaAttrRegex = /\b(?:routerLink|data-href|data-url|to)\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  while ((match = spaAttrRegex.exec(html)) !== null) {
    considerHref(match[1] || match[2]);
  }

  // 4. Quoted route paths inside scripts or attributes like "/faq", "/about", etc.
  const pathRegex = /["'`]((\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+))["'`]/g;
  while ((match = pathRegex.exec(html)) !== null) {
    const p = match[1];
    if (
      p.length > 2 &&
      p.length < 50 &&
      !p.startsWith('/_next') &&
      !p.startsWith('/static') &&
      !p.startsWith('/node_modules') &&
      !p.includes('.') &&
      !p.includes('(')
    ) {
      considerHref(p);
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
 * Preserves paragraphs, line breaks, bullet lists, tables, image descriptions,
 * meta descriptions, and JSON-LD structured data.
 */
export function extractTextFromHtml(html: string): string {
  // Capture meta description for SPAs with minimal static HTML
  let metaDesc = '';
  const metaMatch = html.match(
    /<meta\b[^>]*?\b(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*?\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i
  );
  if (metaMatch && metaMatch[1]) {
    metaDesc = metaMatch[1].trim();
  }

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
  const cleaned = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .trim();

  if (cleaned.length < 30 && metaDesc.length > 0) {
    return cleaned ? `${cleaned}\n\n${metaDesc}` : metaDesc;
  }

  return cleaned;
}

/**
 * Extracts rich pages embedded in modern SPA bundles (Turbopack, Next.js, i18n dictionaries, and live API endpoints).
 * Allows full page-by-page extraction of client-side rendered portals like lakshadweep.irctc.co.in.
 */
export async function extractSpaPages(
  html: string,
  rootUrl: string,
  fetchFn: (url: string) => Promise<string>
): Promise<ScrapedPage[]> {
  const pages: ScrapedPage[] = [];

  let rootHost = '';
  try {
    rootHost = new URL(rootUrl).hostname.toLowerCase();
  } catch {
    return [];
  }

  // 1. Discover script tags on the same domain
  const scriptRegex = /<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  const scriptUrls: string[] = [];

  while ((m = scriptRegex.exec(html)) !== null) {
    let sUrl = m[1].trim();
    if (sUrl.startsWith('//')) sUrl = 'https:' + sUrl;
    else if (sUrl.startsWith('/')) {
      try {
        sUrl = new URL(sUrl, rootUrl).toString();
      } catch {}
    }
    try {
      const parsed = new URL(sUrl);
      if (parsed.hostname.toLowerCase() === rootHost && !scriptUrls.includes(sUrl)) {
        scriptUrls.push(sUrl);
      }
    } catch {}
  }

  // 2. Scan scripts for client dictionaries (e.g. Next.js Turbopack JSON.parse('{"en":{...}}') or i18n JSON)
  let dictData: any = null;
  for (const sUrl of scriptUrls) {
    try {
      const code = await fetchFn(sUrl);
      if (!code) continue;

      const marker = "JSON.parse('";
      let startIdx = 0;
      while ((startIdx = code.indexOf(marker, startIdx)) !== -1) {
        const strStart = startIdx + marker.length;
        const endIdx = code.indexOf("')", strStart);
        if (endIdx > strStart) {
          try {
            const rawLiteral = code.slice(strStart, endIdx);
            // evaluate escaped string literal
            // eslint-disable-next-line no-eval
            const jsonStr = eval("'" + rawLiteral + "'");
            const parsed = JSON.parse(jsonStr);
            if (parsed && (parsed.en || parsed.aboutLakshadweep || parsed.faq || parsed.cancellationPolicy)) {
              dictData = parsed;
              break;
            }
          } catch {}
        }
        startIdx = strStart + 1;
      }
      if (dictData) break;
    } catch {}
  }

  // 3. Check for live schedule/announcement APIs (e.g. /api/v1/alert)
  try {
    const alertUrl = new URL('/api/v1/alert', rootUrl).toString();
    const alertRaw = await fetchFn(alertUrl);
    if (alertRaw) {
      try {
        const alertJson = JSON.parse(alertRaw);
        const list = alertJson?.data?.alertList;
        if (Array.isArray(list) && list.length > 0) {
          let alertContent = 'LAKSHADWEEP VOYAGE ALERTS & NOTICES\n\n';
          list.forEach((item: any, i: number) => {
            const title = (item.title || 'Notice').trim();
            const desc = (item.description || '').trim();
            alertContent += `========================================\n`;
            alertContent += `Notice ${i + 1}: ${title}\n`;
            if (desc) alertContent += `Details:\n${desc}\n`;
            alertContent += `\n`;
          });
          pages.push({
            url: new URL('/alert-announcements', rootUrl).toString(),
            title: 'Alerts & Voyage Announcements',
            content: alertContent.trim(),
            depth: 1,
          });
        }
      } catch {}
    }
  } catch {}

  if (dictData) {
    const dict = dictData.en || dictData;

    // Home / Overview Page
    let homeText = `${extractTitle(html) || 'Lakshadweep Tourism - Official Portal'}\n\n`;
    if (dict.hero) {
      if (dict.hero.title) homeText += `${dict.hero.title}\n`;
      if (dict.hero.subtitle) homeText += `${dict.hero.subtitle}\n\n`;
    }
    if (dict.about) {
      for (const v of Object.values(dict.about)) {
        if (typeof v === 'string') homeText += `${v}\n\n`;
      }
    }
    if (dict.bookingSteps) {
      homeText += 'BOOKING PROCESS:\n';
      for (const [k, v] of Object.entries(dict.bookingSteps)) {
        if (typeof v === 'string') homeText += `• ${v}\n`;
      }
      homeText += '\n';
    }
    pages.push({
      url: rootUrl,
      title: 'Lakshadweep Tourism - Official Portal',
      content: homeText.trim(),
      depth: 0,
    });

    // FAQ Page
    if (dict.faq || dict.faqItems) {
      let faqText = 'FREQUENTLY ASKED QUESTIONS & ANSWERS\n\n';
      const catLabels: Record<string, string> = dict.faq?.categories || {};
      if (Array.isArray(dict.faq?.questions)) {
        let currentCat = '';
        for (const item of dict.faq.questions) {
          const cat = item.category || 'General';
          if (cat !== currentCat) {
            currentCat = cat;
            const heading = catLabels[cat] || cat.toUpperCase();
            faqText += `\n=== CATEGORY: ${heading} ===\n\n`;
          }
          faqText += `Q: ${item.question}\n`;
          if (Array.isArray(item.answer)) {
            faqText += `A:\n${item.answer.map((a: string) => `  • ${a}`).join('\n')}\n\n`;
          } else if (item.answer) {
            faqText += `A: ${item.answer}\n\n`;
          } else {
            faqText += `\n`;
          }
        }
      }
      pages.push({
        url: new URL('/faq', rootUrl).toString(),
        title: 'Frequently Asked Questions (FAQ)',
        content: faqText.trim(),
        depth: 1,
      });
    }

    // Cancellation Policy Page
    if (dict.cancellationPolicy) {
      let cpText = 'CANCELLATION & REFUND POLICY\n\n';
      for (const [k, v] of Object.entries(dict.cancellationPolicy)) {
        if (typeof v === 'string') {
          const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          cpText += `${label}: ${v}\n`;
        }
      }
      pages.push({
        url: new URL('/cancellation-policy', rootUrl).toString(),
        title: 'Cancellation and Refund Policy',
        content: cpText.trim(),
        depth: 1,
      });
    }

    // Terms and Conditions Page
    if (dict.termsConditions) {
      let tcText = 'TERMS & CONDITIONS\n\n';
      for (const [k, v] of Object.entries(dict.termsConditions)) {
        if (typeof v === 'string') {
          const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          tcText += `${label}: ${v}\n`;
        }
      }
      pages.push({
        url: new URL('/terms-conditions', rootUrl).toString(),
        title: 'Terms and Conditions',
        content: tcText.trim(),
        depth: 1,
      });
    }

    // About Lakshadweep Islands Page
    if (dict.aboutLakshadweep) {
      let alText = 'ABOUT LAKSHADWEEP ISLANDS\n\n';
      for (const [k, v] of Object.entries(dict.aboutLakshadweep)) {
        if (typeof v === 'string') {
          const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          alText += `${label}: ${v}\n`;
        }
      }
      pages.push({
        url: new URL('/about-lakshadweep', rootUrl).toString(),
        title: 'About Lakshadweep Islands & Ports',
        content: alText.trim(),
        depth: 1,
      });
    }

    // Boarding Steps Page
    if (dict.boardingSteps) {
      let bsText = 'PASSENGER BOARDING & WEB CHECK-IN GUIDELINES\n\n';
      for (const [k, v] of Object.entries(dict.boardingSteps)) {
        if (typeof v === 'string') {
          const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          bsText += `${label}: ${v}\n`;
        }
      }
      pages.push({
        url: new URL('/boarding-steps', rootUrl).toString(),
        title: 'Passenger Boarding & Web Check-in Guidelines',
        content: bsText.trim(),
        depth: 1,
      });
    }

    // Help & Support Page
    if (dict.helpSupport) {
      let hsText = 'HELP & CUSTOMER SUPPORT\n\n';
      for (const [k, v] of Object.entries(dict.helpSupport)) {
        if (typeof v === 'string') {
          const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          hsText += `${label}: ${v}\n`;
        }
      }
      pages.push({
        url: new URL('/help-support', rootUrl).toString(),
        title: 'Help & Customer Support',
        content: hsText.trim(),
        depth: 1,
      });
    }

    // About IRCTC Page
    if (dict.aboutIrctc) {
      let aiText = 'ABOUT IRCTC\n\n';
      for (const [k, v] of Object.entries(dict.aboutIrctc)) {
        if (typeof v === 'string') {
          const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          aiText += `${label}: ${v}\n`;
        }
      }
      pages.push({
        url: new URL('/about-irctc', rootUrl).toString(),
        title: 'About IRCTC Enterprise',
        content: aiText.trim(),
        depth: 1,
      });
    }

    // Announcements Page
    if (dict.announcements) {
      let annText = 'LAKSHADWEEP TOURISM ANNOUNCEMENTS\n\n';
      for (const [k, v] of Object.entries(dict.announcements)) {
        if (typeof v === 'string') {
          const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          annText += `${label}: ${v}\n`;
        }
      }
      pages.push({
        url: new URL('/announcements', rootUrl).toString(),
        title: 'Official Announcements',
        content: annText.trim(),
        depth: 1,
      });
    }
  }

  return pages;
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
