/**
 * Cloud sync for multi-source data (documents, chunks, websites, telegram).
 * Synchronizes local SQLite `perai_sources.db` with Supabase tables.
 */
import { getSourcesDb } from './client';
import { currentUserId, getSupabase, isConfigured } from '@/sync/client';

export interface SourcesSyncOutcome {
  pushed: number;
  pulled: number;
}

let running: Promise<SourcesSyncOutcome | null> | null = null;

export async function syncSourcesNow(): Promise<SourcesSyncOutcome | null> {
  if (running) return running;

  running = (async () => {
    if (!isConfigured()) return null;
    const userId = await currentUserId();
    if (!userId) return null;

    let pushed = 0;
    let pulled = 0;

    try {
      const p = await pushSources(userId);
      pushed = p;
    } catch (err) {
      console.warn('Sources push error:', err);
    }

    try {
      const g = await pullSources(userId);
      pulled = g;
    } catch (err) {
      console.warn('Sources pull error:', err);
    }

    return { pushed, pulled };
  })().finally(() => {
    running = null;
  });

  return running;
}

async function pushSources(userId: string): Promise<number> {
  const db = await getSourcesDb();
  const supabase = getSupabase();
  let count = 0;

  // 1. Push Websites
  const dirtyWebsites = await db.getAllAsync<{
    id: string;
    url: string;
    title: string | null;
    content: string;
    scraped_at: string;
    last_updated: string;
    deleted: number;
  }>('SELECT id, url, title, content, scraped_at, last_updated, deleted FROM website_data WHERE dirty = 1 LIMIT 100');

  if (dirtyWebsites.length > 0) {
    const payload = dirtyWebsites.map((w) => ({
      id: w.id,
      user_id: userId,
      url: w.url,
      title: w.title,
      content: w.content,
      scraped_at: w.scraped_at,
      last_updated: w.last_updated,
      deleted: w.deleted === 1,
    }));

    const { error } = await supabase.from('website_data').upsert(payload, { onConflict: 'id' });
    if (!error) {
      const ids = dirtyWebsites.map((w) => `'${w.id}'`).join(',');
      await db.runAsync(`UPDATE website_data SET dirty = 0 WHERE id IN (${ids})`);
      count += dirtyWebsites.length;
    } else {
      console.warn('Supabase website_data upsert failed:', error.message);
    }
  }

  // 2. Push Documents
  const dirtyDocs = await db.getAllAsync<{
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
    file_uri: string;
    uploaded_at: string;
    chunk_count: number;
    deleted: number;
  }>('SELECT id, filename, file_type, file_size, file_uri, uploaded_at, chunk_count, deleted FROM documents WHERE dirty = 1 LIMIT 100');

  if (dirtyDocs.length > 0) {
    const deletedDocs = dirtyDocs.filter((d) => d.deleted === 1);
    const activeDocs = dirtyDocs.filter((d) => d.deleted === 0);

    if (deletedDocs.length > 0) {
      const deletedIds = deletedDocs.map((d) => d.id);
      await supabase.from('document_chunks').delete().in('document_id', deletedIds);
      await supabase.from('documents').delete().in('id', deletedIds);
      for (const d of deletedDocs) {
        await db.runAsync('DELETE FROM document_chunks WHERE document_id = ?', [d.id]);
        await db.runAsync('DELETE FROM documents WHERE id = ?', [d.id]);
      }
    }

    if (activeDocs.length > 0) {
      const docPayload = activeDocs.map((d) => ({
        id: d.id,
        user_id: userId,
        filename: d.filename,
        file_type: d.file_type,
        file_size: d.file_size,
        file_uri: d.file_uri,
        uploaded_at: d.uploaded_at,
        chunk_count: d.chunk_count,
        deleted: false,
      }));

      const { error: docError } = await supabase.from('documents').upsert(docPayload, { onConflict: 'id' });
      if (!docError) {
        for (const doc of activeDocs) {
          const chunks = await db.getAllAsync<{
            id: string;
            document_id: string;
            chunk_index: number;
            content: string;
            page_number: number | null;
            created_at: string;
          }>('SELECT id, document_id, chunk_index, content, page_number, created_at FROM document_chunks WHERE document_id = ?', [doc.id]);

          if (chunks.length > 0) {
            const chunkPayload = chunks.map((c) => ({
              id: c.id,
              user_id: userId,
              document_id: c.document_id,
              chunk_index: c.chunk_index,
              content: c.content,
              page_number: c.page_number,
              created_at: c.created_at,
            }));
            await supabase.from('document_chunks').upsert(chunkPayload, { onConflict: 'id' });
          }
        }
        const activeIds = activeDocs.map((d) => `'${d.id}'`).join(',');
        await db.runAsync(`UPDATE documents SET dirty = 0 WHERE id IN (${activeIds})`);
        count += activeDocs.length;
      } else {
        console.warn('Supabase documents upsert failed:', docError.message);
      }
    }
  }

  // 3. Push Telegram Channels
  const channels = await db.getAllAsync<{
    id: string;
    channel_username: string;
    channel_name: string | null;
    last_message_id: number | null;
    last_synced_at: string | null;
    created_at: string;
  }>('SELECT id, channel_username, channel_name, last_message_id, last_synced_at, created_at FROM telegram_channels');

  if (channels.length > 0) {
    const channelPayload = channels.map((ch) => ({
      id: ch.id,
      user_id: userId,
      channel_username: ch.channel_username,
      channel_name: ch.channel_name,
      last_message_id: ch.last_message_id,
      last_synced_at: ch.last_synced_at,
      created_at: ch.created_at,
    }));
    await supabase.from('telegram_channels').upsert(channelPayload, { onConflict: 'id' });

    // Clean up any cloud channels that were deleted locally
    const localIds = new Set(channels.map((c) => c.id));
    const { data: cloudChans } = await supabase
      .from('telegram_channels')
      .select('id')
      .eq('user_id', userId);

    if (cloudChans && cloudChans.length > 0) {
      const idsToDelete = cloudChans.map((c) => c.id).filter((id) => !localIds.has(id));
      if (idsToDelete.length > 0) {
        await supabase.from('telegram_channels').delete().in('id', idsToDelete).eq('user_id', userId);
      }
    }
  } else {
    // Local channels are completely cleared -> remove all cloud channels for this user
    await supabase.from('telegram_channels').delete().eq('user_id', userId);
  }

  return count;
}

