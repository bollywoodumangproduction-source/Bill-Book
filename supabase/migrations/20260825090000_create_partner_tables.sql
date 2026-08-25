-- Partner directory used by the Ledger and Lab Order screens.
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  mobile text not null unique,
  partner_name text not null default '',
  name text not null default '',
  studio_name text not null default '',
  studio_address text not null default '',
  category text not null default 'Studio Freelancer',
  status text not null default 'Active',
  available_for_shoot text not null default 'Active',
  availability_status text not null default 'Active',
  note text not null default '',
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibility table for integrations that use the lab_partners name.
create table if not exists public.lab_partners (
  id uuid primary key default gen_random_uuid(),
  mobile text not null unique,
  partner_name text not null default '',
  name text not null default '',
  studio_name text not null default '',
  studio_address text not null default '',
  category text not null default 'Studio Freelancer',
  status text not null default 'Active',
  available_for_shoot text not null default 'Active',
  availability_status text not null default 'Active',
  note text not null default '',
  trashed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Make this migration safe when an older partners table already exists.
alter table public.partners add column if not exists partner_name text not null default '';
alter table public.partners add column if not exists name text not null default '';
alter table public.partners add column if not exists mobile text;
alter table public.partners add column if not exists studio_name text not null default '';
alter table public.partners add column if not exists studio_address text not null default '';
alter table public.partners add column if not exists category text not null default 'Studio Freelancer';
alter table public.partners add column if not exists status text not null default 'Active';
alter table public.partners add column if not exists available_for_shoot text not null default 'Active';
alter table public.partners add column if not exists availability_status text not null default 'Active';
alter table public.partners add column if not exists note text not null default '';
alter table public.partners add column if not exists trashed_at timestamptz;
alter table public.partners add column if not exists created_at timestamptz not null default now();
alter table public.partners add column if not exists updated_at timestamptz not null default now();

alter table public.lab_partners add column if not exists partner_name text not null default '';
alter table public.lab_partners add column if not exists name text not null default '';
alter table public.lab_partners add column if not exists mobile text;
alter table public.lab_partners add column if not exists studio_name text not null default '';
alter table public.lab_partners add column if not exists studio_address text not null default '';
alter table public.lab_partners add column if not exists category text not null default 'Studio Freelancer';
alter table public.lab_partners add column if not exists status text not null default 'Active';
alter table public.lab_partners add column if not exists available_for_shoot text not null default 'Active';
alter table public.lab_partners add column if not exists availability_status text not null default 'Active';
alter table public.lab_partners add column if not exists note text not null default '';
alter table public.lab_partners add column if not exists trashed_at timestamptz;
alter table public.lab_partners add column if not exists created_at timestamptz not null default now();

alter table public.partners enable row level security;
alter table public.lab_partners enable row level security;
grant select, insert, update, delete on table public.partners, public.lab_partners to anon, authenticated;

drop policy if exists "partners_anon_full_access" on public.partners;
create policy "partners_anon_full_access" on public.partners for all to anon, authenticated using (true) with check (true);
drop policy if exists "lab_partners_anon_full_access" on public.lab_partners;
create policy "lab_partners_anon_full_access" on public.lab_partners for all to anon, authenticated using (true) with check (true);

alter table public.partners drop constraint if exists partners_availability_status_check;
alter table public.partners add constraint partners_availability_status_check check (availability_status in ('Active', 'Busy', 'On Leave'));
alter table public.partners drop constraint if exists partners_available_for_shoot_check;
alter table public.partners add constraint partners_available_for_shoot_check check (available_for_shoot in ('Active', 'Busy', 'On Leave'));
