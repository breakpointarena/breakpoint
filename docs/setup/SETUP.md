# Break Point Arena - Complete Setup Guide

## Architecture Decisions Summary

All 26 key decisions made during the grill-me session:

1. **UI Library:** shadcn/ui + Radix + Tailwind
2. **Routing:** Next.js App Router
3. **Backend:** Next.js API routes + Supabase (no Express)
4. **Supabase Usage:** Full BaaS (Auth, DB, real-time)
5. **TypeScript:** Relaxed mode (strict: false)
6. **Folder Structure:** Feature-based (co-locate UI + actions)
7. **Env Variables:** .env.local + .env.example pattern
8. **State Management:** Redux Toolkit
9. **Authentication:** Custom OTP (no Supabase Auth)
10. **Database Migrations:** Supabase CLI migrations
11. **Responsive Design:** Mobile-first Tailwind + PWA
12. **Forms:** React Hook Form + Zod + Server Actions
13. **QR Codes:** qrcode.react (generation) + html5-qrcode (scanning)
14. **Date Handling:** date-fns
15. **Code Quality:** ESLint + Prettier + Husky pre-commit
16. **Errors & Loading:** React Query + Error Boundaries + Toast (shadcn)
17. **API Integrations:** Service layer (lib/) wrapping official SDKs
18. **Testing:** None (manual QA only due to timeline)
19. **Deployment:** Git-based auto-deploy via Vercel
20. **Versions:** Latest stable (Next.js 15, React 19) with locked versions
21. **Images:** Hybrid (static in /public, dynamic in Supabase Storage)
22. **Slot Locking:** Database-based (PostgreSQL UNIQUE constraints + timestamps)
23. **Scaffolding:** Full feature folders + all configs ready
24. **Package Manager:** pnpm
25. **Node Version:** 20 LTS
26. **Server State:** TanStack Query for API calls

## What's Already Set Up

### ✅ Core Infrastructure
- Next.js 15.1.3 with App Router
- TypeScript 5.3.3 (relaxed)
- Tailwind CSS 4.0
- pnpm workspace
- Node 20 LTS (.nvmrc file)

### ✅ State Management
- Redux Toolkit store configured
- Three slices created: booking, session, admin
- Redux Provider in root layout
- Type-safe hooks (useAppDispatch, useAppSelector)

### ✅ Server State (React Query)
- QueryClientProvider configured
- Default query options (1min stale time, 3 retries)

### ✅ Supabase Integration
- Client-side client (`lib/supabase/client.ts`)
- Server-side admin client (`lib/supabase/server.ts`)
- Ready for migrations

### ✅ Third-party Integrations
- **Razorpay:** Order creation, signature verification, refunds
- **MSG91:** OTP sending, booking confirmation, subscription confirmation
- **Database Locking:** PostgreSQL-based slot locking (no external services needed)

### ✅ API Routes
- `/api/otp/send` - Send OTP with rate limiting
- `/api/otp/verify` - Verify OTP and create session
- `/api/payment/webhook` - Razorpay webhook handler

### ✅ UI Components (shadcn)
Installed: button, card, input, label, form, select, dialog, toast, textarea, calendar

### ✅ Layouts & Route Groups
- Customer layout: Header + footer
- Admin layout: Sidebar navigation
- Route groups configured: (customer) and (admin)

### ✅ Placeholder Pages
**Customer:**
- Home page (/) with feature cards
- /booking (TODO for junior dev)
- /subscription (TODO for junior dev)
- /retrieve (TODO for junior dev)

**Admin:**
- /admin/dashboard (stats cards)
- /admin/devices (TODO for junior dev)
- (Other admin pages need to be created)

### ✅ Utilities
- `cn()` - Tailwind class merging
- OTP generation
- Session token generation
- Date utilities (slot availability, grace periods, etc.)

### ✅ Code Quality
- ESLint configured
- Prettier configured
- Husky + lint-staged (pre-commit hooks)
- `.prettierrc` with project standards

