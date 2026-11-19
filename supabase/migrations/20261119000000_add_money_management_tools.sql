create table if not exists public.user_finance_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cash_balance bigint not null default 0 check (cash_balance >= 0),
  reserve_target bigint not null default 0 check (reserve_target >= 0),
  needs_percent numeric(5, 2) not null default 50 check (needs_percent between 0 and 100),
  wants_percent numeric(5, 2) not null default 30 check (wants_percent between 0 and 100),
  savings_percent numeric(5, 2) not null default 20 check (savings_percent between 0 and 100),
  debt_percent numeric(5, 2) not null default 0 check (debt_percent between 0 and 100),
  debt_monthly_budget bigint not null default 0 check (debt_monthly_budget >= 0),
  last_weekly_review_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_finance_settings_allocation_total check (
    needs_percent + wants_percent + savings_percent + debt_percent = 100
  )
);

create table if not exists public.planned_cashflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  direction text not null check (direction in ('income', 'expense')),
  amount bigint not null check (amount > 0),
  next_date date not null,
  recurrence text not null default 'once' check (recurrence in ('once', 'weekly', 'monthly', 'yearly')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists planned_cashflows_user_date_idx
  on public.planned_cashflows (user_id, next_date)
  where active;

create table if not exists public.monthly_budgets (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('needs', 'wants', 'savings')),
  amount bigint not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  target_amount bigint not null check (target_amount > 0),
  target_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists savings_goals_user_created_idx
  on public.savings_goals (user_id, created_at desc);

alter table public.transactions
  add column if not exists savings_goal_id uuid;

alter table public.transactions
  drop constraint if exists transactions_savings_goal_type_check;

alter table public.transactions
  add constraint transactions_savings_goal_type_check
  check (savings_goal_id is null or type = 'savings');

create index if not exists transactions_savings_goal_idx
  on public.transactions (savings_goal_id)
  where savings_goal_id is not null;

drop policy if exists "Users can create their own transactions" on public.transactions;
create policy "Users can create their own transactions"
  on public.transactions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      savings_goal_id is null
      or exists (
        select 1
        from public.savings_goals as goal
        where goal.id = transactions.savings_goal_id
          and goal.user_id = (select auth.uid())
      )
    )
  );

create table if not exists public.debt_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  balance bigint not null check (balance >= 0),
  minimum_payment bigint not null default 0 check (minimum_payment >= 0),
  annual_interest_rate numeric(5, 2) not null default 0 check (annual_interest_rate between 0 and 100),
  next_due_date date,
  created_at timestamptz not null default now()
);

create index if not exists debt_accounts_user_created_idx
  on public.debt_accounts (user_id, created_at desc);

alter table public.user_finance_settings enable row level security;
alter table public.planned_cashflows enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.debt_accounts enable row level security;

grant select, insert, update on public.user_finance_settings to authenticated;
grant select, insert, update, delete on public.planned_cashflows to authenticated;
grant select, insert, update, delete on public.monthly_budgets to authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, update, delete on public.debt_accounts to authenticated;
revoke all on public.user_finance_settings from anon;
revoke all on public.planned_cashflows from anon;
revoke all on public.monthly_budgets from anon;
revoke all on public.savings_goals from anon;
revoke all on public.debt_accounts from anon;

drop policy if exists "Users can manage their own finance settings" on public.user_finance_settings;
create policy "Users can manage their own finance settings"
  on public.user_finance_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own planned cashflows" on public.planned_cashflows;
create policy "Users can manage their own planned cashflows"
  on public.planned_cashflows for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own monthly budgets" on public.monthly_budgets;
create policy "Users can manage their own monthly budgets"
  on public.monthly_budgets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own savings goals" on public.savings_goals;
create policy "Users can manage their own savings goals"
  on public.savings_goals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own debt accounts" on public.debt_accounts;
create policy "Users can manage their own debt accounts"
  on public.debt_accounts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
