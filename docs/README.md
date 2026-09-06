# Documentation

Reference material for Break Point Arena. Written during development, so
treat anything dated as a record of what was done rather than a promise of
what is true now — the code is the authority.

| Folder | What is in it |
|---|---|
| [setup/](setup) | Getting a machine running, deploying, MSG91, staff and admin access |
| [features/](features) | How individual features work: happy hours, bookings, promo codes, reports, notifications |
| [operations/](operations) | Performance work, the security review, production-readiness notes |
| [design/](design) | Theme, colour and gradient systems |
| [testing/](testing) | Manual test guides for concurrency, walk-ins and happy hours |
| [archive/](archive) | Point-in-time status notes kept for history. Safe to delete. |

## Start here

- **Running it locally** — [setup/SETUP.md](setup/SETUP.md), then [setup/QUICK_START.md](setup/QUICK_START.md)
- **Deploying** — [setup/DEPLOYMENT_GUIDE.md](setup/DEPLOYMENT_GUIDE.md) and [setup/PRE_PRODUCTION_CHECKLIST.md](setup/PRE_PRODUCTION_CHECKLIST.md)
- **SMS / OTP login** — [setup/MSG91_SETUP_GUIDE.md](setup/MSG91_SETUP_GUIDE.md)

## A note on credentials

Passwords have been replaced with `<ADMIN_PASSWORD>` / `<STAFF_PASSWORD>`
placeholders throughout. The seeding scripts now read them from the
environment and refuse to run without one, so no account is ever created
with a password that is written down in this repository.

Two migrations still create accounts with fixed passwords, because they have
already run against live databases and rewriting them would put the files out
of step with what was applied:

- `supabase/migrations/20260611000001_seed_admin_user.sql`
- `supabase/migrations/20260713110000_create_staff_user.sql`

Both are guarded by an existence check, so they will not overwrite a password
you have changed. On a **brand new** database they will create those accounts
with their original passwords — change them immediately after the first
`db push`, or delete the accounts and use the seeding scripts instead.
