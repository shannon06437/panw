import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  detectCategoryTrends,
  detectAnomalies,
  detectRecurringCharges,
  calculateCashflow,
  FinancialSignal,
} from '@/lib/analytics/deterministic'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const mode = request.nextUrl.searchParams.get('mode') || 'deterministic'

    // Get user's transactions
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

    if (!user || user.plaidItems.length === 0) {
      return NextResponse.json(
        { error: 'No connected bank accounts found' },
        { status: 404 }
      )
    }

    // Collect all transactions
    const allTransactions = user.plaidItems.flatMap((item) => item.transactions)

    if (allTransactions.length === 0) {
      return NextResponse.json({
        insights: [],
        signals: [],
        message: 'No transactions found. Sync your account to see insights.',
      })
    }

    // Layer 1: Generate deterministic signals
    const currentMonth = new Date()
    const previousMonth = new Date()
    previousMonth.setMonth(previousMonth.getMonth() - 1)

    const categoryTrends = detectCategoryTrends(
      allTransactions,
      currentMonth,
      previousMonth
    )
    const anomalies = detectAnomalies(allTransactions)
    const recurringCharges = detectRecurringCharges(allTransactions)
    const cashflow = calculateCashflow(allTransactions, currentMonth)

    const signals: FinancialSignal[] = [
      ...categoryTrends,
      ...anomalies,
      ...recurringCharges,
      cashflow,
    ]

    // For MVP, convert signals to simple insights (Layer 2 would use LLM here)
    const insights = signalsToInsights(signals, mode === 'hybrid')

    return NextResponse.json({
      insights,
      signals, // Include raw signals for debugging
      mode,
    })
  } catch (error) {
    console.error('Error generating insights:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}

/**
 * Convert deterministic signals to user-friendly insights
 * In hybrid mode, this would be done by LLM, but for MVP we do it deterministically
 */
function signalsToInsights(
  signals: FinancialSignal[],
  hybridMode: boolean
): any[] {
  const insights: any[] = []

  for (const signal of signals) {
    if (signal.type === 'CATEGORY_TREND') {
      const isIncrease = signal.deltaPercent > 0
      insights.push({
        id: `trend-${signal.category}`,
        priority: Math.abs(signal.deltaPercent) > 20 ? 'p0' : 'p1',
        title: `${signal.category} spending ${isIncrease ? 'increased' : 'decreased'} ${Math.abs(signal.deltaPercent).toFixed(1)}%`,
        message: isIncrease
          ? `Your ${signal.category.toLowerCase()} spending increased by $${Math.abs(signal.monthlyImpact).toFixed(2)} this month compared to last month.`
          : `Great! Your ${signal.category.toLowerCase()} spending decreased by $${Math.abs(signal.monthlyImpact).toFixed(2)} this month.`,
        evidence: [
          `Current month: $${signal.currentMonth.toFixed(2)}`,
          `Previous month: $${signal.previousMonth.toFixed(2)}`,
          `Change: ${signal.deltaPercent > 0 ? '+' : ''}${signal.deltaPercent.toFixed(1)}%`,
        ],
        impact: {
          monthly: signal.monthlyImpact,
          annual: signal.monthlyImpact * 12,
        },
        actions: isIncrease
          ? [
              'Review recent transactions in this category',
              'Consider setting a monthly budget limit',
            ]
          : ['Keep up the good work!'],
        signalId: `CATEGORY_TREND_${signal.category}`,
      })
    } else if (signal.type === 'ANOMALY') {
      insights.push({
        id: `anomaly-${signal.transactionId}`,
        priority: 'p1',
        title: 'Unusual transaction detected',
        message: signal.reason,
        evidence: [
          `Amount: $${Math.abs(signal.amount).toFixed(2)}`,
          `Date: ${signal.date.toLocaleDateString()}`,
        ],
        impact: {
          monthly: Math.abs(signal.amount),
          annual: null,
        },
        actions: [
          'Verify this transaction is legitimate',
          'Check if this is a one-time expense or recurring',
        ],
        signalId: `ANOMALY_${signal.transactionId}`,
      })
    } else if (signal.type === 'RECURRING_CHARGE' && signal.confidence > 0.7) {
      insights.push({
        id: `recurring-${signal.name}`,
        priority: 'p2',
        title: `Recurring charge: ${signal.name}`,
        message: `You have a ${signal.frequency} charge of $${signal.amount.toFixed(2)} for ${signal.name}.`,
        evidence: [
          `Amount: $${signal.amount.toFixed(2)}`,
          `Frequency: ${signal.frequency}`,
          `Confidence: ${(signal.confidence * 100).toFixed(0)}%`,
          `Based on ${signal.transactionCount} transactions`,
        ],
        impact: {
          monthly:
            signal.frequency === 'monthly'
              ? signal.amount
              : signal.frequency === 'weekly'
              ? signal.amount * 4.33
              : signal.amount / 12,
          annual:
            signal.frequency === 'monthly'
              ? signal.amount * 12
              : signal.frequency === 'weekly'
              ? signal.amount * 52
              : signal.amount,
        },
        actions: [
          'Review if this subscription is still needed',
          'Consider canceling unused services',
        ],
        signalId: `RECURRING_${signal.name}`,
      })
    } else if (signal.type === 'CASHFLOW') {
      insights.push({
        id: 'cashflow-summary',
        priority: 'p0',
        title: `Monthly ${signal.trend === 'improving' ? 'improvement' : signal.trend === 'declining' ? 'decline' : 'summary'}`,
        message: `This month: $${signal.monthlyIncome.toFixed(2)} income, $${signal.monthlyExpenses.toFixed(2)} expenses, $${signal.net >= 0 ? '+' : ''}${signal.net.toFixed(2)} net.${signal.savingsRate !== null ? ` Savings rate: ${signal.savingsRate.toFixed(1)}%.` : ''}`,
        evidence: [
          `Income: $${signal.monthlyIncome.toFixed(2)}`,
          `Expenses: $${signal.monthlyExpenses.toFixed(2)}`,
          `Net: $${signal.net >= 0 ? '+' : ''}${signal.net.toFixed(2)}`,
          ...(signal.savingsRate !== null
            ? [`Savings rate: ${signal.savingsRate.toFixed(1)}%`]
            : []),
        ],
        impact: {
          monthly: signal.net,
          annual: signal.net * 12,
        },
        actions:
          signal.net < 0
            ? [
                'Review your largest expense categories',
                'Consider reducing discretionary spending',
              ]
            : signal.savingsRate !== null && signal.savingsRate < 10
            ? [
                'Consider increasing your savings rate',
                'Set up automatic transfers to savings',
              ]
            : ['You\'re on track! Consider setting a savings goal.'],
        signalId: 'CASHFLOW',
      })
    }
  }

  // Sort by priority (p0 first, then p1, then p2)
  const priorityOrder = { p0: 0, p1: 1, p2: 2 }
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return insights
}
