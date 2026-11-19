alter table public.user_finance_settings
  add column if not exists business_percent numeric(5, 2) not null default 0 check (business_percent between 0 and 100),
  add column if not exists bills_percent numeric(5, 2) not null default 0 check (bills_percent between 0 and 100),
  add column if not exists trading_percent numeric(5, 2) not null default 0 check (trading_percent between 0 and 100),
  add column if not exists tax_percent numeric(5, 2) not null default 0 check (tax_percent between 0 and 100),
  add column if not exists weekly_spending_override bigint check (weekly_spending_override >= 0);

alter table public.user_finance_settings
  drop constraint if exists user_finance_settings_allocation_total;

alter table public.user_finance_settings
  add constraint user_finance_settings_allocation_total check (
    needs_percent + wants_percent + savings_percent + debt_percent
      + business_percent + bills_percent + trading_percent + tax_percent = 100
  );

create table if not exists public.money_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (
    category in ('business', 'bills', 'needs', 'wants', 'savings', 'debt', 'trading', 'tax')
  ),
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists money_buckets_user_category_idx
  on public.money_buckets (user_id, category);

alter table public.money_buckets enable row level security;

grant select, insert, update, delete on public.money_buckets to authenticated;
revoke all on public.money_buckets from anon;

drop policy if exists "Users can manage their own money buckets" on public.money_buckets;
create policy "Users can manage their own money buckets"
  on public.money_buckets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
