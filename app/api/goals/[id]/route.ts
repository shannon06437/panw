import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const { id: goalId } = await params
    const { name, targetAmount, targetDate } = await request.json()

    if (!name || !targetAmount || !targetDate) {
      return NextResponse.json(
        { error: 'Name, target amount, and target date are required' },
        { status: 400 }
      )
    }

    // Verify goal exists and belongs to user
    const existingGoal = await prisma.goal.findUnique({
      where: { id: goalId },
    })

    if (!existingGoal || existingGoal.userId !== userId) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      )
    }

    // Update the goal
    const goal = await prisma.goal.update({
      where: { id: goalId },
      data: {
        name,
        targetAmount: parseFloat(targetAmount),
        targetDate: new Date(targetDate),
      },
    })

    return NextResponse.json({
      success: true,
      goal,
    })
  } catch (error) {
    console.error('Error updating goal:', error)
    return NextResponse.json(
      { error: 'Failed to update goal' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id') || 'default-user'
    const { id: goalId } = await params

    // Verify goal exists and belongs to user
    const existingGoal = await prisma.goal.findUnique({
      where: { id: goalId },
    })

    if (!existingGoal || existingGoal.userId !== userId) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      )
    }

    // Delete the goal (cascade will delete associated insights)
    await prisma.goal.delete({
      where: { id: goalId },
    })

    return NextResponse.json({
      success: true,
      message: 'Goal deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting goal:', error)
    return NextResponse.json(
      { error: 'Failed to delete goal' },
      { status: 500 }
    )
  }
}
