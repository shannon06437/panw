import OpenAI from 'openai'

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Generate goal insights using OpenAI
 */
export async function generateGoalInsights(packet: any): Promise<{
  summary: string
  topReasons: string[]
  actionPlan: Array<{
    action: string
    metric: string
    expected_impact_monthly: number
    possibilities_to_explore?: string
  }>
  projected_completion_date?: string // ISO date string, only if goal is achievable
}> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  // Build the prompt based on coaching guidelines and goal data
  const coachStyle = packet.coach_profile?.style || []
  const coachingNotes = packet.coach_profile?.additional_notes || ''
  
  let coachingContext = ''
  if (coachStyle.length > 0) {
    coachingContext = `Coaching Style: ${coachStyle.join(', ')}. `
  }
  if (coachingNotes) {
    coachingContext += `Additional preferences: ${coachingNotes}. `
  }

    const prompt = `You are a financial coach helping a user achieve their financial goal. Your job is to help the user improve their finances using ONLY the structured signals and summaries provided.
  You must be accurate, practical, and non-judgmental. You are not a tax advisor, legal advisor, or investment advisor.

${coachingContext ? `Coaching Approach: ${coachingContext}\n` : ''}Goal Information:
- Target: $${packet.goal.target_amount} by ${new Date(packet.goal.deadline).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
- Months remaining: ${packet.goal.months_remaining}
- Required per month: $${packet.feasibility.required_per_month}
- Current estimated surplus per month: $${packet.feasibility.estimated_surplus_per_month}
- Gap per month: $${packet.feasibility.gap_per_month}
- Status: ${packet.feasibility.status}

Recent Financial History (last 3 months):
${packet.history_summary.map((m: any) => {
  const categoryList = m.categories && m.categories.length > 0
    ? `\n  Categories: ${m.categories.map((c: any) => `${c.category} ($${c.amount})`).join(', ')}`
    : ''
  return `- ${m.month}: Income $${m.income}, Spend $${m.spend}, Net $${m.net}${categoryList}`
}).join('\n')}

Top Spending Categories (average):
${packet.spend_drivers.map((d: any) => `- ${d.category}: $${d.avg_monthly}/month (trend: ${d.trend})`).join('\n')}

Recurring Charges Identified:
${packet.recurring_charges && packet.recurring_charges.length > 0 
  ? packet.recurring_charges.map((rc: any) => `- ${rc.name}: $${rc.amount}/${rc.frequency}`).join('\n')
  : 'None identified'}

IMPORTANT: Recurring charges may include:
- LOAN PAYMENTS (Auto Loan, Mortgage, Student Loan, etc.) - These are NOT subscriptions and CANNOT be cancelled
- SUBSCRIPTIONS (Streaming services, software, memberships, etc.) - These CAN be cancelled

Only suggest canceling subscriptions if there are actual subscription services listed above. Do NOT suggest canceling loan payments.

Anomalies Detected:
${packet.anomalies.length > 0
  ? packet.anomalies.map((a: any) => {
      if (a.type === 'category_spike') {
        return `- ${a.category} spending increased ${Math.abs(a.delta_pct).toFixed(0)}% (impact: $${a.impact_monthly}/month)`
      }
      return `- ${a.reason || 'Unusual transaction pattern'}`
    }).join('\n')
  : 'None'}

IMPORTANT GUIDELINES FOR RECOMMENDATIONS:

CRITICAL: DO NOT make recommendations about credit card debt or balances. You do NOT have access to:
- Credit card account balances
- Outstanding debt amounts
- Minimum payment requirements
- Whether the user has credit card debt at all

You only see transaction data (payments made, spending categories). 

NON-NEGOTIABLE expenses (fixed, contractual - cannot simply reduce):
- Mortgage payments, rent
- Student loans (federal loans have limited options, but may qualify for income-driven repayment)
- Auto loans (cannot reduce payment, but may refinance)
- Insurance premiums (health, auto, home)
- Utilities (can optimize usage but not eliminate)

For NON-NEGOTIABLE expenses, suggest EXPLORING OPTIONS rather than reducing:
- Student loans: "Explore income-driven repayment plans, loan consolidation, or refinancing if you qualify"
- Auto loans: "Consider refinancing if interest rates have dropped or your credit improved"
- Mortgage: "Explore refinancing options if rates are favorable"

NEGOTIABLE or REDUCIBLE expenses:
- Dining out, entertainment, shopping (discretionary)
- Subscriptions and recurring services (review and cancel unnecessary ones)
- Transportation (reduce usage, use public transit)
- General merchandise, discretionary spending

When recommending actions:
- DO suggest reducing discretionary spending (dining, entertainment, shopping)
- DO suggest reviewing/canceling subscriptions ONLY if there are actual SUBSCRIPTION services (not loan payments) in the recurring charges list
- DO NOT suggest canceling subscriptions if:
  * No recurring charges are identified
  * All recurring charges are loan payments (Auto Loan, Mortgage, Student Loan, etc.)
  * The recurring charges are all non-cancellable obligations
- DO NOT treat loan payments as subscriptions - loan payments are fixed obligations that cannot be cancelled
- DO NOT make any recommendations about credit card debt, balances, or payment strategies (you don't have this information)
- DO suggest exploring refinancing/repayment options for loans when applicable
- DO provide specific, actionable guidance (e.g., "Explore student loan income-driven repayment if you qualify" rather than just "reduce student loan payment")

Based on this information, provide personalized financial coaching insights. Be specific, actionable, and match the coaching style preferences. Focus on realistic, negotiable expenses rather than fixed obligations.

Respond in JSON format with this exact structure:
{
  "summary": "A concise 1-2 sentence summary of their goal progress",
  "topReasons": ["Reason 1", "Reason 2", "Reason 3"],
  "actionPlan": [
    {
      "action": "Specific actionable step",
      "metric": "Measurable target",
      "expected_impact_monthly": 50.00,
      "possibilities_to_explore": "Optional: Specific options to explore (e.g., 'Explore income-driven repayment plans for student loans if you qualify', 'Consider refinancing your auto loan if rates have dropped')"
    }
  ],
  "projected_completion_date": "Optional: ISO date string (YYYY-MM-DD) - Only include if the goal is realistically achievable based on the action plan. Calculate based on: current gap per month, total expected monthly impact from all actions, and months remaining. If goal is not achievable or too uncertain, omit this field."
}

For each action in actionPlan:
- If the action involves a non-negotiable expense (loans, mortgage), include "possibilities_to_explore" with specific options to investigate
- If the action is about discretionary spending, "possibilities_to_explore" can be omitted or suggest alternatives
- Be specific: Instead of "reduce student loan payment", suggest "Explore income-driven repayment plans or loan consolidation if you qualify"
- DO NOT include any actions related to credit card debt, balances, or payment strategies`

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful financial coach. Always respond with valid JSON only, no additional text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const parsed = JSON.parse(content)
    
    // Validate and return structured response
    return {
      summary: parsed.summary || 'Unable to generate summary',
      topReasons: Array.isArray(parsed.topReasons) ? parsed.topReasons : [],
      actionPlan: Array.isArray(parsed.actionPlan)
        ? parsed.actionPlan.map((ap: any) => ({
            action: ap.action || '',
            metric: ap.metric || '',
            expected_impact_monthly: typeof ap.expected_impact_monthly === 'number' ? ap.expected_impact_monthly : 0,
            possibilities_to_explore: ap.possibilities_to_explore || undefined,
          }))
        : [],
      projected_completion_date: parsed.projected_completion_date || undefined,
    }
  } catch (error: any) {
    console.error('Error calling OpenAI:', error)
    throw new Error(`Failed to generate insights: ${error.message}`)
  }
}
