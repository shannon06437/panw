'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/Button'

interface Goal {
  id: string
  name: string
  targetAmount: number
  targetDate: string
  createdAt: string
}

interface Forecast {
  requiredMonthlySavings: number
  currentProgress: number
  gap: number
  monthsRemaining: number
  onTrackProbability: number
  avgMonthlyNet: number
}

interface Lever {
  action: string
  impact: number
  description: string
}

export default function GoalsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [forecasts, setForecasts] = useState<Record<string, { forecast: Forecast; levers: Lever[] }>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    targetAmount: '',
    targetDate: '',
  })

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    if (!storedUserId) {
      router.push('/login')
      return
    }
    setUserId(storedUserId)
    loadGoals(storedUserId)
  }, [router])

  const loadGoals = async (uid: string) => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/goals', {
        headers: {
          'x-user-id': uid,
        },
      })

      if (!res.ok) {
        throw new Error('Failed to load goals')
      }

      const data = await res.json()
      setGoals(data.goals)

      // Load forecasts for each goal
      const forecastPromises = data.goals.map(async (goal: Goal) => {
        const forecastRes = await fetch(`/api/goals/${goal.id}/forecast`, {
          headers: {
            'x-user-id': uid,
          },
        })
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json()
          return { goalId: goal.id, ...forecastData }
        }
        return null
      })

      const forecastResults = await Promise.all(forecastPromises)
      const forecastsMap: Record<string, { forecast: Forecast; levers: Lever[] }> = {}
      forecastResults.forEach((result) => {
        if (result) {
          forecastsMap[result.goal.id] = {
            forecast: result.forecast,
            levers: result.recommendedLevers,
          }
        }
      })
      setForecasts(forecastsMap)
    } catch (err: any) {
      setError(err.message || 'Failed to load goals')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    try {
      setCreating(true)
      setError(null)

      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          name: formData.name,
          targetAmount: parseFloat(formData.targetAmount),
          targetDate: formData.targetDate,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create goal')
      }

      // Reset form and reload
      setFormData({ name: '', targetAmount: '', targetDate: '' })
      setShowCreateForm(false)
      await loadGoals(userId)
    } catch (err: any) {
      setError(err.message || 'Failed to create goal')
    } finally {
      setCreating(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  }

  const getProbabilityColor = (probability: number) => {
    if (probability >= 0.7) return 'var(--success)'
    if (probability >= 0.4) return 'var(--warning)'
    return 'var(--danger)'
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '1rem' }}>Loading goals...</p>
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
            Goals & Forecasting
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Set financial goals and track your progress
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button
            variant="outline"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : '+ New Goal'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            ← Back to Dashboard
          </Button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Create Goal Form */}
      {showCreateForm && (
        <div className="card slide-up">
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
            Create New Goal
          </h2>
          <form onSubmit={handleCreateGoal}>
            <div>
              <label className="label" htmlFor="goalName">
                Goal Name
              </label>
              <input
                id="goalName"
                type="text"
                className="input"
                placeholder="e.g., Emergency Fund, Vacation, Down Payment"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={creating}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="label" htmlFor="targetAmount">
                  Target Amount ($)
                </label>
                <input
                  id="targetAmount"
                  type="number"
                  className="input"
                  placeholder="e.g., 10000"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                  min="0"
                  step="0.01"
                  required
                  disabled={creating}
                />
              </div>
              <div>
                <label className="label" htmlFor="targetDate">
                  Target Date
                </label>
                <input
                  id="targetDate"
                  type="date"
                  className="input"
                  value={formData.targetDate}
                  onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  required
                  disabled={creating}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <Button type="submit" isLoading={creating}>
                Create Goal
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false)
                  setFormData({ name: '', targetAmount: '', targetDate: '' })
                }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            No goals yet. Create your first goal to start tracking your progress!
          </p>
        </div>
      ) : (
        goals.map((goal) => {
          const forecastData = forecasts[goal.id]
          if (!forecastData) {
            return (
              <div key={goal.id} className="card slide-up">
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                  {goal.name}
                </h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Target: ${goal.targetAmount.toFixed(2)} by {formatDate(goal.targetDate)}
                </p>
                <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Loading forecast...
                </p>
              </div>
            )
          }

          const { forecast, levers } = forecastData
          const progressPercent = (forecast.currentProgress / goal.targetAmount) * 100

          return (
            <div key={goal.id} className="card slide-up">
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                  {goal.name}
                </h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Target: ${goal.targetAmount.toFixed(2)} by {formatDate(goal.targetDate)}
                </p>
              </div>

              {/* Forecast Summary */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <div className="metric-label">Required Monthly Savings</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                      ${forecast.requiredMonthlySavings.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">Months Remaining</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem' }}>
                      {forecast.monthsRemaining}
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">On-Track Probability</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: getProbabilityColor(forecast.onTrackProbability) }}>
                      {(forecast.onTrackProbability * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">Current Progress</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem' }}>
                      ${forecast.currentProgress.toFixed(2)} / ${goal.targetAmount.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span>Progress</span>
                    <span>{progressPercent.toFixed(1)}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, progressPercent)}%`,
                        height: '100%',
                        background: 'var(--primary)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Recommended Levers */}
              {levers.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
                    Recommended Actions
                  </h4>
                  <div>
                    {levers.map((lever, idx) => (
                      <div
                        key={idx}
                        className="change-item"
                        style={{
                          borderLeftColor: lever.impact > 0 ? 'var(--warning)' : 'var(--success)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                          <h5 style={{ fontWeight: 600 }}>{lever.action}</h5>
                          {lever.impact > 0 && (
                            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                              ${lever.impact.toFixed(2)}/month
                            </span>
                          )}
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                          {lever.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
