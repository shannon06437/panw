import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { days = 90 } = await request.json().catch(() => ({}))
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

      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: item.accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      })

      const transactions = transactionsResponse.data.transactions

      for (const txn of transactions) {
        // Normalize amount: Plaid uses positive for debits, negative for credits
        // We'll store: negative for expenses, positive for income
        const amount = -txn.amount

        // Normalize category (use primary category)
        const category =
          txn.category && txn.category.length > 0
            ? txn.category[0]
            : 'Uncategorized'

        const existing = await prisma.transaction.findUnique({
          where: { plaidId: txn.transaction_id },
        })

        if (existing) {
          await prisma.transaction.update({
            where: { id: existing.id },
            data: {
              amount,
              date: new Date(txn.date),
              name: txn.name,
              category,
              merchantName: txn.merchant_name || null,
              accountId: txn.account_id || null,
            },
          })
          results.updated++
        } else {
          await prisma.transaction.create({
            data: {
              plaidItemId: item.id,
              plaidId: txn.transaction_id,
              amount,
              date: new Date(txn.date),
              name: txn.name,
              category,
              merchantName: txn.merchant_name || null,
              accountId: txn.account_id || null,
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
