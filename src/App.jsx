import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'
import FinanceTools from './FinanceTools.jsx'
import { getWeeklySummary } from './lib/finance.js'
import './App.css'

const transactionTypes = {
  creator_income: { label: 'TikTok LIVE payout', icon: 'sparkle', color: 'mint' },
  trading_income: { label: 'Trading profit withdrawn', icon: 'chart', color: 'blue' },
  income: { label: 'Other income', icon: 'briefcase', color: 'mint' },
  needs: { label: 'Personal needs', icon: 'home', color: 'peach' },
  wants: { label: 'Personal wants', icon: 'sparkle', color: 'yellow' },
  debt: { label: 'Debt payment', icon: 'landmark', color: 'lilac' },
  business_cost: { label: 'Trading / creator cost', icon: 'landmark', color: 'lilac' },
  savings: { label: 'Savings & investment', icon: 'target', color: 'mint' },
  transfer: { label: 'Trading capital transfer · not income', icon: 'chart', color: 'blue' },
}

const navigation = [
  { label: 'Overview', icon: 'grid' },
  { label: 'Transactions', icon: 'receipt' },
  { label: 'Planner', icon: 'calendar' },
  { label: 'Budgets', icon: 'pie' },
  { label: 'Goals', icon: 'target' },
]

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getLastSixMonths() {
  const today = new Date()
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1)
    return {
      key: monthKey(date),
      label: new Intl.DateTimeFormat('en-UG', { month: 'short' }).format(date),
    }
  })
}

const chartPeriods = getLastSixMonths()
const today = new Date()
const activeMonthKey = monthKey(today)
const activeMonthLabel = new Intl.DateTimeFormat('en-UG', { month: 'long', year: 'numeric' }).format(today)

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function mapTransaction(row) {
  const type = transactionTypes[row.type]
  return {
    id: row.id,
    name: row.name,
    category: type.label,
    date: new Intl.DateTimeFormat('en-UG', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(row.occurred_at)),
    occurredAt: row.occurred_at,
    month: monthKey(new Date(row.occurred_at)),
    amount: Number(row.amount),
    type: row.type,
    icon: type.icon,
    color: type.color,
    savingsGoalId: row.savings_goal_id,
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
  }).format(value)
}

