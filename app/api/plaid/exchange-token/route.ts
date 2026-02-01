import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { public_token } = await request.json()

    if (!public_token) {
      return NextResponse.json(
        { error: 'public_token is required' },
        { status: 400 }
      )
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    })

    const accessToken = exchangeResponse.data.access_token
    const itemId = exchangeResponse.data.item_id

    // Get institution info
    const itemResponse = await plaidClient.itemGet({
      access_token: accessToken,
    })

    const institutionId = itemResponse.data.item.institution_id || 'unknown'
    let institutionName = 'Unknown'

    if (institutionId !== 'unknown') {
      try {
        const instResponse = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ['US'],
        })
        institutionName = instResponse.data.institution.name
      } catch (e) {
        console.error('Error fetching institution:', e)
      }
    }

    // For MVP, use a default user. In production, get from session/auth
    const userId = request.headers.get('x-user-id') || 'default-user'

    // Check if user exists, create if not
    let user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      user = await prisma.user.create({
        data: { id: userId },
      })
    }

    // Store Plaid item
    await prisma.plaidItem.create({
      data: {
        userId: user.id,
        accessToken,
        institutionId,
        institutionName,
        lastSyncedAt: null,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Bank account connected successfully',
    })
  } catch (error) {
    console.error('Error exchanging token:', error)
    return NextResponse.json(
      { error: 'Failed to exchange token' },
      { status: 500 }
    )
  }
}
