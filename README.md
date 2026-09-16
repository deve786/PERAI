# PERAI — Personal AI Memory (MVP)

Record what happened in plain language. The app extracts structure from it,
stores it on-device, and later answers questions **only from what you recorded**
— never from general knowledge, never invented.

```
"I got my haircut today"
   -> AI extracts { title, type, category, date, tags, amount, people }
   -> you confirm / edit it
   -> saved to your record (local SQLite)

"When did I last cut my hair?"
   -> AI searches your record
   -> answers, and shows the exact entries it used
```

---

## Setup

Requires Node 20+ and the Expo Go app on your phone.

```bash
npm install
cp .env.example .env        # then paste your Gemini API key into .env
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS).

Create a key at <https://aistudio.google.com/apikey>. The free tier needs no
card. After editing `.env` restart with `npx expo start --clear` — the key is
inlined at bundle time, so a warm cache keeps serving the old value.

**The free tier is rate limited**, per minute and per day. Exceeding it returns
`429`; the app retries once using the delay Gemini reports, then tells you to
wait.

### Models

Set in `src/ai/client.ts`, overridable from `.env`:

| Use | Default |
| --- | --- |
| Extraction | `gemini-3.5-flash-lite` |
| Answering | `gemini-3.5-flash-lite` |

Every Gemini model is on the free tier — "free" is not a model, it is a
**per-model quota**. The newest flagship Flash has the tightest allowance and
will `429` after a couple of dozen requests; flash-lite is far roomier and
passes the whole live suite comfortably, including multi-event extraction and
median-interval answers. That is why the default is lite, not because the
others cost money.

```bash
EXPO_PUBLIC_GEMINI_ASK_MODEL=gemini-3.8-flash   # if answers miss totals or intervals
```

Note that `gemini-2.5-flash` and `gemini-2.5-flash-lite` now return `404 no
longer available to new users`, so don't reach for them as a fallback.

### Running it in a browser

```bash
npm run web
```

Exports the web build and serves it with `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` set. Those headers are **required**: on web
expo-sqlite runs as WebAssembly and needs `SharedArrayBuffer`, which browsers
only expose to cross-origin-isolated pages. Expo's dev server cannot set them
(Metro's `enhanceMiddleware` is bypassed by the Expo CLI, and the expo-router
`headers` option applies to EAS Hosting only), which is why the build is served
from `scripts/serve-web.mjs`. No hot reload — re-run after a change.

### ⚠️ API key handling — read before shipping this

For MVP convenience the app calls Gemini **directly from the device**, with the
key injected via `EXPO_PUBLIC_GEMINI_API_KEY`. Anything prefixed
`EXPO_PUBLIC_` is **inlined into the JavaScript bundle**, which means:

- **the key ships inside the app and is extractable by anyone who has it.**
- This is acceptable only for local development on your own device.

Before any real release, move the model calls behind a small backend that holds
the key server-side. The whole provider integration is three functions in
`src/ai/client.ts`, so that swap touches nothing else — this project has
already been moved between Anthropic, OpenAI and Gemini without any other file
changing.

`.env` is gitignored; `.env.example` is the committed template.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Expo dev server (native, via Expo Go) |
| `npm run web` | Export + serve the web build with the required headers |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Schema + logic tests (no API key, no network) |
| `npm run test:schema` | Runs the real DDL against Node's SQLite, insert/read round-trip |
| `npm run test:logic` | Retrieval ranking, date-window parsing, timeline grouping |
| `npm run test:ai` | **Live API calls.** Uses free-tier quota — paced to stay under the rate limit |

```bash
npm test                                   # offline, 35 assertions
GEMINI_API_KEY=... npm run test:ai         # live
```

---

## Design

Paper and ink, one accent, and a single typographic rule:

> **mono = data** (times, dates, amounts, categories, counts)
> **sans = language** (titles, answers, prose)

so the eye separates a recorded fact from a written sentence before reading
either. IBM Plex Sans and IBM Plex Mono — one family, two voices.

The signature is the **time gutter**: every entry is a fixed-width monospace
column carrying when it happened, with the language of the entry beside it.
The Ask tab renders its evidence with that same component, so the proof under
an answer is visually continuous with the record it came from.

Moss green is the only colour in the app and marks exactly one thing: *live or
ahead* — the send control, the selected filter, the current tab, and anything
scheduled in the future. Scheduled entries sort above today, so the timeline
states that split under a **STILL TO COME** heading rather than leaving future
dates sitting unexplained above "Today".

Category colour-coding was deliberately removed: the filter chips already
narrow by category, so in the record itself the category is a small
typographic stamp. The only icons left are in the tab bar, where a glanceable
target earns its place.

---

## Architecture

```
app/                       Expo Router routes
  _layout.tsx              loads fonts + opens the database, then renders
  (tabs)/_layout.tsx       Record | Timeline | Ask
  (tabs)/index.tsx         capture — the always-visible "What happened?" input
  (tabs)/timeline.tsx      SectionList grouped by day + filter chips
  (tabs)/ask.tsx           question -> answer -> evidence rows
  preview.tsx              modal: confirm/edit each extracted draft

