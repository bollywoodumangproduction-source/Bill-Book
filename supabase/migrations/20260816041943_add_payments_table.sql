-- Add payments / transactions table
create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  receipt_no text unique not null,
  source text not null default 'Booking',
  party_name text not null,
  party_mobile text default '',
  mode text not null default 'Cash',
  amount numeric default 0,
  date text not null,
  note text default '',
  created_at timestamp with time zone default now()
);

alter table payments enable row level security;

create policy "select_payments" on payments for select
  to anon, authenticated using (true);
create policy "insert_payments" on payments for insert
  to anon, authenticated with check (true);
create policy "update_payments" on payments for update
  to anon, authenticated using (true) with check (true);
create policy "delete_payments" on payments for delete
  to anon, authenticated using (true);
