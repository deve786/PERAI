/**
 * Data Sources management screen - Documents, Websites, Telegram.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/expense/theme';
import { Button, Card, Field, ListCard, ListRow, Row, Screen, T, TopBar } from '@/expense/ui';
import { showDialog } from '@/dialogStore';
import { listDocuments, deleteDocument, pickAndProcessDocument, getTotalDocumentChunks, getDocumentChunks, clearAllDocuments, cleanupEmptyDocuments, type Document } from '@/sources/documents';
import { listWebsites, addWebsite, deleteWebsite, refreshWebsite, parseTelegramChannel, clearAllWebsites, type WebsiteData } from '@/sources/websites';
import { extractScrapedPages, type ScrapedPageDetail } from '@/sources/websiteLogic';
import { listTelegramChannels, addTelegramChannel, deleteTelegramChannel, syncTelegramChannel, getTelegramMessageCount, getChannelMessageCounts, getChannelMessageCount, getChannelMessages, getAllChannelMediaStats, getChannelMediaStats, clearAllTelegramData, ocrMessagePhoto, ocrUnextractedPhotosForChannel, downloadAndExtractTelegramFileViaBridge, extractUnextractedDocumentsForChannel, type TelegramChannel, type ChannelMediaStats } from '@/sources/telegram';
import { getSourcesDb } from '@/sources/client';
import { syncSourcesNow } from '@/sources/sync';
import { getSetting, setSetting } from '@/db/queries';
import { getTelegramAutoSyncInterval, setTelegramAutoSyncInterval, getTelegramBridgeUrl, setTelegramBridgeUrl, DEFAULT_TELEGRAM_BRIDGE_URL } from '@/settings';
import { onTelegramAutoSynced } from '@/sources/telegramAutoSync';
import { shortDate, timeLabel } from '@/format';
import { radius } from '@/expense/theme';

type Tab = 'documents' | 'websites' | 'telegram';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Never';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

function parseTelegramPhotoMessage(text?: string | null): { caption: string; ocrText: string | null; photoUrl: string | null } {
  if (!text) return { caption: '', ocrText: null, photoUrl: null };

  let photoUrl: string | null = null;
  const photoMatch = text.match(/\[Photo:\s*([^\]]+)\]/i);
  if (photoMatch) {
    photoUrl = photoMatch[1].trim();
  }

  let ocrText: string | null = null;
  const ocrMatch = text.match(/\[(?:Extracted Poster\/Image Text|Extracted Poster|Image OCR Content)[^\]]*\]:\s*([\s\S]*?)(?=(?:\n\s*\[(?:Photo|Document|Video):)|$)/i);
  if (ocrMatch && ocrMatch[1].trim()) {
    ocrText = ocrMatch[1].trim();
  }

  const caption = text
    .replace(/\[(?:Extracted Poster\/Image Text|Extracted Poster|Image OCR Content)[^\]]*\]:[\s\S]*?(?=(?:\n\s*\[(?:Photo|Document|Video):)|$)/gi, '')
    .replace(/\[Photo:[^\]]*\]/gi, '')
    .trim();

  return { caption, ocrText, photoUrl };
}

function parseTelegramDocMessage(text?: string | null): { caption: string; docText: string | null; docPath: string | null; docLink: string | null; isExtracted: boolean } {
  if (!text) return { caption: '', docText: null, docPath: null, docLink: null, isExtracted: false };

  let docPath: string | null = null;
  const docMatch = text.match(/\[Document:\s*([^\]]+)\]/i);
  if (docMatch) {
    docPath = docMatch[1].trim();
  }

  let docLink: string | null = null;
  const linkMatch = text.match(/\[Document Link:\s*([^\]]+)\]/i);
  if (linkMatch) {
    docLink = linkMatch[1].trim();
  }

  let docText: string | null = null;
  const docTextMatch = text.match(/\[(?:Extracted Document|Attached Cargo\/Document Content|Attached Cargo\/Document Details|Attached Document|Attached Cargo)[^\]]*\]:\s*([\s\S]*?)(?=(?:\n\s*\[(?:Photo|Document|Document Link|Video):)|$)/i);
  if (docTextMatch && docTextMatch[1].trim()) {
    docText = docTextMatch[1].trim();
  }

  const isExtracted = /\[Extracted Document/i.test(text);

  const caption = text
    .replace(/\[(?:Extracted Document|Attached Cargo\/Document Content|Attached Cargo\/Document Details|Attached Document|Attached Cargo)[^\]]*\]:[\s\S]*?(?=(?:\n\s*\[(?:Photo|Document|Document Link|Video):)|$)/gi, '')
    .replace(/\[Document:[^\]]*\]/gi, '')
    .replace(/\[Document Link:[^\]]*\]/gi, '')
    .trim();

  return { caption, docText, docPath, docLink, isExtracted };
}

export default function DataSourcesScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('documents');

  const [documents, setDocuments] = useState<Document[]>([]);
  const [websites, setWebsites] = useState<WebsiteData[]>([]);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [telegramCount, setTelegramCount] = useState(0);
  const [totalDocChunks, setTotalDocChunks] = useState(0);
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});
  const [channelMediaStatsMap, setChannelMediaStatsMap] = useState<Record<string, ChannelMediaStats>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [addingWebsite, setAddingWebsite] = useState(false);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [addingTelegram, setAddingTelegram] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [refreshingSiteId, setRefreshingSiteId] = useState<string | null>(null);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [channelUsername, setChannelUsername] = useState('');
  const [autoSyncInterval, setAutoSyncIntervalState] = useState(5);
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [testingBridge, setTestingBridge] = useState(false);
  const [extractingAllDocs, setExtractingAllDocs] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [docs, sites, chans, token, count, chunks, chCounts, mediaStats, lastSync, interval, savedBridgeUrl] = await Promise.all([
        listDocuments(),
        listWebsites(),
        listTelegramChannels(),
        getSetting('telegram_bot_token'),
        getTelegramMessageCount(),
        getTotalDocumentChunks(),
        getChannelMessageCounts(),
        getAllChannelMediaStats(),
        getSetting('sources_last_synced_at'),
        getTelegramAutoSyncInterval(),
        getTelegramBridgeUrl(),
      ]);
      setDocuments(docs);
      setWebsites(sites);
      setChannels(chans);
      setBotToken(token || '');
      setTelegramCount(count);
      setTotalDocChunks(chunks);
      setChannelCounts(chCounts);
      setChannelMediaStatsMap(mediaStats);
      setAutoSyncIntervalState(interval);
      setBridgeUrl(savedBridgeUrl || DEFAULT_TELEGRAM_BRIDGE_URL);

      const latestItemSync = [
        ...docs.map(d => d.uploadedAt),
        ...sites.map(s => s.lastUpdated),
        ...chans.map(c => c.lastSyncedAt).filter((x): x is string => !!x),
      ].sort().reverse()[0] || null;

      setLastSyncedAt(lastSync || latestItemSync);
    } catch (err) {
      console.warn('Failed to load data sources:', err);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  React.useEffect(() => {
    return onTelegramAutoSynced(() => {
      void loadData();
    });
  }, [loadData]);

  async function changeAutoSyncInterval(mins: number) {
    setAutoSyncIntervalState(mins);
    await setTelegramAutoSyncInterval(mins);
  }

  async function uploadDocument() {
    setUploadingDoc(true);
    try {
      const doc = await pickAndProcessDocument();
      await loadData();
      void syncSourcesNow();
      const now = new Date().toISOString();
      await setSetting('sources_last_synced_at', now);
      setLastSyncedAt(now);
      showDialog({
        title: 'Document Saved in DB',
        message: `${doc.filename}\n\n✓ Synced on ${formatDateTime(doc.uploadedAt)}:\n• ${doc.chunkCount} search chunks indexed\n• ${(doc.fileSize / 1024).toFixed(0)} KB stored\n\nContent is ready and searchable in the Ask tab.`,
      });
    } catch (err) {
      if (err instanceof Error && err.message !== 'Document selection cancelled') {
        showDialog({ title: 'Upload failed', message: err.message });
      }
    } finally {
      setUploadingDoc(false);
    }
  }

  async function addWebsiteUrl() {
    const url = websiteUrl.trim();
    if (!url || savingWebsite) return;

    setSavingWebsite(true);
    setScrapeProgress('Discovering pages...');
    try {
      const site = await addWebsite(url, (p) => {
        setScrapeProgress(
          p.totalFound > 1
            ? `Scraping page ${p.current} of ${p.totalFound}...`
            : 'Scraping webpage...'
        );
      });
      setWebsiteUrl('');
      setAddingWebsite(false);
      setTab('websites');
      await loadData();
      await syncSourcesNow();
      const now = new Date().toISOString();
      await setSetting('sources_last_synced_at', now);
      setLastSyncedAt(now);

      const pageList = site.pages && site.pages.length > 0
        ? site.pages
        : extractScrapedPages(site.content, site.url);

      const charCount = site.content.length;
      const wordCount = site.content.trim() ? site.content.trim().split(/\s+/).length : 0;
      const isTg = !!parseTelegramChannel(url);

      if (isTg) {
        showDialog({
          title: 'Telegram Channel Saved in DB',
          message: `${site.title || site.url}\n\n✓ Scraped & synced on ${formatDateTime(site.lastUpdated)}:\n• ${charCount.toLocaleString()} characters extracted\n• ~${wordCount.toLocaleString()} words indexed\n• Messages, photos, & documents saved\n\nSearchable in Ask tab.`,
        });
      } else {
        const pageLines = pageList.map((p, idx) =>
          `• Page ${idx + 1}: ${p.url}\n  ${p.title ? `"${p.title}"\n  ` : ''}${p.charCount.toLocaleString()} chars (~${p.wordCount.toLocaleString()} words)`
        ).join('\n\n');

        showDialog({
          title: `Website Added: ${pageList.length} Page${pageList.length === 1 ? '' : 's'} Scraped`,
          message: `${site.title || site.url}\n\n✓ Scraped all pages on ${formatDateTime(site.lastUpdated)}:\nTotal: ${charCount.toLocaleString()} characters (~${wordCount.toLocaleString()} words)\n\nPages Scraped:\n${pageLines}\n\nAll page data is stored in your database and ready for search.`,
        });
      }
    } catch (err) {
      showDialog({ title: 'Failed to add website', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingWebsite(false);
      setScrapeProgress('');
    }
  }

  async function addTelegramChannelAction() {
    const token = botToken.trim();
    const username = channelUsername.trim();

    if (!username || savingTelegram) {
      showDialog({ title: 'Missing information', message: 'Please provide a channel username or link (e.g. @lakport or https://t.me/lakport).' });
      return;
    }

    if (!token && username.replace(/^@/, '').toLowerCase().endsWith('_bot')) {
      showDialog({
        title: 'Bot Handle Detected',
        message: `"${username}" ends in _bot. In Telegram, bot handles cannot be scraped as public channels.\n\n• For public channels (like @lakport), enter the channel name without _bot.\n• If this is your custom bot, please enter the Bot Token from @BotFather in the field below.`,
      });
      return;
    }

    setSavingTelegram(true);
    try {
      if (token) {
        await setSetting('telegram_bot_token', token);
      }
      const res = await addTelegramChannel(token, username);
      setChannelUsername('');
      setAddingTelegram(false);
      await loadData();
      void syncSourcesNow();
      const now = new Date().toISOString();
      await setSetting('sources_last_synced_at', now);
      setLastSyncedAt(now);
      showDialog({
        title: 'Telegram Channel Saved in DB',
        message: `${res.channelName || username}\n\n✓ Synced on ${formatDateTime(now)}:\n• ${res.messagesSaved ?? 0} messages stored\n• Photos, documents, & post history indexed\n\nMessages are now searchable in the Ask tab.`,
      });
    } catch (err) {
      showDialog({ title: 'Failed to add channel', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingTelegram(false);
    }
  }

  async function removeDocument(id: string) {
    try {
      await deleteDocument(id);
      await loadData();
      await syncSourcesNow();
    } catch (err) {
      showDialog({ title: 'Delete failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function confirmDeleteDocument(doc: Document) {
    showDialog({
      title: 'Delete Document?',
      message: `Remove "${doc.filename}" and its ${doc.chunkCount} search chunks from your database? This cannot be undone.`,
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Delete',
          destructive: true,
          onPress: () => {
            void removeDocument(doc.id);
          },
        },
      ],
    });
  }

  async function removeWebsite(id: string) {
    try {
      await deleteWebsite(id);
      await loadData();
      void syncSourcesNow();
    } catch (err) {
      showDialog({ title: 'Delete failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function confirmDeleteWebsite(site: WebsiteData) {
    showDialog({
      title: 'Delete Website?',
      message: `Remove "${site.title || site.url}" and all its scraped pages from your database?`,
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Delete',
          destructive: true,
          onPress: () => {
            void removeWebsite(site.id);
          },
        },
      ],
    });
  }

  async function removeChannel(id: string) {
    try {
      await deleteTelegramChannel(id);
      await loadData();
      void syncSourcesNow();
    } catch (err) {
      showDialog({ title: 'Delete failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function confirmDeleteChannel(ch: TelegramChannel) {
    showDialog({
      title: 'Delete Telegram Channel?',
      message: `Remove "${ch.channelName || ch.channelUsername}" and all its saved messages from your database?`,
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Delete',
          destructive: true,
          onPress: () => {
            void removeChannel(ch.id);
          },
        },
      ],
    });
  }

  async function refreshWebsiteData(id: string) {
    if (refreshingSiteId) return;
    setRefreshingSiteId(id);
    try {
      const updated = await refreshWebsite(id);
      await loadData();
      void syncSourcesNow();
      const now = new Date().toISOString();
      await setSetting('sources_last_synced_at', now);
      setLastSyncedAt(now);
      const charCount = updated.content.length;
      const wordCount = updated.content.trim() ? updated.content.trim().split(/\s+/).length : 0;
      showDialog({
        title: 'Website Refreshed & Saved',
        message: `${updated.title || updated.url}\n\n✓ Synced on ${formatDateTime(updated.lastUpdated)}:\n• ${charCount.toLocaleString()} characters saved\n• ~${wordCount.toLocaleString()} words indexed\n\nLatest content is now indexed in the Ask tab.`,
      });
    } catch (err) {
      showDialog({ title: 'Refresh failed', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefreshingSiteId(null);
    }
  }

  async function syncChannel(id: string) {
    if (syncingChannelId) return;
    setSyncingChannelId(id);
    try {
      const count = await syncTelegramChannel(botToken, id);
      await loadData();
      void syncSourcesNow();
      const now = new Date().toISOString();
      await setSetting('sources_last_synced_at', now);
      setLastSyncedAt(now);
      const ch = channels.find(c => c.id === id);
      const total = await getChannelMessageCount(ch?.channelUsername || '', id);
      showDialog({
        title: count > 0 ? 'New Telegram Messages Saved' : 'Telegram Up To Date',
        message: count > 0
          ? `✓ Incremental sync: retrieved ${count} new message${count === 1 ? '' : 's'} on ${formatDateTime(now)}.\n(Only new data fetched, saving time & bandwidth).\nTotal stored for this channel: ${total} messages.`
          : `Already up to date as of ${formatDateTime(now)}.\nChecked in ~0.2s — no new messages found.\nTotal stored in database: ${total} messages.`,
      });
    } catch (err) {
      showDialog({ title: 'Sync failed', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncingChannelId(null);
    }
  }

  async function refreshAll() {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      for (const site of websites) {
        try {
          await refreshWebsite(site.id);
        } catch (e) {
          console.warn('Failed to refresh site:', site.url, e);
        }
      }
      for (const ch of channels) {
        try {
          await syncTelegramChannel(botToken, ch.id);
        } catch (e) {
          console.warn('Failed to sync channel:', ch.channelUsername, e);
        }
      }
      await loadData();
      void syncSourcesNow();
      const now = new Date().toISOString();
      await setSetting('sources_last_synced_at', now);
      setLastSyncedAt(now);

      const totalChars = websites.reduce((acc, s) => acc + s.content.length, 0);
      showDialog({
        title: 'All Data Sources Refreshed',
        message: `✓ Local database synced on ${formatDateTime(now)}:\n\n• Documents: ${documents.length} (${totalDocChunks} chunks saved)\n• Websites: ${websites.length} (${(totalChars / 1024).toFixed(1)} KB text saved)\n• Telegram: ${channels.length} channels (${telegramCount} messages saved)\n\nAll content is in the database and searchable in the Ask tab.`,
      });
    } catch (err) {
      showDialog({ title: 'Refresh error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefreshingAll(false);
    }
  }

  function confirmClearDocuments() {
    showDialog({
      title: 'Clear All Documents?',
      message: 'This will remove all uploaded documents and their indexed search chunks from your local database. This cannot be undone.',
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Clear All',
          destructive: true,
          onPress: () => {
            void (async () => {
              setClearing(true);
              try {
                const count = await clearAllDocuments();
                await loadData();
                await syncSourcesNow();
                showDialog({
                  title: 'Documents Cleared',
                  message: `Successfully removed ${count} document${count === 1 ? '' : 's'} and all associated search chunks from local storage and cloud.`,
                });
              } catch (err) {
                showDialog({ title: 'Error', message: err instanceof Error ? err.message : String(err) });
              } finally {
                setClearing(false);
              }
            })();
          },
        },
      ],
    });
  }

  function confirmClearWebsites() {
    showDialog({
      title: 'Clear All Websites?',
      message: 'This will remove all saved websites and their scraped content from your local database. This cannot be undone.',
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Clear All',
          destructive: true,
          onPress: () => {
            void (async () => {
              setClearing(true);
              try {
                const count = await clearAllWebsites();
                await loadData();
                void syncSourcesNow();
                showDialog({
                  title: 'Websites Cleared',
                  message: `Successfully removed ${count} website${count === 1 ? '' : 's'} from the database.`,
                });
              } catch (err) {
                showDialog({ title: 'Error', message: err instanceof Error ? err.message : String(err) });
              } finally {
                setClearing(false);
              }
            })();
          },
        },
      ],
    });
  }

  function confirmClearTelegram() {
    showDialog({
      title: 'Clear All Telegram Data?',
      message: 'This will remove all Telegram channels and delete all saved messages and media from your local database. This cannot be undone.',
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Clear All',
          destructive: true,
          onPress: () => {
            void (async () => {
              setClearing(true);
              try {
                await clearAllTelegramData();
                await loadData();
                void syncSourcesNow();
                showDialog({
                  title: 'Telegram Cleared',
                  message: 'Successfully removed all Telegram channels and saved messages from the database.',
                });
              } catch (err) {
                showDialog({ title: 'Error', message: err instanceof Error ? err.message : String(err) });
              } finally {
                setClearing(false);
              }
            })();
          },
        },
      ],
    });
  }

  const [previewItem, setPreviewItem] = useState<{
    id?: string;
    type?: 'document' | 'website' | 'telegram';
    title: string;
    subtitle: string;
    content: string;
    meta: string;
    websitePages?: ScrapedPageDetail[];
    telegramMessages?: import('@/sources/telegram').TelegramMessage[];
    telegramStats?: ChannelMediaStats;
  } | null>(null);
  const [tgFilter, setTgFilter] = useState<'all' | 'photo' | 'document' | 'text'>('all');
  const [extractingMsgId, setExtractingMsgId] = useState<string | null>(null);
  const [extractingAll, setExtractingAll] = useState(false);
  const [ocrProgressText, setOcrProgressText] = useState<string | null>(null);

  async function handleOcrPhoto(m: import('@/sources/telegram').TelegramMessage, photoUrlOverride?: string) {
    if (extractingMsgId) return;
    const parsed = parseTelegramPhotoMessage(m.messageText);
    const photoUrl = photoUrlOverride || parsed.photoUrl || (m.mediaPath ? m.mediaPath.split('; ')[0].trim() : null);
    if (!photoUrl) {
      showDialog({ title: 'Photo URL Missing', message: 'Could not find a direct photo URL for this message.' });
      return;
    }
    setExtractingMsgId(m.id);
    try {
      const text = await ocrMessagePhoto(m.id, photoUrl);
      if (text) {
        setPreviewItem(prev => {
          if (!prev || !prev.telegramMessages) return prev;
          const updated = prev.telegramMessages.map(msg => {
            if (msg.id === m.id) {
              const cleaned = msg.messageText?.replace(/\[(?:Extracted Poster\/Image Text|Extracted Poster|Image OCR Content)[^\]]*\]:[\s\S]*?(?=\n+\[Photo:|$)/i, '').trim() || '';
              const newMsgText = cleaned
                ? `${cleaned}\n\n[Extracted Poster/Image Text]:\n${text}`
                : `[Extracted Poster/Image Text]:\n${text}`;
              return { ...msg, messageText: newMsgText };
            }
            return msg;
          });
          return { ...prev, telegramMessages: updated };
        });
        void loadData();
        showDialog({
          title: 'Schedule Extracted!',
          message: `Successfully extracted text and timetable from this photo using Gemini Vision.\n\nContent is now saved and searchable!`,
        });
      } else {
        showDialog({
          title: 'No Text Found',
          message: 'Gemini Vision scanned the photo but did not find any legible text or timetable. Check if the image contains clear text.',
        });
      }
    } catch (err) {
      showDialog({ title: 'OCR Failed', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setExtractingMsgId(null);
    }
  }

  async function handleOcrAllPhotos() {
    if (!previewItem || !previewItem.telegramMessages || extractingAll) return;
    const channelUsername = previewItem.subtitle || previewItem.title;
    setExtractingAll(true);
    setOcrProgressText(null);
    try {
      const extractedCount = await ocrUnextractedPhotosForChannel(channelUsername, previewItem.id, (done, total) => {
        setOcrProgressText(`${done}/${total}`);
      });
      const updatedMessages = await getChannelMessages(channelUsername, previewItem.id);
      setPreviewItem(prev => prev ? { ...prev, telegramMessages: updatedMessages } : null);
      void loadData();
      showDialog({
        title: 'Batch Extraction Finished',
        message: `Extracted text and schedules for ${extractedCount} photos with Gemini Vision.`,
      });
    } catch (e) {
      console.warn('Batch OCR error:', e);
      showDialog({ title: 'Batch Extraction Error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setExtractingAll(false);
      setOcrProgressText(null);
    }
  }

  async function testBridgeConnection() {
    const url = bridgeUrl.trim().replace(/\/$/, '');
    if (!url) {
      showDialog({
        title: 'Bridge URL Empty',
        message: 'Please enter your Telegram Media Bridge URL (e.g. https://my-bridge.onrender.com or http://10.0.2.2:8000).',
      });
      return;
    }
    setTestingBridge(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      showDialog({
        title: 'Bridge Connected ✓',
        message: `Successfully connected to Telegram Media Bridge!\n\n• Service: ${data.service || 'OK'}\n• Telegram Authorized: ${data.authenticated ? 'Yes ✓' : 'No (run python login.py)'}\n\nAttached PDFs will now be downloaded and parsed automatically with Gemini.`,
      });
    } catch (err) {
      showDialog({
        title: 'Bridge Connection Failed',
        message: `Could not reach ${url}/health.\n\nError: ${err instanceof Error ? err.message : String(err)}\n\nPlease ensure your bridge server is running and accessible.`,
      });
    } finally {
      setTestingBridge(false);
    }
  }

  async function handleExtractDoc(m: import('@/sources/telegram').TelegramMessage, channelUsername: string) {
    if (extractingMsgId) return;
    const cleanBridge = bridgeUrl.trim().replace(/\/$/, '');
    if (!cleanBridge) {
      showDialog({
        title: 'Bridge URL Required',
        message: 'Please configure your Telegram Media Bridge URL in the settings above to automatically download and extract attached documents.',
      });
      return;
    }
    const docParsed = parseTelegramDocMessage(m.messageText);
    const docName = docParsed.docPath || m.mediaPath || 'document.pdf';
    setExtractingMsgId(m.id);
    try {
      const text = await downloadAndExtractTelegramFileViaBridge(cleanBridge, channelUsername, m.messageId, docName);
      if (text) {
        const db = await getSourcesDb();
        const updatedText = m.messageText
          ? `${m.messageText}\n\n[Extracted Document: ${docName}]:\n${text}`
          : `[Extracted Document: ${docName}]:\n${text}`;
        await db.runAsync('UPDATE telegram_messages SET message_text = ? WHERE id = ?', [updatedText, m.id]);
        m.messageText = updatedText;
        setPreviewItem(prev => {
          if (!prev || !prev.telegramMessages) return prev;
          const updated = prev.telegramMessages.map(msg => msg.id === m.id ? { ...msg, messageText: updatedText } : msg);
          return { ...prev, telegramMessages: updated };
        });
        void loadData();
        showDialog({
          title: 'Document Content Extracted!',
          message: `Successfully extracted cargo tables and voyages from "${docName}" using Gemini!\n\nAll tables and schedules are now indexed and searchable.`,
        });
      } else {
        showDialog({
          title: 'Extraction Incomplete',
          message: 'The bridge connected, but Gemini could not parse structured text from this file. Check if the PDF contains legible text.',
        });
      }
    } catch (err) {
      showDialog({
        title: 'Document Extraction Error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExtractingMsgId(null);
    }
  }

  async function handleExtractAllDocs() {
    if (!previewItem || !previewItem.telegramMessages || extractingAllDocs) return;
    const cleanBridge = bridgeUrl.trim().replace(/\/$/, '');
    if (!cleanBridge) {
      showDialog({
        title: 'Bridge URL Required',
        message: 'Please configure your Telegram Media Bridge URL in the settings above to automatically download and extract attached documents.',
      });
      return;
    }
    const channelUsername = previewItem.subtitle || previewItem.title;
    setExtractingAllDocs(true);
    setOcrProgressText(null);
    try {
      const extractedCount = await extractUnextractedDocumentsForChannel(channelUsername, previewItem.id || '', (done, total) => {
        setOcrProgressText(`${done}/${total}`);
      });
      const updatedMessages = await getChannelMessages(channelUsername, previewItem.id);
      setPreviewItem(prev => prev ? { ...prev, telegramMessages: updatedMessages } : null);
      void loadData();
      showDialog({
        title: 'Batch Document Extraction Finished',
        message: `Extracted tables and cargo lists for ${extractedCount} document${extractedCount === 1 ? '' : 's'} with Gemini.`,
      });
    } catch (e) {
      showDialog({ title: 'Batch Extraction Error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setExtractingAllDocs(false);
      setOcrProgressText(null);
    }
  }

  async function viewDocument(doc: Document) {
    try {
      const chunks = await getDocumentChunks(doc.id);
      const content = chunks.length > 0
        ? chunks.map((c, i) => `=== Search Chunk ${i + 1} (Page ${c.pageNumber ?? 1}) ===\n${c.content}`).join('\n\n')
        : 'No text extracted.';
      setPreviewItem({
        id: doc.id,
        type: 'document',
        title: doc.filename,
        subtitle: `${doc.chunkCount} search chunks · ${(doc.fileSize / 1024).toFixed(0)} KB`,
        content,
        meta: `Saved to local DB · Synced ${formatDateTime(doc.uploadedAt)}`,
      });
    } catch {
      showDialog({ title: 'Error', message: 'Could not load document text.' });
    }
  }

  function viewWebsite(site: WebsiteData) {
    const pages = site.pages && site.pages.length > 0
      ? site.pages
      : extractScrapedPages(site.content, site.url);
    const words = site.content.trim() ? Math.round(site.content.trim().split(/\s+/).length) : 0;
    setPreviewItem({
      id: site.id,
      type: 'website',
      title: site.title || site.url,
      subtitle: site.url,
      content: site.content,
      meta: `${pages.length} page${pages.length === 1 ? '' : 's'} scraped · ${site.content.length.toLocaleString()} characters · ~${words.toLocaleString()} words · Synced ${formatDateTime(site.lastUpdated)}`,
      websitePages: pages,
    });
  }

  async function viewChannel(ch: TelegramChannel) {
    try {
      const msgs = await getChannelMessages(ch.channelUsername, ch.id, 100);
      const stats = await getChannelMediaStats(ch.channelUsername, ch.id);
      setTgFilter('all');
      const content = msgs.length > 0
        ? msgs.map((m) => `[${formatDateTime(m.messageDate)}] ${m.senderName || 'Channel'}:\n${m.messageText || '(Media message)'}`).join('\n\n')
        : 'No messages saved yet.';
      setPreviewItem({
        id: ch.id,
        type: 'telegram',
        title: ch.channelName || ch.channelUsername,
        subtitle: ch.channelUsername,
        content,
        meta: `${stats.total} saved · 📷 ${stats.photoCount} photos · 📄 ${stats.docCount} docs · Last synced ${ch.lastSyncedAt ? formatDateTime(ch.lastSyncedAt) : 'Never'}`,
        telegramMessages: msgs,
        telegramStats: stats,
      });
    } catch {
      showDialog({ title: 'Error', message: 'Could not load channel messages.' });
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'documents', label: 'Documents', count: documents.length },
    { key: 'websites', label: 'Websites', count: websites.length },
    { key: 'telegram', label: 'Telegram', count: channels.length },
  ];

  return (
    <Screen>
      <TopBar
        title="Data Sources"
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={() => void refreshAll()}
            hitSlop={10}
            disabled={refreshingAll}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            {refreshingAll ? (
              <ActivityIndicator size="small" color={c.accent} />
            ) : (
              <Ionicons name="refresh" size={20} color={c.text} />
            )}
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <T size={14} sub style={{ lineHeight: 20 }}>
          Upload documents, add websites, and connect Telegram channels. All data is saved into your database and searchable from the Ask tab.
        </T>

        {/* Database Storage Status Card */}
        <Card style={{ padding: 14, backgroundColor: `${c.accent}0d`, borderColor: `${c.accent}30`, gap: 8 }}>
          <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Row style={{ alignItems: 'center', gap: 6 }}>
              <Ionicons name="server-outline" size={16} color={c.accent} />
              <T size={13} weight="600" style={{ color: c.accent }}>Database Storage</T>
            </Row>
            <Pressable
              onPress={() => void refreshAll()}
              hitSlop={10}
              disabled={refreshingAll}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              {refreshingAll ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <>
                  <Ionicons name="refresh" size={13} color={c.accent} />
                  <T size={12} weight="600" style={{ color: c.accent }}>Refresh All</T>
                </>
              )}
            </Pressable>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
            <View>
              <T size={11} sub>DOCUMENTS</T>
              <T size={13} weight="600">{documents.length} ({totalDocChunks} chunks)</T>
            </View>
            <View>
              <T size={11} sub>WEBSITES</T>
              <T size={13} weight="600">{websites.length} ({(websites.reduce((a, s) => a + s.content.length, 0) / 1024).toFixed(1)} KB)</T>
            </View>
            <View>
              <T size={11} sub>TELEGRAM</T>
              <T size={13} weight="600">{channels.length} ({telegramCount} msgs)</T>
            </View>
          </Row>
          <Row style={{ alignItems: 'center', gap: 6, marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: `${c.accent}25` }}>
            <Ionicons name="time-outline" size={13} color={c.accent} />
            <T size={12} sub>
              Last Synced: <T size={12} weight="600" style={{ color: c.text }}>{formatDateTime(lastSyncedAt)}</T>
            </T>
          </Row>
        </Card>

        {/* Tab selector */}
        <Row style={{ gap: 8, marginVertical: 4 }}>
          {tabs.map(t => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: tab === t.key ? c.accent : c.border,
                backgroundColor: tab === t.key ? `${c.accent}14` : c.card,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <T size={14} weight="600" style={{ textAlign: 'center', color: tab === t.key ? c.accent : c.text }}>
                {t.label} ({t.count})
              </T>
            </Pressable>
          ))}
        </Row>

        {/* Documents Tab */}
        {tab === 'documents' && (
          <>
            {documents.length > 0 ? (
              <Row style={{ gap: 8 }}>
                <Button
                  title={uploadingDoc ? 'Uploading...' : 'Upload Document'}
                  icon="cloud-upload-outline"
                  onPress={() => void uploadDocument()}
                  disabled={uploadingDoc || clearing}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Clear All"
                  icon="trash-outline"
                  kind="danger"
                  onPress={confirmClearDocuments}
                  disabled={uploadingDoc || clearing}
                  style={{ flex: 1, borderWidth: 1, borderColor: `${c.danger}40`, backgroundColor: `${c.danger}10` }}
                />
              </Row>
            ) : (
              <Button
                title={uploadingDoc ? 'Uploading...' : 'Upload Document'}
                icon="cloud-upload-outline"
                onPress={() => void uploadDocument()}
                disabled={uploadingDoc || clearing}
              />
            )}

            {uploadingDoc && (
              <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: `${c.accent}12` }}>
                <ActivityIndicator size="small" color={c.accent} />
                <View style={{ flex: 1 }}>
                  <T size={14} weight="600">Processing document...</T>
                  <T size={12} sub>Reading text and creating search chunks</T>
                </View>
              </Card>
            )}

            {documents.length === 0 ? (
              <Card style={{ padding: 20, alignItems: 'center', gap: 8 }}>
                <Ionicons name="document-outline" size={48} color={c.faint} />
                <T size={15} sub style={{ textAlign: 'center' }}>
                  No documents uploaded yet. Supports PDF, DOCX, TXT, and images.
                </T>
              </Card>
            ) : (
              <ListCard>
                {documents.map((doc, i) => (
                  <View
                    key={doc.id}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 4,
                      borderBottomWidth: i === documents.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: c.line,
                    }}
                  >
                    <Row style={{ alignItems: 'center', gap: 12 }}>
                      <Ionicons name="document-text" size={20} color={c.accent} />
                      <Pressable
                        onPress={() => void viewDocument(doc)}
                        style={({ pressed }) => ({
                          flex: 1,
                          opacity: pressed ? 0.6 : 1,
                        })}
                      >
                        <T size={15} numberOfLines={1}>{doc.filename}</T>
                        <Row style={{ alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="checkmark-circle" size={13} color={c.good} />
                          <T size={12} style={{ color: c.good, fontWeight: '600' }}>
                            {doc.chunkCount} search chunks saved in DB
                          </T>
                        </Row>
                        <T size={11} sub style={{ marginTop: 1 }}>
                          {(doc.fileSize / 1024).toFixed(0)} KB · Synced {formatDateTime(doc.uploadedAt)} · Tap to view
                        </T>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeleteDocument(doc)}
                        hitSlop={12}
                        style={({ pressed }) => ({
                          padding: 8,
                          borderRadius: radius.sm,
                          opacity: pressed ? 0.5 : 1,
                        })}
                      >
                        <Ionicons name="trash-outline" size={18} color={c.danger} />
                      </Pressable>
                    </Row>
                  </View>
                ))}
              </ListCard>
            )}
          </>
        )}

        {/* Websites Tab */}
        {tab === 'websites' && (
          <>
            {!addingWebsite ? (
              websites.length > 0 ? (
                <Row style={{ gap: 8 }}>
                  <Button
                    title="Add Website"
                    icon="add"
                    onPress={() => setAddingWebsite(true)}
                    disabled={clearing}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Clear All"
                    icon="trash-outline"
                    kind="danger"
                    onPress={confirmClearWebsites}
                    disabled={clearing}
                    style={{ flex: 1, borderWidth: 1, borderColor: `${c.danger}40`, backgroundColor: `${c.danger}10` }}
                  />
                </Row>
              ) : (
                <Button title="Add Website" icon="add" onPress={() => setAddingWebsite(true)} disabled={clearing} />
              )
            ) : (
              <Card style={{ padding: 14, gap: 10 }}>
                <Field
                  value={websiteUrl}
                  onChangeText={setWebsiteUrl}
                  placeholder="https://example.com or https://t.me/channel"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  autoFocus
                  editable={!savingWebsite}
                  containerStyle={{ marginBottom: 0 }}
                />
                {savingWebsite && (
                  <Row style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <ActivityIndicator size="small" color={c.accent} />
                    <T size={13} sub numberOfLines={1}>{scrapeProgress || 'Scraping all pages under website...'}</T>
                  </Row>
                )}
                <Row style={{ gap: 8 }}>
                  <Button
                    title="Cancel"
                    kind="ghost"
                    disabled={savingWebsite}
                    onPress={() => setAddingWebsite(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={savingWebsite ? 'Adding...' : 'Add'}
                    disabled={savingWebsite || !websiteUrl.trim()}
                    onPress={() => void addWebsiteUrl()}
                    style={{ flex: 1 }}
                  />
                </Row>
              </Card>
            )}

            {websites.length === 0 ? (
              <Card style={{ padding: 20, alignItems: 'center', gap: 8 }}>
                <Ionicons name="globe-outline" size={48} color={c.faint} />
                <T size={15} sub style={{ textAlign: 'center' }}>
                  No websites added yet. Add a URL to scrape and search its content.
                </T>
              </Card>
            ) : (
              <ListCard>
                {websites.map((site, i) => {
                  const words = site.content.trim() ? Math.round(site.content.trim().split(/\s+/).length) : 0;
                  return (
                    <View
                      key={site.id}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 4,
                        borderBottomWidth: i === websites.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        borderBottomColor: c.line,
                      }}
                    >
                      <Row style={{ alignItems: 'center', gap: 12 }}>
                        <Ionicons name="link" size={20} color={c.accent} />
                        <Pressable onPress={() => viewWebsite(site)} style={{ flex: 1 }}>
                          <T size={15} numberOfLines={1}>{site.title || site.url}</T>
                          <T size={12} sub numberOfLines={1}>{new URL(site.url).hostname}</T>
                          <Row style={{ alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="checkmark-circle" size={13} color={c.good} />
                            <T size={12} style={{ color: c.good, fontWeight: '600' }}>
                              {site.pages && site.pages.length > 1 ? `${site.pages.length} pages · ` : ''}{site.content.length.toLocaleString()} chars (~{words.toLocaleString()} words) in DB
                            </T>
                          </Row>
                          <T size={11} sub style={{ marginTop: 1 }}>Synced {formatDateTime(site.lastUpdated)} · Tap to view</T>
                        </Pressable>
                        <Pressable
                          onPress={() => void refreshWebsiteData(site.id)}
                          hitSlop={10}
                          disabled={refreshingSiteId === site.id}
                        >
                          {refreshingSiteId === site.id ? (
                            <ActivityIndicator size="small" color={c.accent} />
                          ) : (
                            <Ionicons name="refresh" size={18} color={c.text} />
                          )}
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDeleteWebsite(site)}
                          hitSlop={12}
                          style={({ pressed }) => ({
                            padding: 8,
                            borderRadius: radius.sm,
                            opacity: pressed ? 0.5 : 1,
                          })}
                        >
                          <Ionicons name="trash-outline" size={18} color={c.danger} />
                        </Pressable>
                      </Row>
                    </View>
                  );
                })}
              </ListCard>
            )}
          </>
        )}

        {/* Telegram Tab */}
        {tab === 'telegram' && (
          <>
            {!addingTelegram ? (
              channels.length > 0 || telegramCount > 0 ? (
                <Row style={{ gap: 8 }}>
                  <Button
                    title="Add Telegram"
                    icon="add"
                    onPress={() => setAddingTelegram(true)}
                    disabled={clearing}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Clear All"
                    icon="trash-outline"
                    kind="danger"
                    onPress={confirmClearTelegram}
                    disabled={clearing}
                    style={{ flex: 1, borderWidth: 1, borderColor: `${c.danger}40`, backgroundColor: `${c.danger}10` }}
                  />
                </Row>
              ) : (
                <Button title="Add Telegram Channel" icon="add" onPress={() => setAddingTelegram(true)} disabled={clearing} />
              )
            ) : (
              <Card style={{ padding: 14, gap: 10 }}>
                <Field
                  label="Channel Username or Link"
                  value={channelUsername}
                  onChangeText={setChannelUsername}
                  placeholder="@channelname or https://t.me/channel"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  editable={!savingTelegram}
                  containerStyle={{ marginBottom: 10 }}
                />
                <Field
                  label="Bot Token (Optional for public channels)"
                  value={botToken}
                  onChangeText={setBotToken}
                  placeholder="Optional (leave empty for public channels)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!savingTelegram}
                  containerStyle={{ marginBottom: 0 }}
                />
                {savingTelegram ? (
                  <Row style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <ActivityIndicator size="small" color={c.accent} />
                    <T size={13} sub>Scraping channel messages, photos & documents...</T>
                  </Row>
                ) : (
                  <T size={13} sub style={{ lineHeight: 18, marginTop: 4 }}>
                    Public channels like @lakport are scraped automatically with full history, photos, and document links. For private channels, add a bot token from @BotFather.
                  </T>
                )}
                <Row style={{ gap: 8, marginTop: 6 }}>
                  <Button
                    title="Cancel"
                    kind="ghost"
                    disabled={savingTelegram}
                    onPress={() => setAddingTelegram(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={savingTelegram ? 'Connecting...' : 'Add'}
                    disabled={savingTelegram || !channelUsername.trim()}
                    onPress={() => void addTelegramChannelAction()}
                    style={{ flex: 1 }}
                  />
                </Row>
              </Card>
            )}

            {channels.length === 0 ? (
              <Card style={{ padding: 20, alignItems: 'center', gap: 8 }}>
                <Ionicons name="paper-plane-outline" size={48} color={c.faint} />
                <T size={15} sub style={{ textAlign: 'center' }}>
                  No Telegram channels connected. Add a channel to search its messages.
                </T>
              </Card>
            ) : (
              <>
                <Card style={{ padding: 14, marginBottom: 12, gap: 10 }}>
                  <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Row style={{ alignItems: 'center', gap: 6 }}>
                      <Ionicons name="flash" size={16} color={c.accent} />
                      <T size={14} weight="600">Telegram Auto-Update</T>
                    </Row>
                    <T size={12} weight="600" style={{ color: autoSyncInterval > 0 ? c.good : c.sub }}>
                      {autoSyncInterval > 0 ? `Every ${autoSyncInterval} mins` : 'Off'}
                    </T>
                  </Row>
                  <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { mins: 5, label: '5m' },
                      { mins: 15, label: '15m' },
                      { mins: 30, label: '30m' },
                      { mins: 60, label: '1h' },
                      { mins: 0, label: 'Off' },
                    ].map((opt) => {
                      const on = autoSyncInterval === opt.mins;
                      return (
                        <Pressable
                          key={opt.mins}
                          onPress={() => void changeAutoSyncInterval(opt.mins)}
                          style={{
                            paddingVertical: 5,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: on ? c.accent : c.line,
                            backgroundColor: on ? `${c.accent}18` : c.card,
                          }}
                        >
                          <T size={12} weight={on ? '700' : '500'} style={{ color: on ? c.accent : c.text }}>
                            {opt.label}
                          </T>
                        </Pressable>
                      );
                    })}
                  </Row>
                  <T size={11} sub style={{ lineHeight: 15 }}>
                    ⚡ Incremental: Only downloads brand-new messages since your last sync. Never re-checks old data, saving time and mobile data.
                  </T>
                </Card>

                {/* Telegram Media Bridge Configuration Card */}
                <Card style={{ padding: 14, marginBottom: 12, gap: 10 }}>
                  <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Row style={{ alignItems: 'center', gap: 6 }}>
                      <Ionicons name="cloud-download-outline" size={16} color={c.accent} />
                      <T size={14} weight="600">Telegram Media Bridge (PDF Auto-Extract)</T>
                    </Row>
                    <View style={{ backgroundColor: bridgeUrl.trim() ? `${c.good}20` : c.well, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm }}>
                      <T size={11} weight="700" style={{ color: bridgeUrl.trim() ? c.good : c.sub }}>
                        {bridgeUrl.trim() ? 'Active ✓' : 'Optional'}
                      </T>
                    </View>
                  </Row>
                  <T size={12} sub style={{ lineHeight: 18 }}>
                    Connects to your bridge micro-service to automatically stream and extract full tables from attached Telegram PDFs (like HSC 26 & 27.pdf).
                  </T>
                  <Field
                    label="Bridge Service URL"
                    value={bridgeUrl}
                    onChangeText={(val) => {
                      setBridgeUrl(val);
                      void setTelegramBridgeUrl(val);
                    }}
                    placeholder="e.g. https://my-bridge.onrender.com or http://10.0.2.2:8000"
                    autoCapitalize="none"
                    autoCorrect={false}
                    containerStyle={{ marginBottom: 4 }}
                  />
                  <Row style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <Button
                      title={testingBridge ? 'Testing...' : 'Test Connection'}
                      kind="ghost"
                      disabled={!bridgeUrl.trim() || testingBridge}
                      onPress={() => void testBridgeConnection()}
                    />
                  </Row>
                </Card>
                <Card style={{ padding: 12, marginBottom: 12 }}>
                  <T size={13} sub>{telegramCount} messages tracked across {channels.length} channels</T>
                </Card>
                <ListCard>
                  {channels.map((ch, i) => {
                    const stats = channelMediaStatsMap[ch.id] ??
                      channelMediaStatsMap[ch.channelUsername.toLowerCase()] ??
                      channelMediaStatsMap[ch.channelUsername.replace(/^@/, '').toLowerCase()] ?? {
                        total: channelCounts[ch.id] ?? 0,
                        textCount: channelCounts[ch.id] ?? 0,
                        photoCount: 0,
                        docCount: 0,
                        videoCount: 0,
                      };
                    return (
                      <View
                        key={ch.id}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 4,
                          borderBottomWidth: i === channels.length - 1 ? 0 : StyleSheet.hairlineWidth,
                          borderBottomColor: c.line,
                        }}
                      >
                        <Row style={{ alignItems: 'center', gap: 12 }}>
                          <Ionicons name="paper-plane" size={20} color={c.accent} />
                          <Pressable onPress={() => void viewChannel(ch)} style={{ flex: 1 }}>
                            <T size={15} numberOfLines={1}>{ch.channelName || ch.channelUsername}</T>
                            <T size={12} sub>{ch.channelUsername}</T>
                            <Row style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${c.good}18`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Ionicons name="checkmark-circle" size={11} color={c.good} />
                                <T size={11} weight="600" style={{ color: c.good }}>{stats.total} total</T>
                              </View>
                              {stats.photoCount > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${c.accent}18`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Ionicons name="image" size={11} color={c.accent} />
                                  <T size={11} weight="600" style={{ color: c.accent }}>{stats.photoCount} photos</T>
                                </View>
                              )}
                              {stats.docCount > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f59e0b18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Ionicons name="document-text" size={11} color="#f59e0b" />
                                  <T size={11} weight="600" style={{ color: '#f59e0b' }}>{stats.docCount} docs</T>
                                </View>
                              )}
                              {stats.textCount > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.well, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Ionicons name="chatbubble-ellipses-outline" size={11} color={c.sub} />
                                  <T size={11} style={{ color: c.sub }}>{stats.textCount} text</T>
                                </View>
                              )}
                            </Row>
                            <T size={11} sub style={{ marginTop: 2 }}>
                              Synced {ch.lastSyncedAt ? formatDateTime(ch.lastSyncedAt) : 'Never'} · Tap to view media
                            </T>
                          </Pressable>
                          <Pressable
                            onPress={() => void syncChannel(ch.id)}
                            hitSlop={10}
                            disabled={syncingChannelId === ch.id}
                          >
                            {syncingChannelId === ch.id ? (
                              <ActivityIndicator size="small" color={c.accent} />
                            ) : (
                              <Ionicons name="refresh" size={18} color={c.text} />
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => confirmDeleteChannel(ch)}
                            hitSlop={12}
                            style={({ pressed }) => ({
                              padding: 8,
                              borderRadius: radius.sm,
                              opacity: pressed ? 0.5 : 1,
                            })}
                          >
                            <Ionicons name="trash-outline" size={18} color={c.danger} />
                          </Pressable>
                        </Row>
                      </View>
                    );
                  })}
                </ListCard>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Extracted Data Viewer Modal */}
      <Modal
        visible={!!previewItem}
        animationType="slide"
        onRequestClose={() => setPreviewItem(null)}
      >
        <Screen>
          <TopBar
            title="Extracted Data"
            onBack={() => setPreviewItem(null)}
          />
          <ScrollView contentContainerStyle={styles.content}>
            <Card style={{ padding: 14, backgroundColor: `${c.accent}0d`, borderColor: `${c.accent}30`, gap: 4 }}>
              <T size={16} weight="700">{previewItem?.title}</T>
              <T size={12} sub>{previewItem?.subtitle}</T>
              <T size={12} style={{ color: c.good, fontWeight: '600', marginTop: 4 }}>
                {previewItem?.meta}
              </T>
            </Card>

            {previewItem?.type === 'website' && previewItem.websitePages && previewItem.websitePages.length > 0 ? (
              <View style={{ gap: 12 }}>
                {/* Pages summary list */}
                <Card style={{ padding: 14, gap: 10 }}>
                  <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Row style={{ alignItems: 'center', gap: 6 }}>
                      <Ionicons name="globe-outline" size={16} color={c.accent} />
                      <T size={14} weight="700">Scraped Pages ({previewItem.websitePages.length})</T>
                    </Row>
                    <T size={12} sub>{previewItem.content.length.toLocaleString()} total chars</T>
                  </Row>
                  <T size={12} sub>
                    Pages discovered and scraped under this website:
                  </T>
                  <View style={{ gap: 6, marginTop: 2 }}>
                    {previewItem.websitePages.map((p, idx) => (
                      <View
                        key={idx}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: radius.sm,
                          backgroundColor: c.well,
                          gap: 2,
                        }}
                      >
                        <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <T size={13} weight="600" numberOfLines={1} style={{ flex: 1, paddingRight: 6 }}>
                            Page {p.pageNumber}: {p.title || p.url}
                          </T>
                          <T size={12} weight="700" style={{ color: c.good }}>
                            {p.charCount.toLocaleString()} chars
                          </T>
                        </Row>
                        <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <T size={11} style={{ color: c.accent, flex: 1, paddingRight: 6 }} numberOfLines={1}>
                            {p.url}
                          </T>
                          <T size={10} sub>~{p.wordCount.toLocaleString()} words</T>
                        </Row>
                      </View>
                    ))}
                  </View>
                </Card>

                {/* Per-page detailed content cards */}
                {previewItem.websitePages.map((p, idx) => (
                  <Card key={idx} style={{ padding: 16, gap: 8 }}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: `${c.accent}20` }}>
                        <T size={11} weight="700" style={{ color: c.accent }}>Page {p.pageNumber} of {previewItem.websitePages!.length}</T>
                      </View>
                      <T size={12} weight="600" style={{ color: c.good }}>
                        {p.charCount.toLocaleString()} chars · ~{p.wordCount.toLocaleString()} words
                      </T>
                    </Row>
                    <T size={15} weight="700">{p.title || 'Untitled Page'}</T>
                    <Row style={{ alignItems: 'center', gap: 4 }}>
                      <Ionicons name="link-outline" size={13} color={c.accent} />
                      <T size={12} style={{ color: c.accent }} numberOfLines={1}>{p.url}</T>
                    </Row>
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginVertical: 4 }} />
                    <T size={11} sub weight="700" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      Scraped Content ({p.charCount.toLocaleString()} chars)
                    </T>
                    <T size={14} style={{ lineHeight: 22 }}>
                      {p.content}
                    </T>
                  </Card>
                ))}
              </View>
            ) : previewItem?.type === 'telegram' ? (
              <View style={{ gap: 12 }}>
                {/* Media & Content Stats Breakdown Card */}
                <Card style={{ padding: 14, gap: 10 }}>
                  <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Row style={{ alignItems: 'center', gap: 6 }}>
                      <Ionicons name="stats-chart" size={16} color={c.accent} />
                      <T size={14} weight="700">Channel Media Breakdown</T>
                    </Row>
                    <T size={12} weight="700" style={{ color: c.good }}>
                      {previewItem.telegramStats?.total ?? previewItem.telegramMessages?.length ?? 0} Total Posts
                    </T>
                  </Row>
                  <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 90, padding: 8, borderRadius: radius.sm, backgroundColor: c.well, alignItems: 'center', gap: 2 }}>
                      <Row style={{ alignItems: 'center', gap: 4 }}>
                        <Ionicons name="image" size={14} color={c.accent} />
                        <T size={15} weight="700" style={{ color: c.accent }}>{previewItem.telegramStats?.photoCount ?? 0}</T>
                      </Row>
                      <T size={11} sub>Photos (OCR)</T>
                    </View>
                    <View style={{ flex: 1, minWidth: 90, padding: 8, borderRadius: radius.sm, backgroundColor: c.well, alignItems: 'center', gap: 2 }}>
                      <Row style={{ alignItems: 'center', gap: 4 }}>
                        <Ionicons name="document-text" size={14} color="#f59e0b" />
                        <T size={15} weight="700" style={{ color: '#f59e0b' }}>{previewItem.telegramStats?.docCount ?? 0}</T>
                      </Row>
                      <T size={11} sub>Documents</T>
                    </View>
                    <View style={{ flex: 1, minWidth: 90, padding: 8, borderRadius: radius.sm, backgroundColor: c.well, alignItems: 'center', gap: 2 }}>
                      <Row style={{ alignItems: 'center', gap: 4 }}>
                        <Ionicons name="chatbubble-ellipses" size={14} color={c.text} />
                        <T size={15} weight="700">{previewItem.telegramStats?.textCount ?? 0}</T>
                      </Row>
                      <T size={11} sub>Text Posts</T>
                    </View>
                  </Row>
                </Card>

                {/* Filter Pills */}
                {previewItem.telegramMessages && previewItem.telegramMessages.length > 0 && (
                  <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { key: 'all' as const, label: `All (${previewItem.telegramMessages.length})` },
                      { key: 'photo' as const, label: `📷 Photos (${previewItem.telegramStats?.photoCount ?? 0})` },
                      { key: 'document' as const, label: `📄 Documents (${previewItem.telegramStats?.docCount ?? 0})` },
                      { key: 'text' as const, label: `💬 Text (${previewItem.telegramStats?.textCount ?? 0})` },
                    ].map((f) => {
                      const active = tgFilter === f.key;
                      return (
                        <Pressable
                          key={f.key}
                          onPress={() => setTgFilter(f.key)}
                          style={{
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderColor: active ? c.accent : c.line,
                            backgroundColor: active ? `${c.accent}18` : c.card,
                          }}
                        >
                          <T size={12} weight={active ? '700' : '500'} style={{ color: active ? c.accent : c.text }}>
                            {f.label}
                          </T>
                        </Pressable>
                      );
                    })}
                  </Row>
                )}

                {/* Batch OCR Banner if unextracted photos exist */}
                {(() => {
                  const unextractedCount = previewItem.telegramMessages?.filter(m => {
                    const isPhoto = m.mediaType === 'photo' || m.messageText?.includes('[Photo:');
                    const hasOcr = !!parseTelegramPhotoMessage(m.messageText).ocrText;
                    return isPhoto && !hasOcr;
                  }).length || 0;

                  if (unextractedCount === 0) return null;

                  return (
                    <Card style={{ padding: 12, backgroundColor: `${c.accent}12`, borderColor: `${c.accent}40`, gap: 8 }}>
                      <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Row style={{ alignItems: 'center', gap: 6 }}>
                          <Ionicons name="sparkles" size={16} color={c.accent} />
                          <T size={13} weight="700" style={{ color: c.accent }}>
                            {unextractedCount} Photo{unextractedCount === 1 ? '' : 's'} Not Yet Scanned
                          </T>
                        </Row>
                        <Pressable
                          onPress={() => void handleOcrAllPhotos()}
                          disabled={extractingAll}
                          style={{
                            backgroundColor: c.accent,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: radius.sm,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {extractingAll ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Ionicons name="scan" size={14} color="#fff" />
                          )}
                          <T size={12} weight="700" style={{ color: '#fff' }}>
                            {extractingAll ? 'Extracting All...' : 'Scan All with AI'}
                          </T>
                        </Pressable>
                      </Row>
                      <T size={11} sub style={{ lineHeight: 16 }}>
                        Run Gemini Vision on all {unextractedCount} photos to extract ship departure dates, arrival times, and island rules into your database.
                      </T>
                    </Card>
                  );
                })()}

                {/* Batch Document Extraction Banner if bridge is configured and unextracted docs exist */}
                {(() => {
                  const unextractedDocs = previewItem.telegramMessages?.filter(m => {
                    const isDoc = m.mediaType === 'document' || m.messageText?.includes('[Document:');
                    const parsed = parseTelegramDocMessage(m.messageText);
                    return isDoc && !parsed.isExtracted;
                  }).length || 0;

                  if (unextractedDocs === 0 || !bridgeUrl.trim()) return null;

                  return (
                    <Card style={{ padding: 12, backgroundColor: '#f59e0b12', borderColor: '#f59e0b40', gap: 8 }}>
                      <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Row style={{ alignItems: 'center', gap: 6 }}>
                          <Ionicons name="document-text" size={16} color="#f59e0b" />
                          <T size={13} weight="700" style={{ color: '#f59e0b' }}>
                            {unextractedDocs} PDF Document{unextractedDocs === 1 ? '' : 's'} Not Yet Parsed
                          </T>
                        </Row>
                        <Pressable
                          onPress={() => void handleExtractAllDocs()}
                          disabled={extractingAllDocs}
                          style={{
                            backgroundColor: '#f59e0b',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: radius.sm,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {extractingAllDocs ? (
                            <>
                              <ActivityIndicator size="small" color="#fff" />
                              <T size={12} weight="700" style={{ color: '#fff' }}>
                                Extracting {ocrProgressText || '...'}
                              </T>
                            </>
                          ) : (
                            <>
                              <Ionicons name="sparkles" size={12} color="#fff" />
                              <T size={12} weight="700" style={{ color: '#fff' }}>Extract All Documents</T>
                            </>
                          )}
                        </Pressable>
                      </Row>
                      <T size={11} sub style={{ lineHeight: 16 }}>
                        Download attached PDFs via Telegram Media Bridge and parse full cargo manifests and timetable tables with Gemini.
                      </T>
                    </Card>
                  );
                })()}

                {/* Empty State or Message List */}
                {(!previewItem.telegramMessages || previewItem.telegramMessages.length === 0) ? (
                  <Card style={{ padding: 18, gap: 12, alignItems: 'center' }}>
                    <Ionicons name="alert-circle-outline" size={40} color={c.sub} />
                    <T size={15} weight="700" style={{ textAlign: 'center' }}>No messages saved yet</T>
                    {previewItem.subtitle.replace(/^@/, '').toLowerCase().endsWith('_bot') ? (
                      <View style={{ backgroundColor: `${c.accent}12`, borderColor: `${c.accent}30`, borderWidth: 1, padding: 12, borderRadius: radius.md, gap: 6, width: '100%' }}>
                        <Row style={{ alignItems: 'center', gap: 6 }}>
                          <Ionicons name="information-circle" size={16} color={c.accent} />
                          <T size={13} weight="700" style={{ color: c.accent }}>
                            Bot Handle Detected ("{previewItem.subtitle}")
                          </T>
                        </Row>
                        <T size={12} sub style={{ lineHeight: 18 }}>
                          Public channels (like <T weight="700" style={{ color: c.text }}>@lakport</T>) post announcements publicly and are scraped directly with all photos, timetables, and documents.
                          {'\n\n'}
                          Bot accounts (ending with <T weight="700" style={{ color: c.text }}>_bot</T>) cannot be scraped as public channels; they only receive direct chats or require an admin bot token.
                          {'\n\n'}
                          👉 <T weight="700" style={{ color: c.good }}>Recommendation:</T> Add the public channel <T weight="700" style={{ color: c.good }}>@lakport</T> to sync Lakshadweep ship schedules, photos, and posters.
                        </T>
                      </View>
                    ) : (
                      <T size={13} sub style={{ textAlign: 'center', lineHeight: 18 }}>
                        Tap "Sync" on the Telegram channels list to fetch the latest messages and media, or ensure the channel is public on Telegram.
                      </T>
                    )}
                  </Card>
                ) : (
                  previewItem.telegramMessages
                    .filter((m) => {
                      const photoParsed = parseTelegramPhotoMessage(m.messageText);
                      const isPhoto = m.mediaType === 'photo' || !!photoParsed.photoUrl || !!photoParsed.ocrText;
                      const docParsed = parseTelegramDocMessage(m.messageText);
                      const isDoc = m.mediaType === 'document' || !!docParsed.docPath || !!docParsed.docText;

                      if (tgFilter === 'photo') return isPhoto;
                      if (tgFilter === 'document') return isDoc;
                      if (tgFilter === 'text') return !isPhoto && !isDoc;
                      return true;
                    })
                    .map((m) => {
                      const photoParsed = parseTelegramPhotoMessage(m.messageText);
                      const docParsed = parseTelegramDocMessage(m.messageText);
                      const isPhoto = m.mediaType === 'photo' || !!photoParsed.photoUrl || !!photoParsed.ocrText;
                      const hasOcr = !!photoParsed.ocrText;
                      const isDoc = m.mediaType === 'document' || !!docParsed.docPath || !!docParsed.docText;
                      const hasDoc = !!docParsed.docText;
                      const photoUrl = photoParsed.photoUrl || (m.mediaPath ? m.mediaPath.split('; ')[0].trim() : null);

                      return (
                        <Card key={m.id} style={{ padding: 14, gap: 10 }}>
                          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <Row style={{ alignItems: 'center', gap: 6 }}>
                              <View
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 2,
                                  borderRadius: radius.sm,
                                  backgroundColor: isPhoto ? `${c.accent}18` : isDoc ? '#f59e0b18' : c.well,
                                }}
                              >
                                <T size={11} weight="700" style={{ color: isPhoto ? c.accent : isDoc ? '#f59e0b' : c.sub }}>
                                  {isPhoto ? (hasOcr ? '📷 Photo (Extracted)' : '📷 Photo') : isDoc ? '📄 Document' : '💬 Post'}
                                </T>
                              </View>
                              <T size={12} weight="600" sub>#{m.messageId}</T>
                            </Row>
                            <T size={11} sub>{formatDateTime(m.messageDate)}</T>
                          </Row>

                          {/* Message Caption */}
                          {photoParsed.caption ? (
                            <T size={13} style={{ lineHeight: 20 }}>
                              {photoParsed.caption}
                            </T>
                          ) : docParsed.caption ? (
                            <T size={13} style={{ lineHeight: 20 }}>
                              {docParsed.caption}
                            </T>
                          ) : null}

                          {/* Photo Image Preview */}
                          {isPhoto && photoUrl ? (
                            <View style={{ borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.well, borderWidth: 1, borderColor: c.line, height: 180, width: '100%' }}>
                              <Image
                                source={{ uri: photoUrl }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                              />
                            </View>
                          ) : null}

                          {/* Extracted Photo OCR Box */}
                          {hasOcr ? (
                            <View style={{ backgroundColor: `${c.accent}0d`, borderColor: `${c.accent}30`, borderWidth: 1, padding: 12, borderRadius: radius.sm, gap: 6 }}>
                              <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                <Row style={{ alignItems: 'center', gap: 6 }}>
                                  <Ionicons name="scan-outline" size={14} color={c.accent} />
                                  <T size={11} weight="700" style={{ color: c.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Vision OCR Extracted Content
                                  </T>
                                </Row>
                                <View style={{ backgroundColor: `${c.good}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <T size={10} weight="700" style={{ color: c.good }}>AI Extracted</T>
                                </View>
                              </Row>
                              <T size={13} style={{ lineHeight: 20, color: c.text }}>
                                {photoParsed.ocrText}
                              </T>
                            </View>
                          ) : isPhoto && photoUrl ? (
                            <View style={{ gap: 6, backgroundColor: c.well, padding: 10, borderRadius: radius.sm }}>
                              <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                <Row style={{ alignItems: 'center', gap: 6 }}>
                                  <Ionicons name="sparkles-outline" size={16} color={c.accent} />
                                  <T size={12} weight="600" style={{ color: c.accent }}>Text Not Yet Extracted</T>
                                </Row>
                                <Pressable
                                  onPress={() => void handleOcrPhoto(m, photoUrl)}
                                  disabled={extractingMsgId === m.id}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    backgroundColor: c.accent,
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: radius.sm,
                                  }}
                                >
                                  {extractingMsgId === m.id ? (
                                    <>
                                      <ActivityIndicator size="small" color="#fff" />
                                      <T size={11} weight="700" style={{ color: '#fff' }}>Extracting...</T>
                                    </>
                                  ) : (
                                    <>
                                      <Ionicons name="sparkles" size={12} color="#fff" />
                                      <T size={11} weight="700" style={{ color: '#fff' }}>Extract Text (OCR)</T>
                                    </>
                                  )}
                                </Pressable>
                              </Row>
                            </View>
                          ) : null}

                          {/* Extracted Document Box */}
                          {hasDoc ? (
                            <View style={{ backgroundColor: '#f59e0b0d', borderColor: '#f59e0b30', borderWidth: 1, padding: 12, borderRadius: radius.sm, gap: 8 }}>
                              <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                <Row style={{ alignItems: 'center', gap: 4 }}>
                                  <Ionicons name="document-text-outline" size={14} color="#f59e0b" />
                                  <T size={11} weight="700" style={{ color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Attached Document / Cargo Data
                                  </T>
                                </Row>
                                <View style={{ backgroundColor: docParsed.isExtracted ? `${c.good}20` : '#f59e0b25', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <T size={10} weight="700" style={{ color: docParsed.isExtracted ? c.good : '#f59e0b' }}>
                                    {docParsed.isExtracted ? 'AI Extracted ✓' : 'Document Abstract'}
                                  </T>
                                </View>
                              </Row>
                              {docParsed.docPath ? (
                                <T size={12} weight="700" style={{ color: '#f59e0b' }}>{docParsed.docPath}</T>
                              ) : null}
                              <T size={13} style={{ lineHeight: 20, color: c.text }}>
                                {docParsed.docText}
                              </T>
                              <Row style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                                {!docParsed.isExtracted && bridgeUrl.trim() ? (
                                  <Pressable
                                    onPress={() => void handleExtractDoc(m, previewItem?.subtitle || previewItem?.title || '')}
                                    disabled={extractingMsgId === m.id}
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 4,
                                      backgroundColor: '#f59e0b',
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: radius.sm,
                                    }}
                                  >
                                    {extractingMsgId === m.id ? (
                                      <>
                                        <ActivityIndicator size="small" color="#fff" />
                                        <T size={11} weight="700" style={{ color: '#fff' }}>Extracting PDF...</T>
                                      </>
                                    ) : (
                                      <>
                                        <Ionicons name="sparkles" size={12} color="#fff" />
                                        <T size={11} weight="700" style={{ color: '#fff' }}>Extract Tables with Bridge</T>
                                      </>
                                    )}
                                  </Pressable>
                                ) : null}
                                {docParsed.docLink ? (
                                  <Pressable
                                    onPress={() => {
                                      if (docParsed.docLink) void Linking.openURL(docParsed.docLink);
                                    }}
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 6,
                                      backgroundColor: '#f59e0b18',
                                      borderColor: '#f59e0b40',
                                      borderWidth: 1,
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: radius.sm,
                                    }}
                                  >
                                    <Ionicons name="open-outline" size={14} color="#f59e0b" />
                                    <T size={11} weight="700" style={{ color: '#f59e0b' }}>Open PDF in Telegram</T>
                                  </Pressable>
                                ) : null}
                              </Row>
                            </View>
                          ) : isDoc && docParsed.docPath ? (
                            <View style={{ backgroundColor: '#f59e0b0d', borderColor: '#f59e0b30', borderWidth: 1, padding: 10, borderRadius: radius.sm, gap: 6 }}>
                              <Row style={{ alignItems: 'center', gap: 6 }}>
                                <Ionicons name="document-text-outline" size={16} color="#f59e0b" />
                                <T size={12} weight="600" style={{ color: '#f59e0b' }}>📄 {docParsed.docPath}</T>
                              </Row>
                              {docParsed.docLink ? (
                                <Pressable
                                  onPress={() => {
                                    if (docParsed.docLink) void Linking.openURL(docParsed.docLink);
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                    backgroundColor: '#f59e0b18',
                                    borderColor: '#f59e0b40',
                                    borderWidth: 1,
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: radius.sm,
                                    alignSelf: 'flex-start',
                                    marginTop: 4,
                                  }}
                                >
                                  <Ionicons name="open-outline" size={14} color="#f59e0b" />
                                  <T size={11} weight="700" style={{ color: '#f59e0b' }}>Open PDF in Telegram</T>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : null}
                        </Card>
                      );
                    })
                )}
              </View>
            ) : (
              <Card style={{ padding: 16 }}>
                <T size={11} sub weight="700" style={{ marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Content Saved in Database
                </T>
                <T size={14} style={{ lineHeight: 22 }}>
                  {previewItem?.content}
                </T>
              </Card>
            )}

            <Row style={{ gap: 8, marginTop: 8 }}>
              {previewItem?.type === 'document' && previewItem.id && (
                <Button
                  title="Delete Document"
                  icon="trash-outline"
                  kind="danger"
                  onPress={() => {
                    const docId = previewItem.id!;
                    const docName = previewItem.title;
                    setPreviewItem(null);
                    showDialog({
                      title: 'Delete Document?',
                      message: `Remove "${docName}" from your database? This cannot be undone.`,
                      actions: [
                        { label: 'Cancel', cancel: true },
                        {
                          label: 'Delete',
                          destructive: true,
                          onPress: () => {
                            void removeDocument(docId);
                          },
                        },
                      ],
                    });
                  }}
                  style={{ flex: 1, borderWidth: 1, borderColor: `${c.danger}40`, backgroundColor: `${c.danger}10` }}
                />
              )}
              {previewItem?.type === 'website' && previewItem.id && (
                <Button
                  title="Delete Website"
                  icon="trash-outline"
                  kind="danger"
                  onPress={() => {
                    const siteId = previewItem.id!;
                    const siteTitle = previewItem.title;
                    setPreviewItem(null);
                    showDialog({
                      title: 'Delete Website?',
                      message: `Remove "${siteTitle}" and all its scraped pages from your database? This cannot be undone.`,
                      actions: [
                        { label: 'Cancel', cancel: true },
                        {
                          label: 'Delete',
                          destructive: true,
                          onPress: () => {
                            void removeWebsite(siteId);
                          },
                        },
                      ],
                    });
                  }}
                  style={{ flex: 1, borderWidth: 1, borderColor: `${c.danger}40`, backgroundColor: `${c.danger}10` }}
                />
              )}
              {previewItem?.type === 'telegram' && previewItem.id && (
                <Button
                  title="Delete Channel"
                  icon="trash-outline"
                  kind="danger"
                  onPress={() => {
                    const chId = previewItem.id!;
                    const chTitle = previewItem.title;
                    setPreviewItem(null);
                    showDialog({
                      title: 'Delete Telegram Channel?',
                      message: `Remove "${chTitle}" and all its saved messages and media from your database?`,
                      actions: [
                        { label: 'Cancel', cancel: true },
                        {
                          label: 'Delete',
                          destructive: true,
                          onPress: () => {
                            void removeChannel(chId);
                          },
                        },
                      ],
                    });
                  }}
                  style={{ flex: 1, borderWidth: 1, borderColor: `${c.danger}40`, backgroundColor: `${c.danger}10` }}
                />
              )}
              <Button
                title="Close"
                kind="ghost"
                onPress={() => setPreviewItem(null)}
                style={{ flex: 1 }}
              />
            </Row>
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 12, paddingBottom: 40, gap: 12 },
});
