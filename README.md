# Break Point Arena - Gaming Café Platform

Full-stack web platform for Break Point Arena gaming café with QR-based booking system.

## 🚀 Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start local Supabase (requires Docker)
npx supabase start

# 3. Reset database & seed initial data
npx supabase db reset

# 4. Copy environment variables
cp .env.example .env.local
# Fill in all required values in .env.local

# 5. Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Database Setup Notes

- **First time:** Run `npx supabase start` to pull Docker images and start local DB
- **After git pull:** Run `npx supabase db reset` if there are new migrations
- **Seed data:** Automatically populated with sample devices and menu items
- **Local DB:** PostgreSQL runs on `localhost:54322` via Docker

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
