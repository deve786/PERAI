# Multi-Source Data Integration

This module enables searching across documents, websites, and Telegram channels alongside existing memories and expenses.

## Features

- **Document Upload**: TXT, PDF, DOCX, images with text extraction and chunking
- **Website Scraping**: HTML content extraction with auto-refresh
- **Telegram Integration**: Bot API integration with incremental sync
- **Unified Search**: Parallel retrieval across all sources
- **Evidence Attribution**: AI cites sources used (M0, D1, W2, T3)

## Configuration Limits

### Documents
- Maximum file size: 50MB (10MB for images)
- Minimum extracted text: 10 characters
- Chunk size: 1000 characters with 200 character overlap
- Maximum text length: 500KB (truncated if larger)

### Websites
- Fetch timeout: 30 seconds
- Maximum content size: 5MB
- Minimum content length: 100 characters
- Auto-retry: 2 attempts with exponential backoff
- Default refresh interval: 24 hours

### Telegram
- API timeout: 15 seconds
- Auto-retry: 2 attempts with exponential backoff
- Validates bot token format and channel username

## Error Handling

All operations include:
- Input validation before processing
- Automatic retries for transient failures
- Cleanup on failure (removes partial data)
- Detailed error messages
- Timeout protection

## Performance Optimizations

1. **Parallel Retrieval**: All sources searched simultaneously
2. **Database Indexes**: Optimized for search queries
3. **Chunk-based Search**: Documents split for better matching
4. **Connection Pooling**: Single database instance
5. **Lazy Loading**: Sources initialized only when needed

## Usage

```typescript
// Initialize on app startup (done in _layout.tsx)
import { initSourcesDb } from '@/sources/client';
await initSourcesDb();

// Upload document
import { pickAndProcessDocument } from '@/sources/documents';
const doc = await pickAndProcessDocument();

// Add website
import { addWebsite } from '@/sources/websites';
const site = await addWebsite('https://example.com');

// Add Telegram channel
import { addTelegramChannel } from '@/sources/telegram';
const channel = await addTelegramChannel(botToken, '@channelname');

// Search across all sources
import { askAIEnhanced } from '@/ai/askEnhanced';
const result = await askAIEnhanced(question, nowISO, allMemories);
```

## Database Schema

Two SQLite databases:
- `perai.db` - Original (memories, expenses)
- `perai_sources.db` - New (documents, websites, telegram)

Tables:
- `documents` - File metadata
- `document_chunks` - Searchable text chunks
- `website_data` - Scraped website content
- `telegram_channels` - Channel configuration
- `telegram_messages` - Synced messages

All tables include soft delete flags and timestamps.
