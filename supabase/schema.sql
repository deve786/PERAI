-- PERAI: the server copy of your record.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
--
-- Dates stay as text, exactly as the phone wrote them, so nothing is reformatted
-- on the way back. Only updated_at is a real timestamp: it is what sync compares
-- and pages through, and the trigger below means the server's clock decides it,
-- not the phone's.

create table if not exists public.memories (
  id               text primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,

  raw_input        text not null,
  title            text not null,
  type             text not null,
  category         text not null,
  event_date       text not null,
  date_expression  text,
  created_at       text not null,
  amount           double precision,
  currency         text,
  people           text,
  location         text,
  tags             text,
  priority         text,
  status           text not null default 'active',
  confirmed        boolean not null default true,

  -- A deleted entry stays as a tombstone, so the delete reaches every device
  -- instead of being undone by an older copy.
  deleted          boolean not null default false,
  updated_at       timestamptz not null default now()
);

-- Your rows are yours: nothing else can read or write them.
alter table public.memories enable row level security;

drop policy if exists "memories are private" on public.memories;
create policy "memories are private" on public.memories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sync asks for "everything of mine changed since X", so index exactly that.
create index if not exists memories_user_updated_idx
  on public.memories (user_id, updated_at desc);

-- The server stamps the time on every write. A phone with a wrong clock can
-- then never write a row that sync would skip over.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists memories_touch_updated_at on public.memories;
create trigger memories_touch_updated_at
  before insert or update on public.memories
  for each row execute function public.touch_updated_at();

-- Added later. All safe to re-run, and all three are required: the app sends
-- these columns on every push, so a project missing one rejects the whole
-- batch and nothing is backed up.
--   repeat     — repeating entries ("gym every Monday")
--   end_date   — an entry covering a span rather than a moment (a trip)
--   group_name — the group an entry belongs to ("Kozhikode trip")
alter table public.memories add column if not exists repeat text;
alter table public.memories add column if not exists end_date timestamptz;
alter table public.memories add column if not exists group_name text;
create index if not exists idx_memories_group on public.memories (group_name);

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- EXPENSE BACKUP SCHEMA (Run in Expense Supabase project or shared project)
-- -----------------------------------------------------------------------------

create table if not exists public.categories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.categories enable row level security;
drop policy if exists "categories are private" on public.categories;
create policy "categories are private" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Added later, for per-category monthly budgets. Required: categories is the
-- first table pushed, so without this nothing in Expense is backed up.
alter table public.categories add column if not exists monthly_budget double precision;

-- Which spending belongs to which entry — the trip-spending link table. Lives
-- in the Expense project because that is where expenses are; the memory id is
-- carried as plain text rather than a foreign key across projects.
create table if not exists public.memory_expense_links (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  memory_id text not null,
  expense_id text not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.memory_expense_links enable row level security;
drop policy if exists "memory_expense_links are private" on public.memory_expense_links;
create policy "memory_expense_links are private" on public.memory_expense_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_mel_memory on public.memory_expense_links (memory_id);
create index if not exists idx_mel_expense on public.memory_expense_links (expense_id);

create table if not exists public.income_categories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.income_categories enable row level security;
drop policy if exists "income_categories are private" on public.income_categories;
create policy "income_categories are private" on public.income_categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.recurring (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount double precision not null,
  category_id text not null,
  note text not null default '',
  method text not null default 'Cash',
  day integer not null,
  last_ym text not null default '',
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.recurring enable row level security;
drop policy if exists "recurring are private" on public.recurring;
create policy "recurring are private" on public.recurring for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount double precision not null,
  category_id text not null,
  date text not null,
  note text not null default '',
  notes text not null default '',
  method text not null default 'Cash',
  recurring_id text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
drop policy if exists "expenses are private" on public.expenses;
create policy "expenses are private" on public.expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.expense_items (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expense_id text not null,
  name text not null default '',
  quantity double precision not null default 1,
  amount double precision not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.expense_items enable row level security;
drop policy if exists "expense_items are private" on public.expense_items;
create policy "expense_items are private" on public.expense_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.income (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount double precision not null,
  category_id text not null,
  date text not null,
  note text not null default '',
  notes text not null default '',
  method text not null default 'Cash',
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.income enable row level security;
drop policy if exists "income are private" on public.income;
create policy "income are private" on public.income for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
