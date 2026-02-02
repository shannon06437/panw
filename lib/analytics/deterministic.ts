/**
 * Layer 1: Deterministic Financial Analytics
 * 
 * This layer produces structured financial signals from transaction data.
 * All logic is deterministic: same input → same output.
 */

import { Transaction } from '@prisma/client'

export type FinancialSignal = 
  | CategoryTrendSignal
  | AnomalySignal
  | RecurringChargeSignal
  | CashflowSignal

export interface CategoryTrendSignal {
  type: 'CATEGORY_TREND'
  category: string
  deltaPercent: number
  monthlyImpact: number
  confidence: number
  currentMonth: number
  previousMonth: number
}

export interface AnomalySignal {
  type: 'ANOMALY'
  transactionId: string
  amount: number
  date: Date
  reason: string
  confidence: number
}

export interface RecurringChargeSignal {
  type: 'RECURRING_CHARGE'
  name: string
  amount: number
  frequency: 'monthly' | 'weekly' | 'yearly'
  confidence: number
  transactionCount: number
}

export interface CashflowSignal {
  type: 'CASHFLOW'
  monthlyIncome: number
  monthlyExpenses: number
  net: number
  savingsRate: number | null
  trend: 'improving' | 'declining' | 'stable'
}

/**
 * Normalize category names for consistent grouping
 */
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

/**
 * Calculate category trends (month-over-month)
 */
export function detectCategoryTrends(
  transactions: Transaction[],
  currentMonth: Date,
  previousMonth: Date
): CategoryTrendSignal[] {
  const signals: CategoryTrendSignal[] = []
  
  // Normalize dates for comparison
  const currentYear = currentMonth.getFullYear()
  const currentMonthNum = currentMonth.getMonth()
  const prevYear = previousMonth.getFullYear()
  const prevMonthNum = previousMonth.getMonth()
  
  // Helper to parse dates consistently
  const parseDate = (d: string | Date): Date => {
    if (d instanceof Date) return d
    if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = d.split('-').map(Number)
      return new Date(year, month - 1, day) // month is 0-indexed, parse as local date
    }
    return new Date(d)
  }

  // Filter transactions by month
  const currentMonthTxns = transactions.filter((t) => {
    const txnDate = parseDate(t.date)
    return (
      txnDate.getMonth() === currentMonthNum &&
      txnDate.getFullYear() === currentYear &&
      t.amount < 0 // Only expenses
    )
  })
  
  const previousMonthTxns = transactions.filter((t) => {
    const txnDate = parseDate(t.date)
    return (
      txnDate.getMonth() === prevMonthNum &&
      txnDate.getFullYear() === prevYear &&
      t.amount < 0
    )
  })
  
  // Group by normalized category
  const currentByCategory = new Map<string, number>()
  const previousByCategory = new Map<string, number>()
  
  for (const txn of currentMonthTxns) {
    const cat = normalizeCategory(txn.category)
    currentByCategory.set(cat, (currentByCategory.get(cat) || 0) + Math.abs(txn.amount))
  }
  
  for (const txn of previousMonthTxns) {
    const cat = normalizeCategory(txn.category)
    previousByCategory.set(cat, (previousByCategory.get(cat) || 0) + Math.abs(txn.amount))
  }
  
  // Calculate trends
  const allCategories = new Set([
    ...currentByCategory.keys(),
    ...previousByCategory.keys(),
  ])
  
  for (const category of allCategories) {
    const current = currentByCategory.get(category) || 0
    const previous = previousByCategory.get(category) || 0
    
    if (previous === 0 && current === 0) continue
    
    const deltaPercent = previous === 0 
      ? (current > 0 ? 100 : 0)
      : ((current - previous) / previous) * 100
    
    // Only report significant changes (>10% or >$20)
    if (Math.abs(deltaPercent) > 10 || Math.abs(current - previous) > 20) {
      const monthlyImpact = current - previous
      const confidence = Math.min(0.95, 0.7 + (Math.min(current, previous) / 1000) * 0.25)
      
      signals.push({
        type: 'CATEGORY_TREND',
        category,
        deltaPercent: Math.round(deltaPercent * 10) / 10,
        monthlyImpact: Math.round(monthlyImpact * 100) / 100,
        confidence,
        currentMonth: current,
        previousMonth: previous,
      })
    }
  }
  
  return signals
}

/**
 * Detect anomalies (statistical outliers)
 */
export function detectAnomalies(transactions: Transaction[]): AnomalySignal[] {
  const signals: AnomalySignal[] = []
  
  // Calculate mean and std dev for expense amounts
  const expenses = transactions
    .filter((t) => t.amount < 0)
    .map((t) => Math.abs(t.amount))
  
  if (expenses.length < 3) return signals
  
  const mean = expenses.reduce((a, b) => a + b, 0) / expenses.length
  const variance =
    expenses.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    expenses.length
  const stdDev = Math.sqrt(variance)
  
  // Flag transactions > 2 standard deviations above mean
  const threshold = mean + 2 * stdDev
  
  for (const txn of transactions) {
    if (txn.amount < 0 && Math.abs(txn.amount) > threshold) {
      signals.push({
        type: 'ANOMALY',
        transactionId: txn.id,
        amount: txn.amount,
        date: txn.date,
        reason: `Unusually large expense (${Math.round((Math.abs(txn.amount) / mean) * 100)}% above average)`,
        confidence: Math.min(0.9, 0.6 + (Math.abs(txn.amount) / threshold) * 0.3),
      })
    }
  }
  
  return signals
}

