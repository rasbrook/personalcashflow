import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateIncomeAllocation,
  calculateSafeToSpend,
  calculateWeeklySpendingLimit,
  estimateDebtPayoff,
  getBudgetAlert,
  getSavingsContributionPlan,
  getSavingsContributionsInPeriod,
  getSavingsGoalProgress,
  getUpcomingCashflows,
  getWeeklySpending,
  getWeeklySummary,
} from './finance.js'

test('monthly recurring items preserve their original month-end date', () => {
  const items = [{
    id: 'rent',
    name: 'Rent',
    amount: 500000,
    direction: 'expense',
    next_date: '2026-01-31',
    recurrence: 'monthly',
    active: true,
  }]

  assert.deepEqual(
    getUpcomingCashflows(items, new Date(2026, 1, 1), 60).map((item) => item.occurrence_date),
    ['2026-02-28', '2026-03-31'],
  )
})

test('safe-to-spend includes scheduled income and expenses but protects the reserve', () => {
  const result = calculateSafeToSpend(
    { cash_balance: 1000000, reserve_target: 300000, planned_savings_contribution: 100000 },
    [
      { amount: 200000, direction: 'income' },
      { amount: 400000, direction: 'expense' },
    ],
  )
  assert.equal(result.projectedBalance, 700000)
  assert.equal(result.safeToSpend, 400000)
})

test('income allocations add up exactly to net income', () => {
  const result = calculateIncomeAllocation(10001, {
    needs_percent: 50,
    wants_percent: 25,
    savings_percent: 15,
    debt_percent: 10,
  })
  assert.equal(result.needs + result.wants + result.savings + result.debt, 10001)
})

test('payout allocation preserves every UGX across all money buckets', () => {
  const result = calculateIncomeAllocation(1, {
    business_percent: 50,
    bills_percent: 50,
    needs_percent: 0,
    wants_percent: 0,
    savings_percent: 0,
    debt_percent: 0,
    trading_percent: 0,
    tax_percent: 0,
  })
  assert.equal(result.business + result.bills + result.needs + result.wants
    + result.savings + result.debt + result.trading + result.tax, 1)
  assert.equal(result.needs >= 0, true)
})

test('account buckets exclude earmarked money from safe-to-spend', () => {
  const result = calculateSafeToSpend({
    cash_balance: 0,
    reserve_target: 50000,
    planned_savings_contribution: 30000,
    needs_percent: 20,
    wants_percent: 10,
    savings_percent: 10,
    debt_percent: 10,
    business_percent: 20,
    bills_percent: 20,
    trading_percent: 5,
    tax_percent: 5,
    money_buckets: [
      { category: 'needs', balance: 100000 },
      { category: 'wants', balance: 50000 },
      { category: 'bills', balance: 100000 },
      { category: 'savings', balance: 20000 },
      { category: 'business', balance: 50000 },
      { category: 'tax', balance: 10000 },
      { category: 'trading', balance: 200000 },
    ],
  }, [
    { amount: 100000, direction: 'income' },
    { amount: 150000, direction: 'expense' },
  ])
  assert.equal(result.totalCash, 530000)
  assert.equal(result.uncoveredBills, 30000)
  assert.equal(result.safeToSpend, 110000)
})

test('debt payment buckets cover scheduled debt minimums', () => {
  const result = calculateSafeToSpend({
    cash_balance: 0,
    reserve_target: 0,
    needs_percent: 50,
    wants_percent: 50,
    savings_percent: 0,
    debt_percent: 0,
    business_percent: 0,
    bills_percent: 0,
    trading_percent: 0,
    tax_percent: 0,
    money_buckets: [
      { category: 'needs', balance: 100000 },
      { category: 'wants', balance: 100000 },
      { category: 'debt', balance: 50000 },
    ],
  }, [
    { amount: 30000, direction: 'expense' },
    { amount: 50000, direction: 'expense', debt_payment: true },
  ])
  assert.equal(result.uncoveredBills, 30000)
  assert.equal(result.uncoveredDebtPayments, 0)
  assert.equal(result.safeToSpend, 170000)
})

