# Smart Financial Coach - Technical Documentation

## Overview

Smart Financial Coach is a financial wellness application that helps users understand their spending, set financial goals, and receive AI-powered personalized coaching insights. The application uses a two-layer intelligence architecture combining deterministic financial analytics with AI-assisted reasoning.

## Technical Stack

### Frontend
- **Next.js 14+ (App Router)**: React framework with server-side rendering
- **TypeScript**: Type-safe development
- **CSS Variables**: Theming and styling

### Backend
- **Next.js API Routes**: Serverless API endpoints
- **Prisma ORM**: Database abstraction
- **SQLite**: File-based database

### External Services
- **Plaid API**: Bank connectivity and transaction data
- **OpenAI API**: LLM-powered financial coaching (JSON mode)

## Architecture

### Two-Layer Intelligence Model

#### Layer 1: Deterministic Financial Analytics
**Purpose**: Core correctness, explainability, and testability

**Implementation**: `lib/analytics/deterministic.ts`

**Key Functions**:
- `calculateCashflow`: Monthly income, expenses, net, savings rate
- `detectCategoryTrends`: Month-over-month spending changes
- `detectRecurringCharges`: Identify subscriptions and recurring payments
- `detectAnomalies`: Unusual transaction patterns
- `normalizeCategory`: Standardize transaction categories from Plaid

**Usage**: All financial calculations, feasibility predictions, and data analysis

#### Layer 2: AI-Assisted Reasoning
**Purpose**: Personalized insights and recommendations

**Implementation**: `lib/llm.ts` + `app/api/goals/[id]/insights/route.ts`

**Features**:
- Goal feasibility prediction (deterministic calculation)
- AI-generated coaching insights based on user preferences
- Structured response format (summary, reasons, action plan, projected completion date)
- Context-aware recommendations

**Data Sent to LLM**:
- Goal details and feasibility metrics
- Monthly financial history (aggregated)
- Category breakdowns
- Recurring charges
- Anomalies detected
- Coaching preferences

**Privacy**: Only aggregated data sent, no raw transactions

## Key Design Decisions

### Database Schema

**User**: Authentication, coaching preferences (JSON), persona
**PlaidItem**: Plaid access tokens, institution info
**Transaction**: Normalized amounts (positive=income, negative=expenses), categories
**Account**: Bank account details from Plaid
**Goal**: Target amount, deadline
**GoalInsight**: Cached AI insights (summary, reasons, action plan, projected date)
**RecurringCharge**: Detected subscriptions with confidence scores

### Transaction Processing

**Amount Normalization**:
- Plaid: Positive = money out, Negative = money in
- Internal: Inverted (negative = expenses, positive = income)
- Formula: `amount = -txn.amount`

**Date Parsing**:
- Plaid returns "YYYY-MM-DD" strings
- Parsed as local dates: `new Date(year, month - 1, day)`
- Avoids timezone display issues

**Category Normalization**:
- Uses `personal_finance_category.primary` from Plaid
- Converts SNAKE_CASE to Title Case (e.g., `TRANSPORTATION` → `Transportation`)

### Recurring Charges Detection

- Pattern matching on transaction name, amount, frequency
- Confidence scoring based on transaction count
- Only high-confidence (≥70%) charges used in insights
- User can mark as active/cancelled/unsure

### LLM Integration

**Prompt Engineering**:
- Structured context with goal, history, spending patterns
- Coaching style preferences included
- Explicit guidelines (e.g., don't suggest canceling loan payments)
- JSON response format for structured output

**Caching**:
- Insights saved to database to avoid regeneration costs
- Regeneration only on user request

### Authentication

- Email/password with bcrypt hashing
- Session management via localStorage
- Simple approach for MVP

## Key Features

1. **User Authentication**: Sign up, login, profile management
2. **Bank Connectivity**: Plaid Link integration, multi-account support
3. **Transaction Sync**: Automatic sync of 365 days of history
4. **Financial Dashboard**: Real-time summaries, category breakdowns, month comparisons
5. **Transaction View**: Filterable by account and month
6. **Recurring Charges**: Automatic detection with confidence scoring
7. **Goals & Forecasting**: Create goals, deterministic feasibility analysis, AI insights
8. **AI Coaching**: Personalized insights based on coaching preferences

## API Endpoints

**Authentication**:
- `POST /api/auth/signup`, `POST /api/auth/login`

**Plaid**:
- `POST /api/plaid/link-token`, `POST /api/plaid/exchange-token`

**Data Sync**:
- `POST /api/sync/transactions`, `POST /api/sync/income`

**Dashboard & Transactions**:
- `GET /api/dashboard`, `GET /api/transactions`

**Goals**:
- `GET /api/goals`, `POST /api/goals`
- `PUT /api/goals/[id]`, `DELETE /api/goals/[id]`
- `GET /api/goals/[id]/forecast`, `GET /api/goals/[id]/insights`

**Recurring Charges**:
- `GET /api/recurring`, `POST /api/recurring/[id]`

**Profile**:
- `GET /api/profile`, `POST /api/profile`

**Accounts**:
- `GET /api/accounts`

## Environment Variables

```env
DATABASE_URL="file:./dev.db"
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini  # Optional
```

## Future Enhancements

- Investment tracking
- Retirement planning

## Security & Performance

**Current**:
- Password hashing with bcrypt
- Server-side token storage
- Database indexing on key fields
- Client-side caching of insights

**Future**:
- GCP Secret Manager
- Rate limiting
- Redis caching
- Background job processing
