'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is logged in
    const userId = localStorage.getItem('userId')
    
    if (!userId) {
      router.push('/login')
      return
    }

    // Check if user has connected account, redirect accordingly
    fetch('/api/profile', {
      headers: {
        'x-user-id': userId,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.hasConnectedAccount) {
          router.push('/dashboard')
        } else {
          router.push('/onboarding')
        }
      })
      .catch(() => {
        router.push('/onboarding')
      })
  }, [router])

  return (
    <div className="loading">
      <div className="spinner" style={{ margin: '0 auto' }}></div>
      <p style={{ marginTop: '1rem' }}>Loading...</p>
    </div>
  )
}
