'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/Button'
import { Dropdown } from '@/app/components/ui/Dropdown'
import { PieChart } from '@/app/components/ui/PieChart'

interface Account {
  id: string
  name: string
  officialName: string | null
  type: string
  subtype: string | null
  mask: string | null
  balance: number
  availableBalance: number | null
  limit: number | null
  institutionName: string | null
}

interface DashboardData {
  income: number
  expenses: number
  net: number
  balance: number
  savingsRate: number | null
  creditLimit: number | null
  balanceChange: number | null
  categoryBreakdown: Array<{
    category: string
    amount: number
  }>
  changes: Array<{
    category: string
    deltaPercent: number
    monthlyImpact: number
    currentMonth: number
    previousMonth: number
  }>
  targetMonth: string
  accounts: Account[]
  viewType: 'combined' | 'single'
  accountType: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
  const [allAccounts, setAllAccounts] = useState<Account[]>([])

  useEffect(() => {
    // Get userId from localStorage
    const storedUserId = localStorage.getItem('userId')
    if (!storedUserId) {
      router.push('/login')
      return
    }
    setUserId(storedUserId)
    loadAccounts(storedUserId)
    loadData(storedUserId)
  }, [router, selectedMonth, selectedAccountId])

  const loadAccounts = async (uid: string) => {
    try {
      const res = await fetch('/api/accounts', {
        headers: {
          'x-user-id': uid,
        },
      })

      if (res.ok) {
        const data = await res.json()
        setAllAccounts(data.accounts || [])
      }
    } catch (err) {
      // Failed to load accounts
    }
  }

