import { useMemo, useState } from 'react'
import {
  calculateIncomeAllocation,
  calculateSafeToSpend,
  calculateWeeklySpendingLimit,
  estimateDebtPayoff,
  getBudgetAlert,
  getDateKey,
  getSavingsContributionPlan,
  getSavingsContributionsInPeriod,
  getSavingsGoalProgress,
  getUpcomingCashflows,
  getWeeklySpending,
  parseDate,
} from './lib/finance.js'

const todayDate = getDateKey(new Date())
const bucketCategories = [
  ['business', 'Business costs'],
  ['bills', 'Bills'],
  ['needs', 'Essentials'],
  ['wants', 'Everyday spending'],
  ['savings', 'Savings'],
  ['debt', 'Debt payments'],
  ['trading', 'Trading capital'],
  ['tax', 'Tax reserve'],
]

function getBucketLabel(category) {
  return bucketCategories.find(([value]) => value === category)?.[1] ?? category
}

function getSavingsCommitment(goals, transactions, horizonDays) {
  const today = parseDate(todayDate)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const commitmentPeriods = Math.max(1, Math.ceil(horizonDays / 30.4375))
  return goals.reduce((total, goal) => {
    const progress = getSavingsGoalProgress(goal, transactions)
    const plan = getSavingsContributionPlan(goal, progress, today)
    const contributedThisMonth = getSavingsContributionsInPeriod(goal, transactions, monthStart, nextMonthStart)
    const plannedThroughHorizon = Math.min(goal.target_amount - progress, plan.monthlyAmount * commitmentPeriods)
    return total + Math.max(0, plannedThroughHorizon - contributedThisMonth)
  }, 0)
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDate(value))
}

function InputField({ label, children, ...props }) {
  return <label className="tool-field">{label}{children ?? <input {...props} />}</label>
}

function ToolCard({ title, description, children, className = '' }) {
  return (
    <article className={`panel tool-card ${className}`}>
      <div className="tool-card-heading"><div><h2>{title}</h2><p>{description}</p></div></div>
      {children}
    </article>
  )
}

