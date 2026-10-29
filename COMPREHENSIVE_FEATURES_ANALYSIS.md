# PERAI - Comprehensive Feature Analysis

**Analysis Date:** October 24, 2026  
**App Version:** 1.0.0  
**Platform:** React Native (Expo) - iOS, Android, Web

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Core Architecture](#core-architecture)
3. [Main Features](#main-features)
4. [AI & Intelligence Features](#ai--intelligence-features)
5. [Data Management](#data-management)
6. [Money/Expense Tracking](#moneyexpense-tracking)
7. [User Interface & Experience](#user-interface--experience)
8. [Synchronization & Updates](#synchronization--updates)
9. [Voice & Speech Features](#voice--speech-features)
10. [Notifications & Reminders](#notifications--reminders)
11. [Analytics & Insights](#analytics--insights)
12. [Settings & Customization](#settings--customization)
13. [Technical Infrastructure](#technical-infrastructure)
14. [Database Schema](#database-schema)

---

## EXECUTIVE SUMMARY

PERAI is a **Personal AI Memory and Expense Tracking application** that combines intelligent note-taking with comprehensive financial management. The app uses AI (Google Gemini) to extract structured information from natural language input, maintains a local-first database, and provides powerful querying capabilities.

**Key Value Propositions:**
- Voice and text-based memory capture with AI extraction
- Comprehensive expense and income tracking with categorization
- Natural language queries over personal data
- Offline-first with cloud sync capabilities
- Multi-platform support (iOS, Android, Web)

---

## CORE ARCHITECTURE

### Technology Stack

**Frontend Framework:**
- React Native 0.86.3
- React 19.2.3
- Expo SDK ~57.0.23
- Expo Router (file-based routing)

**State Management:**
- React Hooks (useState, useEffect, useMemo, useCallback)
- Custom stores (draftStore, dialogStore, shareProcessingStore)
- Context API (ThemeContext, ExpenseThemeProvider)

**Database:**
- expo-sqlite (local SQLite database)
- Write-Ahead Logging (WAL) mode enabled
- Async-only API for web compatibility

**AI Integration:**
- Google Gemini API (@google/genai v2.22.0)
- Models: gemini-3.5-flash-lite (default)
- Structured output with JSON schema validation

**Backend Sync:**
- Supabase (@supabase/supabase-js v2.116.0)
- Row-level security
- Incremental push/pull synchronization

**Key Libraries:**
- expo-audio: Voice recording
- expo-speech-recognition: Speech-to-text
- expo-image-picker: Image/document capture
- expo-notifications: Local notifications
- expo-share-intent: Share target integration
- react-native-android-widget: Home screen widgets

---

## MAIN FEATURES

### 1. MEMORY CAPTURE (Record Tab)

**Voice Input:**
- Press-to-talk microphone recording
- Real-time waveform visualization during recording
- Audio transcription via Gemini API
- Supports multiple languages (English, Hindi, Malayalam, Tamil, etc.)
- Transcript appears in text field for editing before submission

**Text Input:**
- Standard text input field
- Multi-event extraction from single input
- Support for natural language date expressions
- Automatic entity recognition (people, places, amounts)

**Extraction Capabilities:**
- Extracts multiple memories from one sentence
- Identifies: title, type, category, date, amount, currency, people, location, tags, priority
- Preserves original date expressions ("yesterday", "next Friday")
- Handles relative and absolute dates
- Supports date ranges (start and end dates)

**Memory Types:**
- **memory**: General life events
- **task**: Actionable items with completion tracking
- **reminder**: Time-sensitive notifications
- **purchase**: Shopping and transactions
- **appointment**: Scheduled meetings/events
- **play**: Games to play (wishlist)
- **watch**: Movies/shows to watch (wishlist)
- **wish**: Items to buy someday (wishlist)

**Categories:**
- Personal Care
- Work
- Shopping
- Entertainment
- Fitness
- Travel
- Health
- Other

**After Save Actions:**
- Immediate display of saved items
- Undo button (deletes just-saved entries)
- Edit button (opens individual entries)
- Title spell-checking via web search (background)
- Automatic reminder scheduling if applicable
- Option to add to a group

**Grouping:**
- Create groups to organize related memories
- Examples: "Kozhikode Trip", "Work Project", "Wedding Plans"
- Assign memories to groups during capture or later
- View group-specific timelines

---

### 2. TIMELINE VIEW (Calendar Tab)

**Display Modes:**
- **Timeline**: Chronological list with date headers
- **Calendar**: Month view with date selection
- **Today**: Quick filter for today's entries

**Filtering:**
- By type: All, Tasks, Reminders, Purchases, etc.
- By status: Active, Done, Archived
- By date range: Custom date picker
- By group: Show only specific group's entries

**Entry Display:**
- Time gutter (monospace) + content (sans-serif)
- Color-coded status indicators
- Strike-through for completed items
- Visual distinction for future/scheduled items
- "STILL TO COME" section for future entries

**Interactions:**
- Tap to view/edit
- Swipe actions for quick operations
- Long-press for batch selection
- Mark as done/active
- Delete with confirmation
- Share entries

**Date Headers:**
- "Today"
- "Yesterday"
- Day names for recent dates
- Full dates for older entries
- "STILL TO COME" for future items

**Overdue Handling:**
- Automatic sweep of overdue items
- Visual indicators for missed deadlines
- Option to reschedule or mark done

---

### 3. ASK TAB (AI Query Interface)

**Natural Language Queries:**
- Ask questions about your recorded data
- Examples:
  - "When did I last cut my hair?"
  - "How much did I spend this month?"
  - "What was my biggest expense last month?"
  - "Compare this month with last month"
  - "Where am I spending the most?"

**Query Types:**
- **Factual retrieval**: Find specific memories
- **Aggregation**: Sum amounts, count entries
- **Temporal**: Date ranges, intervals, patterns
- **Comparison**: Month-over-month, category comparisons
- **Frequency analysis**: "How often do I..."

**Answer Display:**
- Natural language response
- Evidence cards showing source entries
- Source attribution (from X entries, from Money data)
- Inline memory rows with full details

**Command Execution:**
- Understands imperative instructions
- Examples:
  - "Delete all tasks from last week"
  - "Mark all overdue reminders as done"
  - "Archive completed items"
- Shows plan before execution
- Requires confirmation for destructive actions
- Undo capability after execution

**Context Awareness:**
- Follows up on previous questions
- Maintains conversation thread
- Uses context from earlier in session
- Accesses both memories and expense data

**Recent Questions:**
- History of past queries
- Tap to re-ask
- Forget/remove from history

**Voice Queries:**
- Microphone input on Ask tab
- Voice replaces current question (vs. appends on Record)
- Same transcription quality as Record

**Clarification:**
- Asks for missing information when needed
- Guides ambiguous queries
- Suggests refinements

---

### 4. MONEY/EXPENSE TRACKING (Money Tab)

#### 4.1 EXPENSE MANAGEMENT

**Add Expense:**
- Amount entry with currency support
- Category selection (customizable)
- Date picker (defaults to today)
- Payment method: Cash, UPI, Card, Bank
- Optional fields:
  - Note/description
  - Detailed notes (multi-line)
  - Tagged person (who it was for)
  - Place (location)
  - Bank account (for UPI/Bank transfers)
  - Receipt image (OCR extraction)
  - Itemized breakdown

**Categories (Default):**
- Food (restaurant-outline, #C8553D)
- Transport (car-outline, #2E7DB8)
- Shopping (bag-handle-outline, #A8831F)
- Bills (receipt-outline, #7159C4)
- Rent (home-outline, #2E9465)
- Health (medkit-outline, #B0479B)
- Entertainment (film-outline, #7B8B1E)
- Ticket (ticket-outline, #C46210)
- Other (ellipsis, #0D8FAF)

**Category Management:**
- Add custom categories
- Edit name, icon, color
- Set monthly budgets per category
- Archive/delete unused categories
- Legacy color migration support

**Ticket Sub-categories:**
- Flight, Ship, Train, Bus, Cinema, Event
- User-extensible
- Linked to Ticket category
- Supports partial refunds based on people count

**Recurring Expenses:**
- Set up monthly recurring bills
- Amount, category, payment method
- Day of month for charge
- Auto-generates entries each month
- Last processed month tracking
- Edit or delete recurring templates

**Expense Operations:**
- **Edit**: Modify any field, updates timestamp
- **Delete**: Remove with confirmation
- **Cancel/Refund**: 
  - Mark expense as cancelled
  - Record refund amount
  - Link to bank account
  - Creates corresponding income entry
  - Tracks partial refunds
- **Reimbursement**:
  - For expenses paid for others
  - Track who paid back
  - Link to bank account
  - Creates income entry

**Shared Payments:**
- Link expenses to specific people
- Track who owes what
- Settlement tracking

**Receipt Scanning:**
- Image picker integration
- OCR via Gemini API
- Auto-extracts: amount, items, date, merchant
- Item-level breakdown
- Edit extracted data before saving

**Item-Level Tracking:**
- Add multiple items per expense
- Quantity and individual amounts
- Useful for grocery shopping
- Itemized receipt storage

#### 4.2 INCOME MANAGEMENT

**Add Income:**
- Amount and date
- Income categories:
  - Salary (cash-outline, #C8553D)
  - Freelance (laptop-outline, #2E7DB8)
  - Business (storefront-outline, #A8831F)
  - Gift (gift-outline, #7159C4)
  - Refund (return-up-back-outline, #2E9465)
  - Interest (trending-up-outline, #B0479B)
  - Other (ellipsis, #0D8FAF)
- Payment method
- Optional: note, tagged person, place, bank account

**Auto-Generated Income:**
- Refunds create income entries automatically
- Reimbursements create income entries
- Linked back to original expense

#### 4.3 BANK ACCOUNTS

**Account Management:**
- Add multiple bank accounts
- Track account names and types
- Initial balance setting
- Running balance calculation

**Balance Tracking:**
- Auto-updates on UPI/Bank expenses
- Auto-updates on UPI/Bank income
- Refunds update account balances
- Reimbursements update balances
- Manual adjustments possible

**Account Linking:**
- Link expenses to accounts (UPI, Bank method)
- Link income to accounts
- Link refunds to specific accounts
- Link reimbursements to accounts

#### 4.4 BORROW & LEND

**Lending Money:**
- Record money lent to others
- Amount, person, date
- Optional: reason, due date
- Track outstanding amounts

**Borrowing Money:**
- Record money borrowed from others
- Same tracking as lending
- Settlement tracking

**Settlement:**
- Mark as settled when paid back
- Partial settlement support
- Settlement history
- Outstanding balance calculation

**Summary View:**
- Total owed to you
- Total you owe
- Per-person breakdowns
- Overdue items highlighted

#### 4.5 BUDGETING

**Monthly Budget:**
- Set overall monthly spending limit
- Track progress against budget
- Visual indicators (on track, warning, over)
- Percentage used display

**Category Budgets:**
- Individual budgets per category
- Optional (defaults to null)
- Track per-category spending
- Budget utilization metrics

**Budget Alerts:**
- Notifications when approaching limit
- Over-budget warnings
- Configurable thresholds

#### 4.6 NET WORTH TRACKING

**Asset Management:**
- Add assets (savings, investments, property)
- Current value tracking
- Asset categories
- Update values over time

**Liability Management:**
- Track loans and debts
- Outstanding amounts
- Interest rates (optional)

**Net Worth Calculation:**
- Total assets minus liabilities
- Historical tracking
- Visual trends

---

### 5. INSIGHTS & ANALYTICS

**Analytics Tabs:**
- **Money Insights**: Expense and income analytics
- **Notes Insights**: Memory/task analytics

#### 5.1 MONEY INSIGHTS

**Period Selection:**
- Month (current month)
- 3 Months (90 days)
- Year (current year)
- All time
- Custom range (date picker)

**Key Metrics:**
- **Total Spent**: Sum of all expenses
- **Net Income**: Income minus expenses
- **Total Income**: Sum of all income
- **Savings Rate**: Percentage saved
- **Per Day Average**: Daily spending rate
- **Average Entry**: Mean expense amount
- **Budget Progress**: Spending vs. budget
- **Committed Monthly**: Sum of recurring bills

**Visualizations:**

**Category Breakdown (Donut Chart):**
- Percentage by category
- Color-coded segments
- Tap for details
- Shows top categories

**Monthly Trends (Bar Chart):**
- Month-by-month spending
- Income vs. expenses
- Comparative view
- Last 12 months

**Ranked Categories:**
- Sorted by spending amount
- Percentage of total
- Count of entries
- Visual bars

**Category Detail:**
- List all expenses in category
- Date and amount
- Drill-down capability

**Comparison Mode:**
- This period vs. previous period
- Percentage change indicators
- Up/down arrows
- Absolute difference

**Borrow & Lend Summary:**
- Total owed to you
- Total you owe
- Net position

**Glossary:**
- Explanations of all metrics
- Help text for interpretations

#### 5.2 NOTES INSIGHTS

**Capture Metrics:**
- Total entries captured
- By type breakdown
- By category breakdown
- Timeline of captures

**Task Completion:**
- Total tasks
- Completed count
- Still open count
- Completion rate percentage
- Overdue count

**Memory Statistics:**
- Total memories
- By category
- Tagged people frequency
- Location frequency
- Tag cloud

**Time-based Analysis:**
- Capture patterns over time
- Most productive days
- Activity heatmap

**Visualizations:**
- Type distribution (pie chart)
- Completion trends (line chart)
- Category breakdown (bars)

---

### 6. LISTS (Wishlist Management)

**List Types:**
- **To Play**: Games wishlist
- **To Watch**: Movies/shows wishlist
- **To Buy**: Shopping wishlist

**List Features:**
- View all items of a type
- Filter by tags
- Search functionality
- Priority sorting
- Add directly to list
- Move to done/archive
- Delete items

**List Item Details:**
- Title
- Tags
- Priority (if set)
- Date added
- Notes
- Amount (for To Buy)

---

### 7. GROUPS

**Group Management:**
- Create named groups
- Examples: "Trip to Kozhikode", "Wedding Planning"
- Assign memories to groups
- View group timeline

**Group Operations:**
- View all entries in a group
- Filter by group
- Rename group
- Delete group (keeps entries)
- Merge groups

**Group Timeline:**
- Dedicated view per group
- All group entries chronologically
- Same filtering as main timeline

---

### 8. MORE TAB

**Navigation Hub:**
- Settings
- Lists (Play, Watch, Wish)
- Groups
- Timeline view
- Calendar view
- Expense History
- Expense Analytics
- Account Management
- Sync status
- App information
- What's New

**Quick Actions:**
- Access all screens
- Theme toggle
- Sync button
- Compact navigation

---

## AI & INTELLIGENCE FEATURES

### 9.1 EXTRACTION ENGINE

**Capabilities:**
- Multi-event extraction from single sentence
- Example: "I bought groceries for ₹500 and went to the movies" → 2 memories
- Entity recognition:
  - People names
  - Locations/places
  - Dates and times
  - Amounts and currencies
  - Categories
  - Tags

**Date Understanding:**
- Relative dates: "yesterday", "tomorrow", "next week"
- Specific dates: "October 24", "24th"
- Time expressions: "at 5pm", "in the morning"
- Date ranges: "from Monday to Friday"
- Natural language: "three days ago"

**Amount Parsing:**
- Multiple currencies (₹, $, €, £, etc.)
- Various formats: "500", "500.50", "five hundred"
- Automatic currency detection
- Default currency from settings

**People Recognition:**
- Learns names from past entries
- Suggests known people
- Supports multiple people per entry
- Comma-separated storage

**Location/Place Tracking:**
- Learns frequently visited places
- Place suggestions
- Tagged places database
- Auto-complete from history

**Category Classification:**
- AI suggests category from context
- Learns from user corrections
- Improves over time
- Manual override always available

### 9.2 TITLE SPELL CHECKING

**Background Verification:**
- Checks titles against web search
- Happens after save (non-blocking)
- Focuses on: games, films, products, places
- Updates spelling if wrong
- Shows corrections to user

**Spelling Database:**
- Caches learned spellings
- Source tracking (user correction vs. search)
- Prevents repeated lookups
- User corrections take precedence

### 9.3 RETRIEVAL & SEARCH

**On-Device Ranking:**
- Keyword overlap scoring
- Title and tags weighted higher
- Category/type bonuses
- Compound word handling
- Recency as tie-breaker

**Semantic Features:**
- Understands synonyms
- Handles word variations
- Contextual relevance
- No embeddings (keyword-based)

**Date Window Filtering:**
- Restricts to relevant time periods
- Parses "last month", "this year", etc.
- Returns empty if nothing in period
- Avoids hallucination

**Evidence Linking:**
- Every answer cites source entries
- Reference IDs tracked
- Source entries displayed
- Un-cited answers rejected

### 9.4 EXPENSE AI FEATURES

**Auto-Categorization:**
- Suggests category from description
- Learns from user corrections
- Context-aware
- Manual override

**OCR Extraction:**
- Image to structured data
- Extracts: amount, date, merchant, items
- Line-item breakdown
- Quantity and prices

**Title Generation:**
- Auto-generates expense title from note
- Context from category and amount
- Concise and descriptive

**Trip Spending Analysis:**
- Identifies trip-related expenses
- Aggregates spending by trip
- Category breakdown per trip
- Answers trip-specific queries

### 9.5 NATURAL LANGUAGE COMMANDS

**Command Types:**
- Deletion: "Delete all tasks from last week"
- Status change: "Mark all overdue items as done"
- Archival: "Archive completed tasks"
- Batch operations: "Mark all shopping items as bought"

**Command Flow:**
1. Intent recognition
2. Plan generation (what will happen)
3. User confirmation
4. Execution
5. Outcome report
6. Undo option

**Safety:**
- Always shows plan before execution
- Confirmation required for destructive actions
- Undo available after execution
- Limited scope to prevent accidents

---

## DATA MANAGEMENT

### 10.1 LOCAL DATABASE

**SQLite Database:**
- Name: `perai.db`
- Mode: WAL (Write-Ahead Logging)
- Location: App-specific storage
- Async-only API (web-compatible)

**Tables:**
- `memories`: Main entries table
- `questions`: Ask tab query history
- `settings`: Key-value app settings
- `spellings`: Learned title spellings
- `logs`: App event log
- `pending_titles`: Titles awaiting verification
- `pending_notes`: Notes awaiting AI processing
- `categories`: Expense categories
- `income_categories`: Income categories
- `expenses`: Expense entries
- `expense_items`: Itemized expense breakdown
- `income`: Income entries
- `recurring_expenses`: Recurring bill templates
- `tagged_users`: People tags
- `tagged_places`: Place tags
- `ticket_types`: Ticket sub-categories
- `accounts`: Bank accounts
- `borrow_lend`: Borrow/lend records

**Indexes:**
- Event date (DESC) for timeline
- Category for filtering
- Type for list views
- Dirty flag for sync
- Updated_at for sync ordering

**Change Listener:**
- Auto-refresh on data changes
- No manual invalidation needed
- React hooks re-render automatically

### 10.2 CLOUD SYNCHRONIZATION

**Supabase Backend:**
- PostgreSQL database
- Row-level security
- User authentication
- Real-time capabilities (not used in MVP)

**Sync Strategy:**
- **Push**: Send local changes to server
- **Pull**: Fetch server changes to device
- Incremental sync (only changed rows)
- Conflict resolution: newest wins
- Tombstone handling for deletes

**Sync Tables:**
- All memories
- All expense/income data
- Categories
- Tagged users and places
- Account balances

**Sync State:**
- Dirty flag tracks unsaved changes
- Updated_at timestamp for ordering
- Deleted flag for tombstones
- Cursor-based pagination

**Sync Operations:**
- Manual sync via button
- Auto-sync on app startup
- Background sync (if configured)
- Sync status indicators

**Offline Support:**
- Full offline functionality
- Local-first architecture
- Queue changes when offline
- Sync when connection restored

**Pending Count:**
- Shows unsaved changes
- Per-table breakdown
- Visual indicator

### 10.3 DATA IMPORT/EXPORT

**CSV Export:**
- Export expenses to CSV
- Export income to CSV
- Custom date ranges
- All fields included

**Backup:**
- Full database export
- Restore from backup
- Version compatibility checks

**Share Intent:**
- Receive shared images (receipts)
- Receive shared text (notes)
- Background processing
- Queue for OCR/extraction

---

## USER INTERFACE & EXPERIENCE

### 11.1 DESIGN SYSTEM

**Typography:**
- **IBM Plex Sans**: Language, prose, titles
- **IBM Plex Mono**: Data, dates, amounts, times
- Clear hierarchy: labels, body, titles

**Color Palette:**
- **Moss Green (#2E9465)**: Active, live, future items
- **Graphite**: Inactive, past items
- **Paper**: Background (light/dark)
- **Surface**: Cards and sections
- **Rule**: Borders and dividers
- **Alert**: Errors and warnings
- **Category colors**: Muted, accessible palette

**Theme Support:**
- Light and dark modes
- System preference detection
- Manual toggle
- Persistent preference
- Smooth transitions

**Spacing Scale:**
- Consistent padding/margins
- Page, section, field, tight levels
- Responsive to screen size

**Border Radius:**
- Consistent rounding
- Cards, chips, buttons
- Input fields

**Layout Principles:**
- Time gutter + content (signature layout)
- Fixed-width monospace column
- Fluid content area
- Clear visual hierarchy

### 11.2 NAVIGATION

**Bottom Tab Bar:**
- 5 tabs: Record, Money, Insights, Ask, More
- Active tab highlighted (moss green pill)
- Icons + labels
- Persistent across app

**Stack Navigation:**
- Modal presentations for detail screens
- Smooth transitions
- Back button handling
- Deep linking support

**Routes:**
- File-based routing (Expo Router)
- Type-safe navigation
- Dynamic routes for entries/groups

### 11.3 COMPONENTS

**Common Components:**
- **MemoryRow**: Timeline entry display
- **DraftCard**: Preview screen cards
- **Section**: Grouped content with headers
- **Chip**: Filter buttons
- **PillButton**: Action buttons
- **Card**: Elevated content containers
- **Empty**: Empty state illustrations
- **ComposeButton**: Floating action button

**Form Components:**
- Text inputs with validation
- Date pickers (native)
- Amount inputs with currency
- Category pickers
- Method selectors (Cash/UPI/Card/Bank)
- Tag inputs with autocomplete
- Place pickers with history

**Charts:**
- Donut charts (category breakdown)
- Bar charts (trends over time)
- Dual bars (comparison view)
- Ranked lists with meters
- Custom SVG rendering

**Feedback:**
- Loading spinners
- Success/error toasts
- Confirmation dialogs
- Modal alerts
- Pull-to-refresh

### 11.4 GESTURES & INTERACTIONS

**Touch Interactions:**
- Tap to open/edit
- Long-press for context menu
- Swipe actions on lists
- Pull-to-refresh
- Pinch-to-zoom (on charts)

**Keyboard Handling:**
- Avoid keyboard overlap (KeyboardAvoidingView)
- Auto-focus on input fields
- Dismiss on scroll
- Submit on enter

**Haptic Feedback:**
- Button press feedback
- Success/error haptics
- Selection feedback
- Subtle, non-intrusive

---

## VOICE & SPEECH FEATURES

### 12.1 VOICE RECORDING

**Recording:**
- Press-to-talk interface
- `expo-audio` integration
- Wave visualization during recording
- Visual feedback (waveform animation)

**Audio Format:**
- Platform-native formats
- Optimized for speech
- Compressed for API transmission

**Recording States:**
- Idle (ready to record)
- Recording (active, showing waveform)
- Processing (transcribing)
- Error (shown inline)

### 12.2 SPEECH RECOGNITION

**Transcription:**
- Via Gemini API (audio → text)
- Multiple language support
- Handles silence (NO_SPEECH detection)
- Editable before submission

**Languages Supported:**
- English (multiple dialects)
- Hindi
- Malayalam
- Tamil
- Hinglish (code-switching)
- Malayalam-English mix
- Tamil-English mix

**Voice Settings:**
- Language selection
- Saved preference
- Falls back to device language
- Per-session override

**Manglish Support:**
- Malayalam written in Latin script
- Common word mappings
- Dictionary-based translation
- User-extensible

### 12.3 VOICE COMMANDS

**On Record Tab:**
- Transcribed text appends to input
- Can mix typing and dictation
- Multiple recordings accumulate

**On Ask Tab:**
- Transcribed text replaces input
- One question at a time
- Immediate query execution

---

## NOTIFICATIONS & REMINDERS

### 13.1 LOCAL NOTIFICATIONS

**Scheduling:**
- Local notifications (expo-notifications)
- No server required
- Works offline and when app closed
- Inexact timing (Android power saving)

**Notification Types:**
- Reminder alerts
- Appointment alerts (30 min before)
- Budget alerts
- Weekly review nudge

**Permission Handling:**
- Requested on first use
- Not at app launch
- Permission status shown
- Settings deep-link

### 13.2 REMINDER LOGIC

**Scheduling Rules:**
- Clock time specified → notify at that time
- Appointment → 30 min before
- Only day given → 9:00 AM that day
- "Today" after 9 AM → 1 hour from now
- Past dates → no notification
- Tasks/memories → no notification

**Notification Actions:**
- Done: Mark as complete
- Tomorrow: Reschedule +1 day
- Dismiss: Close notification
- Open app: View entry

### 13.3 RECURRING REMINDERS

**Daily Repeats:**
- Same time every day
- Moves to next occurrence when done
- Never closes
- Can be paused

**Weekly Repeats:**
- Same day each week
- Example: "Gym every Monday"
- Advances week by week

**Monthly Repeats:**
- Same date each month
- Example: "Pay rent on the 1st"
- Handles month-end cases

---

## SETTINGS & CUSTOMIZATION

### 14.1 APP SETTINGS

**General Settings:**
- Language selection
- Voice language
- Theme (Light/Dark/Auto)
- Currency default
- Date format preference

**Expense Settings:**
- Monthly budget amount
- Budget alerts on/off
- Default payment method
- Category customization

**Sync Settings:**
- Auto-sync enable/disable
- Sync frequency
- Last sync time display
- Pending changes count
- Account status

**Notification Settings:**
- Reminders on/off
- Notification time preferences
- Weekly review day/time
- Budget alert thresholds

**Privacy Settings:**
- Export data
- Clear local data
- Delete account
- View privacy policy

### 14.2 CATEGORY CUSTOMIZATION

**Expense Categories:**
- Add new categories
- Edit existing (name, icon, color)
- Set monthly budget per category
- Archive unused categories
- Restore archived categories
- Delete (with warning if in use)

**Income Categories:**
- Same management as expense
- Separate list
- Custom icons and colors

**Icon Selection:**
- Ionicons library
- Visual picker
- Preview before saving

**Color Picker:**
- Preset palette (accessible)
- Custom hex entry
- Color accessibility info

### 14.3 ACCOUNT MANAGEMENT

**Profile:**
- User name
- Email (for sync)
- Profile image (optional)

**Authentication:**
- Sign in/sign up
- Email verification
- Password reset
- Sign out

**Data Management:**
- View storage usage
- Clear cache
- Export all data
- Import from backup

---

## ANDROID-SPECIFIC FEATURES

### 15.1 HOME SCREEN WIDGET

**Widget Type:**
- Priority tasks widget
- Shows upcoming and overdue items
- Tap to open entry
- Updates when data changes

**Widget Configuration:**
- Choose what to display
- Update frequency
- Size options

**Widget Sync:**
- Updates on app data changes
- Background updates
- Battery-efficient

### 15.2 SHARE TARGET

**Receive Shared Content:**
- Images (receipts, documents)
- Text (notes, URLs)
- Queue for processing
- Background handling

**Share Processing:**
- OCR on images
- Text extraction
- Auto-categorization
- Review before saving

---

## TECHNICAL INFRASTRUCTURE

### 16.1 STATE MANAGEMENT

**Global State:**
- ThemeContext: Theme and colors
- ExpenseThemeProvider: Expense-specific theme
- dialogStore: Modal dialogs
- draftStore: Preview drafts
- shareProcessingStore: Share intents

**Local State:**
- React hooks (useState, useReducer)
- Per-screen state
- Form state
- UI state

**Derived State:**
- useMemo for computed values
- useCallback for stable functions
- Optimized re-renders

### 16.2 DATA FETCHING

**Custom Hooks:**
- `useMemories()`: Live timeline
- `usePendingNotes()`: Retry queue
- `useTitleChecks()`: Spell-check queue
- `useGroups()`: Group list
- `useVoiceInput()`: Voice recording
- `useExpenseSync()`: Sync status

**Caching:**
- React state caching
- Memoized selectors
- Stale-while-revalidate pattern

**Error Handling:**
- Try-catch blocks
- User-friendly error messages
- Retry logic for transient failures
- Fallbacks for API failures

### 16.3 PERFORMANCE

**Optimizations:**
- FlatList/SectionList virtualization
- Memoized components
- useCallback for event handlers
- Debounced search
- Lazy loading of images

**Bundle Size:**
- Tree shaking
- Code splitting (Expo Router)
- Lazy imports for heavy screens
- Asset optimization

**Database Performance:**
- Indexes on frequently queried columns
- Batch operations where possible
- Transaction wrapping for writes
- WAL mode for concurrency

### 16.4 ERROR HANDLING & LOGGING

**Error Boundaries:**
- Screen-level boundaries
- Graceful degradation
- User-friendly error display
- Retry mechanisms

**Logging:**
- Event log table in database
- Error tracking
- Success/failure logging
- User-visible log viewer

**Crash Reporting:**
- Error boundary catches
- Logging to database
- User can view logs
- Helpful for debugging

---

## DATABASE SCHEMA

### 17.1 MEMORIES TABLE

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY NOT NULL,
  raw_input TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  event_date TEXT NOT NULL,
  date_expression TEXT,
  created_at TEXT NOT NULL,
  amount REAL,
  currency TEXT,
  people TEXT,
  location TEXT,
  tags TEXT,
  priority TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  confirmed INTEGER NOT NULL DEFAULT 0,
  repeat TEXT,
  end_date TEXT,
  group_name TEXT,
  updated_at TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1
);
```

**Indexes:**
- `idx_memories_event_date` on event_date DESC
- `idx_memories_category` on category
- `idx_memories_type` on type

### 17.2 EXPENSE TABLES

**categories:**
- id, name, icon, color, monthly_budget
- updated_at, dirty, deleted

**expenses:**
- id, amount, category_id, date, note, notes
- method, user_tag, place, recurring_id
- account_id, cancelled, refund_amount, refund_account_id
- refund_income_id, people_count, refund_people_count
- sub_category, reimbursed, reimburse_amount
- reimburse_account_id, reimburse_income_id
- updated_at, dirty, deleted

**expense_items:**
- id, expense_id, name, quantity, amount

**income:**
- id, amount, category_id, date, note, notes
- method, user_tag, place, account_id
- updated_at, dirty, deleted

**recurring_expenses:**
- id, amount, category_id, note, method, day, last_ym

**accounts:**
- id, name, type, balance, initial_balance
- updated_at, dirty, deleted

**tagged_users:**
- id, name (people who appear in expenses)

**tagged_places:**
- id, name (frequently visited places)

**ticket_types:**
- id, name (Flight, Train, etc.)

**borrow_lend:**
- id, type ('borrow'/'lend'), amount, person
- date, reason, due_date, settled, settled_date
- updated_at, dirty, deleted

### 17.3 SUPPORTING TABLES

**questions:**
- text (primary key), asked_at
- (Recent questions on Ask tab)

**settings:**
- key, value
- (App preferences)

**spellings:**
- heard (primary key), correct, source, updated_at
- (Learned title spellings)

**logs:**
- id, at, level, event, detail
- (App event log)

**pending_titles:**
- id, title, type, created_at, attempts, last_attempt_at, last_error
- (Titles awaiting spell check)

**pending_notes:**
- id, text, created_at, attempts, last_attempt_at, last_error
- (Notes awaiting AI extraction)

---

## ADVANCED FEATURES

### 18.1 TRIP SPENDING TRACKING

**Trip Detection:**
- Groups by trip name
- Date range detection
- Location-based grouping

**Trip Analytics:**
- Total spending per trip
- Category breakdown
- Per-day averages
- Companions spending
- Compare trips

**Trip Queries:**
- "How much did I spend in Kozhikode?"
- "Show me all expenses from my trip"
- Natural language trip questions

### 18.2 WEEKLY REVIEW

**Review Notification:**
- Scheduled weekly notification
- Configurable day and time
- Summary of week's activity

**Review Screen:**
- Week's captures
- Completed tasks
- Spending summary
- Highlights and insights
- Pending items

### 18.3 EXPENSE HISTORY

**Full History View:**
- All expenses chronologically
- Filter by date range
- Filter by category
- Search by description
- Sort options

**History Features:**
- Quick edit
- Bulk selection
- Export to CSV
- Share entries

### 18.4 LOGS VIEWER

**Event Log:**
- All app operations logged
- Success and failure events
- Timestamps
- Searchable
- Filterable by level

**Log Levels:**
- Info: Normal operations
- Error: Failed operations
- Warning: Issues that recovered

**Use Cases:**
- Debugging sync issues
- Understanding what happened
- Support ticket information

---

## OVER-THE-AIR UPDATES

**Expo Updates:**
- Auto-download in background
- Apply on next launch (30+ sec away)
- No app store required for JS changes
- Fingerprint-based compatibility

**Update Banner:**
- Shows when update downloaded
- "Update ready - restart to apply"
- Tap to restart
- Non-intrusive

**Update Strategy:**
- Check on launch
- Check on foreground
- Download in background
- Apply when idle

---

## MULTI-LANGUAGE SUPPORT

**UI Languages:**
- English (primary)
- Extensible for other UI languages

**Voice Languages:**
- English (multiple accents)
- Hindi
- Malayalam
- Tamil
- Code-switching support (Hinglish, Manglish)

**Date/Time Localization:**
- Locale-aware formatting
- Configurable preferences
- Relative dates ("today", "yesterday")

---

## ACCESSIBILITY FEATURES

**Screen Reader Support:**
- Labeled UI elements
- Semantic HTML on web
- ARIA attributes
- Announcement handling

**Color Accessibility:**
- WCAG AA compliant palette
- Not relying on color alone
- High contrast mode support
- Visual indicators beyond color

**Text Scaling:**
- Respects system text size
- Dynamic type support
- Readable at all sizes

**Touch Targets:**
- Minimum 44x44 pt
- Adequate spacing
- Haptic feedback

---

## SECURITY & PRIVACY

**Data Security:**
- Local-first (no server required)
- Optional cloud sync
- Encrypted connections (HTTPS)
- Row-level security on server

**API Key Handling:**
- Environment variables
- Not committed to git
- Server-side preferred for production

**User Data:**
- No tracking or analytics
- No third-party SDKs
- Data stays with user
- Export and delete capabilities

**Permissions:**
- Microphone (only when needed)
- Notifications (opt-in)
- Camera/photos (for receipts, opt-in)
- No location tracking

---

## TESTING & QUALITY

**Test Coverage:**
- Schema tests (DDL validation)
- Logic tests (pure functions)
- AI tests (live API calls)
- 35+ assertions

**Test Types:**
- Unit tests (pure functions)
- Integration tests (database operations)
- AI behavior tests (extraction, retrieval)

**Quality Checks:**
- TypeScript strict mode
- ESLint
- Type checking (`tsc --noEmit`)
- Manual testing on devices

---

## SUMMARY OF ALL FEATURES

### CORE FEATURES
1. ✅ Voice and text memory capture
2. ✅ AI-powered information extraction
3. ✅ Multi-event extraction from single input
4. ✅ Timeline view with filtering
5. ✅ Natural language querying (Ask tab)
6. ✅ Comprehensive expense tracking
7. ✅ Income tracking
8. ✅ Bank account management
9. ✅ Borrow & lend tracking
10. ✅ Recurring expenses
11. ✅ Receipt OCR
12. ✅ Budget management
13. ✅ Category customization
14. ✅ Analytics and insights
15. ✅ Groups and organization

### MEMORY TYPES
16. ✅ General memories
17. ✅ Tasks with completion tracking
18. ✅ Reminders with notifications
19. ✅ Purchases
20. ✅ Appointments
21. ✅ Wishlists (Play, Watch, Buy)

### DATA FEATURES
22. ✅ Local SQLite database
23. ✅ Cloud sync (Supabase)
24. ✅ Offline-first operation
25. ✅ Conflict resolution
26. ✅ Export to CSV
27. ✅ Data backup and restore
28. ✅ Share intent integration

### AI FEATURES
29. ✅ Multi-language transcription
30. ✅ Entity recognition
31. ✅ Date parsing (relative and absolute)
32. ✅ Amount extraction
33. ✅ Category classification
34. ✅ Auto-complete suggestions
35. ✅ Title spell checking
36. ✅ Evidence-based answers
37. ✅ Command execution
38. ✅ Trip spending analysis

### UI/UX FEATURES
39. ✅ Light and dark themes
40. ✅ Bottom tab navigation
41. ✅ Time gutter layout
42. ✅ Voice waveform visualization
43. ✅ Charts and visualizations
44. ✅ Empty states
45. ✅ Loading states
46. ✅ Error handling
47. ✅ Confirmation dialogs
48. ✅ Swipe actions
49. ✅ Pull-to-refresh

### PLATFORM FEATURES
50. ✅ iOS support
51. ✅ Android support
52. ✅ Web support
53. ✅ Android home screen widget
54. ✅ Share target (Android)
55. ✅ Local notifications
56. ✅ Haptic feedback
57. ✅ OTA updates

### EXPENSE FEATURES
58. ✅ Multiple categories with icons/colors
59. ✅ Payment methods (Cash/UPI/Card/Bank)
60. ✅ Tagged people and places
61. ✅ Itemized expenses
62. ✅ Refund tracking
63. ✅ Reimbursement tracking
64. ✅ Ticket sub-categories
65. ✅ Partial refunds
66. ✅ Net worth tracking

### ANALYTICS FEATURES
67. ✅ Period selection (month, 3 months, year, all, custom)
68. ✅ Category breakdown
69. ✅ Monthly trends
70. ✅ Comparison mode
71. ✅ Savings rate
72. ✅ Budget progress
73. ✅ Per-day averages
74. ✅ Task completion metrics
75. ✅ Capture statistics

### ORGANIZATIONAL FEATURES
76. ✅ Groups for related entries
77. ✅ Filtering by type, status, date, group
78. ✅ Timeline view
79. ✅ Calendar view
80. ✅ Today quick filter
81. ✅ Overdue tracking
82. ✅ Recurring entry management

### ADVANCED FEATURES
83. ✅ Weekly review notifications
84. ✅ Event logging
85. ✅ Pending operations queue
86. ✅ Retry logic for failures
87. ✅ Title verification via web search
88. ✅ Manglish support
89. ✅ Code-switching in speech
90. ✅ Trip spending queries

### SETTINGS & CUSTOMIZATION
91. ✅ Language preferences
92. ✅ Voice language selection
93. ✅ Currency defaults
94. ✅ Budget configuration
95. ✅ Notification preferences
96. ✅ Sync configuration
97. ✅ Theme selection
98. ✅ Data management

### ACCESSIBILITY
99. ✅ Screen reader support
100. ✅ High contrast compliance
101. ✅ Dynamic text sizing
102. ✅ Haptic feedback
103. ✅ Keyboard navigation

---

## CONCLUSION

PERAI is a feature-rich personal memory and expense tracking application that combines:

- **AI-powered intelligence** for natural language understanding
- **Comprehensive financial tracking** with detailed analytics
- **Offline-first architecture** with optional cloud sync
- **Multi-platform support** (iOS, Android, Web)
- **Privacy-focused design** with local data storage
- **Rich user experience** with voice input and intuitive UI
- **Extensible and customizable** categories, budgets, and preferences

The app successfully integrates personal memory management with financial tracking, providing users with a unified platform for capturing and querying their personal data through natural language interfaces.

**Total Documented Features: 103+**

**Last Updated:** October 24, 2026
