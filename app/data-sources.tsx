/**
 * Data Sources management screen - Documents, Websites, Telegram.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/expense/theme';
import { Button, Card, Field, ListCard, ListRow, Row, Screen, T, TopBar } from '@/expense/ui';
import { showDialog } from '@/dialogStore';
import { listDocuments, deleteDocument, pickAndProcessDocument, type Document } from '@/sources/documents';
import { listWebsites, addWebsite, deleteWebsite, refreshWebsite, type WebsiteData } from '@/sources/websites';
import { listTelegramChannels, addTelegramChannel, deleteTelegramChannel, syncTelegramChannel, getTelegramMessageCount, type TelegramChannel } from '@/sources/telegram';
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

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [addingWebsite, setAddingWebsite] = useState(false);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [addingTelegram, setAddingTelegram] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [refreshingSiteId, setRefreshingSiteId] = useState<string | null>(null);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [botToken, setBotToken] = useState('');
  const [channelUsername, setChannelUsername] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [docs, sites, chans, token, count] = await Promise.all([
        listDocuments(),
        listWebsites(),
        listTelegramChannels(),
        getSetting('telegram_bot_token'),
        getTelegramMessageCount(),
      ]);
      setDocuments(docs);
      setWebsites(sites);
      setChannels(chans);
      setBotToken(token || '');
      setTelegramCount(count);
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
      showDialog({
        title: 'Document uploaded',
        message: `${doc.filename} processed into ${doc.chunkCount} chunks and is now searchable.`,
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
      await addWebsite(url);
      setWebsiteUrl('');
      setAddingWebsite(false);
      await loadData();
      showDialog({ title: 'Website added', message: `${url} has been scraped and is now searchable.` });
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
      await addTelegramChannel(token, username);
      setChannelUsername('');
      setAddingTelegram(false);
      await loadData();
      showDialog({ title: 'Telegram channel added', message: `${username} is now being tracked.` });
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
      await refreshWebsite(id);
      await loadData();
      showDialog({ title: 'Refreshed', message: 'Website data updated.' });
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
      showDialog({ title: 'Synced', message: `${count} new messages fetched.` });
    } catch (err) {
      showDialog({ title: 'Sync failed', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncingChannelId(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'documents', label: 'Documents', count: documents.length },
    { key: 'websites', label: 'Websites', count: websites.length },
    { key: 'telegram', label: 'Telegram', count: channels.length },
  ];

  return (
    <Screen>
      <TopBar title="Data Sources" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <T size={14} sub style={{ lineHeight: 20, marginBottom: 16 }}>
          Upload documents, add websites, and connect Telegram channels. All data becomes searchable from the Ask tab.
        </T>

        {/* Tab selector */}
        <Row style={{ gap: 8, marginBottom: 16 }}>
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
                        <T size={13} sub>
                          {doc.processed ? `${doc.chunkCount} chunks` : 'Processing...'} · {(doc.fileSize / 1024).toFixed(0)} KB
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
                {websites.map((site, i) => (
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
                      <View style={{ flex: 1 }}>
                        <T size={15} numberOfLines={1}>{site.title || site.url}</T>
                        <T size={13} sub numberOfLines={1}>{new URL(site.url).hostname}</T>
                        <T size={12} sub>Updated {shortDate(site.lastUpdated)}</T>
                      </View>
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
                ))}
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
                  {channels.map((ch, i) => (
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
                        <View style={{ flex: 1 }}>
                          <T size={15} numberOfLines={1}>{ch.channelName || ch.channelUsername}</T>
                          <T size={13} sub>{ch.channelUsername}</T>
                          {ch.lastSyncedAt && (
                            <T size={12} sub>Synced {shortDate(ch.lastSyncedAt)}, {timeLabel(ch.lastSyncedAt)}</T>
                          )}
                        </View>
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
                  ))}
                </ListCard>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 12, paddingBottom: 40, gap: 12 },
});
