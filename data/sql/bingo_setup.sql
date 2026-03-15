-- Ejecutar este script en SQL Editor de Supabase
-- Agrega tablas para: patrones, lotes de cartones y relacion lote-carton

create extension if not exists pgcrypto;

create table if not exists public.bingo_patterns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('letter', 'number')),
  cells jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Compatibilidad con tablas existentes de versiones anteriores
alter table if exists public.bingo_patterns
  add column if not exists id uuid;
alter table if exists public.bingo_patterns
  add column if not exists code text;
alter table if exists public.bingo_patterns
  add column if not exists name text;
alter table if exists public.bingo_patterns
  add column if not exists category text;
alter table if exists public.bingo_patterns
  add column if not exists cells jsonb;
alter table if exists public.bingo_patterns
  add column if not exists is_active boolean default true;
alter table if exists public.bingo_patterns
  add column if not exists created_at timestamptz default now();

update public.bingo_patterns
set id = gen_random_uuid()
where id is null;

update public.bingo_patterns
set category = 'letter'
where category is null;

update public.bingo_patterns
set is_active = true
where is_active is null;

update public.bingo_patterns
set created_at = now()
where created_at is null;

alter table public.bingo_patterns
  alter column id set default gen_random_uuid();

create unique index if not exists idx_bingo_patterns_id_unique on public.bingo_patterns (id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bingo_patterns_category_check'
      and conrelid = 'public.bingo_patterns'::regclass
  ) then
    alter table public.bingo_patterns
      add constraint bingo_patterns_category_check
      check (category in ('letter', 'number'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bingo_patterns_code_key'
      and conrelid = 'public.bingo_patterns'::regclass
  ) then
    alter table public.bingo_patterns
      add constraint bingo_patterns_code_key unique (code);
  end if;
end $$;

create index if not exists idx_bingo_patterns_category on public.bingo_patterns (category);
create index if not exists idx_bingo_patterns_is_active on public.bingo_patterns (is_active);

create table if not exists public.bingo_card_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_filename text not null,
  total_cards integer not null default 0,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_bingo_card_batches_uploaded_at on public.bingo_card_batches (uploaded_at desc);

create table if not exists public.bingo_batch_cards (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.bingo_card_batches(id) on delete cascade,
  card_code integer not null,
  created_at timestamptz not null default now(),
  unique (batch_id, card_code)
);

create index if not exists idx_bingo_batch_cards_batch_id on public.bingo_batch_cards (batch_id);
create index if not exists idx_bingo_batch_cards_card_code on public.bingo_batch_cards (card_code);