### ✅ Environment Variables
- `.env.example` with all required keys
- Documented in README

## What Needs to Be Done Next

### 🔴 Critical (Blockers)

1. **Create Supabase Database Schema**
   ```bash
   supabase migration new create_initial_schema
   ```
   
   Tables needed:
   - `devices` - Gaming devices
   - `bookings` - Customer bookings
   - `subscriptions` - Subscription plans
   - `subscription_purchases` - User subscriptions
   - `promo_codes` - Promo codes
   - `otps` - OTP storage
   - `sessions` - Session tokens
   - `admin_users` - Admin authentication
   
   **Owner:** Team Lead (you)

2. **Fill in Environment Variables**
   - Get Supabase credentials (create project if not exists)
   - Get Razorpay test keys (client provides by May 13)
   - Get MSG91 credentials (client provides by May 13)
   - Set up Upstash Redis account
   
   **Owner:** Team Lead

3. **Deploy to Vercel**
   - Connect GitHub repo to Vercel
   - Add all env variables
   - Set up staging + production environments
   
   **Owner:** Team Lead

### 🟡 High Priority (Week 1)

4. **Customer Booking Flow UI** (BREAK-20 to BREAK-27)
   - Device selection page
   - Slot selection with calendar
   - Add-ons selection
   - Pricing summary
   - OTP entry component
   - Payment integration
   - Booking confirmation with QR
   
   **Owner:** Junior Developer

5. **Booking Flow Server Actions**
   - `createBooking()` server action
   - Slot availability check
   - Payment order creation
   - QR code generation logic
   
   **Owner:** Team Lead

6. **Admin Authentication**
   - Login page
   - Session middleware
   - Protected route checks
   
   **Owner:** Team Lead

### 🟢 Medium Priority (Week 2-3)

7. **Subscription System UI**
   - Plan listing page
   - Plan purchase flow
   - Subscription status page
   
   **Owner:** Junior Developer

8. **Subscription Server Logic**
   - Dynamic plan creation (admin)
   - Discount calculation
   - Subscription validation
   
   **Owner:** Team Lead

9. **Admin Panel Pages**
   - Device CRUD
   - Booking management
   - Subscription plan management
   - Promo code management
   - QR scanner
   
   **Owner:** Junior Developer (UI) + Team Lead (actions)

10. **Real-time Features**
    - Slot availability refresh (React Query)
    - Active session tracking
    - Dashboard live stats
    
    **Owner:** Team Lead

### 🔵 Lower Priority (Week 4)

11. **PWA Setup**
    - Create `manifest.json`
    - Configure service worker
    - Offline QR viewing
    
    **Owner:** Team Lead

12. **Error Handling**
    - Global error boundaries
    - Toast notifications throughout app
    - Loading skeletons
    
    **Owner:** Junior Developer

13. **Polish & Testing**
    - Mobile responsiveness review
    - Payment flow testing
    - OTP flow testing
    - Admin panel testing
    - Client UAT preparation
    
    **Owner:** Both

## Getting Started (Junior Developer)

### Day 1 Tasks

1. **Get familiar with the codebase**
   ```bash
   # Install dependencies
   pnpm install
   
   # Run dev server
   pnpm dev
   ```

2. **Read documentation**
   - `/Doc/2-User-Flows.md` - Your bible for UI requirements
   - This SETUP.md file
   - Redux slices in `/lib/redux/slices/` - understand state structure

3. **Start with home page improvements**
   - File: `/app/(customer)/page.tsx`
   - Add better hero section
   - Improve feature cards
   - Make it mobile-responsive
   - Use shadcn components (Button, Card)

### Week 1 Sprint (Junior Dev)

**Epic 3: Core Booking System** (BREAK-20 to BREAK-27)

Start with:
1. Device selection page (`/app/(customer)/booking/page.tsx`)
   - Fetch devices from mock data first (Team Lead will add DB later)
   - Display device cards with images, pricing
   - Use Redux: `setDevice()` action on selection
   - Navigate to slot selection

