'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/Button'

interface Account {
  id: string
  name: string
  type: string
  mask: string | null
  institutionName: string | null
}

interface Transaction {
  id: string
  name: string
  amount: number
  date: string | Date
  category: string | null
  merchantName: string | null
  accountId: string | null
  account: {
    id: string
    name: string
    type: string
    mask: string | null
  } | null
  plaidAccountId: string | null
}

export default function TransactionsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ min: Date; max: Date } | null>(null)

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    if (!storedUserId) {
      router.push('/login')
      return
    }
    setUserId(storedUserId)
    loadAccounts(storedUserId)
    loadTransactions(storedUserId)
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

  const loadTransactions = async (uid: string) => {
    try {
      setLoading(true)
      setError(null)

      const month = selectedMonth.getMonth()
      const year = selectedMonth.getFullYear()

      const res = await fetch(
        `/api/transactions?month=${month}&year=${year}&accountId=${selectedAccountId}`,
        {
          headers: {
            'x-user-id': uid,
          },
        }
      )

      if (!res.ok) {
        throw new Error('Failed to load transactions')
      }

      const data = await res.json()
      setTransactions(data.transactions || [])
      
      // Update date range if provided
      if (data.dateRange) {
        setDateRange({
          min: new Date(data.dateRange.min),
          max: new Date(data.dateRange.max),
        })
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string | Date) => {
    let d: Date
    if (date instanceof Date) {
      d = date
    } else if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Parse YYYY-MM-DD format as local date to avoid timezone issues
      const [year, month, day] = date.split('-').map(Number)
      d = new Date(year, month - 1, day)
    } else {
      d = new Date(date)
    }
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatCategory = (category: string | null) => {
    if (!category || category === 'Uncategorized') return 'Uncategorized'
    
    // Convert SNAKE_CASE to Title Case
    if (category.includes('_')) {
      return category
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    }
    
    return category
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  if (loading && transactions.length === 0) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '1rem' }}>Loading transactions...</p>
        </div>
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
            Transactions
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            View and manage your transaction history
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          ← Back to Dashboard
        </Button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="label" style={{ marginBottom: '0.5rem' }}>Account</label>
          <select
            className="select"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            <option value="all">All Accounts</option>
            {allAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.mask && ` •${account.mask}`}
                {account.institutionName && ` (${account.institutionName})`}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="label" style={{ marginBottom: '0.5rem' }}>Month</label>
          <select
            className="select"
            value={`${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth()).padStart(2, '0')}`}
            onChange={(e) => {
              const [year, month] = e.target.value.split('-')
              setSelectedMonth(new Date(parseInt(year), parseInt(month), 1))
            }}
          >
            {(() => {
              // Always show last 12 months, regardless of data availability
              const months = []
              const now = new Date()
              for (let i = 11; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
                months.push(
                  <option key={`${date.getFullYear()}-${date.getMonth()}`} value={`${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`}>
                    {formatMonthYear(date)}
                  </option>
                )
              }
              return months
            })()}
          </select>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Summary Cards */}
      {transactions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Total Income
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)' }}>
              ${transactions
                .filter((t) => t.amount > 0)
                .reduce((sum, t) => sum + t.amount, 0)
                .toFixed(2)}
            </div>
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Total Expenses
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--danger)' }}>
              ${Math.abs(
                transactions
                  .filter((t) => t.amount < 0)
                  .reduce((sum, t) => sum + t.amount, 0)
              ).toFixed(2)}
            </div>
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Net
            </div>
            <div
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color:
                  transactions.reduce((sum, t) => sum + t.amount, 0) >= 0
                    ? 'var(--success)'
                    : 'var(--danger)',
              }}
            >
              ${transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
            </div>
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Transaction Count
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {transactions.length}
            </div>
          </div>
        </div>
      )}

      {/* Transactions List */}
      {transactions.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            No transactions found for {formatMonthYear(selectedMonth)}.
            {selectedAccountId !== 'all' && ' Try selecting a different account or month.'}
          </p>
        </div>
      ) : (
        <div className="card slide-up">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {formatMonthYear(selectedMonth)}
            </h2>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Date
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'left' }}>
                    Description
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'left' }}>
                    Category
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'left' }}>
                    Account
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn, idx) => {
                  const isIncome = txn.amount > 0
                  return (
                    <tr
                      key={txn.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'left', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {formatDate(txn.date)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'left', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 500 }}>{txn.name || 'N/A'}</div>
                        {txn.merchantName && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                            {txn.merchantName}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'left', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {formatCategory(txn.category)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'left', verticalAlign: 'top' }}>
                        {txn.account ? (
                          <div>
                            <div>{txn.account.name}</div>
                            {txn.account.mask && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                ••••{txn.account.mask}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-light)' }}>Unknown</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: isIncome ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {isIncome ? '+' : ''}${Math.abs(txn.amount || 0).toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
