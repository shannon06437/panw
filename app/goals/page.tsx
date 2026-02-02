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

interface Feasibility {
  requiredPerMonth: number
  estimatedSurplusPerMonth: number
  gapPerMonth: number
  status: 'on_track' | 'off_track'
}

interface LLMInsights {
  summary: string
  topReasons: string[]
  actionPlan: Array<{
    action: string
    metric: string
    expected_impact_monthly: number
    possibilities_to_explore?: string
  }>
  projected_completion_date?: string
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
  const [forecasts, setForecasts] = useState<Record<string, { forecast: Forecast; feasibility: Feasibility; levers: Lever[]; historySummary?: any[] }>>({})
  const [llmInsights, setLlmInsights] = useState<Record<string, LLMInsights>>({})
  const [generatingInsights, setGeneratingInsights] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    targetAmount: '',
    targetDate: '',
  })
  const [editFormData, setEditFormData] = useState({
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
      const forecastsMap: Record<string, { forecast: Forecast; feasibility: Feasibility; levers: Lever[]; historySummary?: any[] }> = {}
      forecastResults.forEach((result) => {
        if (result) {
          forecastsMap[result.goal.id] = {
            forecast: result.forecast,
            feasibility: result.feasibility,
            levers: result.recommendedLevers,
            historySummary: result.historySummary,
          }
        }
      })
      setForecasts(forecastsMap)

      // Load existing insights for each goal
      const insightsPromises = goals.map(async (goal) => {
        try {
          const insightsRes = await fetch(`/api/goals/${goal.id}/insights`, {
            headers: {
              'x-user-id': uid,
            },
          })
          if (insightsRes.ok) {
            const insightsData = await insightsRes.json()
            if (insightsData.insights) {
              return { goalId: goal.id, insights: insightsData.insights }
            }
          }
          return null
        } catch (e) {
          return null
        }
      })

      const insightsResults = await Promise.all(insightsPromises)
      const insightsMap: Record<string, LLMInsights> = {}
      insightsResults.forEach((result) => {
        if (result) {
          insightsMap[result.goalId] = result.insights
        }
      })
      setLlmInsights(insightsMap)
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

      // Get the created goal
      const data = await res.json()
      const newGoal = data.goal

      // Immediately fetch forecast for the new goal
      try {
        const forecastRes = await fetch(`/api/goals/${newGoal.id}/forecast`, {
          headers: {
            'x-user-id': userId,
          },
        })
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json()
          setForecasts((prev) => ({
            ...prev,
            [newGoal.id]: {
              forecast: forecastData.forecast,
              feasibility: forecastData.feasibility,
              levers: forecastData.recommendedLevers,
              historySummary: forecastData.historySummary,
            },
          }))
        }
      } catch (e) {
        // Error fetching forecast
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

  const handleGenerateInsights = async (goalId: string, regenerate: boolean = false) => {
    if (!userId || generatingInsights[goalId]) return

    try {
      setGeneratingInsights((prev) => ({ ...prev, [goalId]: true }))
      setError(null)

      const url = `/api/goals/${goalId}/insights${regenerate ? '?regenerate=true' : ''}`
      const res = await fetch(url, {
        headers: {
          'x-user-id': userId,
        },
      })

      if (!res.ok) {
        throw new Error('Failed to generate insights')
      }

      const data = await res.json()
      setLlmInsights((prev) => ({ ...prev, [goalId]: data.insights }))
    } catch (err: any) {
      setError(err.message || 'Failed to generate insights')
    } finally {
      setGeneratingInsights((prev) => ({ ...prev, [goalId]: false }))
    }
  }

  const handleStartEdit = (goal: Goal) => {
    setEditingGoalId(goal.id)
    setEditFormData({
      name: goal.name,
      targetAmount: goal.targetAmount.toString(),
      targetDate: goal.targetDate.split('T')[0], // Convert to YYYY-MM-DD format
    })
  }

  const handleCancelEdit = () => {
    setEditingGoalId(null)
    setEditFormData({ name: '', targetAmount: '', targetDate: '' })
  }

  const handleUpdateGoal = async (e: React.FormEvent, goalId: string) => {
    e.preventDefault()
    if (!userId || updating[goalId]) return

    try {
      setUpdating((prev) => ({ ...prev, [goalId]: true }))
      setError(null)

      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          name: editFormData.name,
          targetAmount: parseFloat(editFormData.targetAmount),
          targetDate: editFormData.targetDate,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update goal')
      }

      // Reload goals and forecasts
      setEditingGoalId(null)
      setEditFormData({ name: '', targetAmount: '', targetDate: '' })
      await loadGoals(userId)
    } catch (err: any) {
      setError(err.message || 'Failed to update goal')
    } finally {
      setUpdating((prev) => ({ ...prev, [goalId]: false }))
    }
  }

  const handleDeleteGoal = async (goalId: string) => {
    if (!userId || deleting[goalId]) return

    if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting((prev) => ({ ...prev, [goalId]: true }))
      setError(null)

      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': userId,
        },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete goal')
      }

      // Remove from local state
      setGoals((prev) => prev.filter((g) => g.id !== goalId))
      setForecasts((prev) => {
        const updated = { ...prev }
        delete updated[goalId]
        return updated
      })
      setLlmInsights((prev) => {
        const updated = { ...prev }
        delete updated[goalId]
        return updated
      })
    } catch (err: any) {
      setError(err.message || 'Failed to delete goal')
    } finally {
      setDeleting((prev) => ({ ...prev, [goalId]: false }))
    }
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div>
                    <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                      {goal.name}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Target: ${goal.targetAmount.toFixed(2)} by {formatDate(goal.targetDate)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                    <Button
                      variant="outline"
                      onClick={() => handleStartEdit(goal)}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDeleteGoal(goal.id)}
                      isLoading={deleting[goal.id]}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Loading forecast...
                </p>
              </div>
            )
          }

          const { forecast, feasibility, levers } = forecastData
          const progressPercent = (forecast.currentProgress / goal.targetAmount) * 100
          const insights = llmInsights[goal.id]

          return (
            <div key={goal.id} className="card slide-up">
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    {editingGoalId === goal.id ? (
                      <form onSubmit={(e) => handleUpdateGoal(e, goal.id)}>
                        <div style={{ marginBottom: '1rem' }}>
                          <label className="label" htmlFor={`edit-name-${goal.id}`}>
                            Goal Name
                          </label>
                          <input
                            id={`edit-name-${goal.id}`}
                            type="text"
                            className="input"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            required
                            disabled={updating[goal.id]}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                          <div>
                            <label className="label" htmlFor={`edit-amount-${goal.id}`}>
                              Target Amount ($)
                            </label>
                            <input
                              id={`edit-amount-${goal.id}`}
                              type="number"
                              className="input"
                              value={editFormData.targetAmount}
                              onChange={(e) => setEditFormData({ ...editFormData, targetAmount: e.target.value })}
                              min="0"
                              step="0.01"
                              required
                              disabled={updating[goal.id]}
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`edit-date-${goal.id}`}>
                              Target Date
                            </label>
                            <input
                              id={`edit-date-${goal.id}`}
                              type="date"
                              className="input"
                              value={editFormData.targetDate}
                              onChange={(e) => setEditFormData({ ...editFormData, targetDate: e.target.value })}
                              min={new Date().toISOString().split('T')[0]}
                              required
                              disabled={updating[goal.id]}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button type="submit" isLoading={updating[goal.id]} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancelEdit}
                            disabled={updating[goal.id]}
                            style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                          {goal.name}
                        </h3>
                        <p style={{ color: 'var(--text-secondary)' }}>
                          Target: ${goal.targetAmount.toFixed(2)} by {formatDate(goal.targetDate)}
                        </p>
                      </>
                    )}
                  </div>
                  {editingGoalId !== goal.id && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                      <Button
                        variant="outline"
                        onClick={() => handleStartEdit(goal)}
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDeleteGoal(goal.id)}
                        isLoading={deleting[goal.id]}
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Deterministic Feasibility Summary */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Feasibility Analysis</h4>
                  <span
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: feasibility.status === 'on_track' ? 'var(--success)' : 'var(--warning)',
                      color: 'white',
                    }}
                  >
                    {feasibility.status === 'on_track' ? 'On Track' : 'Off Track'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <div className="metric-label">Required Per Month</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                      ${feasibility.requiredPerMonth.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">Estimated Surplus</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: feasibility.estimatedSurplusPerMonth >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      ${feasibility.estimatedSurplusPerMonth.toFixed(2)}/mo
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">Gap Per Month</div>
                    <div className="metric-value" style={{ fontSize: '1.5rem', color: feasibility.gapPerMonth <= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      ${Math.abs(feasibility.gapPerMonth).toFixed(2)}
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

              {/* Generate Insights Button */}
              <div style={{ marginBottom: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                {!insights && !generatingInsights[goal.id] ? (
                  <Button
                    onClick={() => handleGenerateInsights(goal.id)}
                    variant="primary"
                  >
                    ✨ Generate Insights with AI
                  </Button>
                ) : insights ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ fontSize: '1.125rem', fontWeight: 600 }}>AI-Generated Insights</h4>
                      <Button
                        onClick={() => handleGenerateInsights(goal.id, true)}
                        isLoading={generatingInsights[goal.id]}
                        variant="outline"
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                      >
                        Regenerate
                      </Button>
                    </div>
                    
                    <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '1rem', lineHeight: '1.6', marginBottom: '1rem' }}>
                        {insights.summary}
                      </p>
                      
                      {insights.topReasons.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <h5 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Key Reasons:</h5>
                          <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
                            {insights.topReasons.map((reason, idx) => (
                              <li key={idx} style={{ marginBottom: '0.25rem' }}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {insights.projected_completion_date && (
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary)' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--primary)' }}>
                            🎯 Projected Completion Date
                          </div>
                          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {new Date(insights.projected_completion_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            Based on your action plan, you could reach your goal by this date
                          </div>
                        </div>
                      )}
                      
                      {insights.actionPlan.length > 0 && (
                        <div>
                          <h5 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Action Plan:</h5>
                          <div>
                            {insights.actionPlan.map((action, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '0.75rem',
                                  marginBottom: '0.5rem',
                                  background: 'var(--bg-secondary)',
                                  borderRadius: 'var(--radius-sm)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.25rem' }}>
                                  <span style={{ fontWeight: 600 }}>{action.action}</span>
                                  <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.875rem' }}>
                                    ${action.expected_impact_monthly}/mo
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                  Target: {action.metric}
                                </div>
                                {action.possibilities_to_explore && (
                                  <div style={{ fontSize: '0.875rem', color: 'var(--primary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                    💡 {action.possibilities_to_explore}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>
                    Generating insights...
                  </div>
                )}
              </div>

              {/* Recommended Levers */}
              {levers.length > 0 && !insights && (
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
