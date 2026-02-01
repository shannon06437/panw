import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  detectCategoryTrends,
  calculateCashflow,
} from '@/lib/analytics/deterministic'
import { Transaction } from '@prisma/client'

function normalizeCategory(category: string | null): string {
  if (!category) return 'Uncategorized'
  
  const normalized = category.toLowerCase()
  
  const categoryMap: Record<string, string> = {
    'food and drink': 'Dining',
    'restaurants': 'Dining',
    'fast food': 'Dining',
    'coffee shops': 'Dining',
    'shops': 'Shopping',
    'supermarkets': 'Groceries',
    'gas stations': 'Gas',
    'transportation': 'Transportation',
    'general merchandise': 'Shopping',
    'entertainment': 'Entertainment',
    'recreation': 'Entertainment',
    'travel': 'Travel',
    'hotels': 'Travel',
    'air travel': 'Travel',
    'utilities': 'Utilities',
    'internet': 'Utilities',
    'telecommunication services': 'Utilities',
  }
  
  for (const [key, value] of Object.entries(categoryMap)) {
    if (normalized.includes(key)) {
      return value
    }
  }
  
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()
}

function getCategoryBreakdown(transactions: Transaction[], targetMonth: Date) {
  const monthTxns = transactions.filter(
    (t) =>
      t.date.getMonth() === targetMonth.getMonth() &&
      t.date.getFullYear() === targetMonth.getFullYear() &&
      t.amount < 0 // Only expenses
  )

  const byCategory = new Map<string, number>()
  
  for (const txn of monthTxns) {
    const cat = normalizeCategory(txn.category)
    byCategory.set(cat, (byCategory.get(cat) || 0) + Math.abs(txn.amount))
  }

  return Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const monthParam = request.nextUrl.searchParams.get('month')
    const yearParam = request.nextUrl.searchParams.get('year')

    // Parse month/year or use current month
    let targetMonth = new Date()
    if (monthParam && yearParam) {
      targetMonth = new Date(parseInt(yearParam), parseInt(monthParam), 1)
    }

    const previousMonth = new Date(targetMonth)
    previousMonth.setMonth(previousMonth.getMonth() - 1)

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

    const allTransactions = user.plaidItems.flatMap((item) => item.transactions)

    if (allTransactions.length === 0) {
      return NextResponse.json({
        income: 0,
        expenses: 0,
        net: 0,
        savingsRate: null,
        categoryBreakdown: [],
        changes: [],
        targetMonth: targetMonth.toISOString(),
      })
    }

    // Calculate cashflow for target month
    const cashflow = calculateCashflow(allTransactions, targetMonth)

    // Get category breakdown
    const categoryBreakdown = getCategoryBreakdown(allTransactions, targetMonth)

    // Get category trends for "What Changed"
    const categoryTrends = detectCategoryTrends(
      allTransactions,
      targetMonth,
      previousMonth
    )

    const changes = categoryTrends.map((trend) => ({
      category: trend.category,
      deltaPercent: trend.deltaPercent,
      monthlyImpact: trend.monthlyImpact,
      currentMonth: trend.currentMonth,
      previousMonth: trend.previousMonth,
    }))

    return NextResponse.json({
      income: cashflow.monthlyIncome,
      expenses: cashflow.monthlyExpenses,
      net: cashflow.net,
      savingsRate: cashflow.savingsRate,
      categoryBreakdown,
      changes,
      targetMonth: targetMonth.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