test('weekly review excludes transfers and compares the previous seven days', () => {
  const now = new Date(2026, 10, 19, 12)
  const transactions = [
    { occurred_at: new Date(2026, 10, 18, 12).toISOString(), type: 'needs', amount: 50000 },
    { occurred_at: new Date(2026, 10, 17, 12).toISOString(), type: 'transfer', amount: 80000 },
    { occurred_at: new Date(2026, 10, 10, 12).toISOString(), type: 'needs', amount: 30000 },
  ]
  const result = getWeeklySummary(transactions, now)
  assert.equal(result.thisWeek.outflow, 50000)
  assert.equal(result.lastWeek.outflow, 30000)
  assert.equal(result.spendingChange, 20000)
})

test('weekly spending tracks only needs and wants transactions', () => {
  const now = new Date(2026, 10, 19, 12)
  const transactions = [
    { occurred_at: new Date(2026, 10, 18, 12).toISOString(), type: 'needs', amount: 50000 },
    { occurred_at: new Date(2026, 10, 17, 12).toISOString(), type: 'wants', amount: 10000 },
    { occurred_at: new Date(2026, 10, 17, 12).toISOString(), type: 'debt', amount: 30000 },
  ]
  assert.equal(getWeeklySpending(transactions, now), 60000)
})

test('weekly limit uses an override when set and otherwise divides by weeks to income', () => {
  assert.deepEqual(calculateWeeklySpendingLimit(200000, null, '2026-12-17', new Date(2026, 10, 19)), {
    suggested: 50000,
    limit: 50000,
    weeksUntilIncome: 4,
  })
  assert.equal(calculateWeeklySpendingLimit(200000, 30000, null).limit, 30000)
})

test('budget alert distinguishes nearing and exceeded limits', () => {
  assert.equal(getBudgetAlert(800, 1000).level, 'near')
  assert.equal(getBudgetAlert(1000, 1000).level, 'over')
  assert.equal(getBudgetAlert(700, 1000), null)
  assert.equal(getBudgetAlert(1, 0).level, 'over')
  assert.equal(getBudgetAlert(0, 0), null)
})

test('debt estimate returns an exact payoff duration for zero-interest debt', () => {
  assert.deepEqual(estimateDebtPayoff([
    { balance: 2500, minimum_payment: 0, annual_interest_rate: 0 },
  ], 1000), { months: 3, interest: 0, monthlyPayment: 1000 })
})

test('savings progress counts only contributions made after a goal was created', () => {
  const progress = getSavingsGoalProgress(
    { id: 'goal-1', created_at: '2026-01-10T00:00:00.000Z' },
    [
      { occurred_at: '2026-01-09T12:00:00.000Z', type: 'savings', amount: 100 },
      { occurred_at: '2026-01-11T12:00:00.000Z', type: 'savings', savingsGoalId: 'goal-1', amount: 250 },
      { occurred_at: '2026-01-12T12:00:00.000Z', type: 'needs', savingsGoalId: 'goal-1', amount: 50 },
    ],
  )
  assert.equal(progress, 250)
})

test('monthly savings commitment subtracts contributions already linked to that goal', () => {
  const amount = getSavingsContributionsInPeriod(
    { id: 'goal-1', created_at: '2026-01-10T00:00:00.000Z' },
    [
      { occurredAt: '2026-01-11T12:00:00.000Z', type: 'savings', savingsGoalId: 'goal-1', amount: 250 },
      { occurredAt: '2026-01-12T12:00:00.000Z', type: 'savings', savingsGoalId: 'goal-2', amount: 500 },
      { occurredAt: '2026-02-01T00:00:00.000Z', type: 'savings', savingsGoalId: 'goal-1', amount: 100 },
    ],
    new Date(2026, 0, 1),
    new Date(2026, 1, 1),
  )
  assert.equal(amount, 250)
})

test('savings goal shows weekly and monthly contribution targets', () => {
  const plan = getSavingsContributionPlan(
    { target_amount: 120000, target_date: '2026-12-19' },
    60000,
    new Date(2026, 10, 19),
  )
  assert.equal(plan.daysRemaining, 30)
  assert.equal(plan.weeklyAmount, 14000)
  assert.equal(plan.monthlyAmount, 60000)
})

test('savings target contributions are capped at the amount left when a goal is near due', () => {
  const plan = getSavingsContributionPlan(
    { target_amount: 1000, target_date: '2026-11-26' },
    400,
    new Date(2026, 10, 19),
  )
  assert.equal(plan.weeklyAmount, 600)
  assert.equal(plan.monthlyAmount, 600)
})
