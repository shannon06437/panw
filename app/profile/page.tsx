'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/Button'

interface ProfileData {
  id: string
  email: string
  name: string | null
  persona: string | null
  monthlyFixedCosts: number | null
  riskTolerance: string | null
}

export default function ProfilePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [monthlyFixedCosts, setMonthlyFixedCosts] = useState<string>('')

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    if (!storedUserId) {
      router.push('/login')
      return
    }
    setUserId(storedUserId)
    loadProfile(storedUserId)
  }, [router])

  const loadProfile = async (uid: string) => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/profile', {
        headers: {
          'x-user-id': uid,
        },
      })

      if (!res.ok) {
        throw new Error('Failed to load profile')
      }

      const data = await res.json()
      setProfile({
        id: data.id,
        email: data.email || '',
        name: data.name || null,
        persona: data.persona || null,
        monthlyFixedCosts: data.monthlyFixedCosts || null,
        riskTolerance: data.riskTolerance || null,
      })
      setMonthlyFixedCosts(data.monthlyFixedCosts?.toString() || '')
    } catch (err: any) {
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          monthlyFixedCosts: monthlyFixedCosts ? parseFloat(monthlyFixedCosts) : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update profile')
      }

      const data = await res.json()
      setProfile({
        ...profile!,
        monthlyFixedCosts: data.user.monthlyFixedCosts,
      })
      setSuccess('Profile updated successfully!')
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '1rem' }}>Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container">
        <div className="error">Failed to load profile</div>
        <Button onClick={() => userId && loadProfile(userId)}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="container fade-in">
      <div className="header">
        <div>
          <h1>
            <span className="logo">$</span>
            Profile Settings
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Manage your account settings and preferences
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          ← Back to Dashboard
        </Button>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card slide-up">
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
          Account Information
        </h2>
        
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={profile.email}
              disabled
              style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed' }}
            />
          </div>
          
          {profile.name && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Name</label>
              <input
                type="text"
                className="input"
                value={profile.name}
                disabled
                style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed' }}
              />
            </div>
          )}

          {profile.persona && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Persona</label>
              <input
                type="text"
                className="input"
                value={profile.persona.charAt(0).toUpperCase() + profile.persona.slice(1)}
                disabled
                style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed' }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="card slide-up">
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
          Financial Settings
        </h2>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="label" htmlFor="monthlyFixedCosts">
              Monthly Fixed Costs
            </label>
            <input
              id="monthlyFixedCosts"
              type="number"
              className="input"
              placeholder="e.g., 1500"
              value={monthlyFixedCosts}
              onChange={(e) => setMonthlyFixedCosts(e.target.value)}
              min="0"
              step="0.01"
            />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Enter your estimated monthly fixed costs (rent, utilities, etc.) to help with financial planning.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <Button type="submit" isLoading={saving}>
              Save Changes
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMonthlyFixedCosts(profile.monthlyFixedCosts?.toString() || '')}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
