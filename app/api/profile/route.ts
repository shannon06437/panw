import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        plaidItems: {
          select: {
            id: true,
            institutionName: true,
            lastSyncedAt: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      persona: user.persona,
      monthlyFixedCosts: user.monthlyFixedCosts,
      riskTolerance: user.riskTolerance,
      hasConnectedAccount: user.plaidItems.length > 0,
      plaidItems: user.plaidItems,
    })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const { persona, monthlyFixedCosts, riskTolerance } = await request.json()

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          persona: persona || null,
          monthlyFixedCosts: monthlyFixedCosts || null,
          riskTolerance: riskTolerance || null,
        },
      })
    } else {
      user = await prisma.user.update({
        where: { id: userId },
        data: {
          persona: persona !== undefined ? persona : user.persona,
          monthlyFixedCosts:
            monthlyFixedCosts !== undefined
              ? monthlyFixedCosts
              : user.monthlyFixedCosts,
          riskTolerance:
            riskTolerance !== undefined ? riskTolerance : user.riskTolerance,
        },
      })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        persona: user.persona,
        monthlyFixedCosts: user.monthlyFixedCosts,
        riskTolerance: user.riskTolerance,
      },
    })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
