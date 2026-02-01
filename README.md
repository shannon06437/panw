# Smart Financial Coach

A Next.js application that provides personalized financial coaching by securely connecting to bank accounts, analyzing transaction data, and delivering actionable insights.

## Architecture

This application follows a **three-layer intelligence architecture** as defined in `DESIGN.md`:

1. **Layer 1: Deterministic Financial Analytics** - Ground truth calculations (trends, anomalies, recurring charges)
2. **Layer 2: AI-Assisted Reasoning** - LLM synthesis and prioritization (optional, for future implementation)
3. **Layer 3: Coaching & Natural Language Generation** - Human-friendly delivery

## Tech Stack

- **Next.js 14** (App Router) with TypeScript
- **Prisma** with SQLite (for demo; Postgres recommended for production)
- **Plaid Sandbox** for secure bank connectivity
- **React Plaid Link** for bank authentication

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Plaid Account

You need to create a Plaid account and get API credentials:

1. Go to [Plaid Dashboard](https://dashboard.plaid.com/signup)
2. Sign up for a free account (Sandbox access is free)
3. Navigate to **Team Settings** → **Keys**
4. Copy your **Client ID** and **Secret** (use the Sandbox keys)

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL="file:./dev.db"

# Plaid Configuration
PLAID_CLIENT_ID=your_plaid_client_id_here
PLAID_SECRET=your_plaid_secret_here
PLAID_ENV=sandbox
```

**Important:** Replace `your_plaid_client_id_here` and `your_plaid_secret_here` with your actual Plaid credentials.

### 4. Set Up Database

```bash
# Generate Prisma Client
npm run db:generate

# Create database and tables
npm run db:push
```

### 5. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Using Plaid Sandbox

When testing with Plaid Sandbox:

1. Use the test credentials provided by Plaid:
   - Username: `user_good`
   - Password: `pass_good`
   - Or use any of the [Plaid Sandbox test credentials](https://plaid.com/docs/sandbox/test-credentials/)

2. Select any test institution (e.g., "First Platypus Bank")

3. The app will sync transactions from the sandbox environment

## Security Notes

- Bank credentials never touch the application (handled by Plaid)
- Access tokens are stored server-side only
- Client never sees Plaid secrets
- Raw transaction data is never sent to LLMs (only aggregates)