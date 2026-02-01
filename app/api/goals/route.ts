import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'

    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { targetDate: 'asc' },
    })

    return NextResponse.json({ goals })
  } catch (error) {
    console.error('Error fetching goals:', error)
    return NextResponse.json(
      { error: 'Failed to fetch goals' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const { name, targetAmount, targetDate } = await request.json()

    if (!name || !targetAmount || !targetDate) {
      return NextResponse.json(
        { error: 'Name, target amount, and target date are required' },
        { status: 400 }
      )
    }

    const goal = await prisma.goal.create({
      data: {
        userId,
        name,
        targetAmount: parseFloat(targetAmount),
        targetDate: new Date(targetDate),
      },
    })

    return NextResponse.json({
      success: true,
      goal,
    })
  } catch (error) {
    console.error('Error creating goal:', error)
    return NextResponse.json(
      { error: 'Failed to create goal' },
      { status: 500 }
    )
  }
}
