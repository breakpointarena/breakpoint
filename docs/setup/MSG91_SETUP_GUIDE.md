# MSG91 OTP Setup Guide for Breakpoint Arena

## Quick Start — test mode, no MSG91 account needed

The whole OTP login flow runs locally with no MSG91 credentials and no credits
spent. The code is printed to the terminal running `npm run dev` instead of
being sent by SMS.

```bash
cp .env.local.starter .env.local   # already filled in for local work
npx supabase start                 # local database in Docker
npx supabase db reset              # applies every migration, incl. otp_sessions
npm run check:env                  # says what is missing, if anything
npm run dev
```

`npm run check:env` is the one to run first when something looks broken. It
reports missing configuration in plain language instead of letting it surface
as a stack trace from inside the OTP service.

> **Use `npx supabase db reset`, not `supabase db push`.**
> `db push` applies migrations to the **remote** project — that is production.
> `db reset` rebuilds your local database from the migration files, which is
> what you want while developing.

### Testing the flow

1. Go to `/booking`, pick a station and a slot, and continue to the details step.
2. Enter any valid Indian mobile number. Nothing is sent to it.
3. **Read the OTP from the terminal running `npm run dev`**, not from a phone:

```
============================================================
📱 MSG91 TEST MODE - OTP NOT SENT TO REAL PHONE
============================================================
Phone: +91 9876543210
OTP:   413573
============================================================
```

4. Type that code into the browser. You are signed in for 12 hours, and the
   same session carries across booking, food ordering, subscriptions and
   Retrieve Booking — there is a sign-out button in the header.

### Things that will look like bugs and are not

| What you see | Why |
|---|---|
| `Please wait 58 seconds before requesting a new OTP` | One OTP per number per 60 seconds. Run `npm run otp:reset` instead of waiting. |
| `Invalid OTP. 2 attempts remaining.` | Three attempts per code, then that code is dead. Request a new one. |
| Checkout refuses to take payment | Razorpay keys are blank in the starter. Deliberate — the app refuses payment rather than booking for free. Ask for the shared `rzp_test_...` keys if you need to test checkout. |
| OTP never appears in the terminal | `MSG91_TEST_MODE` is not `true`. Check with `npm run check:env`. |

### Test mode vs. a real SMS

`MSG91_TEST_MODE=true` skips MSG91 entirely. If you need to test real delivery,
set it to `false`, add `MSG91_AUTH_KEY`, and **set `MSG91_LIVE_SMS_NUMBERS` to
your own number** — only listed numbers then receive an SMS, and every other
number falls back to the terminal. Each real send costs a credit, so leaving
that list empty means every typo in the form is a paid message.

---

## 📲 Production Setup with MSG91

When you're ready for real SMS:

### Step 1: Get MSG91 Auth Key

#### Option A: Simple Setup (Recommended)

1. Login to https://control.msg91.com/
2. Look for **"SendOTP"** in left sidebar
   - If not visible, go to **Products** → Enable **SendOTP**
3. In SendOTP section, go to **Settings** or **Configuration**
4. Copy your **Auth Key**
5. Done! SendOTP doesn't need templates

#### Option B: Advanced Setup (Template-based)

1. Login to https://control.msg91.com/
2. Go to **Settings** → **API Keys**
3. Copy your **Authkey**
4. Go to **SMS** → **Templates**
5. Create OTP template:
   ```
   Template Name: Breakpoint Arena OTP
   Message: Your OTP for Breakpoint Arena is ##OTP##. Valid for 5 minutes. Do not share with anyone.
   Template Type: OTP/Transactional
   ```
6. Copy the **Template ID** after approval

### Step 2: Configure Environment

Update your `.env.local`:

#### For SendOTP API (Simpler):
```env
# Disable test mode
MSG91_TEST_MODE=false

# MSG91 SendOTP Configuration
MSG91_AUTH_KEY=your-auth-key-from-sendotp-section
MSG91_USE_SENDOTP_API=true
MSG91_SENDER_ID=BRKPNT

# Session Secret (generate using command above)
SESSION_SECRET=your-random-32-character-secret-key
```

#### For Flow API (Template-based):
```env
# Disable test mode
MSG91_TEST_MODE=false

# MSG91 Flow API Configuration
MSG91_AUTH_KEY=your-auth-key-here
MSG91_USE_SENDOTP_API=false
MSG91_TEMPLATE_ID_OTP=your-template-id-here
MSG91_SENDER_ID=BRKPNT

# Session Secret
SESSION_SECRET=your-random-32-character-secret-key
```

### Step 3: Test Production

1. Restart your server
2. Try booking/food order with real phone number
3. You should receive SMS with OTP!

---

## 🔧 Configuration Options

### OTP Settings (in `.env`)

