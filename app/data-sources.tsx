/**
 * Data Sources management screen - Documents, Websites, Telegram.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/expense/theme';
import { Button, Card, Field, ListCard, ListRow, Row, Screen, T, TopBar } from '@/expense/ui';
import { showDialog } from '@/dialogStore';
import { listDocuments, deleteDocument, pickAndProcessDocument, getTotalDocumentChunks, getDocumentChunks, type Document } from '@/sources/documents';
import { listWebsites, addWebsite, deleteWebsite, refreshWebsite, type WebsiteData } from '@/sources/websites';
import { listTelegramChannels, addTelegramChannel, deleteTelegramChannel, syncTelegramChannel, getTelegramMessageCount, getChannelMessageCounts, getChannelMessageCount, getChannelMessages, type TelegramChannel } from '@/sources/telegram';
import { syncSourcesNow } from '@/sources/sync';
import { getSetting, setSetting } from '@/db/queries';
import { shortDate, timeLabel } from '@/format';
import { radius } from '@/expense/theme';

type Tab = 'documents' | 'websites' | 'telegram';

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

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [addingWebsite, setAddingWebsite] = useState(false);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [addingTelegram, setAddingTelegram] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [refreshingSiteId, setRefreshingSiteId] = useState<string | null>(null);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [channelUsername, setChannelUsername] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [docs, sites, chans, token, count, chunks, chCounts] = await Promise.all([
        listDocuments(),
        listWebsites(),
        listTelegramChannels(),
        getSetting('telegram_bot_token'),
        getTelegramMessageCount(),
        getTotalDocumentChunks(),
        getChannelMessageCounts(),
      ]);
      setDocuments(docs);
      setWebsites(sites);
      setChannels(chans);
      setBotToken(token || '');
      setTelegramCount(count);
      setTotalDocChunks(chunks);
      setChannelCounts(chCounts);
    } catch (err) {
      console.warn('Failed to load data sources:', err);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  async function uploadDocument() {
    setUploadingDoc(true);
    try {
      const doc = await pickAndProcessDocument();
      await loadData();
      void syncSourcesNow();
      showDialog({
        title: 'Document Saved in DB',
        message: `${doc.filename}\n\n✓ Successfully saved in database:\n• ${doc.chunkCount} search chunks indexed\n• ${(doc.fileSize / 1024).toFixed(0)} KB stored\n\nContent is ready and searchable in the Ask tab.`,
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
    try {
      const site = await addWebsite(url);
      setWebsiteUrl('');
      setAddingWebsite(false);
      await loadData();
      void syncSourcesNow();
      const charCount = site.content.length;
      const wordCount = site.content.trim() ? site.content.trim().split(/\s+/).length : 0;
      showDialog({
        title: 'Website Saved in DB',
        message: `${site.title || site.url}\n\n✓ Successfully saved in database:\n• ${charCount.toLocaleString()} characters extracted\n• ~${wordCount.toLocaleString()} words indexed\n\nContent is stored in the database and searchable in the Ask tab.`,
      });
    } catch (err) {
      showDialog({ title: 'Failed to add website', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingWebsite(false);
    }
  }

  async function addTelegramChannelAction() {
    const token = botToken.trim();
    const username = channelUsername.trim();

    if (!token || !username || savingTelegram) {
      showDialog({ title: 'Missing information', message: 'Please provide both bot token and channel username.' });
      return;
    }

    setSavingTelegram(true);
    try {
      await setSetting('telegram_bot_token', token);
      const res = await addTelegramChannel(token, username);
      setChannelUsername('');
      setAddingTelegram(false);
      await loadData();
      void syncSourcesNow();
      showDialog({
        title: 'Telegram Channel Saved in DB',
        message: `${username}\n\n✓ Successfully saved in database:\n• ${res.messagesSaved ?? 0} messages stored\n\nChannel messages are now indexed and searchable in the Ask tab.`,
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
    } catch (err) {
      showDialog({ title: 'Delete failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function removeWebsite(id: string) {
    try {
      await deleteWebsite(id);
      await loadData();
    } catch (err) {
      showDialog({ title: 'Delete failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function removeChannel(id: string) {
    try {
      await deleteTelegramChannel(id);
      await loadData();
    } catch (err) {
      showDialog({ title: 'Delete failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function refreshWebsiteData(id: string) {
    if (refreshingSiteId) return;
    setRefreshingSiteId(id);
    try {
      const updated = await refreshWebsite(id);
      await loadData();
      void syncSourcesNow();
      const charCount = updated.content.length;
      const wordCount = updated.content.trim() ? updated.content.trim().split(/\s+/).length : 0;
      showDialog({
        title: 'Website Refreshed & Saved',
        message: `${updated.title || updated.url}\n\n✓ Updated in database:\n• ${charCount.toLocaleString()} characters saved\n• ~${wordCount.toLocaleString()} words indexed\n\nLatest content is now indexed in the Ask tab.`,
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
      const ch = channels.find(c => c.id === id);
      const total = await getChannelMessageCount(ch?.channelUsername || '', id);
      showDialog({
        title: count > 0 ? 'Telegram Messages Saved' : 'Telegram Up To Date',
        message: count > 0
          ? `✓ Saved ${count} new messages to the database.\nTotal stored for this channel: ${total} messages.`
          : `Already up to date. No new messages found.\nTotal stored in database: ${total} messages.`,
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
      if (botToken) {
        for (const ch of channels) {
          try {
            await syncTelegramChannel(botToken, ch.id);
          } catch (e) {
            console.warn('Failed to sync channel:', ch.channelUsername, e);
          }
        }
      }
      await loadData();
      void syncSourcesNow();

      const totalChars = websites.reduce((acc, s) => acc + s.content.length, 0);
      showDialog({
        title: 'All Data Sources Refreshed',
        message: `✓ Local database is fully updated:\n\n• Documents: ${documents.length} (${totalDocChunks} chunks saved)\n• Websites: ${websites.length} (${(totalChars / 1024).toFixed(1)} KB text saved)\n• Telegram: ${channels.length} channels (${telegramCount} messages saved)\n\nAll content is in the database and searchable in the Ask tab.`,
      });
    } catch (err) {
      showDialog({ title: 'Refresh error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefreshingAll(false);
    }
  }

  const [previewItem, setPreviewItem] = useState<{
    title: string;
    subtitle: string;
    content: string;
    meta: string;
  } | null>(null);

  async function viewDocument(doc: Document) {
    try {
      const chunks = await getDocumentChunks(doc.id);
      const content = chunks.length > 0
        ? chunks.map((c, i) => `=== Search Chunk ${i + 1} (Page ${c.pageNumber ?? 1}) ===\n${c.content}`).join('\n\n')
        : 'No text extracted.';
      setPreviewItem({
        title: doc.filename,
        subtitle: `${doc.chunkCount} search chunks · ${(doc.fileSize / 1024).toFixed(0)} KB`,
        content,
        meta: `Saved to local DB · Uploaded ${shortDate(doc.uploadedAt)}`,
      });
    } catch {
      showDialog({ title: 'Error', message: 'Could not load document text.' });
    }
  }

  function viewWebsite(site: WebsiteData) {
    const words = site.content.trim() ? Math.round(site.content.trim().split(/\s+/).length) : 0;
    setPreviewItem({
      title: site.title || site.url,
      subtitle: site.url,
      content: site.content,
      meta: `${site.content.length.toLocaleString()} characters · ~${words.toLocaleString()} words · Updated ${shortDate(site.lastUpdated)}`,
    });
  }

  async function viewChannel(ch: TelegramChannel) {
    try {
      const msgs = await getChannelMessages(ch.channelUsername, ch.id);
      const content = msgs.length > 0
        ? msgs.map((m) => `[${shortDate(m.messageDate)} ${timeLabel(m.messageDate)}] ${m.senderName || 'Channel'}:\n${m.messageText || '(Media message)'}`).join('\n\n')
        : 'No messages saved yet.';
      setPreviewItem({
        title: ch.channelName || ch.channelUsername,
        subtitle: ch.channelUsername,
        content,
        meta: `${msgs.length} messages saved in DB · Last synced ${ch.lastSyncedAt ? shortDate(ch.lastSyncedAt) : 'Never'}`,
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
            <Button
              title={uploadingDoc ? 'Uploading...' : 'Upload Document'}
              icon="cloud-upload-outline"
              onPress={() => void uploadDocument()}
              disabled={uploadingDoc}
            />

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
                  <Pressable
                    key={doc.id}
                    onPress={() => void viewDocument(doc)}
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      paddingHorizontal: 4,
                      borderBottomWidth: i === documents.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: c.line,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Row style={{ alignItems: 'center', gap: 12 }}>
                      <Ionicons name="document-text" size={20} color={c.accent} />
                      <View style={{ flex: 1 }}>
                        <T size={15} numberOfLines={1}>{doc.filename}</T>
                        <Row style={{ alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="checkmark-circle" size={13} color={c.good} />
                          <T size={12} style={{ color: c.good, fontWeight: '600' }}>
                            {doc.chunkCount} search chunks saved in DB
                          </T>
                        </Row>
                        <T size={11} sub style={{ marginTop: 1 }}>
                          {(doc.fileSize / 1024).toFixed(0)} KB · Uploaded {shortDate(doc.uploadedAt)} · Tap to view
                        </T>
                      </View>
                      <Pressable onPress={() => void removeDocument(doc.id)} hitSlop={10}>
                        <Ionicons name="trash-outline" size={18} color={c.danger} />
                      </Pressable>
                    </Row>
                  </Pressable>
                ))}
              </ListCard>
            )}
          </>
        )}

        {/* Websites Tab */}
        {tab === 'websites' && (
          <>
            {!addingWebsite ? (
              <Button title="Add Website" icon="add" onPress={() => setAddingWebsite(true)} />
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
                    <T size={13} sub>Scraping webpage content...</T>
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
                              {site.content.length.toLocaleString()} chars (~{words.toLocaleString()} words) in DB
                            </T>
                          </Row>
                          <T size={11} sub style={{ marginTop: 1 }}>Updated {shortDate(site.lastUpdated)} · Tap to view</T>
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
                        <Pressable onPress={() => void removeWebsite(site.id)} hitSlop={10}>
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
              <Button title="Add Telegram Channel" icon="add" onPress={() => setAddingTelegram(true)} />
            ) : (
              <Card style={{ padding: 14, gap: 10 }}>
                <Field
                  label="Bot Token"
                  value={botToken}
                  onChangeText={setBotToken}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!savingTelegram}
                  containerStyle={{ marginBottom: 10 }}
                />
                <Field
                  label="Channel Username"
                  value={channelUsername}
                  onChangeText={setChannelUsername}
                  placeholder="@channelname"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={!!botToken}
                  editable={!savingTelegram}
                  containerStyle={{ marginBottom: 0 }}
                />
                {savingTelegram ? (
                  <Row style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <ActivityIndicator size="small" color={c.accent} />
                    <T size={13} sub>Connecting to Telegram & fetching messages...</T>
                  </Row>
                ) : (
                  <T size={13} sub style={{ lineHeight: 18, marginTop: 4 }}>
                    Create a bot via @BotFather, add it to your channel as admin, then enter details here.
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
                    disabled={savingTelegram || !channelUsername.trim() || !botToken.trim()}
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
                <Card style={{ padding: 14, marginBottom: 12 }}>
                  <T size={13} sub>{telegramCount} messages tracked across {channels.length} channels</T>
                </Card>
                <ListCard>
                  {channels.map((ch, i) => {
                    const msgCount = channelCounts[ch.id] ??
                      channelCounts[ch.channelUsername.replace(/^@/, '').toLowerCase()] ??
                      channelCounts[ch.channelUsername.toLowerCase()] ?? 0;
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
                            <Row style={{ alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Ionicons name="checkmark-circle" size={13} color={c.good} />
                              <T size={12} style={{ color: c.good, fontWeight: '600' }}>
                                {msgCount} messages saved in DB
                              </T>
                            </Row>
                            {ch.lastSyncedAt && (
                              <T size={11} sub style={{ marginTop: 1 }}>Synced {shortDate(ch.lastSyncedAt)} · Tap to view</T>
                            )}
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
                          <Pressable onPress={() => void removeChannel(ch.id)} hitSlop={10}>
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

            <Card style={{ padding: 16 }}>
              <T size={11} sub weight="700" style={{ marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Content Saved in Database
              </T>
              <T size={14} style={{ lineHeight: 22 }}>
                {previewItem?.content}
              </T>
            </Card>

            <Button
              title="Close"
              kind="ghost"
              onPress={() => setPreviewItem(null)}
              style={{ marginTop: 8 }}
            />
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 12, paddingBottom: 40, gap: 12 },
});
