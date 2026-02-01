import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'

export async function POST(request: NextRequest) {
  try {
    // For MVP, we'll use a single user. In production, get from session/auth
    const userId = request.headers.get('x-user-id') || 'default-user'

    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: 'Smart Financial Coach',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    })

    return NextResponse.json({ link_token: response.data.link_token })
  } catch (error) {
    console.error('Error creating link token:', error)
    return NextResponse.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    )
  }
}
