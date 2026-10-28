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

### ✅ PHASE 8: Text Extraction (COMPLETED)
- [x] `src/sources/extractors.ts` implements `extractText(fileUri, fileType)`
- [x] TXT read directly, PDF/DOCX via the text extractor, images via Gemini OCR

### ✅ PHASE 9: Integration (COMPLETED)
- [x] Sources DB initialised in app startup (`app/_layout.tsx`)
- [x] Data Sources screen reachable from More
- [x] `askAIEnhanced` wired into the Ask tab

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

`master`

## Answer Accuracy — rules to keep

The Ask tab answers from records, so the ways it can be wrong are specific.
These were each the cause of a real wrong answer; do not undo them.

1. **Never put worked examples with concrete data in a prompt.** The enhanced
   prompt once carried sample voyages with real-looking dates. The model
   recited one of them — "01/11/2026, MV Arabian Sea" — as a fact about a
   schedule that said no such thing. Rules in prompts, never facts.
2. **The model must not do arithmetic over a list if the app can do it first.**
   Totals per month, per category and per place are worked out in
   `buildChatContext` so an answer is a lookup. Asked to add rows up itself it
   used the pre-refund column and dropped entries, and gave a different total
   each time the same question was asked.
3. **`spent` is net of refunds and paybacks; `billedAmount` is not a total.**
   A ticket bought for someone who paid it back is ₹0 of spending.
4. **Memories are rendered by `renderMemory`,** which includes whether an entry
   is still to do or done. A short rendering that drops it makes every
   "what's still left" question wrong.
5. **Retrieval must rank.** Document, website and Telegram search score by how
   many distinct search terms match, and drop sources well below the best
   match. An unranked OR over every word matched "the" in every document.
6. **An answer is only `found` when it is traceable** to a cited source or to
   the expense block. Something merely being retrieved is not evidence.

## What's Not Done

1. **Testing** - `scripts/test-ai.ts` covers the single-source `askAI` only;
   the multi-source path cannot be imported under plain Node, so it is checked
   by hand against the live API.
2. **Error Handling** - thin in places outside the Ask flow.
