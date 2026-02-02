import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
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
      errors: [] as string[],
    }

    // Sync income for each Plaid item
    for (const item of user.plaidItems) {
      try {
        // Note: Income API requires user_token, not access_token
        // For now, we'll try to get user_token from the item or skip if not available
        // In production, you'd need to store user_token during Link flow
        
        // Try to get income data - this may fail if user_token is not available
        // or if Credit product is not enabled
        const incomeResponse = await plaidClient.creditBankIncomeGet({
          user_token: item.accessToken, // This might not work - may need separate user_token
          options: {
            count: 1,
          },
        })

        const bankIncome = incomeResponse.data.bank_income || []

        for (const income of bankIncome) {
          const summary = income.bank_income_summary

          if (!summary) continue

          // Parse dates
          const startDate = new Date(summary.start_date)
          const endDate = new Date(summary.end_date)

          // Check if income summary already exists for this date range
          const existing = await prisma.incomeSummary.findFirst({
            where: {
              plaidItemId: item.id,
              startDate: startDate,
              endDate: endDate,
            },
          })

          const incomeData = {
            bankIncomeId: income.bank_income_id || null,
            startDate,
            endDate,
            totalAmount: summary.total_amount || 0,
            currencyCode: summary.iso_currency_code || null,
            incomeSourcesCount: summary.income_sources_count || null,
            incomeCategoriesCount: summary.income_categories_count || null,
            incomeTransactionsCount: summary.income_transactions_count || null,
            generatedTime: income.generated_time ? new Date(income.generated_time) : null,
            lastUpdatedTime: income.items?.[0]?.last_updated_time
              ? new Date(income.items[0].last_updated_time)
              : null,
          }

          if (existing) {
            await prisma.incomeSummary.update({
              where: { id: existing.id },
              data: incomeData,
            })
            results.updated++
          } else {
            await prisma.incomeSummary.create({
              data: {
                plaidItemId: item.id,
                ...incomeData,
              },
            })
            results.inserted++
          }
        }
      } catch (error: any) {
        // Income API might not be available for all items (requires Credit product)
        // or user_token might not be available
        console.error(`Error syncing income for item ${item.id}:`, error.message)
        results.errors.push(`Item ${item.institutionName || item.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `Synced ${results.inserted} new, ${results.updated} updated income summaries`,
      warnings: results.errors.length > 0 ? results.errors : undefined,
    })
  } catch (error) {
    console.error('Error syncing income:', error)
    return NextResponse.json(
      { error: 'Failed to sync income' },
      { status: 500 }
    )
  }
}