```env
# OTP Expiry (default: 5 minutes)
OTP_EXPIRY_MINUTES=5

# Max OTP verification attempts (default: 3)
OTP_MAX_ATTEMPTS=3

# Max OTP requests per phone per hour (default: 3)
OTP_MAX_REQUESTS_PER_PHONE=3

# Session expiry after OTP verification (hard-coded: 15 minutes)
# Users don't need OTP again if they return within 15 minutes
```

---

## 🎯 How It Works

### Flow Diagram

```
User enters phone → Check active session?
                    ↓ YES (within 15 min)
                    ├──→ Skip OTP, proceed directly
                    ↓ NO
                    ├──→ Send OTP via MSG91
                    ├──→ User enters OTP
                    ├──→ Verify OTP
                    ├──→ Create 15-min session
                    └──→ Proceed to booking/order
```

### Rate Limiting

- **3 OTP requests per phone per hour**
- **60-second cooldown between resends**
- **3 verification attempts per OTP**
- **5-minute OTP expiry**

### Session Management

- **15-minute session** after successful OTP verification
- Session stored in `otp_sessions` table
- Secure session token (64 characters, hex)
- Auto-cleanup of expired sessions

---

## 🧪 Testing Checklist

### Test Mode Tests
- [ ] Phone number entry
- [ ] OTP displayed in console
- [ ] OTP verification works
- [ ] 15-minute session persists
- [ ] Second booking skips OTP (within 15 min)

### Production Tests
- [ ] Real SMS received
- [ ] OTP verification works
- [ ] Invalid OTP shows error
- [ ] Resend OTP works (60s cooldown)
- [ ] Max attempts protection works
- [ ] Rate limiting works (3 per hour)
- [ ] Session persistence works

---

## 📊 Database Schema

The `otp_sessions` table stores:
- Phone number
- Hashed OTP (secure)
- Session token
- Expiry times
- Rate limiting data

View with:
```sql
SELECT * FROM otp_sessions WHERE phone = '9876543210' ORDER BY created_at DESC;
```

---

## 🐛 Troubleshooting

### "MSG91 configuration missing"
- Check `MSG91_AUTH_KEY` in `.env.local`
- Restart server after adding env vars

### "OTP not received"
- Check phone number format (10 digits, no +91)
- Verify MSG91 account has SMS credits
- Check MSG91 dashboard for delivery status
- Enable test mode to verify flow works

### "Session expired" immediately
- Check `SESSION_SECRET` is set (32+ characters)
- Verify database migration ran successfully

### "Rate limit exceeded"
- Wait 1 hour or clear `otp_sessions` table
- In test: `DELETE FROM otp_sessions WHERE phone = 'YOUR_PHONE';`

### OTP in console not showing (test mode)
- Verify `MSG91_TEST_MODE=true` in `.env.local`
- Check server console (not browser console)
- Restart dev server

---

## 🔐 Security Features

✅ OTP hashed with SHA-256 + salt  
✅ Session tokens cryptographically random  
✅ Rate limiting (3 requests/hour)  
✅ Auto-expire old sessions  
✅ IP address logging  
✅ Max verification attempts  

---

## 📝 Integrated Flows

OTP is integrated into:

1. **Booking Flow** (`/booking/auth`)
   - Phone → OTP → Customer Details → Summary → Payment

2. **Food Order Flow** (`/food/checkout`)
   - Cart → Phone → OTP → Customer Details → Confirm

3. **Subscription Flow** (coming soon)
   - Plan Selection → Phone → OTP → Payment

---

## 💡 Tips

- **Test mode is perfect for development** - no SMS costs
- **Use SendOTP API** - simpler than Flow API
- **Monitor rate limits** in production
- **Session caching** reduces OTP requests
- **Check Supabase logs** for debugging

---

## 🆘 Support

If you encounter issues:

1. Check this guide
2. Enable test mode to isolate MSG91 issues
3. Check Supabase logs: `supabase logs`
4. Check MSG91 dashboard delivery logs
5. Review console for error messages

---

## ✅ Quick Checklist

**For Testing (No MSG91):**
- [ ] Add `MSG91_TEST_MODE=true` to `.env.local`
- [ ] Add `SESSION_SECRET` to `.env.local`
- [ ] Run database migration
- [ ] Start dev server
- [ ] Test booking/food flow
- [ ] Check console for OTP

**For Production:**
- [ ] Get MSG91 Auth Key
- [ ] Add credentials to `.env.local`
- [ ] Set `MSG91_TEST_MODE=false`
- [ ] Set `MSG91_USE_SENDOTP_API=true`
- [ ] Test with real phone
- [ ] Verify SMS received
- [ ] Test full flow

---

**Next Steps:**
1. Start with test mode
2. Test all flows (booking, food)
3. When ready, get MSG91 credentials
4. Switch to production mode
5. Test with real SMS

Good luck! 🚀
