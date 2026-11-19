import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateIncomeAllocation,
  calculateSafeToSpend,
  estimateDebtPayoff,
  getBudgetAlert,
  getSavingsContributionPlan,
  getSavingsContributionsInPeriod,
  getSavingsGoalProgress,
  getUpcomingCashflows,
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