/**
 * Detect recurring charges
 */
export function detectRecurringCharges(
  transactions: Transaction[]
): RecurringChargeSignal[] {
  const signals: RecurringChargeSignal[] = []
  
  // Group by merchant name and amount
  const chargeGroups = new Map<string, { amount: number; dates: Date[] }>()
  
  for (const txn of transactions.filter((t) => t.amount < 0)) {
    const key = `${txn.merchantName || txn.name}_${Math.round(Math.abs(txn.amount) * 100)}`
    
    if (!chargeGroups.has(key)) {
      chargeGroups.set(key, { amount: Math.abs(txn.amount), dates: [] })
    }
    
    chargeGroups.get(key)!.dates.push(txn.date)
  }
  
  // Analyze frequency
  for (const [key, group] of chargeGroups.entries()) {
    if (group.dates.length < 2) continue
    
    const sortedDates = group.dates.sort((a, b) => a.getTime() - b.getTime())
    const intervals: number[] = []
    
    for (let i = 1; i < sortedDates.length; i++) {
      const daysDiff = Math.round(
        (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) /
          (1000 * 60 * 60 * 24)
      )
      intervals.push(daysDiff)
    }
    
    // Check if intervals are consistent (within 5 days of each other for monthly)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    
    let frequency: 'monthly' | 'weekly' | 'yearly' | null = null
    let confidence = 0
    
    if (avgInterval >= 25 && avgInterval <= 35) {
      frequency = 'monthly'
      const variance = intervals.reduce(
        (sum, val) => sum + Math.pow(val - avgInterval, 2),
        0
      ) / intervals.length
      confidence = Math.max(0.5, 1 - variance / 100)
    } else if (avgInterval >= 5 && avgInterval <= 9) {
      frequency = 'weekly'
      const variance = intervals.reduce(
        (sum, val) => sum + Math.pow(val - avgInterval, 2),
        0
      ) / intervals.length
      confidence = Math.max(0.5, 1 - variance / 10)
    } else if (avgInterval >= 360 && avgInterval <= 370) {
      frequency = 'yearly'
      confidence = 0.7
    }
    
    if (frequency && confidence > 0.5) {
      const name = key.split('_')[0]
      signals.push({
        type: 'RECURRING_CHARGE',
        name,
        amount: group.amount,
        frequency,
        confidence: Math.round(confidence * 100) / 100,
        transactionCount: group.dates.length,
      })
    }
  }
  
  return signals
}

/**
 * Calculate cashflow signals
 */
export function calculateCashflow(
  transactions: Transaction[],
  currentMonth: Date
): CashflowSignal {
  // Helper to parse dates consistently
  const parseDate = (d: string | Date): Date => {
    if (d instanceof Date) return d
    if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = d.split('-').map(Number)
      return new Date(year, month - 1, day) // month is 0-indexed, parse as local date
    }
    return new Date(d)
  }

  // Normalize currentMonth to start of month for comparison
  const targetYear = currentMonth.getFullYear()
  const targetMonthNum = currentMonth.getMonth()
  
  const monthTxns = transactions.filter((t) => {
    const txnDate = parseDate(t.date)
    return (
      txnDate.getMonth() === targetMonthNum &&
      txnDate.getFullYear() === targetYear
    )
  })
  
  const income = monthTxns
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)
  
  const expenses = Math.abs(
    monthTxns
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0)
  )
  
  const net = income - expenses
  const savingsRate = income > 0 ? (net / income) * 100 : null
  
  // Compare with previous month for trend
  const previousMonth = new Date(currentMonth)
  previousMonth.setMonth(previousMonth.getMonth() - 1)
  const prevYear = previousMonth.getFullYear()
  const prevMonthNum = previousMonth.getMonth()
  
  const prevMonthTxns = transactions.filter((t) => {
    const txnDate = parseDate(t.date)
    return (
      txnDate.getMonth() === prevMonthNum &&
      txnDate.getFullYear() === prevYear
    )
  })
  
  const prevIncome = prevMonthTxns
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)
  
  const prevExpenses = Math.abs(
    prevMonthTxns
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0)
  )
  
  const prevNet = prevIncome - prevExpenses
  
  let trend: 'improving' | 'declining' | 'stable' = 'stable'
  if (prevNet !== 0) {
    const change = ((net - prevNet) / Math.abs(prevNet)) * 100
    if (change > 5) trend = 'improving'
    else if (change < -5) trend = 'declining'
  }
  
  return {
    type: 'CASHFLOW',
    monthlyIncome: Math.round(income * 100) / 100,
    monthlyExpenses: Math.round(expenses * 100) / 100,
    net: Math.round(net * 100) / 100,
    savingsRate: savingsRate !== null ? Math.round(savingsRate * 100) / 100 : null,
    trend,
  }
}