  const loadData = async (uid: string) => {
    try {
      setLoading(true)
      setError(null)

      const month = selectedMonth.getMonth()
      const year = selectedMonth.getFullYear()

      const res = await fetch(
        `/api/dashboard?month=${month}&year=${year}&accountId=${selectedAccountId}`,
        {
          headers: {
            'x-user-id': uid,
          },
        }
      )

      if (!res.ok) {
        if (res.status === 404) {
          router.push('/onboarding')
          return
        }
        throw new Error('Failed to load dashboard')
      }

      const data = await res.json()
      setDashboardData(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    if (!userId) return

    try {
      setSyncing(true)
      setError(null)

      const res = await fetch('/api/sync/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ days: 365 }),
      })

      if (!res.ok) {
        throw new Error('Failed to sync transactions')
      }

      const data = await res.json()
      
      // Show success message
      const successMsg = document.createElement('div')
      successMsg.className = 'success'
      successMsg.textContent = `Sync complete: ${data.message}`
      successMsg.style.position = 'fixed'
      successMsg.style.top = '20px'
      successMsg.style.right = '20px'
      successMsg.style.zIndex = '1000'
      document.body.appendChild(successMsg)
      setTimeout(() => successMsg.remove(), 3000)

      // Reload accounts and data
      await loadAccounts(userId)
      await loadData(userId)
    } catch (err: any) {
      setError(err.message || 'Failed to sync')
    } finally {
      setSyncing(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('userId')
    localStorage.removeItem('userEmail')
    router.push('/login')
  }

  const userEmail = typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U'

  const changeMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(selectedMonth)
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1)
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1)
    }
    setSelectedMonth(newMonth)
  }

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  if (loading && !dashboardData) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '1rem' }}>Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error && !dashboardData) {
    return (
      <div className="container">
        <div className="error">{error}</div>
        <button className="button" onClick={() => userId && loadData(userId)}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="container fade-in">
      {/* Header */}
      <div className="header">
        <div>
          <h1>
            <span className="logo">$</span>
            Smart Financial Coach
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {formatMonthYear(selectedMonth)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Button
            variant="outline"
            onClick={handleSync}
            isLoading={syncing}
          >
            Sync Now
          </Button>
          <Dropdown
            align="right"
            trigger={
              <button className="profile-button" aria-label="Profile menu">
                {userInitial}
              </button>
            }
            items={[
              {
                label: 'Profile Settings',
                icon: '⚙️',
                onClick: () => router.push('/profile'),
              },
              {
                label: 'Sign Out',
                icon: '🚪',
                onClick: handleLogout,
              },
            ]}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Button
          variant="outline"
          onClick={() => router.push('/transactions')}
        >
          📄 View Transactions
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push('/subscriptions')}
        >
          📋 View Subscriptions
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push('/goals')}
        >
          🎯 View Goals
        </Button>
      </div>

      {/* Account Selector */}
      {allAccounts.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label className="label" style={{ marginBottom: '0.5rem' }}>Account View</label>
          <select
            className="select"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            style={{ maxWidth: '400px' }}
          >
            <option value="all">
              All Depository Accounts
              {(() => {
                const depositoryAccounts = allAccounts.filter((a) => a.type === 'depository')
                if (depositoryAccounts.length > 0) {
                  return ` (${depositoryAccounts.map((a) => a.name).join(', ')})`
                }
                return ''
              })()}
            </option>
            {allAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.mask && ` •${account.mask}`}
                {account.institutionName && ` (${account.institutionName})`}
                {` - ${account.type.charAt(0).toUpperCase() + account.type.slice(1)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Month Selector */}
      <div className="month-selector">
        <button onClick={() => changeMonth('prev')} aria-label="Previous month">
          ←
        </button>
        <select
          value={`${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth()).padStart(2, '0')}`}
          onChange={(e) => {
            const [year, month] = e.target.value.split('-')
            setSelectedMonth(new Date(parseInt(year), parseInt(month), 1))
          }}
        >
          {Array.from({ length: 12 }, (_, i) => {
            const date = new Date(selectedMonth.getFullYear(), i, 1)
            return (
              <option key={i} value={`${date.getFullYear()}-${String(i).padStart(2, '0')}`}>
                {formatMonthYear(date)}
              </option>
            )
          })}
        </select>
        <button onClick={() => changeMonth('next')} aria-label="Next month">
          →
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {dashboardData && (
        <>
          {/* Summary Cards - Dynamic based on account type */}
          <div className="grid">
            {dashboardData.accountType === 'depository' && (
              <>
                <div className="metric-card slide-up">
                  <div className="metric-label">Balance</div>
                  <div className="metric-value" style={{ color: 'var(--primary)' }}>
                    ${dashboardData.balance.toFixed(2)}
                  </div>
                  {dashboardData.viewType === 'combined' && dashboardData.accounts.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      {dashboardData.accounts.length} account{dashboardData.accounts.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div className="metric-card slide-up" style={{ animationDelay: '0.1s' }}>
                  <div className="metric-label">Income</div>
                  <div className="metric-value" style={{ color: 'var(--success)' }}>
                    ${dashboardData.income.toFixed(2)}
                  </div>
                </div>
                <div className="metric-card slide-up" style={{ animationDelay: '0.2s' }}>
                  <div className="metric-label">Spend</div>
                  <div className="metric-value" style={{ color: 'var(--danger)' }}>
                    ${dashboardData.expenses.toFixed(2)}
                  </div>
                </div>
                <div className="metric-card slide-up" style={{ animationDelay: '0.3s' }}>
                  <div className="metric-label">Net</div>
                  <div className="metric-value" style={{ color: dashboardData.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {dashboardData.net >= 0 ? '+' : ''}${dashboardData.net.toFixed(2)}
                  </div>
                </div>
              </>
            )}

            {dashboardData.accountType === 'credit' && (
              <>
                <div className="metric-card slide-up">
                  <div className="metric-label">Balance</div>
                  <div className="metric-value" style={{ color: 'var(--danger)' }}>
                    ${dashboardData.balance.toFixed(2)}
                  </div>
                  {dashboardData.creditLimit !== null && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      Limit: ${dashboardData.creditLimit.toFixed(2)}
                    </div>
                  )}
                </div>
                <div className="metric-card slide-up" style={{ animationDelay: '0.1s' }}>
                  <div className="metric-label">Spend</div>
                  <div className="metric-value" style={{ color: 'var(--danger)' }}>
                    ${dashboardData.expenses.toFixed(2)}
                  </div>
                </div>
              </>
            )}

            {(dashboardData.accountType === 'investment' || dashboardData.accountType === 'loan') && (
              <>
                <div className="metric-card slide-up">
                  <div className="metric-label">
                    {dashboardData.accountType === 'investment' ? 'Balance' : 'Outstanding Balance'}
                  </div>
                  <div className="metric-value" style={{ color: 'var(--primary)' }}>
                    ${dashboardData.balance.toFixed(2)}
                  </div>
                </div>
                {dashboardData.balanceChange !== null && (
                  <div className="metric-card slide-up" style={{ animationDelay: '0.1s' }}>
                    <div className="metric-label">Change</div>
                    <div className="metric-value" style={{ color: dashboardData.balanceChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {dashboardData.balanceChange >= 0 ? '+' : ''}${dashboardData.balanceChange.toFixed(2)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Category Breakdown and Changes - Only for depository accounts */}
          {dashboardData.accountType === 'depository' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
              {/* Category Breakdown */}
              {dashboardData.categoryBreakdown.length > 0 && (
            <div className="card slide-up">
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
                Spending by Category
              </h2>
              {(() => {
                const total = dashboardData.categoryBreakdown.reduce((sum, cat) => sum + cat.amount, 0)
                const pieData = dashboardData.categoryBreakdown.map((cat) => ({
                  category: cat.category,
                  amount: cat.amount,
                  percentage: (cat.amount / total) * 100,
                }))
                return <PieChart data={pieData} size={300} />
              })()}
            </div>
          )}

          {/* What Changed Highlights */}
            {dashboardData.changes.length > 0 && (
              <div className="card slide-up">
                <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
                  What Changed Since Last Month
                </h2>
              <div>
                  {dashboardData.changes.slice(0, 5).map((change, idx) => {
                    const isIncrease = change.deltaPercent > 0
                    return (
                      <div key={change.category} className="change-item" style={{ animationDelay: `${idx * 0.05}s` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h3 style={{ fontWeight: 600 }}>{change.category}</h3>
                          <span className={`metric-change ${isIncrease ? 'negative' : 'positive'}`}>
                            {isIncrease ? '↑' : '↓'} {Math.abs(change.deltaPercent).toFixed(1)}%
                          </span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          {isIncrease
                            ? `Increased by $${Math.abs(change.monthlyImpact).toFixed(2)} this month`
                            : `Decreased by $${Math.abs(change.monthlyImpact).toFixed(2)} this month`}
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                          <span>Current: ${change.currentMonth.toFixed(2)}</span>
                          <span>Previous: ${change.previousMonth.toFixed(2)}</span>
                        </div>
                      </div>
                    )
                  })}
                    </div>
              </div>
              )}
            </div>
          )}

          {dashboardData.accountType === 'depository' && dashboardData.categoryBreakdown.length === 0 && dashboardData.changes.length === 0 && (
            <div className="card">
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                No data available for this month. Sync your transactions to see insights.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
