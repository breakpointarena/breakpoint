# Staff Login Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Login Page                               │
│                   /admin/login/page.tsx                          │
│                                                                   │
│  ┌──────────────┐           ┌──────────────┐                    │
│  │   Admin      │           │    Staff     │                    │
│  │   Login      │           │    Login     │                    │
│  └──────┬───────┘           └──────┬───────┘                    │
│         │                          │                             │
│         └──────────┬───────────────┘                             │
│                    │                                             │
│                    ▼                                             │
│         Supabase Auth Validation                                │
│         (user_metadata.role)                                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Session Created       │
         │  Role: admin | staff   │
         └────────────┬───────────┘
                      │
                      ▼
         ┌────────────────────────────────────────────┐
         │          Admin Layout                       │
         │      app/(admin)/layout.tsx                 │
         │                                             │
         │  ┌─────────────────┬───────────────────┐   │
         │  │   Sidebar       │    TopBar         │   │
         │  │  (Menu Items)   │  (Role Badge)     │   │
         │  └────────┬────────┴────────┬──────────┘   │
         │           │                 │               │
         │           ▼                 ▼               │
         │    getUserRole()      getUserRole()         │
         │           │                 │               │
         │           ▼                 ▼               │
         │   Filter Menu Items   Display Badge        │
         └───────────────────────────────────────────┬─┘
                                                     │
                                                     ▼
                      ┌──────────────────────────────────────┐
                      │         Page Navigation              │
                      └──────────────┬───────────────────────┘
                                     │
                     ┌───────────────┴────────────────┐
                     │                                │
                     ▼                                ▼
         ┌────────────────────┐          ┌────────────────────┐
         │   Regular Pages    │          │   Reports Page     │
         │   (All Access)     │          │   (Admin Only)     │
         │                    │          │                    │
         │  • Dashboard       │          │  checkReportsAccess│
         │  • Bookings        │          │         │          │
         │  • Devices         │          │         ▼          │
         │  • Food            │          │  if (!hasAccess)   │
         │  • Customers       │          │  Show Access Denied│
         │  • Subscriptions   │          │  Redirect to       │
         │  • Promo Codes     │          │  Dashboard         │
         │  • Happy Hours     │          │                    │
         │  • Timeline        │          │                    │
         │                    │          │                    │
         │  Admin: ✅         │          │  Admin: ✅         │
         │  Staff: ✅         │          │  Staff: ❌         │
         └────────────────────┘          └────────────────────┘
```

## Data Flow

### 1. User Creation Flow
```
Script (seed-admin.ts / seed-staff.ts)
    ↓
Supabase Admin API
    ↓
Create User with Metadata
    {
      email: "user@example.com",
      password: "Password@123",
      user_metadata: {
        role: "admin" | "staff",
        full_name: "User Name"
      }
    }
    ↓
User Stored in Supabase Auth
```

### 2. Authentication Flow
```
User enters credentials
    ↓
supabase.auth.signInWithPassword()
    ↓
Supabase validates credentials
    ↓
Session created with user metadata
    ↓
JWT token includes role information
    ↓
User redirected to /admin/dashboard
```

### 3. Role Check Flow
```
Component mounts
    ↓
Call getUserRole() from lib/auth/roles.ts
    ↓
supabase.auth.getUser()
    ↓
Extract role from user_metadata or app_metadata
    ↓
Return: 'admin' | 'staff' | null
    ↓
Component updates UI based on role
```

### 4. Reports Access Flow
```
User navigates to /admin/reports
    ↓
Page component calls checkReportsAccess()
    ↓
getUserRole() → returns role
    ↓
canAccessReports(role) → returns boolean
    ↓
if (role === 'admin') → Show Reports
if (role === 'staff') → Show Access Denied + Redirect
```

## Component Hierarchy

```
app/(admin)/layout.tsx
│
├── Sidebar Component
│   ├── navItems (static)
│   ├── getUserRole() → userRole state
│   ├── filteredNavItems (filtered by role)
│   └── Map filteredNavItems → render menu
│
├── TopBar Component
│   ├── getUserRole() → userRole state
│   ├── Display user name
│   ├── Display user email
│   └── Display role badge (admin/staff)
│
└── Page Content
    │
    ├── Regular Pages (No restriction)
    │   └── Accessible by all authenticated users
    │
    └── Reports Page (Admin only)
        ├── checkReportsAccess() on mount
        ├── if (!hasAccess) → Show Access Denied
        └── if (hasAccess) → Show Reports
