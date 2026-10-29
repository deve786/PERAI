import { getDb as getPeraiDb } from './client';
import { getDb as getExpenseDb, findOrCreateCategory, findOrCreateIncomeCategory, getSetting, saveExpense, saveExpenseItems, saveIncome, setSetting, uuid } from '../expense/db';
import { saveAccount } from '../expense/accountsDb';
import { saveBorrowLend } from '../expense/borrowLendDb';
import { getSourcesDb } from '../sources/client';
import { todayStr, addDays } from '../expense/dates';
import type { Memory } from '../types';

const nowIso = () => new Date().toISOString();

/** Set once sample data has been loaded or taken out; from then on it is never loaded by itself again. */
export const SAMPLE_HANDLED_KEY = 'sample_data_handled';

/**
 * Whether this is a brand-new install that has never held anything.
 *
 * Deliberately strict. "No expenses and no notes right now" is also what a
 * phone looks like after its sample data was removed, and loading the sample
 * data again then would undo the removal. So any trace of earlier use, even a
 * row deleted long ago or a saved place or person, or the marker left when
 * sample data was loaded or removed, means it is not new.
 */
export async function isDatabaseEmpty(): Promise<boolean> {
  try {
    const expenseDb = await getExpenseDb();
    if (await getSetting(SAMPLE_HANDLED_KEY, '')) return false;

    for (const table of ['expenses', 'income', 'accounts', 'borrow_lend', 'tagged_users', 'tagged_places']) {
      try {
        const row = await expenseDb.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
        if ((row?.c ?? 0) > 0) return false;
      } catch {
        // A table that does not exist yet holds nothing.
      }
    }

    const peraiDb = getPeraiDb();
    const memRow = await peraiDb.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM memories');
    if ((memRow?.c ?? 0) > 0) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Populate realistic, relatable dummy data across all sections:
 * - Accounts (HDFC, SBI, ICICI Card, Cash, Index Fund)
 * - Monthly category budgets
 * - Current month expenses with line items and tagged places/people
 * - Current month income
 * - Active refund alert (IRCTC Tatkal ticket)
 * - Borrow & Lend records
 * - Recurring bills and subscriptions
 * - Tasks, notes, reminders, wishlist in Memories
 * - Knowledge sources (Documents, Website pages, Telegram messages)
 */
export async function seedAllDummyData(force = false): Promise<void> {
  const expenseDb = await getExpenseDb();
  const peraiDb = getPeraiDb();
  const sourcesDb = await getSourcesDb();

  if (!force) {
    const empty = await isDatabaseEmpty();
    if (!empty) return;
  }
  // Written first: even if loading is interrupted, it is not retried by itself.
  await setSetting(SAMPLE_HANDLED_KEY, '1').catch(() => {});

  const today = todayStr();
  const now = nowIso();

  // ==========================================
  // 1. ACCOUNTS & NET WORTH
  // ==========================================
  const accHdfcId = 'acc-hdfc-01';
  const accSbiId = 'acc-sbi-02';
  const accCardId = 'acc-icici-03';
  const accCashId = 'acc-cash-04';
  const accStockId = 'acc-stock-05';

  await saveAccount({
    id: accHdfcId,
    name: 'HDFC Bank Savings',
    type: 'bank',
    balance: 54200,
    currency: '₹',
    institution: 'HDFC Bank',
    notes: 'Primary UPI and daily spending account',
  });

  await saveAccount({
    id: accSbiId,
    name: 'SBI Salary Account',
    type: 'bank',
    balance: 88400,
    currency: '₹',
    institution: 'State Bank of India',
    notes: 'Direct salary deposit',
  });

  await saveAccount({
    id: accCardId,
    name: 'ICICI Coral Credit Card',
    type: 'other',
    balance: -8450,
    currency: '₹',
    institution: 'ICICI Bank',
    notes: 'Dining & travel cashbacks',
  });

  await saveAccount({
    id: accCashId,
    name: 'Cash Wallet',
    type: 'cash',
    balance: 3250,
    currency: '₹',
    institution: 'Cash',
    notes: 'Physical pocket cash',
  });

  await saveAccount({
    id: accStockId,
    name: 'Nifty 50 Index & Mutual Funds',
    type: 'stock',
    balance: 142000,
    invested: 120000,
    currency: '₹',
    institution: 'Zerodha',
    notes: 'Long-term equity SIP',
  });

  // ==========================================
  // 2. CATEGORIES & MONTHLY BUDGETS
  // ==========================================
  const foodId = await findOrCreateCategory('Food');
  const groceriesId = await findOrCreateCategory('Groceries');
  const transportId = await findOrCreateCategory('Transport');
  const shoppingId = await findOrCreateCategory('Shopping');
  const entertainmentId = await findOrCreateCategory('Entertainment');
  const utilitiesId = await findOrCreateCategory('Utilities');
  const healthId = await findOrCreateCategory('Health');
  const travelId = await findOrCreateCategory('Travel');
  const fitnessId = await findOrCreateCategory('Fitness');

  await expenseDb.runAsync('UPDATE categories SET monthly_budget = ? WHERE id = ?', 12000, foodId);
  await expenseDb.runAsync('UPDATE categories SET monthly_budget = ? WHERE id = ?', 8000, groceriesId);
  await expenseDb.runAsync('UPDATE categories SET monthly_budget = ? WHERE id = ?', 6000, shoppingId);
  await expenseDb.runAsync('UPDATE categories SET monthly_budget = ? WHERE id = ?', 4000, transportId);
  await expenseDb.runAsync('UPDATE categories SET monthly_budget = ? WHERE id = ?', 5000, utilitiesId);
  await expenseDb.runAsync('UPDATE categories SET monthly_budget = ? WHERE id = ?', 3000, entertainmentId);

  // ==========================================
  // 3. EXPENSES (SPREAD ACROSS CURRENT MONTH)
  // ==========================================
  // Expense 1: Today lunch
  const exp1Id = await saveExpense({
    amount: 450,
    category_id: foodId,
    date: today,
    note: 'Swiggy Gourmet - Chicken Biryani',
    notes: 'Lunch at office',
    method: 'UPI',
    place: 'Swiggy',
    account_id: accHdfcId,
  });
  await saveExpenseItems(exp1Id, [
    { name: 'Chicken Biryani Special', quantity: 1, amount: 380 },
    { name: 'Gulab Jamun (2 pcs)', quantity: 1, amount: 70 },
  ]);

  // Expense 2: Today coffee
  await saveExpense({
    amount: 220,
    category_id: foodId,
    date: today,
    note: 'Cold Brew & Butter Croissant',
    notes: 'Evening coffee break',
    method: 'UPI',
    place: 'Blue Tokai Cafe',
    account_id: accHdfcId,
  });

  // Expense 3: Yesterday groceries
  const exp3Id = await saveExpense({
    amount: 1680,
    category_id: groceriesId,
    date: addDays(today, -1),
    note: 'Weekly Organic Grocery Restock',
    notes: 'Nature Basket supermarket',
    method: 'Card',
    place: "Nature's Basket",
    account_id: accCardId,
  });
  await saveExpenseItems(exp3Id, [
    { name: 'Extra Virgin Olive Oil 500ml', quantity: 1, amount: 650 },
    { name: 'Artisan Sourdough Loaf', quantity: 1, amount: 180 },
    { name: 'Oat Milk 1L', quantity: 2, amount: 450 },
    { name: 'Farm Fresh Organic Veggies', quantity: 1, amount: 400 },
  ]);

  // Expense 4: Yesterday taxi
  await saveExpense({
    amount: 320,
    category_id: transportId,
    date: addDays(today, -1),
    note: 'Uber Ride to Tech Park',
    notes: 'Morning office commute',
    method: 'UPI',
    place: 'Uber',
    account_id: accHdfcId,
  });

  // Expense 5: 2 days ago - IRCTC Tatkal (Refund Watchdog Alert!)
  const refundExpId = await saveExpense({
    amount: 1420,
    category_id: travelId,
    date: addDays(today, -2),
    note: 'IRCTC Tatkal - Train 12626 to Kochi',
    notes: 'Waiting list not confirmed, refund expected',
    method: 'UPI',
    account_id: accHdfcId,
  });
  // Mark cancelled with refund pending so the Refund Watchdog card lights up!
  await expenseDb.runAsync(
    `UPDATE expenses SET
       cancelled = 1,
       cancelled_at = ?,
       refund_amount = 1420,
       people_count = 1,
       sub_category = 'Train',
       updated_at = ?,
       dirty = 1
     WHERE id = ?`,
    addDays(today, -2),
    now,
    refundExpId
  );

  // Expense 6: Metro recharge
  await saveExpense({
    amount: 200,
    category_id: transportId,
    date: addDays(today, -2),
    note: 'Metro Smart Card Auto-Topup',
    notes: 'Station kiosk',
    method: 'UPI',
    account_id: accHdfcId,
  });

  // Expense 7: 4 days ago - Dinner with friends
  await saveExpense({
    amount: 2400,
    category_id: foodId,
    date: addDays(today, -4),
    note: 'Weekend Buffet with Friends',
    notes: 'Barbeque Nation buffet',
    method: 'Card',
    user_tag: 'Rahul',
    place: 'Barbeque Nation',
    account_id: accCardId,
  });

  // Expense 8: 7 days ago - Shell petrol
  await saveExpense({
    amount: 2100,
    category_id: transportId,
    date: addDays(today, -7),
    note: 'Car Fuel Refill',
    notes: 'V-Power Petrol',
    method: 'Card',
    place: 'Shell Petrol Pump',
    account_id: accCardId,
  });

  // Expense 9: 8 days ago - Pharmacy
  await saveExpense({
    amount: 650,
    category_id: healthId,
    date: addDays(today, -8),
    note: 'Multivitamins & First Aid',
    notes: 'Apollo Pharmacy',
    method: 'UPI',
    place: 'Apollo Pharmacy',
    account_id: accHdfcId,
  });

  // Expense 10: 10 days ago - Clothes shopping
  await saveExpense({
    amount: 3850,
    category_id: shoppingId,
    date: addDays(today, -10),
    note: 'Autumn Casuals & Chinos',
    notes: 'Weekend shopping mall',
    method: 'Card',
    place: 'Zara',
    account_id: accCardId,
  });

  // Expense 11: 14 days ago - Electricity bill
  await saveExpense({
    amount: 1850,
    category_id: utilitiesId,
    date: addDays(today, -14),
    note: 'State Electricity Board Bill',
    notes: 'Home power consumption',
    method: 'UPI',
    account_id: accHdfcId,
  });

  // Expense 12: 18 days ago - Broadband fiber
  await saveExpense({
    amount: 799,
    category_id: utilitiesId,
    date: addDays(today, -18),
    note: 'Airtel Broadband 200Mbps',
    notes: 'Monthly fiber internet',
    method: 'UPI',
    place: 'Airtel Fiber',
    account_id: accHdfcId,
  });

  // Expense 13: 22 days ago - Cult gym
  await saveExpense({
    amount: 1500,
    category_id: fitnessId,
    date: addDays(today, -22),
    note: 'Cult.fit Gym Monthly Pass',
    notes: 'Strength & conditioning',
    method: 'Card',
    place: 'Cult.fit',
    account_id: accCardId,
  });

  // Expense 14: 25 days ago - IMAX movie
  await saveExpense({
    amount: 940,
    category_id: entertainmentId,
    date: addDays(today, -25),
    note: 'IMAX Movie Tickets & Popcorn',
    notes: 'Weekend evening show',
    method: 'UPI',
    place: 'PVR Cinemas',
    account_id: accHdfcId,
  });

  // ==========================================
  // 4. INCOME
  // ==========================================
  const salaryIncId = await findOrCreateIncomeCategory('Salary');
  const freelanceIncId = await findOrCreateIncomeCategory('Freelance');
  const investIncId = await findOrCreateIncomeCategory('Investments');

  await saveIncome({
    amount: 85000,
    category_id: salaryIncId,
    date: addDays(today, -26),
    note: 'October Tech Salary',
    notes: 'Direct company bank transfer',
    method: 'Bank',
    account_id: accSbiId,
  });

  await saveIncome({
    amount: 12500,
    category_id: freelanceIncId,
    date: addDays(today, -12),
    note: 'UI/UX Mobile Design Milestone',
    notes: 'Client app delivery payment',
    method: 'Bank',
    account_id: accHdfcId,
  });

  await saveIncome({
    amount: 2000,
    category_id: investIncId,
    date: addDays(today, -5),
    note: 'Index Fund Dividend Payout',
    notes: 'Quarterly payout',
    method: 'UPI',
    account_id: accHdfcId,
  });

  // ==========================================
  // 5. BORROW & LEND
  // ==========================================
  await saveBorrowLend({
    person_name: 'Rahul',
    type: 'lent',
    amount: 2500,
    date: addDays(today, -3),
    due_date: addDays(today, 5),
    notes: 'Concert pass & dinner split',
    status: 'active',
    settled_amount: 0,
    settled_at: null,
  });

  await saveBorrowLend({
    person_name: 'Priya',
    type: 'lent',
    amount: 1200,
    date: addDays(today, -6),
    due_date: addDays(today, 8),
    notes: 'Supermarket bill share',
    status: 'active',
    settled_amount: 0,
    settled_at: null,
  });

  await saveBorrowLend({
    person_name: 'Sarah',
    type: 'borrowed',
    amount: 800,
    date: addDays(today, -2),
    due_date: addDays(today, 3),
    notes: 'Airport taxi cash contribution',
    status: 'active',
    settled_amount: 0,
    settled_at: null,
  });

  await saveBorrowLend({
    person_name: 'Amit',
    type: 'lent',
    amount: 5000,
    date: addDays(today, -15),
    due_date: addDays(today, -5),
    notes: 'Camera lens security deposit',
    status: 'settled',
    settled_amount: 5000,
    settled_at: addDays(today, -4),
  });

  // ==========================================
  // 6. RECURRING SUBSCRIPTIONS
  // ==========================================
  await expenseDb.runAsync(
    'INSERT OR REPLACE INTO recurring (id, amount, category_id, note, method, day, last_ym, updated_at, dirty, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)',
    'rec-netflix', 649, entertainmentId, 'Netflix Premium 4K', 'Card', 5, today.slice(0, 7), now
  );

  await expenseDb.runAsync(
    'INSERT OR REPLACE INTO recurring (id, amount, category_id, note, method, day, last_ym, updated_at, dirty, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)',
    'rec-spotify', 199, entertainmentId, 'Spotify Family Subscription', 'UPI', 12, today.slice(0, 7), now
  );

  await expenseDb.runAsync(
    'INSERT OR REPLACE INTO recurring (id, amount, category_id, note, method, day, last_ym, updated_at, dirty, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)',
    'rec-fiber', 799, utilitiesId, 'Airtel Fiber Broadband', 'UPI', 18, today.slice(0, 7), now
  );

  await expenseDb.runAsync(
    'INSERT OR REPLACE INTO recurring (id, amount, category_id, note, method, day, last_ym, updated_at, dirty, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)',
    'rec-gym', 1500, fitnessId, 'Cult.fit Gym Monthly', 'Card', 1, today.slice(0, 7), now
  );

  // ==========================================
  // 7. MEMORIES / TASKS / REMINDERS
  // ==========================================
  const memories: Memory[] = [
    {
      id: uuid(),
      rawInput: 'Review Q4 product roadmap with design team at 11am',
      title: 'Review Q4 product roadmap with design team',
      type: 'task',
      category: 'Work',
      eventDate: `${today}T11:00:00.000Z`,
      dateExpression: 'today at 11am',
      createdAt: now,
      amount: null,
      currency: null,
      people: 'Design Team',
      location: 'Conference Room B',
      tags: 'roadmap, design, q4',
      priority: 'high',
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: 'Work Projects',
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Doctor dental routine checkup at 4:30pm in two days',
      title: 'Doctor dental routine checkup',
      type: 'appointment',
      category: 'Health',
      eventDate: `${addDays(today, 2)}T16:30:00.000Z`,
      dateExpression: 'in two days at 4:30pm',
      createdAt: now,
      amount: null,
      currency: null,
      people: 'Dr. Nair',
      location: 'City Dental Clinic',
      tags: 'dentist, health, checkup',
      priority: 'medium',
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: null,
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Submit travel expense reimbursements to finance tomorrow',
      title: 'Submit travel expense reimbursements to finance',
      type: 'task',
      category: 'Work',
      eventDate: `${addDays(today, 1)}T15:00:00.000Z`,
      dateExpression: 'tomorrow at 3pm',
      createdAt: now,
      amount: 1420,
      currency: 'INR',
      people: 'Finance Team',
      location: null,
      tags: 'finance, travel, expense',
      priority: 'medium',
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: 'Work Projects',
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Pick up dry cleaning and organic groceries today at 6pm',
      title: 'Pick up dry cleaning & groceries',
      type: 'task',
      category: 'Personal Care',
      eventDate: `${today}T18:00:00.000Z`,
      dateExpression: 'today at 6pm',
      createdAt: now,
      amount: null,
      currency: null,
      people: null,
      location: "Nature's Basket",
      tags: 'errands, home',
      priority: 'low',
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: 'Personal',
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Ideas for next AI voice feature: offline embeddings & local whisper model',
      title: 'Ideas for next AI voice feature: offline embeddings & local whisper',
      type: 'memory',
      category: 'Work',
      eventDate: `${addDays(today, -1)}T10:00:00.000Z`,
      dateExpression: null,
      createdAt: now,
      amount: null,
      currency: null,
      people: null,
      location: null,
      tags: 'ai, voice, product',
      priority: 'low',
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: 'AI R&D',
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Renew car comprehensive insurance before expiry in 4 days',
      title: 'Renew car comprehensive insurance',
      type: 'reminder',
      category: 'Travel',
      eventDate: `${addDays(today, 4)}T10:00:00.000Z`,
      dateExpression: 'in 4 days',
      createdAt: now,
      amount: 12500,
      currency: 'INR',
      people: null,
      location: null,
      tags: 'car, insurance, policy',
      priority: 'high',
      status: 'active',
      confirmed: true,
      repeat: 'monthly',
      endDate: null,
      groupName: null,
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Plan weekend hiking trip to Nandi Hills with Alex and Priya',
      title: 'Plan weekend hiking trip to Nandi Hills',
      type: 'task',
      category: 'Fitness',
      eventDate: `${addDays(today, 5)}T07:00:00.000Z`,
      dateExpression: 'Saturday morning',
      createdAt: now,
      amount: null,
      currency: null,
      people: 'Alex, Priya',
      location: 'Nandi Hills',
      tags: 'hiking, outdoors, weekend',
      priority: 'medium',
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: 'Fitness',
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Sony WH-1000XM5 Noise Cancelling Headphones',
      title: 'Sony WH-1000XM5 Noise Cancelling Headphones',
      type: 'wish',
      category: 'Shopping',
      eventDate: `${today}T00:00:00.000Z`,
      dateExpression: null,
      createdAt: now,
      amount: 26990,
      currency: 'INR',
      people: null,
      location: 'Sony Center / Amazon',
      tags: 'audio, headphones, tech',
      priority: null,
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: 'Wishlist',
      updatedAt: now,
    },
    {
      id: uuid(),
      rawInput: 'Dune: Part Two (IMAX Experience)',
      title: 'Dune: Part Two (IMAX Experience)',
      type: 'watch',
      category: 'Entertainment',
      eventDate: `${today}T00:00:00.000Z`,
      dateExpression: null,
      createdAt: now,
      amount: null,
      currency: null,
      people: null,
      location: 'PVR IMAX',
      tags: 'sci-fi, cinema',
      priority: null,
      status: 'active',
      confirmed: true,
      repeat: null,
      endDate: null,
      groupName: 'Watchlist',
      updatedAt: now,
    },
  ];

  for (const m of memories) {
    await peraiDb.runAsync(
      `INSERT OR REPLACE INTO memories (
        id, raw_input, title, type, category, event_date, date_expression, created_at,
        amount, currency, people, location, tags, priority, status, confirmed, repeat,
        end_date, group_name, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id, m.rawInput, m.title, m.type, m.category, m.eventDate, m.dateExpression, m.createdAt,
      m.amount, m.currency, m.people, m.location, m.tags, m.priority, m.status, m.confirmed ? 1 : 0, m.repeat,
      m.endDate, m.groupName, m.updatedAt
    );
  }

  // ==========================================
  // 8. DATA SOURCES (DOCUMENTS, WEBSITES, TELEGRAM)
  // ==========================================
  // Document 1
  const doc1Id = 'doc-ship-schedule';
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO documents (id, filename, file_type, file_size, file_uri, uploaded_at, processed, chunk_count, updated_at, dirty, deleted)
     VALUES (?, ?, ?, ?, ?, ?, 1, 3, ?, 1, 0)`,
    doc1Id, 'Lakshadweep Ship Schedule 2026.pdf', 'pdf', 245760, 'file:///sample/Lakshadweep_Ship_Schedule_2026.pdf', now, now
  );
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO document_chunks (id, document_id, chunk_index, content, page_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'chk-1', doc1Id, 0, 'MV Lagoons departs Kochi on 26/10/2026 at 10:00 hrs bound for Kavaratti and Agatti. Arrival at Kavaratti on 27/10/2026 at 06:00 hrs. All passengers must carry government photo identification and verified island entry permit.', 1, now
  );
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO document_chunks (id, document_id, chunk_index, content, page_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'chk-2', doc1Id, 1, 'MV Corals departs Kochi on 29/10/2026 at 11:30 hrs for Androth and Kalpeni. High speed vessel HSC Parali operates daily connecting voyages between Kavaratti, Kadmat and Amini islands.', 1, now
  );
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO document_chunks (id, document_id, chunk_index, content, page_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'chk-3', doc1Id, 2, 'Passenger ticketing & cancellation policy: cancellations made more than 48 hours prior to vessel departure incur a 10% administrative clerkage fee. Within 24-48 hours incurs a 25% cancellation charge. Verified refunds are credited within 5 working days.', 2, now
  );

  // Document 2
  const doc2Id = 'doc-portfolio-q3';
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO documents (id, filename, file_type, file_size, file_uri, uploaded_at, processed, chunk_count, updated_at, dirty, deleted)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, 1, 0)`,
    doc2Id, 'Q3 Financial Portfolio Summary.pdf', 'pdf', 184320, 'file:///sample/Q3_Portfolio.pdf', now, now
  );
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO document_chunks (id, document_id, chunk_index, content, page_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'chk-4', doc2Id, 0, 'Investment portfolio breakdown: 60% allocated to Nifty 50 large-cap index funds, 25% in Mid-cap momentum funds, and 15% in Sovereign Gold Bonds. Total assets under management: ₹2,42,000 with year-to-date annualized return of +14.2%.', 1, now
  );

  // Website data
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO website_data (id, url, title, content, scraped_at, last_updated, refresh_interval, auto_refresh, dirty, deleted)
     VALUES (?, ?, ?, ?, ?, ?, 86400, 1, 1, 0)`,
    'web-1',
    'https://lakshadweeptourism.gov.in/voyages',
    'Official Lakshadweep Voyage Schedules & Island Permits',
    'Official port schedule portal. All voyages depart from Willingdon Island Berth 4, Kochi. Bookings open 15 days in advance. Dedicated tourist quota available for Agatti, Bangaram and Thinnakara island resorts.',
    now,
    now
  );

  // Telegram channel
  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO telegram_channels (id, channel_username, channel_name, last_message_id, last_synced_at, auto_sync, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    'tg-1', '@lakshadweep_ship_updates', 'Kerala & Island Ship Alerts', 104, now, now
  );

  await sourcesDb.runAsync(
    `INSERT OR REPLACE INTO telegram_messages (id, channel_id, channel_name, message_id, message_text, message_date, sender_name, synced_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    'tgm-1',
    '@lakshadweep_ship_updates',
    'Kerala & Island Ship Alerts',
    104,
    'Notice: MV Lagoons passenger boarding begins tomorrow at 08:30 AM sharp at Ernakulam Wharf. Please keep e-permits downloaded offline on mobile devices.',
    `${addDays(today, -1)}T08:30:00Z`,
    'Port Operations',
    now
  );
}
