const incomeTypes = new Set(['creator_income', 'trading_income', 'income'])

function getTransactionDate(transaction) {
  return new Date(transaction.occurredAt ?? transaction.occurred_at)
}

export function parseDate(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function getDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateAtMonthOffset(anchor, offset) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1)
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(anchor.getDate(), lastDay))
}

function getOccurrences(item, start, end) {
  const anchor = parseDate(item.next_date)
  const occurrences = []

  if (item.recurrence === 'once') {
    if (anchor >= start && anchor <= end) occurrences.push(anchor)
    return occurrences
  }

  if (item.recurrence === 'weekly') {
    let offset = Math.max(0, Math.ceil((start - anchor) / (7 * 24 * 60 * 60 * 1000)))
    let occurrence = new Date(anchor)
    occurrence.setDate(anchor.getDate() + offset * 7)
    while (occurrence <= end) {
      occurrences.push(new Date(occurrence))
      occurrence.setDate(occurrence.getDate() + 7)
    }
    return occurrences
  }

  const monthsPerOccurrence = item.recurrence === 'yearly' ? 12 : 1
  let monthOffset = Math.max(0, (start.getFullYear() - anchor.getFullYear()) * 12 + start.getMonth() - anchor.getMonth())
  monthOffset = Math.ceil(monthOffset / monthsPerOccurrence) * monthsPerOccurrence
  let occurrence = dateAtMonthOffset(anchor, monthOffset)
  while (occurrence < start) {
    monthOffset += monthsPerOccurrence
    occurrence = dateAtMonthOffset(anchor, monthOffset)
  }
  while (occurrence <= end) {
    occurrences.push(occurrence)
    monthOffset += monthsPerOccurrence
    occurrence = dateAtMonthOffset(anchor, monthOffset)
  }
  return occurrences
}

export function getUpcomingCashflows(items, from = new Date(), days = 30) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + Math.max(0, days - 1))

  return items
    .filter((item) => item.active)
    .flatMap((item) => getOccurrences(item, start, end).map((date) => ({
      ...item,
      occurrence_date: getDateKey(date),
    })))
    .sort((left, right) => left.occurrence_date.localeCompare(right.occurrence_date))
}

export function calculateSafeToSpend(settings, upcomingCashflows) {
  const scheduledIncome = upcomingCashflows
    .filter((item) => item.direction === 'income')
    .reduce((total, item) => total + Number(item.amount), 0)
  const upcomingExpenses = upcomingCashflows
    .filter((item) => item.direction === 'expense')
    .reduce((total, item) => total + Number(item.amount), 0)
  const plannedSavings = Number(settings.planned_savings_contribution ?? 0)
  const projectedBalance = Number(settings.cash_balance) + scheduledIncome - upcomingExpenses - plannedSavings
  const reserveTarget = Number(settings.reserve_target)

  return {
    scheduledIncome,
    upcomingExpenses,
    plannedSavings,
    projectedBalance,
    reserveTarget,
    safeToSpend: Math.max(0, projectedBalance - reserveTarget),
    reserveShortfall: Math.max(0, reserveTarget - projectedBalance),
  }
}

export function calculateIncomeAllocation(netIncome, settings) {
  const base = Math.max(0, Math.floor(netIncome))
  const needs = Math.round(base * Number(settings.needs_percent) / 100)
  const wants = Math.round(base * Number(settings.wants_percent) / 100)
  const savings = Math.round(base * Number(settings.savings_percent) / 100)
  return {
    needs,
    wants,
    savings,
    debt: base - needs - wants - savings,
    total: base,
  }
}

