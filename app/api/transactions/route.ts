import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    const targetYear = targetMonth.getFullYear()
    const targetMonthNum = targetMonth.getMonth()

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
    if (accountIdParam && accountIdParam !== 'all') {
      const account = allAccounts.find((a) => a.id === accountIdParam)
      if (!account) {
        return NextResponse.json(
          { error: 'Account not found' },
          { status: 404 }
        )
      }
      selectedAccounts = [account]
    } else {
      // Default: show all accounts
      selectedAccounts = allAccounts
    }

    // Filter transactions by selected accounts and month
    const selectedAccountIds = new Set(selectedAccounts.map((a) => a.id))
    const allTransactions = user.plaidItems.flatMap((item) => item.transactions)

    const filteredTransactions = allTransactions
      .filter((t) => {
        // Filter by account
        if (t.accountId && !selectedAccountIds.has(t.accountId)) {
          return false
        }
        // Filter by month - handle date parsing consistently
        let txnDate: Date
        if (t.date instanceof Date) {
          txnDate = t.date
        } else if (typeof t.date === 'string') {
          // Parse date string (format: YYYY-MM-DD or ISO string)
          if (t.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = t.date.split('-').map(Number)
            txnDate = new Date(year, month - 1, day) // month is 0-indexed
          } else {
            txnDate = new Date(t.date)
          }
        } else {
          txnDate = new Date(t.date)
        }
        
        return (
          txnDate.getMonth() === targetMonthNum &&
          txnDate.getFullYear() === targetYear
        )
      })
      .map((t) => ({
        id: t.id,
        name: t.name,
        amount: t.amount,
        date: t.date,
        category: t.category,
        merchantName: t.merchantName,
        accountId: t.accountId,
        account: t.account
          ? {
              id: t.account.id,
              name: t.account.name,
              type: t.account.type,
              mask: t.account.mask,
            }
          : null,
        plaidAccountId: t.plaidAccountId,
      }))

    // Sort by date (newest first)
    filteredTransactions.sort((a, b) => {
      const parseDate = (d: string | Date): Date => {
        if (d instanceof Date) return d
        if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = d.split('-').map(Number)
          return new Date(year, month - 1, day)
        }
        return new Date(d)
      }
      const dateA = parseDate(a.date)
      const dateB = parseDate(b.date)
      return dateB.getTime() - dateA.getTime()
    })

    // Get date range of all transactions for this user
    const allUserTransactions = user.plaidItems.flatMap((item) => item.transactions)
    const parseDate = (d: string | Date): Date => {
      if (d instanceof Date) return d
      if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = d.split('-').map(Number)
        return new Date(year, month - 1, day)
      }
      return new Date(d)
    }
    
    const dates = allUserTransactions
      .map((t) => {
        const d = parseDate(t.date)
        return new Date(d.getFullYear(), d.getMonth(), 1)
      })
      .filter((d) => !isNaN(d.getTime()))

    const minDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date()
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date()

    return NextResponse.json({
      transactions: filteredTransactions,
      accounts: selectedAccounts,
      targetMonth: targetMonth.toISOString(),
      totalCount: filteredTransactions.length,
      dateRange: {
        min: minDate.toISOString(),
        max: maxDate.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}
