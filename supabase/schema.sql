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
