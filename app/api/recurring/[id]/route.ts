import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const { status } = await request.json()

    if (!['active', 'cancelled', 'unsure'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be active, cancelled, or unsure' },
        { status: 400 }
      )
    }

    // Check if this is a detected charge (starts with "detected-")
    const chargeId = params.id
    if (chargeId.startsWith('detected-')) {
      // For detected charges, we need to create a new RecurringCharge record
      // Get the charge name from the ID
      const chargeName = chargeId.replace('detected-', '')
      
      // Find the user's first PlaidItem
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

      // Create a new recurring charge record
      const recurringCharge = await prisma.recurringCharge.create({
        data: {
          plaidItemId: user.plaidItems[0].id,
          name: chargeName,
          amount: 0, // Will be updated when we have better detection
          frequency: 'monthly',
          confidence: 0.7,
          status,
        },
      })

      return NextResponse.json({
        success: true,
        recurringCharge: {
          id: recurringCharge.id,
          name: recurringCharge.name,
          status: recurringCharge.status,
        },
      })
    }

    // Update existing recurring charge
    const recurringCharge = await prisma.recurringCharge.findUnique({
      where: { id: chargeId },
      include: {
        plaidItem: {
          include: {
            user: true,
          },
        },
      },
    })

    if (!recurringCharge) {
      return NextResponse.json(
        { error: 'Recurring charge not found' },
        { status: 404 }
      )
    }

    if (recurringCharge.plaidItem.user.id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const updated = await prisma.recurringCharge.update({
      where: { id: chargeId },
      data: { status },
    })

    return NextResponse.json({
      success: true,
      recurringCharge: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
      },
    })
  } catch (error) {
    console.error('Error updating recurring charge:', error)
    return NextResponse.json(
      { error: 'Failed to update recurring charge' },
      { status: 500 }
    )
  }
}