export function getWeeklySummary(transactions, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(today.getDate() - 6)
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(thisWeekStart.getDate() - 7)

  function summarize(start, end) {
    return transactions.reduce((totals, transaction) => {
      const occurredAt = getTransactionDate(transaction)
      if (occurredAt < start || occurredAt >= end || transaction.type === 'transfer') return totals
      if (incomeTypes.has(transaction.type)) totals.income += transaction.amount
      else totals.outflow += transaction.amount
      return totals
    }, { income: 0, outflow: 0 })
  }

  const thisWeek = summarize(thisWeekStart, new Date(today.getTime() + 24 * 60 * 60 * 1000))
  const lastWeek = summarize(lastWeekStart, thisWeekStart)
  return {
    thisWeek,
    lastWeek,
    net: thisWeek.income - thisWeek.outflow,
    spendingChange: thisWeek.outflow - lastWeek.outflow,
  }
}

export function getBudgetAlert(spent, limit) {
  if (limit === 0) return spent > 0 ? { level: 'over', percentage: 100 } : null
  if (limit < 0) return null
  const percentage = spent / limit * 100
  if (percentage >= 100) return { level: 'over', percentage }
  if (percentage >= 80) return { level: 'near', percentage }
  return null
}

export function estimateDebtPayoff(debts, monthlyBudget) {
  const balances = debts
    .filter((debt) => Number(debt.balance) > 0)
    .map((debt) => ({
      balance: Number(debt.balance),
      minimum: Number(debt.minimum_payment),
      rate: Number(debt.annual_interest_rate),
    }))
    .sort((left, right) => right.rate - left.rate)

  if (!balances.length) return { months: 0, interest: 0, monthlyPayment: 0 }

  const minimumTotal = balances.reduce((total, debt) => total + debt.minimum, 0)
  const monthlyPayment = Math.max(minimumTotal, Number(monthlyBudget))
  if (monthlyPayment <= 0) return { months: null, interest: null, monthlyPayment: 0 }

  let interestPaid = 0
  for (let month = 1; month <= 600; month += 1) {
    for (const debt of balances) {
      const interest = Math.round(debt.balance * debt.rate / 1200)
      debt.balance += interest
      interestPaid += interest
    }

    let remainingPayment = monthlyPayment
    for (const debt of balances) {
      const payment = Math.min(debt.balance, debt.minimum, remainingPayment)
      debt.balance -= payment
      remainingPayment -= payment
    }
    for (const debt of balances) {
      if (remainingPayment <= 0) break
      const payment = Math.min(debt.balance, remainingPayment)
      debt.balance -= payment
      remainingPayment -= payment
    }

    if (balances.every((debt) => debt.balance === 0)) {
      return { months: month, interest: interestPaid, monthlyPayment }
    }
  }

  return { months: null, interest: null, monthlyPayment }
}

export function getSavingsGoalProgress(goal, transactions) {
  return transactions
    .filter((transaction) => transaction.type === 'savings' && transaction.savingsGoalId === goal.id)
    .reduce((total, transaction) => total + transaction.amount, 0)
}

export function getSavingsContributionsInPeriod(goal, transactions, start, end) {
  const startTime = Math.max(start.getTime(), new Date(goal.created_at).getTime())
  const endTime = end.getTime()
  return transactions
    .filter((transaction) => transaction.type === 'savings'
      && transaction.savingsGoalId === goal.id
      && getTransactionDate(transaction).getTime() >= startTime
      && getTransactionDate(transaction).getTime() < endTime)
    .reduce((total, transaction) => total + transaction.amount, 0)
}

export function getSavingsContributionPlan(goal, progress, now = new Date()) {
  const [year, month, day] = goal.target_date.split('-').map(Number)
  const targetDay = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const daysRemaining = Math.max(0, Math.ceil((targetDay - today) / (24 * 60 * 60 * 1000)))
  const amountRemaining = Math.max(0, Number(goal.target_amount) - progress)

  if (amountRemaining === 0) return { daysRemaining, weeklyAmount: 0, monthlyAmount: 0 }
  if (daysRemaining === 0) return { daysRemaining, weeklyAmount: amountRemaining, monthlyAmount: amountRemaining }

  return {
    daysRemaining,
    weeklyAmount: Math.min(amountRemaining, Math.ceil(amountRemaining / (daysRemaining / 7))),
    monthlyAmount: Math.min(amountRemaining, Math.ceil(amountRemaining / (daysRemaining / 30.4375))),
  }
}
