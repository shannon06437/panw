import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { days = 365 } = await request.json().catch(() => ({}))
    const userId = request.headers.get('x-user-id') || 'default-user'

    // Get user's Plaid items
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { plaidItems: true },
    })

    if (!user || user.plaidItems.length === 0) {
      return NextResponse.json(
        { error: 'No connected bank accounts found' },
        { status: 404 }
      )
    }

    const results = {
      inserted: 0,
      updated: 0,
      skipped: 0,
    }

    // Sync transactions for each Plaid item
    for (const item of user.plaidItems) {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      const endDate = new Date()

      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]


      // Initial request
      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: item.accessToken,
        start_date: startDateStr,
        end_date: endDateStr,
        options: {
          days_requested: days ? days : 90,
        },
      })

      let transactions = transactionsResponse.data.transactions
      const totalTransactions = transactionsResponse.data.total_transactions
      const accounts = transactionsResponse.data.accounts || []


      // Handle pagination to get all transactions
      while (transactions.length < totalTransactions) {
        const paginatedResponse = await plaidClient.transactionsGet({
          access_token: item.accessToken,
          start_date: startDateStr,
          end_date: endDateStr,
          options: {
            offset: transactions.length,
            days_requested: days >= 30 ? days : 30,
          },
        })
        transactions = transactions.concat(paginatedResponse.data.transactions)
      }


      // Sync accounts
      for (const account of accounts) {
        const existingAccount = await prisma.account.findUnique({
          where: { plaidAccountId: account.account_id },
        })

        const accountData = {
          name: account.name,
          officialName: account.official_name || null,
          type: account.type,
          subtype: account.subtype || null,
          mask: account.mask || null,
          balance: account.balances.current || 0,
          availableBalance: account.balances.available || null,
          limit: account.balances.limit || null,
          currencyCode: account.balances.iso_currency_code || null,
          lastSyncedAt: new Date(),
        }

        if (existingAccount) {
          await prisma.account.update({
            where: { id: existingAccount.id },
            data: accountData,
          })
        } else {
          await prisma.account.create({
            data: {
              plaidItemId: item.id,
              plaidAccountId: account.account_id,
              ...accountData,
            },
          })
        }
      }


      // Create a map of plaidAccountId to our Account.id for quick lookup
      const accountMap = new Map<string, string>()
      const allAccounts = await prisma.account.findMany({
        where: { plaidItemId: item.id },
      })
      for (const acc of allAccounts) {
        accountMap.set(acc.plaidAccountId, acc.id)
      }

      for (const txn of transactions) {
        // Normalize amount based on Plaid product:
        // We're using transactionsGet() (Transactions API, NOT Income API)
        // For Transactions API: positive = money moves out (expenses), negative = money moves in (income)
        // We invert to store: negative = expenses, positive = income
        // Note: If we were using Income API, amounts would already be positive for income
        const amount = -txn.amount

        // Normalize category (use personal_finance_category.primary, fallback to category array, then merchant name)
        let category = 'Uncategorized'
        if (txn.personal_finance_category?.primary) {
          category = txn.personal_finance_category.primary
        } else if (txn.category && txn.category.length > 0) {
          category = txn.category[0]
        } else if (txn.merchant_name) {
          // Use merchant name as fallback for categorization
          category = txn.merchant_name
        }

        // Get our Account.id from the plaidAccountId
        const accountId = accountMap.get(txn.account_id) || null

        const existing = await prisma.transaction.findUnique({
          where: { plaidId: txn.transaction_id },
        })

        // Parse date properly to avoid timezone issues
        // Plaid date format is "YYYY-MM-DD", parse as local date
        const [year, month, day] = txn.date.split('-').map(Number)
        const txnDate = new Date(year, month - 1, day) // month is 0-indexed

        if (existing) {
          await prisma.transaction.update({
            where: { id: existing.id },
            data: {
              amount,
              date: txnDate,
              name: txn.name,
              category,
              merchantName: txn.merchant_name || null,
              accountId,
              plaidAccountId: txn.account_id,
            },
          })
          results.updated++
        } else {
          await prisma.transaction.create({
            data: {
              plaidItemId: item.id,
              plaidId: txn.transaction_id,
              amount,
              date: txnDate,
              name: txn.name,
              category,
              merchantName: txn.merchant_name || null,
              accountId,
              plaidAccountId: txn.account_id,
            },
          })
          results.inserted++
        }
      }

      // Update last synced timestamp
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: { lastSyncedAt: new Date() },
      })
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `Synced ${results.inserted} new, ${results.updated} updated transactions`,
    })
  } catch (error) {
    console.error('Error syncing transactions:', error)
    return NextResponse.json(
      { error: 'Failed to sync transactions' },
      { status: 500 }
    )
  }
}
