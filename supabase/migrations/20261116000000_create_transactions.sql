create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  type text not null check (
    type in (
      'creator_income',
      'trading_income',
      'income',
      'needs',
      'wants',
      'debt',
      'business_cost',
      'savings',
      'transfer'
    )
  ),
  amount bigint not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_occurred_at_idx
  on public.transactions (user_id, occurred_at desc);

alter table public.transactions enable row level security;

grant select, insert, delete on public.transactions to authenticated;
revoke all on public.transactions from anon;

drop policy if exists "Users can read their own transactions" on public.transactions;
create policy "Users can read their own transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own transactions" on public.transactions;
create policy "Users can create their own transactions"
  on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own transactions" on public.transactions;
create policy "Users can delete their own transactions"
  on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id);
