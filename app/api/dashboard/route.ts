import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  detectCategoryTrends,
  calculateCashflow,
} from '@/lib/analytics/deterministic'
import { Transaction } from '@prisma/client'

function normalizeCategory(category: string | null): string {
  if (!category || category === 'Uncategorized') return 'Uncategorized'
  
  const trimmed = category.trim()
  
  // Convert SNAKE_CASE to Title Case (e.g., FOOD_AND_DRINK -> Food And Drink)
  if (trimmed.includes('_')) {
    return trimmed
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }
  
  // If already in a readable format, just capitalize first letter of each word
  return trimmed
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function getCategoryBreakdown(transactions: Transaction[], targetMonth: Date) {
  // Normalize target month to start of month for comparison
  const targetYear = targetMonth.getFullYear()
  const targetMonthNum = targetMonth.getMonth()
  
  const monthTxns = transactions.filter((t) => {
    // Handle both Date objects and date strings
    const txnDate = t.date instanceof Date ? t.date : new Date(t.date)
    return (
      txnDate.getMonth() === targetMonthNum &&
      txnDate.getFullYear() === targetYear &&
      t.amount < 0 // Only expenses
    )
  })

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
    const accountIdParam = request.nextUrl.searchParams.get('accountId') // 'all' or specific account ID

    // Parse month/year or use current month
    let targetMonth = new Date()
    if (monthParam !== null && yearParam !== null) {
      targetMonth = new Date(parseInt(yearParam), parseInt(monthParam), 1)
    } else {
      targetMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
    }

    const previousMonth = new Date(targetMonth)
    previousMonth.setMonth(previousMonth.getMonth() - 1)

    // Get user's accounts and transactions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        plaidItems: {
          include: {
            accounts: {
              orderBy: [
                { type: 'asc' },
                { name: 'asc' },
              ],
            },
            transactions: {
              include: {
                account: true,
              },
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

    const allAccounts = user.plaidItems.flatMap((item) =>
      item.accounts.map((acc) => ({
        ...acc,
        institutionName: item.institutionName,
      }))
    )

    // Determine which accounts to show
    let selectedAccounts: typeof allAccounts = []
    let viewType: 'combined' | 'single' = 'combined'
    let accountType: string | null = null

    if (accountIdParam && accountIdParam !== 'all') {
      // Single account view
      const account = allAccounts.find((a) => a.id === accountIdParam)
      if (!account) {
        return NextResponse.json(
          { error: 'Account not found' },
          { status: 404 }
        )
      }
      selectedAccounts = [account]
      viewType = 'single'
      accountType = account.type
    } else {
      // Combined view - default to all depository accounts
      selectedAccounts = allAccounts.filter((a) => a.type === 'depository')
      viewType = 'combined'
      accountType = 'depository'
    }

    // Filter transactions by selected accounts
    const selectedAccountIds = new Set(selectedAccounts.map((a) => a.id))
    const allTransactions = user.plaidItems.flatMap((item) => item.transactions)
    const filteredTransactions = allTransactions.filter(
      (t) => !t.accountId || selectedAccountIds.has(t.accountId)
    )

    if (filteredTransactions.length === 0 && selectedAccounts.length === 0) {
      return NextResponse.json({
        income: 0,
        expenses: 0,
        net: 0,
        balance: 0,
        savingsRate: null,
        categoryBreakdown: [],
        changes: [],
        targetMonth: targetMonth.toISOString(),
        accounts: selectedAccounts,
        viewType,
        accountType,
      })
    }

    // Calculate metrics based on account type
    let income = 0
    let expenses = 0
    let net = 0
    let balance = 0
    let savingsRate: number | null = null
    let creditLimit: number | null = null
    let balanceChange: number | null = null

    if (accountType === 'depository') {
      // Calculate balance (sum of all selected depository accounts)
      balance = selectedAccounts.reduce((sum, acc) => sum + acc.balance, 0)

      // Calculate cashflow for target month
      const cashflow = calculateCashflow(filteredTransactions, targetMonth)
      income = cashflow.monthlyIncome
      expenses = cashflow.monthlyExpenses
      net = cashflow.net
      savingsRate = cashflow.savingsRate
    } else if (accountType === 'credit') {
      // For credit: balance (amount owed) and spend
      balance = selectedAccounts.reduce((sum, acc) => sum + acc.balance, 0)
      creditLimit = selectedAccounts.reduce((sum, acc) => sum + (acc.limit || 0), 0)
      
      // Calculate spend (negative transactions = spending)
      const monthTxns = filteredTransactions.filter((t) => {
        const txnDate = t.date instanceof Date ? t.date : new Date(t.date)
        return (
          txnDate.getMonth() === targetMonth.getMonth() &&
          txnDate.getFullYear() === targetMonth.getFullYear()
        )
      })
      expenses = Math.abs(
        monthTxns.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
      )
    } else if (accountType === 'investment' || accountType === 'loan') {
      // For investment/loan: balance and change over time
      balance = selectedAccounts.reduce((sum, acc) => sum + acc.balance, 0)
      
      // Calculate change from previous month (simplified - would need historical balance data)
      // For now, we'll use transaction net as a proxy
      const currentMonthTxns = filteredTransactions.filter((t) => {
        const txnDate = t.date instanceof Date ? t.date : new Date(t.date)
        return (
          txnDate.getMonth() === targetMonth.getMonth() &&
          txnDate.getFullYear() === targetMonth.getFullYear()
        )
      })
      const prevMonthTxns = filteredTransactions.filter((t) => {
        const txnDate = t.date instanceof Date ? t.date : new Date(t.date)
        return (
          txnDate.getMonth() === previousMonth.getMonth() &&
          txnDate.getFullYear() === previousMonth.getFullYear()
        )
      })
      
      const currentNet = currentMonthTxns.reduce((sum, t) => sum + t.amount, 0)
      const prevNet = prevMonthTxns.reduce((sum, t) => sum + t.amount, 0)
      balanceChange = currentNet - prevNet
    }

    // Get category breakdown (only for depository accounts with expenses)
    const categoryBreakdown =
      accountType === 'depository'
        ? getCategoryBreakdown(filteredTransactions, targetMonth)
        : []

    // Get category trends for "What Changed" (only for depository)
    const changes =
      accountType === 'depository'
        ? detectCategoryTrends(filteredTransactions, targetMonth, previousMonth).map(
            (trend) => ({
              category: trend.category,
              deltaPercent: trend.deltaPercent,
              monthlyImpact: trend.monthlyImpact,
              currentMonth: trend.currentMonth,
              previousMonth: trend.previousMonth,
            })
          )
        : []

    return NextResponse.json({
      income,
      expenses,
      net,
      balance,
      savingsRate,
      creditLimit,
      balanceChange,
      categoryBreakdown,
      changes,
      targetMonth: targetMonth.toISOString(),
      accounts: selectedAccounts,
      viewType,
      accountType,
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
