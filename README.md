# Break Point Arena - Gaming Café Platform

Full-stack web platform for Break Point Arena gaming café with QR-based booking system.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Docker Desktop, then start local Supabase
npm run supabase:start

# 3. First-time only: apply all migrations and load sample seed data
npm run supabase:reset
# Later, after pulling migration changes, use this non-destructive command:
# npm run supabase:migrate

# 4. Create .env.local if it does not exist
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
# Copy API_URL, ANON_KEY, and SERVICE_ROLE_KEY from:
npx --yes supabase status
# Set MSG91_TEST_MODE=true and give SESSION_SECRET and OTP_HASH_SECRET random
# values of at least 32 characters.

# 5. Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Database Setup Notes

- Docker Desktop must be running before starting Supabase.
- Supabase services run locally: API at `http://127.0.0.1:54321`, Studio at `http://127.0.0.1:54323`, and PostgreSQL at `localhost:54322`.
- Copy `API_URL` to `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` to `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SERVICE_ROLE_KEY` to `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- Set `MSG91_TEST_MODE=true` in `.env.local` to print OTPs in the Next.js terminal instead of sending real SMS. Razorpay keys are only needed for payment flows.
- `npm run supabase:migrate` applies pending migrations without deleting local data.
- `npm run supabase:reset` **deletes local database contents**, reapplies every migration, and loads `supabase/seed.sql`. Use it only for a brand-new local database or when you intend to rebuild it.

## 📋 Tech Stack

- **Framework:** Next.js 15.1.3 (App Router)
- **Language:** TypeScript (relaxed mode)
- **Styling:** Tailwind CSS 4 + shadcn/ui  
- **State:** Redux Toolkit + TanStack Query
- **Database:** Supabase (PostgreSQL with database-based locking)
- **Payments:** Razorpay
- **SMS:** MSG91
- **Package Manager:** pnpm

## 📁 Project Structure

```
/app
  /(customer)       # Customer booking flows
  /(admin)          # Admin panel
  /api              # API routes (OTP, payments)
/components
  /ui               # shadcn components
  /booking          # Booking components
  /admin            # Admin components
/lib
  /redux            # Redux store & slices
  /supabase         # DB clients
  /razorpay         # Payment integration
  /msg91            # SMS integration
  /utils            # Utilities
```

## 🔑 Environment Setup

**Prerequisites:**
- Node.js 18+
- pnpm (or npm)
- Docker Desktop (for local Supabase)

**Steps:**
1. Create `.env.local` from `.env.example`
2. Run `npx supabase start` to get local Supabase credentials
3. Copy the output URLs and keys to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` (usually `http://127.0.0.1:54321`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Add Razorpay test keys (optional for local dev)
5. Add MSG91 credentials (optional for local dev)

See `.env.example` for full list of required variables.

## 👥 Team Workflow

**Team Lead:** Backend (API routes, integrations, server actions)  
**Junior Dev:** Frontend (UI, pages, forms, customer flows)

**Branches:**
- `main` → Production
- `staging` → UAT testing
- `feature/*` → Feature branches (auto-preview URLs)

**Development:**
```bash
pnpm lint          # Run ESLint
pnpm format        # Format with Prettier
pnpm type-check    # TypeScript check
```

## 🗄️ Database & Seed Data

**Migrations:** Located in `supabase/migrations/` (auto-applied on reset)

**Seed Data:** `supabase/seed.sql` includes:
- 5 Device Types (PS5, Standard Snooker, Medium Snooker, American Pool, Board Games)
- 5 Sample Devices (one per type)
- 9 Menu Items (Snacks, Drinks, Meals)
- 1 Admin User (username: `admin`, password: `admin123`)

**Common Commands:**
```bash
npx supabase start              # Start local database
npx supabase db reset           # Reset DB + run migrations + seed
npx supabase db diff            # Check for schema changes
npx supabase migration new <name>  # Create new migration
```

## 📚 Documentation

See project root for complete documentation:
- `PROJECT_CONTEXT.md` - Full project overview
- `SCHEMA_DESIGN.md` - Database schema
- `FOOD_ORDERING_SYSTEM.md` - Food ordering feature
- `ADMIN_BOOKINGS_IMPLEMENTATION.md` - Admin system
- `THEMING.md` - Theme customization
- `CODE_AUDIT.md` - Code quality audit

## 🚢 Deployment

Deployed on Vercel with automatic deployments:
- Push to `main` → Production
- Push to `staging` → Staging environment  
- Pull requests → Preview URLs

## 📝 TODO

- [ ] Create Supabase migrations
- [ ] Complete MSG91 templates
- [ ] Add PWA manifest
- [ ] Implement admin auth
- [ ] Add loading states

## 📞 Project Info

**Client:** Break Point Arena  
**Timeline:** May 6 - June 4, 2026  
**Go-Live:** June 7, 2026

---

Built by WnR Advisory
