# PERAI - Multi-Source Data Integration Project

## Project Overview

PERAI is a Personal AI Memory and Expense Tracking application built with React Native (Expo). The app combines intelligent note-taking with financial management, using Google Gemini AI for extraction and natural language processing.

## Core Technology Stack

- **Framework**: React Native 0.86.3 with Expo SDK ~57.0.23
- **Database**: SQLite (expo-sqlite) with WAL mode
- **AI**: Google Gemini API (gemini-3.5-flash-lite)
- **Backend Sync**: Supabase
- **Language**: TypeScript

## Recent Enhancement: Multi-Source Data Integration

### What Was Built

A comprehensive multi-source data integration system that enhances the existing Ask tab with the ability to query across:

1. **Personal Memories** (existing) - notes, tasks, reminders captured by user
2. **Expense Data** (existing) - spending and income records
3. **Documents** (NEW) - uploaded PDFs, DOCX, TXT files, and images
4. **Websites** (NEW) - scraped web content from tracked URLs
5. **Telegram** (NEW) - messages from connected Telegram channels

### New Files Created

#### Core Infrastructure
- `src/sources/schema.ts` - Database schema for documents, websites, and Telegram
- `src/sources/client.ts` - Database client initialization for sources DB
- `src/sources/types.ts` - TypeScript interfaces for all source types

#### Data Source Handlers
- `src/sources/documents.ts` - Document upload, chunking, and retrieval
- `src/sources/websites.ts` - Website scraping and content extraction
- `src/sources/telegram.ts` - Telegram channel integration via Bot API
- `src/sources/extractors.ts` - Text extraction from various file formats (NEEDED)

#### Enhanced AI & Retrieval
- `src/sources/multiSourceRetrieval.ts` - Unified retrieval across all sources
- `src/ai/askEnhanced.ts` - Enhanced Ask with multi-source support

#### UI
- `app/data-sources.tsx` - Management screen for documents, websites, and Telegram

### Architecture

**Two SQLite Databases:**
1. `perai.db` - Original database (memories, expenses, settings)
2. `perai_sources.db` - New database for multi-source data

**Document Processing:**
- Upload → Store → Extract text → Chunk into ~1000 char pieces with 200 char overlap → Index
- Chunks enable better retrieval for long documents

**Website Scraping:**
- Fetch HTML → Extract text content → Store
- Auto-refresh capability based on configured intervals

**Telegram Integration:**
- Bot API based (requires bot token and channel admin access)
- Incremental sync (fetches only new messages since last sync)
- Stores message text and metadata

**Enhanced Ask Flow:**
1. User asks question
2. System searches all 5 sources in parallel
3. AI synthesizes answer with evidence from all relevant sources
4. UI shows answer + evidence cards from each source type

### Key Features

- **Unified Search**: Single query searches across memories, expenses, documents, websites, and Telegram
- **Evidence Attribution**: AI cites which sources were used (M0, D1, W2, T3 format)
- **Chunk-based Retrieval**: Long documents are searchable via overlapping chunks
- **Auto-refresh**: Websites can automatically re-scrape on configured intervals
- **Telegram Sync**: Incremental message fetching with channel tracking

## Implementation Phases

### ✅ PHASE 1: Core Infrastructure (COMPLETED)
- [x] Database schema for documents, websites, Telegram
- [x] Database client and initialization
- [x] TypeScript types and interfaces
- [x] UUID generation utility

### ✅ PHASE 2: Document System (COMPLETED)
- [x] Document picker integration
- [x] File storage in app directory
- [x] Text chunking algorithm (1000 chars, 200 overlap)
- [x] Document metadata storage
- [x] Chunk storage and indexing
- [x] Document search functionality

### ✅ PHASE 3: Website Scraping (COMPLETED)
- [x] HTML fetching with proper headers
- [x] Text extraction from HTML (no external deps)
- [x] Title extraction (from <title> or <h1>)
- [x] Website metadata storage
- [x] Search functionality for website content
- [x] Refresh capability
- [x] Auto-refresh for stale websites

### ✅ PHASE 4: Telegram Integration (COMPLETED)
- [x] Bot API integration
- [x] Channel configuration storage
- [x] Message fetching and parsing
- [x] Incremental sync logic
- [x] Message search functionality
- [x] Message count tracking

### ✅ PHASE 5: Multi-Source Retrieval (COMPLETED)
- [x] Parallel retrieval from all sources
- [x] Unified context building
- [x] Evidence formatting for UI
- [x] Source type tracking

### ✅ PHASE 6: Enhanced Ask Integration (COMPLETED)
- [x] Enhanced ask function with multi-source support
- [x] Source ID citation (M0, D1, W2, T3)
- [x] Evidence filtering (only cited sources)
- [x] Conversation history preservation
- [x] JSON schema for structured responses

### ✅ PHASE 7: UI Implementation (COMPLETED)
- [x] Data sources management screen
- [x] Tab navigation (Documents/Websites/Telegram)
- [x] Document upload UI
- [x] Website add/refresh UI
- [x] Telegram channel add/sync UI
- [x] List views for all source types
- [x] Delete/refresh actions

### 🚧 PHASE 8: Text Extraction (MISSING)
**Status: NOT STARTED - This is the immediate blocker**

Missing file: `src/sources/extractors.ts`

This file is imported by `documents.ts` but doesn't exist yet. It needs to implement:

```typescript
export async function extractText(
  fileUri: string, 
  fileType: 'pdf' | 'docx' | 'txt' | 'image' | 'other'
): Promise<string>
```

**Requirements:**
- TXT files: Direct read with FileSystem
- PDF files: expo-pdf or similar (or skip for MVP)
- DOCX files: Complex format (skip for MVP or use external service)
- Images: OCR via existing Gemini integration (reuse receipt OCR logic)
- Other: Return empty string or throw error

### 🔲 PHASE 9: Integration & Testing (PENDING)
- [ ] Initialize sources DB in app startup
- [ ] Add Data Sources link to More tab
- [ ] Integrate askEnhanced into existing Ask tab
- [ ] Test document upload flow
- [ ] Test website scraping
- [ ] Test Telegram integration
- [ ] Test multi-source queries
- [ ] Error handling and edge cases

### 🔲 PHASE 10: Polish & Optimization (PENDING)
- [ ] Loading states for long operations
- [ ] Better error messages
- [ ] Retry logic for failed scrapes
- [ ] Background refresh for websites
- [ ] Background sync for Telegram
- [ ] Performance optimization for large document sets
- [ ] File size limits
- [ ] Chunk size tuning

## Current Branch

`claude/perai-expo-ota-update-5muwbn`

## What's Not Done

1. **Text Extractors** - Critical blocker, file doesn't exist
2. **App Integration** - Sources DB not initialized in app startup
3. **UI Navigation** - Data Sources screen not linked from More tab
4. **Ask Tab Integration** - askEnhanced not wired up to replace existing ask
5. **Testing** - No end-to-end testing of the full flow
6. **Error Handling** - Minimal error handling in place

## Next Immediate Steps

**START WITH PHASE 8** - Create the missing extractors file. This is the blocker preventing documents from working.
