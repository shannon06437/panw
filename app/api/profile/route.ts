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

    // Parse coachingGuidelines if present
    let coachingGuidelines = null
    if (user.coachingGuidelines) {
      try {
        coachingGuidelines = JSON.parse(user.coachingGuidelines)
      } catch (e) {
        console.error('Error parsing coachingGuidelines:', e)
      }
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      persona: user.persona,
      monthlyFixedCosts: user.monthlyFixedCosts,
      riskTolerance: user.riskTolerance,
      coachingGuidelines,
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
    const { persona, monthlyFixedCosts, riskTolerance, coachingGuidelines } = await request.json()

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { id: userId },
    })

    const updateData: any = {}
    if (persona !== undefined) updateData.persona = persona || null
    if (monthlyFixedCosts !== undefined) updateData.monthlyFixedCosts = monthlyFixedCosts || null
    if (riskTolerance !== undefined) updateData.riskTolerance = riskTolerance || null
    if (coachingGuidelines !== undefined) {
      updateData.coachingGuidelines = coachingGuidelines ? (typeof coachingGuidelines === 'string' ? coachingGuidelines : JSON.stringify(coachingGuidelines)) : null
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          ...updateData,
        },
      })
    } else {
      user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      })
    }

    // Parse coachingGuidelines for response
    let parsedCoachingGuidelines = null
    if (user.coachingGuidelines) {
      try {
        parsedCoachingGuidelines = JSON.parse(user.coachingGuidelines)
      } catch (e) {
        console.error('Error parsing coachingGuidelines:', e)
      }
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
        coachingGuidelines: parsedCoachingGuidelines,
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
