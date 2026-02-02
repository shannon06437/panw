import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  detectCategoryTrends,
  detectAnomalies,
  detectRecurringCharges,
} from '@/lib/analytics/deterministic'
import { generateGoalInsights } from '@/lib/llm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const { id: goalId } = await params
    const { searchParams } = new URL(request.url)
    const regenerate = searchParams.get('regenerate') === 'true'

    // Get goal
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
    })

    if (!goal || goal.userId !== userId) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      )
    }

    // Check if insights already exist and return them if not regenerating
    if (!regenerate) {
      const existingInsights = await prisma.goalInsight.findUnique({
        where: { goalId },
      })

      if (existingInsights) {
        return NextResponse.json({
          success: true,
          insights: {
            summary: existingInsights.summary,
            topReasons: JSON.parse(existingInsights.topReasons),
            actionPlan: JSON.parse(existingInsights.actionPlan),
            projected_completion_date: existingInsights.projectedCompletionDate || undefined,
          },
          cached: true,
        })
      }
    }

    // Get user profile for coaching guidelines
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

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Parse coaching guidelines
    let coachProfile: { style: string[]; additional_notes?: string } | null = null
    if (user.coachingGuidelines) {
      try {
        coachProfile = JSON.parse(user.coachingGuidelines)
      } catch (e) {
        console.error('Error parsing coachingGuidelines:', e)
      }
    }

    // Get all transactions
    const allTransactions = user.plaidItems.flatMap((item) => item.transactions)

    // Calculate feasibility (same logic as forecast route)
    const now = new Date()
    const targetDate = new Date(goal.targetDate)
    const monthsRemaining = Math.max(
      1,
      Math.ceil(
        (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
      )
    )
    const requiredPerMonth = goal.targetAmount / monthsRemaining

    // Get last 3 months of data
    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const recentTransactions = allTransactions.filter(
      (t) => {
        const txnDate = t.date instanceof Date ? t.date : new Date(t.date)
        return txnDate >= threeMonthsAgo
      }
    )

    const historySummary: Array<{ month: string; income: number; spend: number; net: number; categories: Array<{ category: string; amount: number }> }> = []
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

      // Calculate category breakdown for this month
      const monthCategories = new Map<string, number>()
      monthTxns
        .filter((t) => t.amount < 0)
        .forEach((t) => {
          const cat = t.category || 'Uncategorized'
          monthCategories.set(cat, (monthCategories.get(cat) || 0) + Math.abs(t.amount))
        })

      const categoryBreakdown = Array.from(monthCategories.entries())
        .map(([category, amount]) => ({
          category,
          amount: Math.round(amount * 100) / 100,
        }))
        .sort((a, b) => b.amount - a.amount)

      const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      historySummary.push({
        month: monthStr,
        income: Math.round(income * 100) / 100,
        spend: Math.round(expenses * 100) / 100,
        net: Math.round(net * 100) / 100,
        categories: categoryBreakdown,
      })
    }

    const baselineSurplusPerMonth =
      historySummary.length > 0
        ? historySummary.reduce((sum, m) => sum + m.net, 0) / historySummary.length
        : 0

    const gapPerMonth = requiredPerMonth - baselineSurplusPerMonth
    const status = gapPerMonth <= 0 ? 'on_track' : 'off_track'

    // Get category breakdown and top drivers
    const categoryTotals = new Map<string, number>()
    recentTransactions
      .filter((t) => t.amount < 0)
      .forEach((t) => {
        const cat = t.category || 'Uncategorized'
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Math.abs(t.amount))
      })

    const spendDrivers = Array.from(categoryTotals.entries())
      .map(([category, total]) => ({
        category,
        avg_monthly: Math.round((total / 3) * 100) / 100,
        trend: 'flat' as const, // Could enhance with trend detection
      }))
      .sort((a, b) => b.avg_monthly - a.avg_monthly)
      .slice(0, 5)

    // Get recurring charges - same approach as subscriptions page
    // Detect recurring charges from transactions (like subscriptions page does)
    const detectedCharges = detectRecurringCharges(allTransactions)
    
    // Merge with existing recurring charges from DB (user labels/status)
    const existingCharges = new Map(
      user.plaidItems.flatMap((item) =>
        item.recurringCharges.map((rc) => [rc.name.toLowerCase(), rc])
      )
    )
    
    const recurringCharges = detectedCharges.map((charge) => {
      const existing = existingCharges.get(charge.name.toLowerCase())
      return {
        name: charge.name,
        amount: charge.amount,
        frequency: charge.frequency,
        confidence: charge.confidence,
        status: existing?.status || 'active',
      }
    })
    
    // Filter for high confidence and active status (same as subscriptions page logic)
    const highConfidenceRecurring = recurringCharges
      .filter((rc) => rc.confidence >= 0.7 && rc.status === 'active')
      .map((rc) => ({
        name: rc.name,
        amount: rc.amount,
        frequency: rc.frequency,
      }))

    // Detect anomalies
    const previousMonth = new Date(now)
    previousMonth.setMonth(previousMonth.getMonth() - 1)
    const categoryTrends = detectCategoryTrends(allTransactions, now, previousMonth)
    const anomalies = detectAnomalies(recentTransactions)

    // Build anomalies list (only relevant ones)
    const relevantAnomalies = [
      ...categoryTrends
        .filter((t) => Math.abs(t.deltaPercent) > 15 || Math.abs(t.monthlyImpact) > 50)
        .map((t) => ({
          type: 'category_spike' as const,
          category: t.category,
          delta_pct: t.deltaPercent,
          impact_monthly: Math.round(t.monthlyImpact * 100) / 100,
        })),
      ...anomalies.slice(0, 3).map((a) => ({
        type: 'unusual_transaction' as const,
        amount: a.amount,
        reason: a.reason,
      })),
    ]

    // Build Goal Insight Packet
    const insightPacket = {
      coach_profile: coachProfile || {
        style: [],
        additional_notes: undefined,
      },
      goal: {
        type: 'save_amount',
        target_amount: goal.targetAmount,
        deadline: goal.targetDate.toISOString().split('T')[0],
        months_remaining: monthsRemaining,
      },
      feasibility: {
        required_per_month: Math.round(requiredPerMonth * 100) / 100,
        estimated_surplus_per_month: Math.round(baselineSurplusPerMonth * 100) / 100,
        gap_per_month: Math.round(gapPerMonth * 100) / 100,
        status,
      },
      history_summary: historySummary,
      spend_drivers: spendDrivers,
      recurring_charges: highConfidenceRecurring,
      anomalies: relevantAnomalies,
    }

    // Call LLM to generate insights
    const llmResponse = await generateGoalInsights(insightPacket)

    // Save or update insights in database
    const savedInsights = await prisma.goalInsight.upsert({
      where: { goalId },
      create: {
        goalId,
        summary: llmResponse.summary,
        topReasons: JSON.stringify(llmResponse.topReasons),
        actionPlan: JSON.stringify(llmResponse.actionPlan),
        projectedCompletionDate: llmResponse.projected_completion_date || null,
      },
      update: {
        summary: llmResponse.summary,
        topReasons: JSON.stringify(llmResponse.topReasons),
        actionPlan: JSON.stringify(llmResponse.actionPlan),
        projectedCompletionDate: llmResponse.projected_completion_date || null,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      insights: llmResponse,
      packet: insightPacket, // Include for debugging
    })
  } catch (error) {
    console.error('Error generating insights:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}

