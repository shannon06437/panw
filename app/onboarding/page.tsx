'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'

export default function OnboardingPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [persona, setPersona] = useState<string>('')
  const [monthlyFixedCosts, setMonthlyFixedCosts] = useState<string>('')
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'persona' | 'connect' | 'success'>('persona')

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    if (!storedUserId) {
      router.push('/login')
      return
    }
    setUserId(storedUserId)
  }, [router])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      setLoading(true)
      try {
        if (!userId) {
          throw new Error('Not authenticated')
        }

        // Exchange public token
        const exchangeRes = await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({ public_token }),
        })

        if (!exchangeRes.ok) {
          throw new Error('Failed to connect bank account')
        }

        // Auto-sync transactions
        const syncRes = await fetch('/api/sync/transactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({ days: 90 }),
        })

        if (!syncRes.ok) {
          console.warn('Sync failed, but account is connected')
        }

        setStep('success')
      } catch (err: any) {
        setError(err.message || 'Failed to connect bank account')
      } finally {
        setLoading(false)
      }
    },
    onExit: (err, metadata) => {
      if (err) {
        setError(err.error_message || 'Connection cancelled')
      }
    },
  })

  const handlePersonaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!userId) {
      setError('Not authenticated')
      return
    }

    // Save persona/profile
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          persona,
          monthlyFixedCosts: monthlyFixedCosts ? parseFloat(monthlyFixedCosts) : null,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save profile')
      }

      // Get link token
      const linkRes = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: {
          'x-user-id': userId,
        },
      })

      if (!linkRes.ok) {
        throw new Error('Failed to initialize bank connection')
      }

      const data = await linkRes.json()
      setLinkToken(data.link_token)
      setStep('connect')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  const handleConnectBank = () => {
    if (ready && linkToken) {
      open()
    }
  }

  const handleGoToDashboard = () => {
    router.push('/dashboard')
  }

  if (!userId) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: '0 auto' }}></div>
        <p style={{ marginTop: '1rem' }}>Loading...</p>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="container">
        <div className="card fade-in">
          <h1>Bank Account Connected!</h1>
          <div className="success">
            <p>Your bank account has been successfully connected.</p>
            <p>Your transactions are being synced.</p>
          </div>
          <button className="button" onClick={handleGoToDashboard}>
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (step === 'connect') {
    return (
      <div className="container">
        <div className="card fade-in">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, var(--secondary) 0%, var(--secondary-dark) 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '2.5rem' }}>
              🏦
            </div>
            <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Connect Your Bank</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Securely link your bank account to get personalized insights.</p>
          </div>
          {error && <div className="error">{error}</div>}
          <button
            className="button"
            onClick={handleConnectBank}
            disabled={!ready || loading}
            style={{ width: '100%' }}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Connecting...
              </>
            ) : (
              'Connect Bank Account'
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card fade-in">
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Welcome to Smart Financial Coach</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Let's get started by setting up your profile.</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handlePersonaSubmit}>
          <div>
            <label className="label" htmlFor="persona">
              I am a:
            </label>
            <select
              id="persona"
              className="select"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              required
            >
              <option value="">Select...</option>
              <option value="student">Student / Young Adult</option>
              <option value="freelancer">Freelancer / Variable Income</option>
              <option value="general">General User</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="monthlyFixedCosts">
              Monthly Fixed Costs (optional)
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
          </div>

          <button type="submit" className="button" disabled={!persona}>
            Continue
          </button>
        </form>
      </div>
    </div>
  )
}
