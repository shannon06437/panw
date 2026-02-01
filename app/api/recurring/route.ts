import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { detectRecurringCharges } from '@/lib/analytics/deterministic'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const confidenceFilter = request.nextUrl.searchParams.get('confidence') // 'high' | 'medium' | 'low'

    // Get user's transactions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        plaidItems: {
          include: {
            transactions: {
              orderBy: { date: 'desc' },
            },
            recurringCharges: true,
          },
        },
      },
    })

    if (!user || user.plaidItems.length === 0) {
      return NextResponse.json(
        { error: 'No connected bank accounts found' },
        { status: 404 }
      )
    }

    const allTransactions = user.plaidItems.flatMap((item) => item.transactions)

    if (allTransactions.length === 0) {
      return NextResponse.json({
        recurringCharges: [],
        message: 'No transactions found. Sync your account to see recurring charges.',
      })
    }

    // Detect recurring charges using deterministic analytics
    const detectedCharges = detectRecurringCharges(allTransactions)

    // Merge with existing recurring charges from DB (user labels)
    const existingCharges = new Map(
      user.plaidItems.flatMap((item) =>
        item.recurringCharges.map((rc) => [rc.name.toLowerCase(), rc])
      )
    )

    const recurringCharges = detectedCharges.map((charge) => {
      const existing = existingCharges.get(charge.name.toLowerCase())
      return {
        id: existing?.id || `detected-${charge.name}`,
        name: charge.name,
        amount: charge.amount,
        frequency: charge.frequency,
        confidence: charge.confidence,
        transactionCount: charge.transactionCount,
        status: existing?.status || 'active',
        isDetected: !existing,
      }
    })

    // Apply confidence filter
    let filtered = recurringCharges
    if (confidenceFilter) {
      filtered = recurringCharges.filter((charge) => {
        if (confidenceFilter === 'high') return charge.confidence >= 0.8
        if (confidenceFilter === 'medium') return charge.confidence >= 0.6 && charge.confidence < 0.8
        if (confidenceFilter === 'low') return charge.confidence < 0.6
        return true
      })
    }

    // Calculate monthly total
    const monthlyTotal = filtered.reduce((sum, charge) => {
      if (charge.status === 'cancelled') return sum
      const monthly =
        charge.frequency === 'monthly'
          ? charge.amount
          : charge.frequency === 'weekly'
          ? charge.amount * 4.33
          : charge.amount / 12
      return sum + monthly
    }, 0)

    return NextResponse.json({
      recurringCharges: filtered,
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      totalCount: filtered.length,
    })
  } catch (error) {
    console.error('Error fetching recurring charges:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recurring charges' },
      { status: 500 }
    )
  }
}
