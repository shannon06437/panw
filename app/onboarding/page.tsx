'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'

export default function OnboardingPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [persona, setPersona] = useState<string>('')
  const [coachingStyles, setCoachingStyles] = useState<string[]>([])
  const [coachingNotes, setCoachingNotes] = useState<string>('')
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
          body: JSON.stringify({ days: 365 }),
        })

        if (!syncRes.ok) {
          // Sync failed, but account is connected
        }

        setStep('success')
        // Auto-redirect to dashboard after a brief delay
        setTimeout(() => {
          router.push('/dashboard')
        }, 1500)
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
      // Build coachingGuidelines object
      const coachingGuidelines = {
        style: coachingStyles,
        additional_notes: coachingNotes.trim() || undefined,
      }

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          persona,
          coachingGuidelines: coachingStyles.length > 0 || coachingNotes.trim() ? JSON.stringify(coachingGuidelines) : null,
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
        <div className="card fade-in" style={{ width: '60%', maxWidth: '600px', margin: '0 auto' }}>
          <h1>Bank Account Connected!</h1>
          <div className="success">
            <p>Your bank account has been successfully connected.</p>
            <p>Your transactions are being synced.</p>
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Redirecting to dashboard...
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'connect') {
    return (
      <div className="container">
        <div className="card fade-in" style={{ width: '60%', maxWidth: '600px', margin: '0 auto' }}>
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
      <div className="card fade-in" style={{ width: '60%', maxWidth: '600px', margin: '0 auto' }}>
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
            <label className="label" htmlFor="coaching">
              What type of coach do you prefer? (optional)
            </label>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {['Direct and Cash-first', 'Supportive and Gentle', 'Optimization and Numbers'].map((style) => (
                  <label
                    key={style}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '2px solid var(--border)',
                      transition: 'var(--transition)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary)'
                      e.currentTarget.style.background = 'var(--bg-secondary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={coachingStyles.includes(style)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCoachingStyles([...coachingStyles, style])
                        } else {
                          setCoachingStyles(coachingStyles.filter((s) => s !== style))
                        }
                      }}
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    />
                    <span>{style}</span>
                  </label>
                ))}
              </div>
            </div>
            <textarea
              id="coachingNotes"
              className="input"
              placeholder="Tell us more about your preferences (e.g., 'I would like my coach to prioritize reducing my monthly spend.')"
              value={coachingNotes}
              onChange={(e) => setCoachingNotes(e.target.value)}
              rows={4}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
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