2. Slot selection page (`/app/(customer)/booking/slots/page.tsx`)
   - Date picker (use shadcn calendar)
   - Time slot grid
   - Use Redux: `setSlot()` action
   - Navigate to add-ons

3. Continue through flow (pricing → OTP → confirmation)

**Ask Team Lead for:**
- Mock data for devices
- Help with Redux actions
- Server actions for form submissions

## Getting Started (Team Lead)

### Day 1 Tasks

1. **Set up Supabase**
   ```bash
   pnpm install -g supabase
   supabase init
   supabase link --project-ref <project-ref>
   ```

2. **Apply database migrations**
   ```bash
   npx supabase db reset  # Apply all migrations
   ```
   - ✅ Schema ready in `/supabase/migrations/20260530092146_redesigned_schema.sql`
   - Includes all tables, indexes, RLS policies, and helper functions
   - See `SCHEMA_DESIGN.md` for complete documentation

3. **Set up external accounts**
   - Get Razorpay test keys (if available)
   - Get MSG91 credentials for OTP/SMS

4. **Deploy to Vercel**
   - Connect repo
   - Add env variables
   - Create staging + production

### Week 1 Sprint (Team Lead)

1. **Database setup complete**
   - All migrations run
   - Seed data for devices
   - Seed data for admin user

2. **Server Actions**
   - Create booking server action
   - Slot availability logic
   - Payment integration

3. **Support Junior Dev**
   - Code review PRs within 4 hours
   - Unblock on Redux/API questions
   - Pair program on complex parts

## Commands Reference

```bash
# Development
pnpm dev                 # Start dev server
pnpm build               # Build for production
pnpm start               # Start production server

# Code Quality
pnpm lint                # Run ESLint
pnpm lint:fix            # Auto-fix ESLint issues
pnpm format              # Format with Prettier
pnpm format:check        # Check formatting
pnpm type-check          # TypeScript check

# Supabase
supabase start           # Start local Supabase
supabase migration new   # Create new migration
supabase db push         # Push migrations to remote
supabase db pull         # Pull schema from remote

# shadcn
pnpx shadcn add <component>  # Add new component
```

## File Structure Guide

### Where Junior Dev Works
- `/app/(customer)/**/*` - All customer pages
- `/components/booking/**/*` - Booking components
- `/components/ui/**/*` - Use existing shadcn components
- Ask before modifying Redux slices

### Where Team Lead Works
- `/app/api/**/*` - All API routes
- `/lib/supabase/**/*` - Database queries
- `/lib/razorpay/**/*` - Payment logic
- `/lib/msg91/**/*` - SMS logic
- `/lib/redux/slices/**/*` - Redux state
- Server actions in feature folders (e.g., `/app/(customer)/booking/actions.ts`)

### Shared
- `/components/layout/**/*` - Layout components
- `/lib/utils/**/*` - Utility functions
- Both can add, coordinate via PR reviews

## Important Notes

1. **Don't commit .env.local** - It's gitignored
2. **Locked package versions** - Don't upgrade without discussion
3. **Mobile-first** - Always test on mobile viewport
4. **No tests** - Manual QA only for Phase 1
5. **30-day timeline** - Tight schedule, focus on core features
6. **Client approval needed** - May 13 for designs, June 5 for UAT

## Support Channels

- **Blocked on something?** → Tag Team Lead in PR or Slack
- **Design decision needed?** → Refer to `/Doc/2-User-Flows.md` first
- **API not working?** → Check Supabase dashboard, Vercel logs
- **Need new shadcn component?** → Run `pnpx shadcn add <name>`

## Success Criteria (June 7 Launch)

- [ ] Customer can book slot end-to-end
- [ ] Payment successful via Razorpay
- [ ] QR code generated and SMS sent
- [ ] Admin can scan QR and check-in
- [ ] Subscription purchase working
- [ ] Subscription discount auto-applied
- [ ] Admin panel functional
- [ ] No critical bugs
- [ ] Mobile responsive
- [ ] Client UAT sign-off

---

**Let's build! 🚀**
