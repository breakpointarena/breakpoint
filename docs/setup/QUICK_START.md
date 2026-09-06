# Quick Start Guide

## For Junior Developer 👨‍💻

### First Time Setup (5 minutes)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment template (Team Lead will fill this)
cp .env.example .env.local

# 3. Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Your First Task: Improve Home Page

**File:** `app/(customer)/page.tsx`

1. Make the hero section more attractive
2. Add real images (use placeholder from unsplash.com for now)
3. Test on mobile (Chrome DevTools → Toggle device toolbar)
4. Use shadcn components that already exist: Button, Card

**Example:**
```tsx
import { Button } from '@/components/ui/button'

<Button>Click Me</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
```

### Where You Work

✅ **You own these folders:**
- `/app/(customer)/**/*` - All customer pages
- `/components/booking/**/*` - Booking components
- `/components/ui/**/*` - Use existing UI components

❌ **Don't touch (Team Lead owns):**
- `/app/api/**/*` - API routes
- `/lib/supabase/**/*` - Database
- `/lib/redux/slices/**/*` - Redux state (unless discussed)

### Getting Unstuck

1. **Need mock data?** → Ask Team Lead
2. **Redux not working?** → Check `/lib/redux/slices/bookingSlice.ts` for available actions
3. **Component not found?** → Add shadcn component: `pnpx shadcn add <name>`
4. **Blocked > 30 min?** → Create PR draft and tag Team Lead

### Read These Files
1. `/Doc/2-User-Flows.md` - Your UI requirements bible
2. `SETUP.md` - Full setup guide
3. `PROJECT_STATUS.md` - What's done vs TODO

---

## For Team Lead 🔧

### Critical Path (Day 1)

```bash
# 1. Database setup
pnpm install -g supabase
supabase init
supabase link --project-ref YOUR_PROJECT_REF

# 2. Create schema migration
supabase migration new create_initial_schema
# Edit supabase/migrations/xxx_create_initial_schema.sql
# Add all tables: devices, bookings, subscriptions, etc.

supabase db push

# 3. Fill environment variables
# Edit .env.local with real credentials:
# - Supabase URL + keys
# - Razorpay test keys
# - MSG91 credentials
# - Upstash Redis

# 4. Deploy to Vercel
# Go to vercel.com → Import Git repository
# Add all environment variables from .env.local
# Deploy staging + production

# 5. Test API routes
curl -X POST http://localhost:3000/api/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

### Your Responsibilities

**Week 1:**
- ✅ Database schema complete
- ✅ All environment variables configured
- ✅ Staging deployed
- ✅ Booking server actions implemented
- ✅ Review junior's PRs within 4 hours

**Code Review Checklist:**
- [ ] Mobile responsive?
- [ ] Uses Redux correctly?
- [ ] Follows design from `/Doc/2-User-Flows.md`?
- [ ] No console.errors?
- [ ] Formatted (Prettier auto-runs on commit)

### Where You Work

✅ **You own:**
- `/app/api/**/*` - All API routes
- `/lib/**/*` - All service layers
- Server actions (e.g., `/app/(customer)/booking/actions.ts`)
- Database migrations

✅ **You review:**
- Junior's UI PRs
- Component structure
- State management patterns

### Common Tasks

**Add new API route:**
```typescript
// app/api/bookings/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const data = await request.json()
  // Your logic here
  return NextResponse.json({ success: true })
}
```

**Add server action:**
```typescript
// app/(customer)/booking/actions.ts
'use server'

import { supabaseAdmin } from '@/lib/supabase/server'

export async function createBooking(data: BookingData) {
  // Your logic here
  return { success: true, bookingId: 'BP12345' }
}
```

**Query Supabase:**
```typescript
const { data, error } = await supabaseAdmin
  .from('devices')
  .select('*')
  .eq('status', 'available')
```

---

## Commands Everyone Uses

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Build for production

# Code quality (auto-runs on commit)
pnpm lint             # Check for errors
pnpm format           # Format code
pnpm type-check       # TypeScript check

# Add UI component
pnpx shadcn add button
pnpx shadcn add input
pnpx shadcn add calendar
```

## File You'll Edit Most

### Junior Dev
- `app/(customer)/booking/page.tsx` - Booking flow
- `app/(customer)/subscription/page.tsx` - Subscription plans
- `components/booking/*.tsx` - Booking components

### Team Lead
- `lib/supabase/queries.ts` - Database queries (create this)
- `app/(customer)/booking/actions.ts` - Booking server actions (create this)
- `app/api/*/route.ts` - API endpoints

## Help & Resources

**Stuck?**
1. Check `SETUP.md` for detailed setup
2. Check `PROJECT_STATUS.md` for what's done
3. Check `/Doc/2-User-Flows.md` for requirements
4. Ask in Slack/PR comments

**External Docs:**
- Next.js 15: https://nextjs.org/docs
- Supabase: https://supabase.com/docs
- shadcn/ui: https://ui.shadcn.com
- Redux Toolkit: https://redux-toolkit.js.org
- React Query: https://tanstack.com/query

## Daily Workflow

### Morning (Both)
```bash
git pull origin main
pnpm install  # If package.json changed
pnpm dev
```

### During Day

**Junior Dev:**
1. Work on assigned Jira ticket
2. Test on mobile frequently
3. Commit often (pre-commit hooks auto-format)
4. Create PR when feature is done
5. Tag Team Lead for review

**Team Lead:**
1. Review PRs within 4 hours
2. Implement backend for junior's UI
3. Monitor Vercel deployments
4. Unblock junior if stuck

### Before Leaving
```bash
git add .
git commit -m "feat: descriptive message"
git push
```

## Success Metrics

**Week 1 (May 13):**
- [ ] Home page looks good
- [ ] Device selection UI complete
- [ ] Database schema deployed
- [ ] Staging environment live

**Week 2 (May 20):**
- [ ] Full booking flow (UI + backend)
- [ ] Payment integration working
- [ ] QR code generation

**Week 4 (June 4):**
- [ ] All features complete
- [ ] UAT with client passed
- [ ] Ready for June 7 launch

---

**Let's ship this! 🚀**

Questions? Check `SETUP.md` for details.