async function pullSources(userId: string): Promise<number> {
  const db = await getSourcesDb();
  const supabase = getSupabase();
  let count = 0;

  // 1. Pull Websites from Cloud
  const { data: cloudWebsites, error: webErr } = await supabase
    .from('website_data')
    .select('*')
    .eq('user_id', userId)
    .limit(200);

  if (!webErr && cloudWebsites && cloudWebsites.length > 0) {
    for (const w of cloudWebsites) {
      await db.runAsync(
        `INSERT INTO website_data (id, url, title, content, scraped_at, last_updated, deleted, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           url = excluded.url,
           title = excluded.title,
           content = excluded.content,
           last_updated = excluded.last_updated,
           deleted = excluded.deleted,
           dirty = 0`,
        [w.id, w.url, w.title, w.content, w.scraped_at, w.last_updated, w.deleted ? 1 : 0]
      );
      count++;
    }
  }

  // 2. Pull Documents & Chunks from Cloud
  const { data: cloudDocs, error: docErr } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .limit(100);

  if (!docErr && cloudDocs) {
    const activeCloudDocs = cloudDocs.filter((d) => !d.deleted);
    const deletedCloudDocs = cloudDocs.filter((d) => d.deleted);

    // If cloud has deleted documents, purge them from cloud and local
    if (deletedCloudDocs.length > 0) {
      const delIds = deletedCloudDocs.map((d) => d.id);
      await supabase.from('document_chunks').delete().in('document_id', delIds);
      await supabase.from('documents').delete().in('id', delIds);
      for (const d of deletedCloudDocs) {
        await db.runAsync('DELETE FROM document_chunks WHERE document_id = ?', [d.id]);
        await db.runAsync('DELETE FROM documents WHERE id = ?', [d.id]);
      }
    }

    for (const d of activeCloudDocs) {
      await db.runAsync(
        `INSERT INTO documents (id, filename, file_type, file_size, file_uri, uploaded_at, chunk_count, deleted, dirty, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           filename = excluded.filename,
           file_type = excluded.file_type,
           file_size = excluded.file_size,
           chunk_count = excluded.chunk_count,
           deleted = 0,
           dirty = 0,
           updated_at = excluded.updated_at`,
        [d.id, d.filename, d.file_type, d.file_size, d.file_uri || '', d.uploaded_at, d.chunk_count, d.updated_at || d.uploaded_at]
      );
      count++;
    }

    // Pull chunks ONLY for active documents
    if (activeCloudDocs.length > 0) {
      const activeDocIds = activeCloudDocs.map((d) => d.id);
      const { data: cloudChunks } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('user_id', userId)
        .in('document_id', activeDocIds)
        .limit(1000);

      if (cloudChunks && cloudChunks.length > 0) {
        for (const c of cloudChunks) {
          await db.runAsync(
            `INSERT OR IGNORE INTO document_chunks (id, document_id, chunk_index, content, page_number, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [c.id, c.document_id, c.chunk_index, c.content, c.page_number, c.created_at]
          );
        }
      }
    }

    // Purge any orphan local chunks whose document is not an active document
    await db.runAsync('DELETE FROM document_chunks WHERE document_id NOT IN (SELECT id FROM documents WHERE deleted = 0)');
  }

  // 3. Pull Telegram Channels
  const { data: cloudChannels } = await supabase
    .from('telegram_channels')
    .select('*')
    .eq('user_id', userId);

  if (cloudChannels && cloudChannels.length > 0) {
    for (const ch of cloudChannels) {
      await db.runAsync(
        `INSERT INTO telegram_channels (id, channel_username, channel_name, last_message_id, last_synced_at, auto_sync, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           channel_name = excluded.channel_name,
           last_message_id = excluded.last_message_id,
           last_synced_at = excluded.last_synced_at`,
        [ch.id, ch.channel_username, ch.channel_name, ch.last_message_id, ch.last_synced_at, ch.created_at]
      );
    }
  }

  return count;
}