function FinanceTools({
  user,
  settings,
  cashflows,
  moneyBuckets,
  budgets,
  budgetItems,
  goals,
  debts,
  transactions,
  totals,
  weeklySummary,
  onSaveSettings,
  onAddCashflow,
  onDeleteCashflow,
  onAddBucket,
  onUpdateBucket,
  onDeleteBucket,
  onSaveBudget,
  onResetBudget,
  onAddGoal,
  onDeleteGoal,
  onAddDebt,
  onUpdateDebt,
  onDeleteDebt,
  onMarkWeeklyReview,
  onAddSavings,
}) {
  const [reserveTarget, setReserveTarget] = useState(String(settings.reserve_target))
  const [allocationForm, setAllocationForm] = useState(() => ({
    business_percent: String(settings.business_percent),
    bills_percent: String(settings.bills_percent),
    needs_percent: String(settings.needs_percent),
    wants_percent: String(settings.wants_percent),
    savings_percent: String(settings.savings_percent),
    debt_percent: String(settings.debt_percent),
    trading_percent: String(settings.trading_percent),
    tax_percent: String(settings.tax_percent),
  }))
  const [payoutAmount, setPayoutAmount] = useState('')
  const [debtBudget, setDebtBudget] = useState(() => String(settings.debt_monthly_budget))
  const [weeklyOverride, setWeeklyOverride] = useState(settings.weekly_spending_override == null ? '' : String(settings.weekly_spending_override))
  const [allocationError, setAllocationError] = useState('')
  const [bucketForm, setBucketForm] = useState({ name: '', category: 'wants', balance: '' })
  const [bucketEdits, setBucketEdits] = useState({})
  const [scheduleForm, setScheduleForm] = useState({ name: '', amount: '', direction: 'expense', next_date: todayDate, recurrence: 'monthly' })
  const [goalForm, setGoalForm] = useState({ name: 'Emergency fund', target_amount: '', target_date: '' })
  const [debtForm, setDebtForm] = useState({ name: '', balance: '', minimum_payment: '', annual_interest_rate: '0', next_due_date: '' })
  const [budgetEdits, setBudgetEdits] = useState({})
  const [debtEdits, setDebtEdits] = useState({})
  const [saving, setSaving] = useState('')
  const [reviewMessage, setReviewMessage] = useState('')

  const scheduledItems = useMemo(() => {
    const debtDues = debts
      .filter((debt) => debt.next_due_date && Number(debt.minimum_payment) > 0)
      .map((debt) => ({
        id: `debt-${debt.id}`,
        name: `${debt.name} minimum payment`,
        amount: debt.minimum_payment,
        direction: 'expense',
        next_date: debt.next_due_date,
        recurrence: 'monthly',
        active: true,
        debt_payment: true,
      }))
    return [...cashflows, ...debtDues]
  }, [cashflows, debts])
  const upcoming = useMemo(
    () => getUpcomingCashflows(scheduledItems, parseDate(todayDate)),
    [scheduledItems],
  )
  const possibleIncome = useMemo(
    () => getUpcomingCashflows(scheduledItems, parseDate(todayDate), 90).find((item) => item.direction === 'income'),
    [scheduledItems],
  )
  const daysUntilIncome = possibleIncome
    ? Math.max(7, Math.ceil((parseDate(possibleIncome.occurrence_date) - parseDate(todayDate)) / (24 * 60 * 60 * 1000)))
    : 28
  const weeklyHorizonDays = Math.min(90, daysUntilIncome)
  const weeklyUpcoming = useMemo(
    () => getUpcomingCashflows(scheduledItems, parseDate(todayDate), weeklyHorizonDays),
    [scheduledItems, weeklyHorizonDays],
  )
  const plannedSavings = useMemo(() => {
    return getSavingsCommitment(goals, transactions, 30)
  }, [goals, transactions])
  const weeklySavingsPlan = useMemo(
    () => getSavingsCommitment(goals, transactions, weeklyHorizonDays),
    [goals, transactions, weeklyHorizonDays],
  )
  const forecast = useMemo(
    () => calculateSafeToSpend({ ...settings, money_buckets: moneyBuckets, planned_savings_contribution: plannedSavings }, upcoming),
    [settings, moneyBuckets, upcoming, plannedSavings],
  )
  const weeklyForecast = useMemo(
    () => calculateSafeToSpend({ ...settings, money_buckets: moneyBuckets, planned_savings_contribution: weeklySavingsPlan }, weeklyUpcoming),
    [settings, moneyBuckets, weeklyUpcoming, weeklySavingsPlan],
  )
  const weeklySpent = getWeeklySpending(transactions, parseDate(todayDate))
  const weeklyLimit = calculateWeeklySpendingLimit(
    weeklyForecast.safeToSpend,
    settings.weekly_spending_override,
    possibleIncome?.occurrence_date,
    parseDate(todayDate),
  )
  const weeklyRemaining = weeklyLimit.limit - weeklySpent
  const personalIncome = Math.max(0, totals.income - totals.businessCosts)
  const payoutAllocation = calculateIncomeAllocation(Number(payoutAmount) || 0, {
    ...settings,
    ...Object.fromEntries(Object.entries(allocationForm).map(([key, value]) => [key, Number(value) || 0])),
  })
  const monthlyDebtAllocation = calculateIncomeAllocation(personalIncome, settings).debt
  const plannedDebtPayment = Number(settings.debt_monthly_budget) || monthlyDebtAllocation
  const payoff = estimateDebtPayoff(debts, plannedDebtPayment)
  const allocationTotal = Object.values(allocationForm).reduce((total, value) => total + (Number(value) || 0), 0)

  async function submitSettings(event) {
    event.preventDefault()
    setSaving('settings')
    await onSaveSettings({
      reserve_target: Number(reserveTarget),
    })
    setSaving('')
  }

  async function submitAllocation(event) {
    event.preventDefault()
    if (Math.abs(allocationTotal - 100) > 0.001) {
      setAllocationError('The payout allocation percentages must total 100%.')
      return
    }
    setAllocationError('')
    setSaving('allocation')
    await onSaveSettings({
      ...Object.fromEntries(Object.entries(allocationForm).map(([key, value]) => [key, Number(value)])),
    })
    setSaving('')
  }

  async function submitBucket(event) {
    event.preventDefault()
    setSaving('bucket')
    const saved = await onAddBucket({ ...bucketForm, balance: Number(bucketForm.balance) })
    if (saved) setBucketForm({ name: '', category: 'wants', balance: '' })
    setSaving('')
  }

  async function updateBucket(event, bucket) {
    event.preventDefault()
    setSaving(`bucket-${bucket.id}`)
    await onUpdateBucket(bucket.id, Number(bucketEdits[bucket.id] ?? bucket.balance))
    setSaving('')
  }

  async function submitWeeklyLimit(event) {
    event.preventDefault()
    setSaving('weekly-limit')
    await onSaveSettings({
      weekly_spending_override: weeklyOverride === '' ? null : Number(weeklyOverride),
    })
    setSaving('')
  }

  async function submitSchedule(event) {
    event.preventDefault()
    setSaving('schedule')
    const saved = await onAddCashflow({ ...scheduleForm, amount: Number(scheduleForm.amount) })
    if (saved) setScheduleForm({ ...scheduleForm, name: '', amount: '' })
    setSaving('')
  }

  async function submitGoal(event) {
    event.preventDefault()
    setSaving('goal')
    const saved = await onAddGoal({ ...goalForm, target_amount: Number(goalForm.target_amount) })
    if (saved) setGoalForm({ name: '', target_amount: '', target_date: '' })
    setSaving('')
  }

  async function submitDebt(event) {
    event.preventDefault()
    setSaving('debt')
    const saved = await onAddDebt({
      ...debtForm,
      balance: Number(debtForm.balance),
      minimum_payment: Number(debtForm.minimum_payment || 0),
      annual_interest_rate: Number(debtForm.annual_interest_rate || 0),
      next_due_date: debtForm.next_due_date || null,
    })
    if (saved) setDebtForm({ name: '', balance: '', minimum_payment: '', annual_interest_rate: '0', next_due_date: '' })
    setSaving('')
  }

  async function saveDebtBudget(event) {
    event.preventDefault()
    setSaving('debt-budget')
    await onSaveSettings({ debt_monthly_budget: Number(debtBudget) })
    setSaving('')
  }

  return (
    <div className="finance-tools">
      <section className="tool-grid">
        <ToolCard title="Safe to spend in 30 days" description="Uses tagged account balances, scheduled bills, a protected reserve, and savings goals." className="safe-to-spend-card">
          <div className="safe-spend-amount">{formatMoney(forecast.safeToSpend)}</div>
          <p className="safe-spend-caption">Estimated amount left for personal spending after planned commitments</p>
          {forecast.reserveShortfall > 0 && <p className="tool-warning">Your forecast is {formatMoney(forecast.reserveShortfall)} below your reserve target.</p>}
          <div className="forecast-breakdown">
            <span>Current account balances <strong>{formatMoney(forecast.totalCash)}</strong></span>
            <span>Expected income <strong>{formatMoney(forecast.scheduledIncome)}</strong></span>
            <span>Bills and debt minimums <strong>{formatMoney(forecast.upcomingExpenses)}</strong></span>
            {moneyBuckets.length > 0 && <span>Bills not yet covered by the bills bucket <strong>{formatMoney(forecast.uncoveredBills)}</strong></span>}
            {moneyBuckets.length > 0 && <span>Debt minimums not covered by the debt bucket <strong>{formatMoney(forecast.uncoveredDebtPayments)}</strong></span>}
            <span>Planned savings <strong>{formatMoney(forecast.plannedSavings)}</strong></span>
            <span>Projected after 30 days <strong>{formatMoney(forecast.projectedBalance)}</strong></span>
          </div>
          <form className="tool-form two-column-form" onSubmit={submitSettings}>
            <InputField label="Protected reserve target (UGX)" type="number" min="0" step="1" required value={reserveTarget} onChange={(event) => setReserveTarget(event.target.value)} />
            <button className="primary-button tool-submit" type="submit" disabled={saving === 'settings'}>{saving === 'settings' ? 'Saving…' : 'Update cash plan'}</button>
          </form>
          <p className="tool-footnote">{moneyBuckets.length ? 'Balances are manual; update each account after money moves.' : `No accounts added yet. Using the previous manual balance of ${formatMoney(settings.cash_balance)} until you add buckets.`} When you add your first bucket, include every account and wallet so the forecast has a complete balance. Only confirmed scheduled income is counted.</p>
        </ToolCard>

        <ToolCard title="Accounts and money buckets" description="Track each bank account, mobile-money wallet, or cash holding once, and assign it to the purpose you use it for.">
          <div className="bucket-balance-total"><span>Total tracked balances</span><strong>{formatMoney(moneyBuckets.length ? forecast.totalCash : settings.cash_balance)}</strong></div>
          <form className="tool-form bucket-form" onSubmit={submitBucket}>
            <InputField label="Account or wallet name" required maxLength={80} value={bucketForm.name} onChange={(event) => setBucketForm({ ...bucketForm, name: event.target.value })} placeholder="e.g. Mobile money wallet" />
            <div className="two-column-form">
              <InputField label="Purpose"><select value={bucketForm.category} onChange={(event) => setBucketForm({ ...bucketForm, category: event.target.value })}>{bucketCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></InputField>
              <InputField label="Current balance (UGX)" type="number" min="0" step="1" required value={bucketForm.balance} onChange={(event) => setBucketForm({ ...bucketForm, balance: event.target.value })} />
            </div>
            <button className="primary-button tool-submit" type="submit" disabled={saving === 'bucket'}>{saving === 'bucket' ? 'Adding…' : 'Add account or wallet'}</button>
          </form>
          <div className="bucket-list">
            {moneyBuckets.length ? moneyBuckets.map((bucket) => (
              <form className="bucket-row" key={bucket.id} onSubmit={(event) => updateBucket(event, bucket)}>
                <div><strong>{bucket.name}</strong><span>{getBucketLabel(bucket.category)}</span></div>
                <InputField label={`${bucket.name} balance (UGX)`} type="number" min="0" step="1" required value={bucketEdits[bucket.id] ?? String(bucket.balance)} onChange={(event) => setBucketEdits({ ...bucketEdits, [bucket.id]: event.target.value })} />
                <button className="secondary-button" type="submit" disabled={saving === `bucket-${bucket.id}`}>{saving === `bucket-${bucket.id}` ? 'Saving…' : 'Update'}</button>
                <button className="tool-delete" type="button" onClick={() => onDeleteBucket(bucket.id)} aria-label={`Delete ${bucket.name}`}>×</button>
              </form>
            )) : <p className="empty-transactions">Add your bank, mobile-money, and cash balances to start using purpose-based buckets.</p>}
          </div>
          <p className="tool-footnote">Add each real balance once—do not enter the same wallet in multiple buckets. These are manual records, not bank connections.</p>
        </ToolCard>

        <ToolCard title="Split each payout" description="Enter a payout to see your personal allocation plan. Percentages are yours to set; the app never moves money automatically.">
          <InputField label="Payout received (UGX)" type="number" min="0" step="1" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} placeholder="Enter a payout amount" />
          <div className="allocation-list">
            {bucketCategories.map(([category, label]) => (
              <div className="allocation-row" key={category}><span>{label}</span><strong>{formatMoney(payoutAllocation[category])}</strong></div>
            ))}
          </div>
          <form className="tool-form allocation-form" onSubmit={submitAllocation}>
            {[
              ['business_percent', 'Business costs %'],
              ['bills_percent', 'Bills %'],
              ['needs_percent', 'Essentials %'],
              ['wants_percent', 'Everyday spending %'],
              ['savings_percent', 'Savings %'],
              ['debt_percent', 'Debt %'],
              ['trading_percent', 'Trading capital %'],
              ['tax_percent', 'Tax reserve %'],
            ].map(([key, label]) => <InputField key={key} label={label} type="number" min="0" max="100" step="0.1" required value={allocationForm[key]} onChange={(event) => setAllocationForm({ ...allocationForm, [key]: event.target.value })} />)}
            <p className={`allocation-total-note ${allocationError ? 'tool-warning' : ''}`}>{allocationError || `Allocation total: ${allocationTotal.toFixed(1)}% (must be 100%)`}</p>
            <button className="primary-button tool-submit" type="submit" disabled={saving === 'allocation'}>{saving === 'allocation' ? 'Saving…' : 'Save payout split'}</button>
          </form>
          <p className="tool-footnote">Tax is optional and starts at 0%. Choose a reserve percentage based on your own tax guidance. Transfer amounts yourself, then update bucket balances.</p>
        </ToolCard>

        <ToolCard title="Weekly spending limit" description="Set a cap or use the suggested amount based on safe-to-spend money and your next confirmed payout.">
          <div className="weekly-limit-amount">{formatMoney(weeklyLimit.limit)}<span> for this week</span></div>
          <div className="weekly-review-grid">
            <div><span>Suggested weekly amount</span><strong>{formatMoney(weeklyLimit.suggested)}</strong></div>
            <div><span>Needs + wants recorded</span><strong>{formatMoney(weeklySpent)}</strong></div>
          </div>
          <p className={weeklyRemaining < 0 ? 'tool-warning' : 'weekly-insight'}>
            {weeklyRemaining < 0
              ? `You are ${formatMoney(Math.abs(weeklyRemaining))} over this week’s limit.`
              : `${formatMoney(weeklyRemaining)} remains in this week’s spending limit.`}
          </p>
          <form className="tool-form weekly-limit-form" onSubmit={submitWeeklyLimit}>
            <InputField label="Your weekly override (UGX, optional)" type="number" min="0" step="1" value={weeklyOverride} onChange={(event) => setWeeklyOverride(event.target.value)} placeholder="Leave blank to use suggestion" />
            <button className="secondary-button" type="submit" disabled={saving === 'weekly-limit'}>{saving === 'weekly-limit' ? 'Saving…' : weeklyOverride === '' ? 'Use suggested amount' : 'Save weekly limit'}</button>
          </form>
          <p className="tool-footnote">{possibleIncome ? `Next confirmed income is scheduled for ${formatDate(possibleIncome.occurrence_date)}.` : 'No confirmed income is scheduled in the next 90 days; the suggestion spreads your safe amount across four weeks.'} Weekly spending counts transactions categorized as essentials or everyday spending. Transfers and business costs are excluded.</p>
        </ToolCard>

        <ToolCard title="Bills and income calendar" description="Schedule known bills and confirmed income. In-app reminders show what is coming up.">
          <form className="tool-form schedule-form" onSubmit={submitSchedule}>
            <InputField label="Description" required maxLength={100} value={scheduleForm.name} onChange={(event) => setScheduleForm({ ...scheduleForm, name: event.target.value })} placeholder="e.g. Rent" />
            <div className="two-column-form">
              <InputField label="Amount (UGX)" type="number" min="1" step="1" required value={scheduleForm.amount} onChange={(event) => setScheduleForm({ ...scheduleForm, amount: event.target.value })} />
              <InputField label="Direction"><select value={scheduleForm.direction} onChange={(event) => setScheduleForm({ ...scheduleForm, direction: event.target.value })}><option value="expense">Bill / expense</option><option value="income">Confirmed income</option></select></InputField>
              <InputField label="Next date" type="date" required value={scheduleForm.next_date} onChange={(event) => setScheduleForm({ ...scheduleForm, next_date: event.target.value })} />
              <InputField label="Repeats"><select value={scheduleForm.recurrence} onChange={(event) => setScheduleForm({ ...scheduleForm, recurrence: event.target.value })}><option value="once">One time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></InputField>
            </div>
            <button className="primary-button tool-submit" type="submit" disabled={saving === 'schedule'}>{saving === 'schedule' ? 'Adding…' : 'Add to calendar'}</button>
          </form>
          <div className="upcoming-list">
            <h3>Next 30 days</h3>
            {upcoming.length ? upcoming.map((item) => (
              <div className="upcoming-row" key={`${item.id}-${item.occurrence_date}`}>
                <span className="upcoming-date">{formatDate(item.occurrence_date)}</span>
                <span className="upcoming-name">{item.name}{item.debt_payment && <small> · debt minimum</small>}</span>
                <strong className={item.direction === 'income' ? 'incoming-amount' : ''}>{item.direction === 'income' ? '+' : '−'}{formatMoney(item.amount)}</strong>
                {!item.debt_payment && <button className="tool-delete" type="button" onClick={() => onDeleteCashflow(item.id)} aria-label={`Delete ${item.name}`}>×</button>}
              </div>
            )) : <p className="empty-transactions">Nothing scheduled. Add a bill or confirmed payout above.</p>}
          </div>
          <div className="scheduled-list">
            <h3>All scheduled items</h3>
            {cashflows.length ? cashflows.map((item) => (
              <div className="scheduled-row" key={item.id}>
                <span>{formatDate(item.next_date)}</span>
                <strong>{item.name}</strong>
                <span>{item.recurrence === 'once' ? 'One time' : item.recurrence}</span>
                <strong>{item.direction === 'income' ? '+' : '−'}{formatMoney(item.amount)}</strong>
                <button className="tool-delete" type="button" onClick={() => onDeleteCashflow(item.id)} aria-label={`Delete ${item.name}`}>×</button>
              </div>
            )) : <p className="empty-transactions">No scheduled items yet.</p>}
          </div>
          <p className="tool-footnote">Debt minimums with a due date are included automatically. Do not also schedule them as a separate bill.</p>
        </ToolCard>

        <ToolCard title="Budget guardrails" description="Set monthly caps and get a warning as spending approaches or passes them.">
          <div className="tool-budget-list">
            {budgetItems.map((item) => {
              const key = item.name.toLowerCase()
              const alert = getBudgetAlert(item.spent, item.limit)
              const custom = budgets.some((budget) => budget.category === key)
              return (
                <form className="tool-budget-row" key={key} onSubmit={async (event) => {
                  event.preventDefault()
                  setSaving(`budget-${key}`)
                  await onSaveBudget(key, Number(budgetEdits[key] ?? item.limit))
                  setSaving('')
                }}>
                  <div className="tool-budget-copy">
                    <strong>{item.name}</strong>
                    <span>{formatMoney(item.spent)} used {custom ? 'of your limit' : 'of the suggested guide'}</span>
                    {alert && <small className={alert.level === 'over' ? 'tool-warning' : 'tool-near-limit'}>{alert.level === 'over' ? 'Over budget' : 'Near budget'} · {Math.round(alert.percentage)}%</small>}
                    {custom && <button className="tool-reset" type="button" onClick={async () => {
                      setSaving(`reset-${key}`)
                      const reset = await onResetBudget(key)
                      if (reset) {
                        setBudgetEdits((current) => {
                          const next = { ...current }
                          delete next[key]
                          return next
                        })
                      }
                      setSaving('')
                    }} disabled={saving === `reset-${key}`}>{saving === `reset-${key}` ? 'Resetting…' : 'Use suggested guide'}</button>}
                  </div>
                  <InputField label={`${item.name} monthly limit (UGX)`} type="number" min="0" step="1" required value={budgetEdits[key] ?? String(item.limit)} onChange={(event) => setBudgetEdits({ ...budgetEdits, [key]: event.target.value })} />
                  <button className="secondary-button" type="submit" disabled={saving === `budget-${key}`}>{saving === `budget-${key}` ? 'Saving…' : 'Save limit'}</button>
                </form>
              )
            })}
          </div>
          <p className="tool-footnote">Suggested limits follow your income allocation percentages until you save a custom limit.</p>
        </ToolCard>

        <ToolCard title="Emergency fund goals" description="Choose a target date and track savings contributions recorded in Pocketwise.">
          <form className="tool-form" onSubmit={submitGoal}>
            <InputField label="Goal name" required maxLength={100} value={goalForm.name} onChange={(event) => setGoalForm({ ...goalForm, name: event.target.value })} />
            <div className="two-column-form">
              <InputField label="Target amount (UGX)" type="number" min="1" step="1" required value={goalForm.target_amount} onChange={(event) => setGoalForm({ ...goalForm, target_amount: event.target.value })} />
              <InputField label="Target date" type="date" required min={todayDate} value={goalForm.target_date} onChange={(event) => setGoalForm({ ...goalForm, target_date: event.target.value })} />
            </div>
            <button className="primary-button tool-submit" type="submit" disabled={saving === 'goal'}>{saving === 'goal' ? 'Adding…' : 'Add savings goal'}</button>
          </form>
          <div className="goal-tool-list">
            {goals.length ? goals.map((goal) => {
              const progress = getSavingsGoalProgress(goal, transactions)
              const contributionPlan = getSavingsContributionPlan(goal, progress)
              const percentage = Math.min(100, progress / goal.target_amount * 100)
              return (
                <div className="goal-tool-row" key={goal.id}>
                  <div className="goal-tool-heading"><strong>{goal.name}</strong><button className="tool-delete" type="button" onClick={() => onDeleteGoal(goal.id)} aria-label={`Delete ${goal.name}`}>×</button></div>
                  <p>{formatMoney(progress)} of {formatMoney(goal.target_amount)} · due {formatDate(goal.target_date)}</p>
                  <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
                  {progress >= goal.target_amount
                    ? <p className="goal-contribution-plan">Goal reached. Great work!</p>
                    : contributionPlan.daysRemaining > 0
                      ? <p className="goal-contribution-plan">Aim for {formatMoney(contributionPlan.weeklyAmount)} weekly or {formatMoney(contributionPlan.monthlyAmount)} monthly.</p>
                      : <p className="tool-warning">Target date passed. {formatMoney(goal.target_amount - progress)} remains.</p>}
                  <button className="text-button" type="button" onClick={() => onAddSavings(goal.id)}>Add a savings contribution <span>→</span></button>
                </div>
              )
            }) : <p className="empty-transactions">Create a goal to start tracking your emergency fund.</p>}
          </div>
          <p className="tool-footnote">Progress counts contributions explicitly linked to each goal. Use its contribution button to keep goals separate.</p>
        </ToolCard>

        <ToolCard title="Debt payoff planner" description="Track balances and minimums. The estimate uses your monthly debt payment plan and targets higher-interest balances first.">
          <form className="tool-form debt-form" onSubmit={submitDebt}>
            <InputField label="Debt name" required maxLength={100} value={debtForm.name} onChange={(event) => setDebtForm({ ...debtForm, name: event.target.value })} placeholder="e.g. Personal loan" />
            <div className="two-column-form">
              <InputField label="Current balance (UGX)" type="number" min="0" step="1" required value={debtForm.balance} onChange={(event) => setDebtForm({ ...debtForm, balance: event.target.value })} />
              <InputField label="Minimum monthly payment (UGX)" type="number" min="0" step="1" value={debtForm.minimum_payment} onChange={(event) => setDebtForm({ ...debtForm, minimum_payment: event.target.value })} />
              <InputField label="Annual interest rate (%)" type="number" min="0" max="100" step="0.01" value={debtForm.annual_interest_rate} onChange={(event) => setDebtForm({ ...debtForm, annual_interest_rate: event.target.value })} />
              <InputField label="Next payment due" type="date" value={debtForm.next_due_date} onChange={(event) => setDebtForm({ ...debtForm, next_due_date: event.target.value })} />
            </div>
            <button className="primary-button tool-submit" type="submit" disabled={saving === 'debt'}>{saving === 'debt' ? 'Adding…' : 'Add debt'}</button>
          </form>
          <form className="debt-budget-form" onSubmit={saveDebtBudget}>
            <InputField label="Total monthly debt payment plan (UGX)" type="number" min="0" step="1" required value={debtBudget} onChange={(event) => setDebtBudget(event.target.value)} />
            <button className="secondary-button" type="submit" disabled={saving === 'debt-budget'}>{saving === 'debt-budget' ? 'Saving…' : 'Update plan'}</button>
          </form>
          <p className="tool-footnote">Leave this at zero to estimate with your current monthly debt allocation, plus required minimums.</p>
          {debts.length > 0 && <div className="debt-estimate">
            {payoff.months === null
              ? <p className="tool-warning">Add a monthly payment above your minimums to estimate a payoff date.</p>
              : <p>Estimated payoff: <strong>{payoff.months} month{payoff.months === 1 ? '' : 's'}</strong> · estimated interest {formatMoney(payoff.interest)} · total monthly payment {formatMoney(payoff.monthlyPayment)}</p>}
          </div>}
          <div className="debt-list">
            {debts.length ? debts.map((debt) => (
              <form className="debt-row" key={debt.id} onSubmit={async (event) => {
                event.preventDefault()
                setSaving(`debt-balance-${debt.id}`)
                await onUpdateDebt(debt.id, { balance: Number(debtEdits[debt.id] ?? debt.balance) })
                setSaving('')
              }}>
                <div><strong>{debt.name}</strong><span>{Number(debt.annual_interest_rate)}% APR · minimum {formatMoney(debt.minimum_payment)}{debt.next_due_date ? ` · due ${formatDate(debt.next_due_date)}` : ''}</span></div>
                <label className="debt-balance-field">Balance (UGX)<input aria-label={`${debt.name} current balance`} type="number" min="0" step="1" required value={debtEdits[debt.id] ?? String(debt.balance)} onChange={(event) => setDebtEdits({ ...debtEdits, [debt.id]: event.target.value })} /></label>
                <strong>{formatMoney(debt.balance)}</strong>
                <div className="debt-row-actions"><button className="secondary-button" type="submit" disabled={saving === `debt-balance-${debt.id}`}>{saving === `debt-balance-${debt.id}` ? 'Saving…' : 'Update'}</button><button className="tool-delete" type="button" onClick={() => onDeleteDebt(debt.id)} aria-label={`Delete ${debt.name}`}>×</button></div>
              </form>
            )) : <p className="empty-transactions">Add a debt to see your payoff estimate.</p>}
          </div>
          <p className="tool-footnote">Estimates assume a fixed monthly payment and monthly interest; lender fees and payment timing can change the real result. Update balances after making payments.</p>
        </ToolCard>

        <ToolCard title="Weekly money check-in" description="Review the last seven days against the seven days before that. Transfers are excluded.">
          <div className="weekly-review-grid">
            <div><span>Income this week</span><strong>{formatMoney(weeklySummary.thisWeek.income)}</strong></div>
            <div><span>Outflow this week</span><strong>{formatMoney(weeklySummary.thisWeek.outflow)}</strong></div>
            <div><span>Net this week</span><strong>{formatMoney(weeklySummary.net)}</strong></div>
            <div><span>Outflow change vs last week</span><strong>{weeklySummary.spendingChange > 0 ? '+' : ''}{formatMoney(weeklySummary.spendingChange)}</strong></div>
          </div>
          <p className={weeklySummary.net < 0 ? 'tool-warning' : 'weekly-insight'}>
            {weeklySummary.net < 0
              ? `Recorded outflows exceeded income by ${formatMoney(Math.abs(weeklySummary.net))} this week. Review upcoming bills before discretionary spending.`
              : `You kept ${formatMoney(weeklySummary.net)} after recorded outflows this week. Check your upcoming bills and savings goal before spending it.`}
          </p>
          <button className="primary-button" type="button" onClick={async () => {
            setSaving('review')
            const reviewed = await onMarkWeeklyReview()
            if (reviewed) setReviewMessage(`Reviewed ${new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium' }).format(new Date())}.`)
            setSaving('')
          }} disabled={saving === 'review'}>{saving === 'review' ? 'Saving…' : 'Mark this week reviewed'}</button>
          {settings.last_weekly_review_at && <p className="tool-footnote">Last marked reviewed: {formatDate(settings.last_weekly_review_at.slice(0, 10))}</p>}
          {reviewMessage && <p className="weekly-insight" role="status">{reviewMessage}</p>}
          <p className="tool-footnote">This check-in uses only transactions you recorded. It is guidance, not a financial guarantee.</p>
        </ToolCard>
      </section>
      <p className="tool-account-note">Signed in as {user.email}. All forecasts and plans are based on information you enter and can be changed at any time.</p>
    </div>
  )
}

export default FinanceTools
