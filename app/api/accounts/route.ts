import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'

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

    // Group accounts by type
    const allAccounts = user.plaidItems.flatMap((item) =>
      item.accounts.map((acc) => ({
        ...acc,
        institutionName: item.institutionName,
      }))
    )

    const accountsByType = {
      depository: allAccounts.filter((a) => a.type === 'depository'),
      credit: allAccounts.filter((a) => a.type === 'credit'),
      investment: allAccounts.filter((a) => a.type === 'investment'),
      loan: allAccounts.filter((a) => a.type === 'loan'),
    }

    return NextResponse.json({
      accounts: allAccounts,
      accountsByType,
    })
  } catch (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    )
  }
}
