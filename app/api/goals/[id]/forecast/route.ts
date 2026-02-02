import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const { id: goalId } = await params

    // Get goal
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
    })

    if (!goal) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      )
    }

    if (goal.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Get user's transactions to calculate current savings rate
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        plaidItems: {
          include: {
            transactions: {
              orderBy: { date: 'desc' },
            },
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

    const allTransactions = user.plaidItems.flatMap((item) => item.transactions)

    // Calculate deterministic feasibility
    const now = new Date()
    const targetDate = new Date(goal.targetDate)
    
    // Calculate months remaining
    const monthsRemaining = Math.max(
      1,
      Math.ceil(
        (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
      )
    )

    // Calculate required per month
    const requiredPerMonth = goal.targetAmount / monthsRemaining

    // Calculate baseline surplus from last 3 months
    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const recentTransactions = allTransactions.filter(
      (t) => {
        const txnDate = t.date instanceof Date ? t.date : new Date(t.date)
        return txnDate >= threeMonthsAgo
      }
    )

    const monthlyData: { month: string; income: number; spend: number; net: number }[] = []
    for (let i = 2; i >= 0; i--) {
      const monthDate = new Date(now)
      monthDate.setMonth(monthDate.getMonth() - i)
      
      const monthTxns = recentTransactions.filter(
        (t) => {
          const txnDate = t.date instanceof Date ? t.date : new Date(t.date)
          return (
            txnDate.getMonth() === monthDate.getMonth() &&
            txnDate.getFullYear() === monthDate.getFullYear()
          )
        }
      )

      const income = monthTxns.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
      const expenses = Math.abs(
        monthTxns.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
      )
      const net = income - expenses

      const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      monthlyData.push({
        month: monthStr,
        income: Math.round(income * 100) / 100,
        spend: Math.round(expenses * 100) / 100,
        net: Math.round(net * 100) / 100,
      })
    }

    const baselineSurplusPerMonth = monthlyData.length > 0
      ? monthlyData.reduce((sum, m) => sum + m.net, 0) / monthlyData.length
      : 0


    const gapPerMonth = requiredPerMonth - baselineSurplusPerMonth
    const status = gapPerMonth <= 0 ? 'on_track' : 'off_track'

    // Estimate current progress (assume 0 for now, could be enhanced with actual savings tracking)
    const currentProgress = 0
    const gap = goal.targetAmount - currentProgress

    // Calculate on-track probability based on feasibility
    let onTrackProbability = 0.5
    if (baselineSurplusPerMonth >= requiredPerMonth) {
      onTrackProbability = 0.9
    } else if (baselineSurplusPerMonth > 0) {
      onTrackProbability = Math.min(0.8, 0.5 + (baselineSurplusPerMonth / requiredPerMonth) * 0.3)
    } else {
      onTrackProbability = 0.2
    }

    // Calculate recommended levers
    const levers: Array<{ action: string; impact: number; description: string }> = []

    if (baselineSurplusPerMonth < requiredPerMonth) {
      const shortfall = requiredPerMonth - baselineSurplusPerMonth
      
      // Suggest reducing expenses
      if (shortfall > 0) {
        levers.push({
          action: 'Reduce monthly expenses',
          impact: shortfall,
          description: `Reduce expenses by $${shortfall.toFixed(2)}/month to meet your goal`,
        })
      }

      // Suggest increasing income
      levers.push({
        action: 'Increase monthly income',
        impact: shortfall,
        description: `Increase income by $${shortfall.toFixed(2)}/month to meet your goal`,
      })

      // Suggest extending timeline
      const extendedMonths = Math.ceil(goal.targetAmount / Math.max(baselineSurplusPerMonth, 1))
      if (extendedMonths > monthsRemaining) {
        levers.push({
          action: 'Extend target date',
          impact: 0,
          description: `Extend target date by ${extendedMonths - monthsRemaining} months to make goal achievable`,
        })
      }
    } else {
      levers.push({
        action: 'Maintain current savings rate',
        impact: 0,
        description: 'You\'re on track! Continue saving at your current rate.',
      })
    }

    return NextResponse.json({
      goal: {
        id: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
      },
      forecast: {
        requiredMonthlySavings: Math.round(requiredPerMonth * 100) / 100,
        currentProgress,
        gap: Math.round(gap * 100) / 100,
        monthsRemaining,
        onTrackProbability: Math.round(onTrackProbability * 100) / 100,
        avgMonthlyNet: Math.round(baselineSurplusPerMonth * 100) / 100,
      },
      feasibility: {
        requiredPerMonth: Math.round(requiredPerMonth * 100) / 100,
        estimatedSurplusPerMonth: Math.round(baselineSurplusPerMonth * 100) / 100,
        gapPerMonth: Math.round(gapPerMonth * 100) / 100,
        status,
      },
      historySummary: monthlyData,
      recommendedLevers: levers,
    })
  } catch (error) {
    console.error('Error calculating forecast:', error)
    return NextResponse.json(
      { error: 'Failed to calculate forecast' },
      { status: 500 }
    )
  }
}