```

## File Structure

```
breakpoint-arena/
│
├── app/(admin)/
│   └── admin/
│       ├── login/
│       │   └── page.tsx          # Login form with role detection
│       ├── reports/
│       │   └── page.tsx          # Protected page with access check
│       └── layout.tsx            # Admin layout wrapper
│
├── components/admin/layout/
│   ├── SideBar.tsx               # Dynamic menu filtering
│   └── TopBar.tsx                # Role badge display
│
├── lib/auth/
│   └── roles.ts                  # Role utilities
│       ├── getUserRole()         # Get current user role
│       ├── canAccessReports()    # Check if role can access reports
│       └── checkReportsAccess()  # Check current user's reports access
│
├── scripts/
│   ├── seed-admin.ts             # Create admin user
│   └── seed-staff.ts             # Create staff user
│
└── Documentation/
    ├── STAFF_LOGIN_GUIDE.md
    ├── ADMIN_STAFF_CREDENTIALS.md
    ├── STAFF_LOGIN_IMPLEMENTATION_SUMMARY.md
    └── STAFF_LOGIN_ARCHITECTURE.md (this file)
```

## State Management

### Client-side State
```typescript
// In components
const [userRole, setUserRole] = useState<UserRole>(null)
const [hasAccess, setHasAccess] = useState<boolean | null>(null)

// On mount
useEffect(() => {
  getUserRole().then(setUserRole)
}, [])
```

### Supabase Auth State
```typescript
// User metadata structure
{
  id: "uuid",
  email: "user@example.com",
  user_metadata: {
    role: "admin" | "staff",
    full_name: "User Name"
  },
  app_metadata: {
    role: "admin" | "staff",
    provider: "email"
  }
}
```

## Security Layers

```
┌─────────────────────────────────────────────────┐
│   Layer 1: UI Visibility (Client-side)          │
│   - Hide Reports menu item for staff            │
│   - Role badge in TopBar                        │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│   Layer 2: Page Access Control (Client-side)    │
│   - checkReportsAccess() on page mount          │
│   - Show Access Denied if unauthorized          │
│   - Auto-redirect to dashboard                  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│   Layer 3: Session Validation (Supabase)        │
│   - JWT token with role information             │
│   - Session expiry (12 hours)                   │
│   - SessionMonitor component                    │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│   Future Layer 4: Server-side (TODO)            │
│   - API route validation                        │
│   - Row Level Security (RLS) policies           │
│   - Server action role checks                   │
└─────────────────────────────────────────────────┘
```

## Role Detection Logic

```typescript
// Priority order for role detection
1. user.user_metadata?.role
   ↓
2. user.app_metadata?.role
   ↓
3. Default to 'admin' (backward compatibility)
```

## Access Control Matrix

```
┌──────────────┬────────┬────────┐
│   Resource   │ Admin  │ Staff  │
├──────────────┼────────┼────────┤
│ Dashboard    │   ✅   │   ✅   │
│ Bookings     │   ✅   │   ✅   │
│ Timeline     │   ✅   │   ✅   │
│ Devices      │   ✅   │   ✅   │
│ Food         │   ✅   │   ✅   │
│ Customers    │   ✅   │   ✅   │
│ Subscription │   ✅   │   ✅   │
│ Promo Codes  │   ✅   │   ✅   │
│ Happy Hours  │   ✅   │   ✅   │
│ Reports      │   ✅   │   ❌   │
└──────────────┴────────┴────────┘
```

## API Reference

### getUserRole()
```typescript
async function getUserRole(): Promise<UserRole>
// Returns: 'admin' | 'staff' | null
```

### canAccessReports(role)
```typescript
function canAccessReports(role: UserRole): boolean
// Returns: true if role === 'admin', false otherwise
```

### checkReportsAccess()
```typescript
async function checkReportsAccess(): Promise<boolean>
// Convenience function combining getUserRole + canAccessReports
```

## Example Usage

### Protect a Page
```typescript
'use client'

import { useState, useEffect } from 'react'
import { checkReportsAccess } from '@/lib/auth/roles'

export default function ProtectedPage() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  useEffect(() => {
    checkReportsAccess().then(setHasAccess)
  }, [])

  if (hasAccess === null) return <Loading />
  if (!hasAccess) return <AccessDenied />

  return <PageContent />
}
```

### Filter UI Elements
```typescript
'use client'

import { useState, useEffect } from 'react'
import { getUserRole, type UserRole } from '@/lib/auth/roles'

export default function Navigation() {
  const [userRole, setUserRole] = useState<UserRole>(null)

  useEffect(() => {
    getUserRole().then(setUserRole)
  }, [])

  return (
    <nav>
      {menuItems.map(item => {
        // Hide reports for staff
        if (item.href === '/admin/reports' && userRole === 'staff') {
          return null
        }
        return <MenuItem key={item.href} {...item} />
      })}
    </nav>
  )
}
```

---

**Last Updated:** 2026-07-12  
**Version:** 1.0.0