function Icon({ name, size = 20 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    receipt: <><path d="M5 3.5h14v17l-3.5-2-3.5 2-3.5-2L5 20.5z" /><path d="M9 8h6M9 12h6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>,
    pie: <><path d="M11 3a9 9 0 1 0 10 10H11z" /><path d="M14 3.2V10h6.8A9 9 0 0 0 14 3.2Z" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-1.2 1.2-2.1 1.4-2.1 3M12 17.5h.01" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    down: <><path d="m7 10 5 5 5-5" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z" /></>,
    basket: <><path d="m3 10 2 10h14l2-10zM8 10l4-7 4 7M12 10v7M8 12v4M16 12v4" /></>,
    landmark: <><path d="m3 9 9-6 9 6zM5 10v9M9 10v9M15 10v9M19 10v9M3 21h18M2 19h20" /></>,
    chart: <><path d="M3 3v18h18M8 15l4-4 3 3 6-7" /></>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2zM19 14l1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1z" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  }

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function TransactionRow({ transaction, onDelete, deleting }) {
  const isIncome = ['creator_income', 'trading_income', 'income'].includes(transaction.type)
  const sign = isIncome ? '+' : transaction.type === 'transfer' ? '↔ ' : '−'

  return (
    <div className="transaction-row">
      <div className={`transaction-icon ${transaction.color}`}><Icon name={transaction.icon} size={19} /></div>
      <div className="transaction-info"><strong>{transaction.name}</strong><span>{transaction.category}</span></div>
      <span className="transaction-date">{transaction.date}</span>
      <strong className={`transaction-amount ${isIncome ? 'positive' : ''} ${transaction.type === 'transfer' ? 'neutral' : ''}`}>{sign}{formatMoney(transaction.amount)}</strong>
      <button className="transaction-delete" onClick={() => onDelete(transaction.id)} aria-label={`Delete ${transaction.name}`} disabled={deleting === transaction.id}><Icon name="close" size={14} /></button>
    </div>
  )
}

function MiniChart({ className, values }) {
  const maximum = Math.max(0, ...values)

  return <div className={`mini-chart ${className}`}>{values.map((value, index) => <span key={index} style={{ height: maximum ? `${value / maximum * 100}%` : '0%' }} />)}</div>
}

function FlowChart({ bars }) {
  const highestAmount = Math.max(0, ...bars.flatMap((bar) => [bar.income, bar.outflow]))
  const axisMaximum = Math.max(500000, Math.ceil(highestAmount / 500000) * 500000)
  const axisLabels = [axisMaximum, axisMaximum * 2 / 3, axisMaximum / 3, 0]
  const compactMoney = (value) => value === 0
    ? 'UGX 0'
    : `UGX ${new Intl.NumberFormat('en-UG', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`

  return (
    <div className="chart-area">
      <div className="chart-y-labels">{axisLabels.map((value) => <span key={value}>{compactMoney(value)}</span>)}</div>
      <div className="chart-plot">
        <div className="chart-grid"><i /><i /><i /><i /></div>
        <div className="bar-groups">
          {bars.map((bar) => (
            <div className="bar-group" key={bar.key}>
              <div className="bars">
                <span className="bar income-bar" style={{ height: `${bar.income / axisMaximum * 100}%` }} />
                <span className="bar outflow-bar" style={{ height: `${bar.outflow / axisMaximum * 100}%` }} />
              </div>
              <span className="bar-label">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BackendSetup() {
  return (
    <main className="setup-screen">
      <section className="setup-card">
        <a className="brand setup-brand" href="#"><span className="brand-mark"><span /><span /><span /></span><span>pocket<span className="brand-light">wise</span></span></a>
        <p className="eyebrow">SUPABASE CONNECTION NEEDED</p>
        <h1>Connect your private money database.</h1>
        <p className="setup-copy">Pocketwise is set up to use Supabase for your transactions. Add your project URL and publishable key to enable sign-in and cloud storage. No sample transactions are loaded.</p>
        <ol className="setup-steps">
          <li>Copy <code>.env.example</code> to <code>.env.local</code>.</li>
          <li>Add your Supabase project URL and publishable key.</li>
          <li>Run all SQL migrations in <code>supabase/migrations</code> in the Supabase SQL Editor, in date order.</li>
          <li>Restart the development server.</li>
        </ol>
        <p className="setup-security">Use a publishable key only. Never put a Supabase secret or service-role key in the browser app.</p>
      </section>
    </main>
  )
}

function AuthScreen({ onSubmit, busy, error, message, isSignUp, onToggle, email, setEmail, password, setPassword }) {
  return (
    <main className="setup-screen">
      <section className="setup-card auth-card">
        <a className="brand setup-brand" href="#"><span className="brand-mark"><span /><span /><span /></span><span>pocket<span className="brand-light">wise</span></span></a>
        <p className="eyebrow">YOUR TRADER + CREATOR CASH FLOW</p>
        <h1>{isSignUp ? 'Create your private account.' : 'Welcome back.'}</h1>
        <p className="setup-copy">Your transactions are private to your account and stored in your Supabase project.</p>
        {error && <div className="backend-error" role="alert">{error}</div>}
        {message && <div className="backend-message" role="status">{message}</div>}
        <form className="auth-form" onSubmit={onSubmit}>
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="auth-toggle">{isSignUp ? 'Already have an account?' : 'New to Pocketwise?'} <button onClick={onToggle}>{isSignUp ? 'Sign in' : 'Create an account'}</button></p>
      </section>
    </main>
  )
}

function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [showModal, setShowModal] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [financeSettings, setFinanceSettings] = useState(null)
  const [plannedCashflows, setPlannedCashflows] = useState([])
  const [moneyBuckets, setMoneyBuckets] = useState([])
  const [monthlyBudgets, setMonthlyBudgets] = useState([])
  const [savingsGoals, setSavingsGoals] = useState([])
  const [debtAccounts, setDebtAccounts] = useState([])
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [planningLoaded, setPlanningLoaded] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState({ name: '', amount: '', type: 'creator_income' })

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      setTransactions([])
      setFinanceSettings(null)
      setPlannedCashflows([])
      setMoneyBuckets([])
      setMonthlyBudgets([])
      setSavingsGoals([])
      setDebtAccounts([])
      setDataLoaded(false)
      setPlanningLoaded(false)
      setError('')
      setMessage('')
    })

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    }).catch((sessionError) => {
      if (!active) return
      setError(getErrorMessage(sessionError))
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !user) return undefined

    let active = true
    async function loadTransactions() {
      try {
        const { data, error: queryError } = await supabase
          .from('transactions')
          .select('id, name, type, amount, occurred_at, savings_goal_id')
          .order('occurred_at', { ascending: false })
        if (queryError) throw queryError
        if (active) setTransactions(data.map(mapTransaction))
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError))
      } finally {
        if (active) setDataLoaded(true)
      }
    }

    loadTransactions()
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!supabase || !user) return undefined

    let active = true
    async function loadFinanceTools() {
      try {
        const [settingsResult, cashflowsResult, bucketsResult, budgetsResult, goalsResult, debtsResult] = await Promise.all([
          supabase.from('user_finance_settings').select('*').maybeSingle(),
          supabase.from('planned_cashflows').select('*').order('next_date'),
          supabase.from('money_buckets').select('*').order('created_at'),
          supabase.from('monthly_budgets').select('*'),
          supabase.from('savings_goals').select('*').order('created_at', { ascending: false }),
          supabase.from('debt_accounts').select('*').order('created_at', { ascending: false }),
        ])
        for (const result of [settingsResult, cashflowsResult, bucketsResult, budgetsResult, goalsResult, debtsResult]) {
          if (result.error) throw result.error
        }

        let settings = settingsResult.data
        if (!settings) {
          const { data: createdSettings, error: settingsError } = await supabase
            .from('user_finance_settings')
            .insert({ user_id: user.id })
            .select('*')
            .single()
          if (settingsError) throw settingsError
          settings = createdSettings
        }

        if (!active) return
        setFinanceSettings(settings)
        setPlannedCashflows(cashflowsResult.data)
        setMoneyBuckets(bucketsResult.data)
        setMonthlyBudgets(budgetsResult.data)
        setSavingsGoals(goalsResult.data)
        setDebtAccounts(debtsResult.data)
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError))
      } finally {
        if (active) setPlanningLoaded(true)
      }
    }

    loadFinanceTools()
    return () => { active = false }
  }, [user])

  const currentTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.month === activeMonthKey),
    [transactions],
  )

  const monthlyTotals = useMemo(() => chartPeriods.map((period) => transactions
    .filter((transaction) => transaction.month === period.key)
    .reduce((result, transaction) => {
      if (['creator_income', 'trading_income', 'income'].includes(transaction.type)) {
        result.income += transaction.amount
        if (transaction.type === 'creator_income') result.creatorIncome += transaction.amount
        if (transaction.type === 'trading_income') result.tradingIncome += transaction.amount
      } else if (transaction.type !== 'transfer') {
        result.outflow += transaction.amount
      }
      return result
    }, { ...period, income: 0, outflow: 0, creatorIncome: 0, tradingIncome: 0 })), [transactions])

  const totals = useMemo(() => currentTransactions.reduce((result, transaction) => {
    if (transaction.type === 'creator_income') {
      result.income += transaction.amount
      result.creatorIncome += transaction.amount
    } else if (transaction.type === 'trading_income') {
      result.income += transaction.amount
      result.tradingIncome += transaction.amount
    } else if (transaction.type === 'income') {
      result.income += transaction.amount
    } else if (transaction.type === 'business_cost') {
      result.outflow += transaction.amount
      result.businessCosts += transaction.amount
    } else if (transaction.type !== 'transfer') {
      result.outflow += transaction.amount
      if (transaction.type === 'needs') result.needs += transaction.amount
      if (transaction.type === 'wants') result.wants += transaction.amount
      if (transaction.type === 'savings') result.savings += transaction.amount
    }
    return result
  }, { income: 0, outflow: 0, creatorIncome: 0, tradingIncome: 0, businessCosts: 0, needs: 0, wants: 0, savings: 0 }), [currentTransactions])

  const budgetItems = useMemo(() => {
    const personalBudget = Math.max(0, totals.income - totals.businessCosts)
    const savedLimits = new Map(monthlyBudgets.map((budget) => [budget.category, Number(budget.amount)]))
    const allocation = financeSettings ?? { needs_percent: 50, wants_percent: 30, savings_percent: 20 }
    return [
      { name: 'Needs', note: 'Housing, food, essentials', spent: totals.needs, limit: savedLimits.get('needs') ?? Math.round(personalBudget * Number(allocation.needs_percent) / 100), color: 'green', icon: 'home' },
      { name: 'Wants', note: 'Lifestyle & fun', spent: totals.wants, limit: savedLimits.get('wants') ?? Math.round(personalBudget * Number(allocation.wants_percent) / 100), color: 'orange', icon: 'sparkle' },
      { name: 'Savings', note: 'Build your income cushion', spent: totals.savings, limit: savedLimits.get('savings') ?? Math.round(personalBudget * Number(allocation.savings_percent) / 100), color: 'purple', icon: 'chart' },
    ]
  }, [totals, monthlyBudgets, financeSettings])

  const weeklySummary = useMemo(() => getWeeklySummary(transactions), [transactions])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    if (!supabase) return
    setAuthBusy(true)
    setError('')
    setMessage('')

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password })
        if (signUpError) throw signUpError
        if (!data.session) setMessage('Check your email to confirm your account, then sign in.')
        else setMessage('Your account is ready.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
      }
    } catch (authError) {
      setError(getErrorMessage(authError))
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  async function addTransaction(event) {
    event.preventDefault()
    if (!supabase || !user) return
    const amount = Number(form.amount)
    if (!form.name.trim() || !Number.isSafeInteger(amount) || amount <= 0) {
      setError('Enter a description and a whole-number amount greater than zero.')
      return
    }

    setSaving(true)
    setError('')
    const occurredAt = new Date().toISOString()
    try {
      const { data, error: insertError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          name: form.name.trim(),
          type: form.type,
          amount,
          occurred_at: occurredAt,
          savings_goal_id: form.type === 'savings' ? form.savingsGoalId ?? null : null,
        })
        .select('id, name, type, amount, occurred_at, savings_goal_id')
        .single()
      if (insertError) throw insertError
      setTransactions((current) => [mapTransaction(data), ...current])
      setForm({ name: '', amount: '', type: 'creator_income' })
      setShowModal(false)
    } catch (insertError) {
      setError(getErrorMessage(insertError))
    } finally {
      setSaving(false)
    }
  }

  async function deleteTransaction(id) {
    if (!supabase) return
    setDeleting(id)
    setError('')
    try {
      const { error: deleteError } = await supabase.from('transactions').delete().eq('id', id)
      if (deleteError) throw deleteError
      setTransactions((current) => current.filter((transaction) => transaction.id !== id))
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setDeleting(null)
    }
  }

  async function runFinanceRequest(request, onSuccess) {
    if (!supabase || !user) {
      setError('Sign in to manage your financial plan.')
      return false
    }

    setError('')
    try {
      const { data, error: requestError } = await request()
      if (requestError) throw requestError
      onSuccess(data)
      return true
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      return false
    }
  }

  async function saveFinanceSettings(updates) {
    if (!financeSettings) {
      setError('Your financial settings are still loading. Please try again.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('user_finance_settings')
        .upsert({ user_id: user.id, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select('*')
        .single(),
      setFinanceSettings,
    )
  }

  async function addPlannedCashflow(item) {
    if (!item.name.trim() || !Number.isSafeInteger(item.amount) || item.amount <= 0) {
      setError('Enter a description and a whole-number amount greater than zero.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('planned_cashflows')
        .insert({ ...item, name: item.name.trim(), user_id: user.id })
        .select('*')
        .single(),
      (data) => setPlannedCashflows((current) => [...current, data]),
    )
  }

  async function deletePlannedCashflow(id) {
    if (!window.confirm('Delete this scheduled item?')) return false
    return runFinanceRequest(
      () => supabase.from('planned_cashflows').delete().eq('id', id),
      () => setPlannedCashflows((current) => current.filter((item) => item.id !== id)),
    )
  }

  async function addMoneyBucket(bucket) {
    const categories = ['business', 'bills', 'needs', 'wants', 'savings', 'debt', 'trading', 'tax']
    if (!bucket.name.trim() || !categories.includes(bucket.category)
      || !Number.isSafeInteger(bucket.balance) || bucket.balance < 0) {
      setError('Enter an account name, choose a purpose, and enter a whole-number balance of zero or more.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('money_buckets')
        .insert({ ...bucket, name: bucket.name.trim(), user_id: user.id })
        .select('*')
        .single(),
      (data) => setMoneyBuckets((current) => [...current, data]),
    )
  }

  async function updateMoneyBucket(id, balance) {
    if (!Number.isSafeInteger(balance) || balance < 0) {
      setError('Enter a whole-number account balance of zero or more.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('money_buckets')
        .update({ balance, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single(),
      (data) => setMoneyBuckets((current) => current.map((bucket) => bucket.id === id ? data : bucket)),
    )
  }

  async function deleteMoneyBucket(id) {
    if (!window.confirm('Delete this account bucket?')) return false
    return runFinanceRequest(
      () => supabase.from('money_buckets').delete().eq('id', id),
      () => setMoneyBuckets((current) => current.filter((bucket) => bucket.id !== id)),
    )
  }

  async function saveMonthlyBudget(category, amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      setError('Enter a whole-number budget limit of zero or more.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('monthly_budgets')
        .upsert({ user_id: user.id, category, amount, updated_at: new Date().toISOString() }, { onConflict: 'user_id,category' })
        .select('*')
        .single(),
      (data) => setMonthlyBudgets((current) => [...current.filter((item) => item.category !== category), data]),
    )
  }

  async function resetMonthlyBudget(category) {
    return runFinanceRequest(
      () => supabase.from('monthly_budgets').delete().eq('user_id', user.id).eq('category', category),
      () => setMonthlyBudgets((current) => current.filter((budget) => budget.category !== category)),
    )
  }

  async function addSavingsGoal(goal) {
    if (!goal.name.trim() || !Number.isSafeInteger(goal.target_amount) || goal.target_amount <= 0) {
      setError('Enter a goal name and a whole-number target greater than zero.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('savings_goals')
        .insert({ ...goal, name: goal.name.trim(), user_id: user.id })
        .select('*')
        .single(),
      (data) => setSavingsGoals((current) => [data, ...current]),
    )
  }

  async function deleteSavingsGoal(id) {
    if (!window.confirm('Delete this savings goal?')) return false
    return runFinanceRequest(
      () => supabase.from('savings_goals').delete().eq('id', id),
      () => setSavingsGoals((current) => current.filter((goal) => goal.id !== id)),
    )
  }

  async function addDebtAccount(debt) {
    if (!debt.name.trim() || !Number.isSafeInteger(debt.balance) || debt.balance < 0
      || !Number.isSafeInteger(debt.minimum_payment) || debt.minimum_payment < 0
      || !Number.isFinite(debt.annual_interest_rate) || debt.annual_interest_rate < 0 || debt.annual_interest_rate > 100) {
      setError('Enter a debt name, a whole-number balance and minimum payment, and an interest rate from 0 to 100%.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('debt_accounts')
        .insert({ ...debt, name: debt.name.trim(), user_id: user.id })
        .select('*')
        .single(),
      (data) => setDebtAccounts((current) => [data, ...current]),
    )
  }

  async function updateDebtAccount(id, updates) {
    if (!Number.isSafeInteger(updates.balance) || updates.balance < 0) {
      setError('Enter a whole-number debt balance of zero or more.')
      return false
    }
    return runFinanceRequest(
      () => supabase.from('debt_accounts').update(updates).eq('id', id).select('*').single(),
      (data) => setDebtAccounts((current) => current.map((debt) => debt.id === id ? data : debt)),
    )
  }

  async function deleteDebtAccount(id) {
    if (!window.confirm('Delete this debt account?')) return false
    return runFinanceRequest(
      () => supabase.from('debt_accounts').delete().eq('id', id),
      () => setDebtAccounts((current) => current.filter((debt) => debt.id !== id)),
    )
  }

  async function markWeeklyReview() {
    return saveFinanceSettings({ last_weekly_review_at: new Date().toISOString() })
  }

  function startSavingsContribution(goalId) {
    const goal = savingsGoals.find((item) => item.id === goalId)
    setForm({
      name: goal ? `${goal.name} contribution` : 'Emergency fund contribution',
      amount: '',
      type: 'savings',
      savingsGoalId: goal?.id ?? null,
    })
    setShowModal(true)
  }

  if (!isSupabaseConfigured) return <BackendSetup />
  if (authLoading) return <main className="setup-screen"><p className="loading-copy">Connecting to your private account…</p></main>
  if (!user) {
    return <AuthScreen
      onSubmit={handleAuthSubmit}
      busy={authBusy}
      error={error}
      message={message}
      isSignUp={isSignUp}
      onToggle={() => { setIsSignUp((current) => !current); setError(''); setMessage('') }}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
    />
  }

  const pageTitles = {
    Overview: ['Your money, in balance', 'Trade with a plan. Earn on LIVE. Take care of life off screen.'],
    Transactions: ['Your money moves', 'See trading, LIVE payouts, business costs, and life expenses together.'],
    Planner: ['Plan your next money moves', 'See what is safe to spend, prepare for bills, and make progress on your goals.'],
    Budgets: ['Your personal budget', 'Plan your essentials around income that can change week to week.'],
    Goals: ['Your safety net', 'Build a cushion for quieter trading or LIVE weeks.'],
  }
  const currentMonth = activeMonthLabel
  const savingsLimit = budgetItems[2].limit
  const savingsProgress = savingsLimit ? Math.min(100, totals.savings / savingsLimit * 100) : 0
  const userInitials = user.email?.slice(0, 2).toUpperCase() ?? 'ME'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActivePage('Overview') }}>
          <span className="brand-mark"><span /><span /><span /></span>
          <span>pocket<span className="brand-light">wise</span></span>
        </a>
        <div className="workspace-label">YOUR MONEY</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.label} className={`nav-item ${activePage === item.label ? 'active' : ''}`} onClick={() => setActivePage(item.label)}>
              <Icon name={item.icon} size={19} /><span>{item.label}</span>
              {item.label === 'Transactions' && <span className="nav-count">{transactions.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <span className="upgrade-sparkle"><Icon name="sparkle" size={16} /></span>
            <strong>Make money moves<br />with confidence.</strong>
            <p>Prepare for bills, savings, and debt.</p>
            <button onClick={() => setActivePage('Planner')}>Open money planner <span>→</span></button>
          </div>
          <button className="nav-item support-item" onClick={() => setActivePage('Overview')}><Icon name="help" size={19} /><span>Help & support</span></button>
          <button className="profile-button" onClick={handleSignOut}>
            <span className="avatar">{userInitials}</span><span className="profile-name"><strong>{user.email}</strong><small>Sign out</small></span><Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">My finances <span>/</span> <strong>{activePage}</strong></div>
          <div className="topbar-right">
            <span className="month-picker"><span className="calendar-icon">▦</span> {currentMonth}</span>
            <span className="top-avatar">{userInitials}</span>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div><p className="eyebrow">{activePage === 'Overview' ? 'TRADER + CREATOR CASH FLOW' : 'YOUR MONEY, MADE SIMPLE'}</p><h1>{pageTitles[activePage][0]}<span className="heading-period">.</span></h1><p className="page-subtitle">{pageTitles[activePage][1]}</p></div>
            <button className="primary-button" onClick={() => setShowModal(true)}><Icon name="plus" size={18} /> Add transaction</button>
          </div>

          {error && !showModal && <div className="backend-error page-error" role="alert">{error}</div>}
          {dataLoaded && planningLoaded && !error && <div className="connection-indicator"><span /> Synced to your private Supabase account</div>}
          {(!dataLoaded || !planningLoaded) && !error && <div className="loading-banner">Loading your financial plan…</div>}

          {activePage === 'Overview' && <>
            <div className="trader-note"><span className="trader-note-icon"><Icon name="chart" size={17} /></span><p><strong>Keep trading and personal cash clear.</strong> Count only net profits you withdraw as income. Broker deposits and transfers are not income; record TikTok money when the payout reaches you.</p></div>
            <section className="summary-grid" aria-label="Monthly cash flow summary">
              <article className="summary-card balance-card">
                <div className="card-topline"><span className="card-label">YOUR CASH FLOW</span><span className="period-pill"><span /> This month</span></div>
                <div className="balance-amount">{formatMoney(totals.income - totals.outflow)}</div>
                <div className="balance-caption">Income after all listed outflows</div>
                <div className="balance-divider" />
                <div className="balance-breakdown"><span><i className="legend-dot income-dot" /> Income <strong>{formatMoney(totals.income)}</strong></span><span><i className="legend-dot outflow-dot" /> Outflow <strong>{formatMoney(totals.outflow)}</strong></span></div>
                <span className="balance-decoration decoration-one" /><span className="balance-decoration decoration-two" />
              </article>
              <article className="summary-card">
                <div className="card-topline"><span className="card-label">TRADING PROFIT</span><span className="metric-icon trading-metric"><Icon name="chart" size={16} /></span></div>
                <div className="metric-amount">{formatMoney(totals.tradingIncome)}</div>
                <div className="metric-caption">Net profit withdrawn to you</div>
                <MiniChart className="trading-mini" values={monthlyTotals.map((month) => month.tradingIncome)} />
              </article>
              <article className="summary-card">
                <div className="card-topline"><span className="card-label">TIKTOK LIVE</span><span className="metric-icon creator-metric"><Icon name="sparkle" size={16} /></span></div>
                <div className="metric-amount">{formatMoney(totals.creatorIncome)}</div>
                <div className="metric-caption">Payouts received this month</div>
                <MiniChart className="creator-mini" values={monthlyTotals.map((month) => month.creatorIncome)} />
              </article>
              <article className="summary-card">
                <div className="card-topline"><span className="card-label">TOTAL OUTFLOW</span><span className="metric-icon outflow-metric"><Icon name="arrow" size={17} /></span></div>
                <div className="metric-amount">{formatMoney(totals.outflow)}</div>
                <div className="metric-caption">Living, work costs & savings</div>
                <MiniChart className="outflow-mini" values={monthlyTotals.map((month) => month.outflow)} />
              </article>
            </section>

            <section className="middle-grid">
              <article className="panel flow-panel">
                <div className="panel-heading"><div><h2>Cash flow</h2><p>Your income vs. outflow over the last six months</p></div><span className="period-pill"><span /> Last 6 months</span></div>
                <div className="chart-legend"><span><i className="legend-dot income-dot" /> Income</span><span><i className="legend-dot outflow-dot" /> Outflow</span></div>
                <FlowChart bars={monthlyTotals} />
              </article>
              <article className="panel budget-panel">
                <div className="panel-heading"><div><h2>50 / 30 / 20 guide</h2><p>Based on income after work costs</p></div><span className="more-button" aria-hidden="true">···</span></div>
                <div className="budget-intro"><div className="budget-ring"><span>50<small>%</small></span></div><div><strong>Your monthly guide</strong><p>Adjust as trading & LIVE income changes.</p></div></div>
                <div className="budget-list">
                  {budgetItems.map((item) => <div className="budget-item" key={item.name}><div className={`budget-icon ${item.color}`}><Icon name={item.icon} size={16} /></div><div className="budget-info"><div className="budget-name"><strong>{item.name}</strong><span>{formatMoney(item.spent)} <small>/ {formatMoney(item.limit)}</small></span></div><div className="progress-track"><span className={item.color} style={{ width: `${item.limit ? Math.min(100, item.spent / item.limit * 100) : 0}%` }} /></div></div></div>)}
                </div>
              </article>
            </section>

            <section className="bottom-grid">
              <article className="panel transactions-panel">
                <div className="panel-heading"><div><h2>Recent money moves</h2><p>Trading, TikTok, work costs & everyday life</p></div><button className="text-button" onClick={() => setActivePage('Transactions')}>View all <span>→</span></button></div>
                <div className="transaction-list">{transactions.length ? transactions.slice(0, 4).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={deleteTransaction} deleting={deleting} />) : <p className="empty-transactions">No entries yet. Add your first payout, trade profit, or expense.</p>}</div>
              </article>
              <article className="goal-card">
                <div className="goal-card-heading"><span className="goal-icon"><Icon name="target" size={18} /></span><span className="goal-menu">···</span></div>
                <p className="goal-eyebrow">YOUR SAVINGS GUIDE</p>
                <h2>Income<br />cushion</h2>
                <div className="goal-amounts"><strong>{formatMoney(totals.savings)}</strong><span>of {formatMoney(savingsLimit)}</span></div>
                <div className="goal-track"><span style={{ width: `${savingsProgress}%` }} /></div>
                <div className="goal-footer"><span>{Math.round(savingsProgress)}% of this month’s guide</span><button onClick={() => setActivePage('Goals')}>View plan <span>→</span></button></div>
                <div className="goal-decoration">✳</div>
              </article>
            </section>
          </>}

          {activePage === 'Transactions' && <section className="panel full-panel"><div className="panel-heading"><div><h2>All transactions</h2><p>{transactions.length} saved money moves</p></div><span className="period-pill"><span /> All time</span></div><div className="transaction-list all-transactions">{transactions.length ? transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={deleteTransaction} deleting={deleting} />) : <p className="empty-transactions">No transactions yet. Add a TikTok payout, trading profit, or everyday expense to get started.</p>}</div></section>}

          {activePage === 'Planner' && (financeSettings
            ? <FinanceTools
              user={user}
              settings={financeSettings}
              cashflows={plannedCashflows}
              moneyBuckets={moneyBuckets}
              budgets={monthlyBudgets}
              budgetItems={budgetItems}
              goals={savingsGoals}
              debts={debtAccounts}
              transactions={transactions}
              totals={totals}
              weeklySummary={weeklySummary}
              onSaveSettings={saveFinanceSettings}
              onAddCashflow={addPlannedCashflow}
              onDeleteCashflow={deletePlannedCashflow}
              onAddBucket={addMoneyBucket}
              onUpdateBucket={updateMoneyBucket}
              onDeleteBucket={deleteMoneyBucket}
              onSaveBudget={saveMonthlyBudget}
              onResetBudget={resetMonthlyBudget}
              onAddGoal={addSavingsGoal}
              onDeleteGoal={deleteSavingsGoal}
              onAddDebt={addDebtAccount}
              onUpdateDebt={updateDebtAccount}
              onDeleteDebt={deleteDebtAccount}
              onMarkWeeklyReview={markWeeklyReview}
              onAddSavings={startSavingsContribution}
            />
            : <section className="panel planner-migration-note"><h2>Set up your money tools</h2><p>Run all SQL migrations in <code>supabase/migrations</code> in your Supabase SQL Editor, in date order, then reload the app.</p></section>)}

          {activePage === 'Budgets' && <><div className="trader-note"><span className="trader-note-icon"><Icon name="chart" size={17} /></span><p>The 50 / 30 / 20 guide uses income after trading and creator costs. With variable earnings, use it as a flexible starting point—not a fixed rule.</p></div><section className="budget-page-grid">{budgetItems.map((item) => <article className="panel budget-detail-card" key={item.name}><div className={`budget-icon ${item.color}`}><Icon name={item.icon} size={18} /></div><p className="card-label">{item.name.toUpperCase()}</p><h2>{formatMoney(item.spent)}<small> / {formatMoney(item.limit)}</small></h2><p className="page-subtitle">{item.note}</p><div className="progress-track"><span className={item.color} style={{ width: `${item.limit ? Math.min(100, item.spent / item.limit * 100) : 0}%` }} /></div><p className="budget-remaining">{formatMoney(Math.max(0, item.limit - item.spent))} left this month</p></article>)}</section></>}

          {activePage === 'Goals' && <section className="goal-page-grid"><article className="goal-card large-goal"><div className="goal-card-heading"><span className="goal-icon"><Icon name="target" size={18} /></span><span className="period-pill"><span /> This month</span></div><p className="goal-eyebrow">SAVINGS GUIDE</p><h2>Income cushion</h2><p className="page-subtitle">Track what you actually set aside toward quieter trading or LIVE weeks.</p><div className="goal-amounts"><strong>{formatMoney(totals.savings)}</strong><span>of {formatMoney(savingsLimit)}</span></div><div className="goal-track"><span style={{ width: `${savingsProgress}%` }} /></div><div className="goal-footer"><span>{Math.round(savingsProgress)}% of your 20% guide</span><span>From saved transactions</span></div></article><article className="panel new-goal-card"><span className="goal-icon"><Icon name="plus" size={19} /></span><h2>Set money aside</h2><p className="page-subtitle">Record savings contributions as transactions to keep your cash flow and plan up to date.</p><button className="primary-button" onClick={() => { setForm({ name: '', amount: '', type: 'savings' }); setShowModal(true) }}><Icon name="plus" size={18} /> Add to savings</button></article></section>}
        </div>
      </main>

      {showModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowModal(false) }}><section className="transaction-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">CREATOR + TRADING CASH FLOW</p><h2 id="modal-title">Add a money move</h2></div><button className="close-button" onClick={() => setShowModal(false)} aria-label="Close" disabled={saving}><Icon name="close" size={19} /></button></div>{error && <div className="backend-error" role="alert">{error}</div>}<form onSubmit={addTransaction}><label>What was it for?<input autoFocus required maxLength={100} placeholder="e.g. TikTok LIVE payout" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><div className="form-row"><label>Amount (UGX)<input required type="number" min="1" step="1" placeholder="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="creator_income">TikTok LIVE payout received</option><option value="trading_income">Trading profit withdrawn</option><option value="income">Other income received</option><option value="needs">Personal needs</option><option value="wants">Personal wants</option><option value="business_cost">Trading / creator cost</option><option value="debt">Debt payment</option><option value="savings">Savings & investment</option><option value="transfer">Trading capital transfer (not income)</option></select></label></div>{form.type === 'savings' && savingsGoals.length > 0 && <label>Link this contribution to a goal<select value={form.savingsGoalId ?? ''} onChange={(event) => setForm({ ...form, savingsGoalId: event.target.value || null })}><option value="">General savings (not linked to a goal)</option>{savingsGoals.map((goal) => <option value={goal.id} key={goal.id}>{goal.name}</option>)}</select></label>}<p className="form-hint">Only count trading profits you have withdrawn. Broker top-ups and transfers between your own accounts are not income.</p><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving}><Icon name="plus" size={17} /> {saving ? 'Saving…' : 'Save money move'}</button></div></form></section></div>}
    </div>
  )
}

export default App
