'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/Button'

interface RecurringCharge {
  id: string
  name: string
  amount: number
  frequency: 'monthly' | 'weekly' | 'yearly'
  confidence: number
  transactionCount: number
  status: 'active' | 'cancelled' | 'unsure'
  isDetected: boolean
}

export default function SubscriptionsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [recurringCharges, setRecurringCharges] = useState<RecurringCharge[]>([])
  const [monthlyTotal, setMonthlyTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all')

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    if (!storedUserId) {
      router.push('/login')
      return
    }
    setUserId(storedUserId)
    loadRecurringCharges(storedUserId)
  }, [router, confidenceFilter])

  const loadRecurringCharges = async (uid: string) => {
    try {
      setLoading(true)
      setError(null)

      const url = `/api/recurring${confidenceFilter !== 'all' ? `?confidence=${confidenceFilter}` : ''}`
      const res = await fetch(url, {
        headers: {
          'x-user-id': uid,
        },
      })

      if (!res.ok) {
        throw new Error('Failed to load recurring charges')
      }

      const data = await res.json()
      setRecurringCharges(data.recurringCharges)
      setMonthlyTotal(data.monthlyTotal)
    } catch (err: any) {
      setError(err.message || 'Failed to load recurring charges')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (chargeId: string, newStatus: 'active' | 'cancelled' | 'unsure') => {
    if (!userId) return

    try {
      setUpdating(chargeId)
      setError(null)

      const res = await fetch(`/api/recurring/${chargeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update status')
      }

      // Reload charges
      await loadRecurringCharges(userId)
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    } finally {
      setUpdating(null)
    }
  }

  const getMonthlyAmount = (charge: RecurringCharge) => {
    if (charge.frequency === 'monthly') return charge.amount
    if (charge.frequency === 'weekly') return charge.amount * 4.33
    return charge.amount / 12
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return { label: 'High', color: 'var(--success)' }
    if (confidence >= 0.6) return { label: 'Medium', color: 'var(--warning)' }
    return { label: 'Low', color: 'var(--danger)' }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '1rem' }}>Loading subscriptions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container fade-in">
      <div className="header">
        <div>
          <h1>
            <span className="logo">$</span>
            Subscriptions & Recurring Charges
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Review and manage your recurring charges
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          ← Back to Dashboard
        </Button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Summary Card */}
      <div className="card slide-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="metric-label">Monthly Total</div>
            <div className="metric-value" style={{ color: 'var(--primary)' }}>
              ${monthlyTotal.toFixed(2)}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {recurringCharges.length} recurring charge{recurringCharges.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <div>
            <label className="label" style={{ marginBottom: '0.5rem' }}>Filter by Confidence</label>
            <select
              className="select"
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              style={{ width: '200px', marginBottom: 0 }}
            >
              <option value="all">All</option>
              <option value="high">High (≥80%)</option>
              <option value="medium">Medium (60-79%)</option>
              <option value="low">Low (&lt;60%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Recurring Charges List */}
      {recurringCharges.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            No recurring charges found. Sync your transactions to detect subscriptions.
          </p>
        </div>
      ) : (
        <div className="card slide-up">
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
            Recurring Charges
          </h2>
          <div>
            {recurringCharges.map((charge) => {
              const monthlyAmount = getMonthlyAmount(charge)
              const confidenceInfo = getConfidenceLabel(charge.confidence)
              const isCancelled = charge.status === 'cancelled'

              return (
                <div
                  key={charge.id}
                  className="category-item"
                  style={{
                    opacity: isCancelled ? 0.6 : 1,
                    borderLeft: `4px solid ${isCancelled ? 'var(--text-light)' : 'var(--primary)'}`,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontWeight: 600, fontSize: '1.125rem' }}>{charge.name}</h3>
                      {charge.isDetected && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          Detected
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      <span>
                        ${charge.amount.toFixed(2)} / {charge.frequency}
                      </span>
                      <span>≈ ${monthlyAmount.toFixed(2)}/month</span>
                      <span style={{ color: confidenceInfo.color, fontWeight: 500 }}>
                        {confidenceInfo.label} confidence ({(charge.confidence * 100).toFixed(0)}%)
                      </span>
                      <span>Based on {charge.transactionCount} transaction{charge.transactionCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value={charge.status}
                      onChange={(e) => handleStatusChange(charge.id, e.target.value as any)}
                      disabled={updating === charge.id}
                      style={{
                        padding: '0.5rem',
                        border: '2px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-primary)',
                        cursor: updating === charge.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <option value="active">Keep</option>
                      <option value="cancelled">Cancel</option>
                      <option value="unsure">Unsure</option>
                    </select>
                    {updating === charge.id && <span className="spinner" style={{ width: '16px', height: '16px' }}></span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