src/
  theme.ts                 palette, type scale, gutter width
  ai/client.ts             Gemini client, key lookup, requestJson, 429 retry
  ai/extract.ts            extractMemories(text, nowISO) -> MemoryDraft[]
  ai/retrieval.ts          on-device ranking (no embeddings)
  ai/ask.ts                askAI(question, nowISO, memories) -> { answer, evidence }
  db/schema.ts             table DDL
  db/client.ts             async connection + change listener
  db/queries.ts            insert / timeline / range / delete
  useMemories.ts           live timeline hook
  components/              MemoryRow, DraftCard, Chip
  draftStore.ts            holds drafts between capture and the preview modal
  format.ts                currency, day labels, day grouping
```

### Storage

One denormalised `memories` table — `people` and `tags` are comma-separated
strings rather than join tables, which is plenty for a single-user MVP.

**The data layer is fully async, and does not use Drizzle.** expo-sqlite's
synchronous API blocks the calling thread via `Atomics.wait`, which browsers
forbid on the main thread — on web every sync call fails with "Sync operation
timeout" no matter when it runs. `drizzle-orm/expo-sqlite` is a sync-only
driver, so it cannot run on web at all. Raw async expo-sqlite is the only
single-code-path option, which the original brief anticipated.

Auto-refresh survived the change: the connection is opened with
`enableChangeListener`, and `useMemories` re-queries on
`addDatabaseChangeListener`, so confirming an entry updates the timeline with
no manual invalidation.

### Extraction

`extractMemories` sends the note plus the current timestamp and constrains the
reply with a response schema, so the model cannot return prose or a different
shape. On top of that the response is still parsed defensively — markdown
fences stripped, several candidate spans tried, every field validated against
the enums, bad values replaced with safe defaults. A malformed reply surfaces
as "Couldn't understand that — try rephrasing." inline; it never crashes.

The prompt is explicit that one sentence can hold several events, and that a
field the note does not imply must come back `null` rather than guessed.

### Ask — how answers stay grounded

1. **Retrieve on-device.** `selectRelevantMemories` ranks by keyword overlap
   (title and tags weighted over raw text), with bonuses for a guessed
   category or type, and recency as the tiebreaker. Compound words are
   handled, so "cut my hair" reaches "haircut". If the question names a period
   ("last month", "in 2024", "past 3 weeks") the slice is restricted to it —
   and if that window is empty, the app answers "not found" **without calling
   the model at all**. Capped at 200 entries.
2. **Answer from that slice only.** The system prompt states that the supplied
   entries are the entire world of knowledge about this person, forbids
   outside knowledge, and requires every claim to trace to a specific entry.
3. **Cite or don't count.** The model returns the reference ids it used, which
   are mapped back to real rows and rendered as evidence. **An answer that
   cites nothing is downgraded to "not found"** — an answer whose basis cannot
   be shown is exactly the ungrounded output this app exists to avoid.

No vector database. For a personal timeline, keyword ranking plus a date
filter is enough, and it keeps everything on-device.

---

## Verified

- ✅ Runs in a browser — capture, timeline and ask all render, SQLite reads and
  writes, fonts load, page is cross-origin isolated
- ✅ Android, iOS and web bundles export cleanly
- ✅ `tsc --noEmit` clean
- ✅ 12 schema assertions — real DDL, idempotency, defaults, insert/read
- ✅ 23 logic assertions — retrieval ranking, date windows, grouping, formatting
- ✅ **31 live assertions against Gemini** (`npm run test:ai`), run twice
  back-to-back with no rate limit
- ✅ Rate-limit handling — a real `429` surfaces as a readable message

The live suite covers every example sentence from the brief and proves the
behaviour the app exists for:

| Case | Result |
| --- | --- |
| Multi-event sentence | Split into a Travel memory **and** a ₹1,200 Shopping purchase, both dated to yesterday, both located in Kozhikode |
| Relative dates | "yesterday", "next month", "Friday at 4pm" all resolved, original wording preserved |
| No fabrication | "I went for a walk" returned null amount, null people, null location |
| Spending | "₹20400 across 2 entries", citing both purchases |
| Frequency | "typical gap 42 days", computed from the three cited haircuts |
| **Nothing recorded** | "There is no recorded memory for that." — no evidence cited |

## Not verified

The end-to-end acceptance check on a real device — enter a memory in Expo Go,
restart the app, ask about it — still needs a phone. Everything it covers has
been verified in the browser and in the live suite, but not in Expo Go itself.

## Out of scope for this MVP

Voice input (the capture flow is text-only, but `extractMemories` takes a plain
string, so a speech-to-text source drops in without touching extraction or
storage) · any backend or multi-device sync · auth · actually firing reminder
notifications (reminder data is stored, delivery is not built) · knowledge-graph
linking · proactive suggestions · native release builds.
