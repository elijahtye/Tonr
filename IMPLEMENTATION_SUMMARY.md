# Tonr - Complete Implementation Summary

## System Overview
Tonr is a speech refinement platform that analyzes voice transcripts and provides AI-powered feedback to improve communication skills. The system includes tier-based access (Free/Pro), Stripe payment integration, and comprehensive user management.

---

## Database Architecture (Supabase)

### Tables

#### `public.users`
- **Purpose**: Store user profile and subscription information
- **Columns**:
  - `id` (UUID): References auth.users(id), CASCADE delete
  - `email` (TEXT): Unique, not null
  - `name` (TEXT): User display name
  - `tier` (TEXT): NULL | 'free' | 'pro' - NULL means tier not selected yet
  - `stripe_customer_id` (TEXT): Unique Stripe customer reference
  - `stripe_subscription_id` (TEXT): Current subscription ID
  - `subscription_status` (TEXT): 'active' | 'canceled' | 'past_due' | NULL
  - `created_at` (TIMESTAMPTZ): Auto-set on creation
  - `updated_at` (TIMESTAMPTZ): Auto-updated via trigger

#### `public.sessions`
- **Purpose**: Track speech analysis usage for free tier limits
- **Columns**:
  - `id` (UUID): Primary key, auto-generated
  - `user_id` (UUID): References users(id), CASCADE delete
  - `tonality` (TEXT): 'neutral' | 'assertive' | 'composed'
  - `transcript_length` (INTEGER): Optional, for analytics
  - `rating` (INTEGER): 1-100, analysis score
  - `created_at` (TIMESTAMPTZ): Session timestamp

### Security (Row Level Security)

**RLS Policies:**
1. Users can SELECT their own data only
2. Users can UPDATE their own profile
3. Users can INSERT their own sessions
4. Service role has full access (backend operations)

**Triggers:**
1. `on_auth_user_created`: Auto-creates user record when Supabase auth user is created
2. `on_user_updated`: Auto-updates `updated_at` timestamp

**Indexes:**
- `idx_users_email`: Fast email lookups
- `idx_users_stripe_customer`: Stripe customer queries
- `idx_users_tier`: Tier-based queries
- `idx_sessions_user_date`: Daily usage checks (free tier limits)
- `idx_sessions_created_at`: General session queries
- `idx_sessions_user_id_tonality`: Analytics queries

---

## Authentication Flow

### 1. Signup (`POST /api/auth/signup`)
**Rate Limit**: 5 requests / 15 minutes
```
1. Validate: name, email, password (min 6 chars)
2. Create Supabase auth user
3. Trigger creates user record with tier=NULL
4. Generate JWT (7-day expiration)
5. Return token + user object
```

### 2. Login (`POST /api/auth/login`)
**Rate Limit**: 5 requests / 15 minutes
```
1. Validate: email, password
2. Authenticate with Supabase
3. Fetch user tier from users table
4. Generate JWT
5. Return token + user object (including tier)
```

### 3. Tier Selection (Second Screen)
**Flow:**
```
1. User logs in → tier is NULL
2. Dashboard redirects to pricing page
3. User selects Free or Pro
4. POST /api/user/tier with tier='free' OR
5. POST /api/stripe/create-checkout for Pro
6. Tier updated in database
7. User can now access dashboard
```

**Restrictions:**
- Users can only set tier to 'free' themselves
- 'pro' tier is only set via Stripe webhook after successful payment
- Tier cannot be changed back to NULL once set

---

## Tier System

### Free Tier
- **Limit**: 3 speech refinements per day
- **Tonality**: Neutral only
- **Enforcement**: Backend checks sessions table for daily count
- **Reset**: Automatically at midnight (date-based query)

### Pro Tier ($9/month)
- **Limit**: Unlimited refinements
- **Tonality**: All options (neutral, assertive, composed)
- **Payment**: Stripe subscription
- **Status Tracking**: subscription_status field

### Tier Enforcement (`POST /api/analyze-speech`)
**Rate Limit**: 50 requests / hour
```
1. Check user's tier from database
2. If tier=NULL → Error: "Please select a tier"
3. If tier='free':
   - Check today's session count
   - If >= 3 → Error: "Daily limit reached"
   - If tonality != 'neutral' → Error: "Free tier neutral only"
4. If tier='pro':
   - No restrictions
5. Record session in database
6. Process analysis via OpenAI
```

---

## User Profile Management

### Get Profile (`GET /api/user/profile`)
**Rate Limit**: 100 requests / 15 minutes
```
Returns: { id, email, name, tier, createdAt }
```

### Update Profile (`PUT /api/user/profile`)
**Rate Limit**: 100 requests / 15 minutes
```
Body: { name }
Validation: 1-100 characters
Updates: users table + auth metadata
```

### Change Password (`POST /api/user/change-password`)
**Rate Limit**: 100 requests / 15 minutes
```
Body: { currentPassword, newPassword }
Validation:
  - Current password verified via Supabase sign-in
  - New password 6-72 characters
  - Must be different from current
Updates: Supabase auth password via admin API
```

### Forgot Password (`POST /api/user/forgot-password`)
```
Body: { email }
Action: Sends password reset email via Supabase
Security: Always returns success (prevents email enumeration)
Redirect: frontend_url/reset-password.html
```

---

## Stripe Integration

### Create Checkout Session (`POST /api/stripe/create-checkout`)
**Rate Limit**: 100 requests / 15 minutes
```
1. Authenticates user
2. Creates Stripe checkout session
3. Product: "Tonr Pro" - $9/month
4. Metadata: { user_id }
5. Success URL: /dashboard.html?session={CHECKOUT_SESSION_ID}
6. Cancel URL: /pricing.html
7. Returns: { url } for redirect
```

### Webhook Handler (`POST /api/stripe/webhook`)
**Events:**
1. `checkout.session.completed`:
   - Extract user_id from metadata
   - Update users table: tier='pro', stripe_customer_id, stripe_subscription_id
2. `customer.subscription.deleted`:
   - Downgrade to free tier
   - Keep subscription_id for reference

**Security**: 
- Signature verification required
- Only processes whitelisted events
- Idempotent operations

---

## OpenAI Integration

### Speech Analysis (`POST /api/analyze-speech`)
**Rate Limit**: 50 requests / hour
**Input:**
```json
{
  "transcript": "speech text with pauses...",
  "tonality": "neutral" | "assertive" | "composed"
}
```

**Processing:**
1. Validate tier and usage limits
2. Check transcript not empty
3. Build prompt with tonality context
4. Call OpenAI with:
   - Model: gpt-4 (configurable)
   - Temperature: 0.7
   - Response format: JSON
5. Parse response
6. Record session

**Output:**
```json
{
  "rating": 75,
  "feedback": [
    "Reduce filler words...",
    "Improve pacing...",
    "..."
  ]
}
```

---

## Security Measures

### 1. Authentication & Authorization
- JWT tokens (7-day expiration)
- Supabase bcrypt password hashing
- Row Level Security on all tables
- Service role key for backend admin operations

### 2. Rate Limiting
- Auth endpoints: 5 req/15min
- General API: 100 req/15min
- Analysis: 50 req/hour
- Prevents brute force and abuse

### 3. Input Validation
- Email format validation
- Password: 6-72 characters
- Tier: only 'free' or 'pro'
- Tonality: only 3 valid options
- Name: max 100 characters
- Body size: 10MB limit

### 4. SQL Injection Prevention
- Parameterized queries (Supabase client)
- No raw SQL
- Database-level type checking

### 5. HTTP Security
- Helmet middleware (security headers)
- CORS with specific origin
- XSS protection
- CSRF protection (JWT in headers)

### 6. API Key Protection
- OpenAI key: backend only
- Supabase service role: backend only
- Stripe keys: backend only
- JWT secret: strong random string

### 7. Password Security
- Minimum 6 characters
- Maximum 72 characters (bcrypt limit)
- Requires current password to change
- Secure reset via email
- Bcrypt hashing with salt

---

## Frontend Flow

### 1. Landing Page (`index.html`)
- Hero section with live examples
- Feature cards (Dating, Social, Presence)
- Tone selector demo
- Call-to-action → Login

### 2. Login/Signup (`login.html`)
- Tabbed interface
- Client-side validation
- Token storage in localStorage
- Redirects to dashboard on success

### 3. Pricing Page (`pricing.html`)
- Free vs Pro comparison
- "Try Free" button → Sets tier='free'
- "Subscribe to Pro" → Stripe checkout
- Session ID validation on return

### 4. Dashboard (`dashboard.html`)
**Authentication Check:**
```
1. Bypass if localhost (dev mode)
2. Check for token in localStorage
3. Redirect to login if not authenticated
4. Check tier from backend
5. Redirect to pricing if tier=NULL
6. Load dashboard
```

**Features:**
- Start/Stop recording
- Speech recognition (Web Speech API)
- Real-time transcript with pauses
- Tonality selector
- Auto-analysis on stop
- Rating display
- Feedback list
- Usage counter (free tier)

---

## Environment Variables (`.env`)

```bash
# OpenAI
openai_key=sk-...              # REQUIRED - API key
openai_model=gpt-4             # Optional - model selection

# Supabase
supabase_url=https://...       # REQUIRED - project URL
supabase_key=...               # REQUIRED - anon/public key
supabase_service_role_key=...  # REQUIRED - admin key (backend)

# Stripe
stripe_secret_key=sk_...       # Optional - for payments
stripe_publishable_key=pk_...  # Optional - for frontend
stripe_webhook_secret=whsec_...# Optional - webhook verification

# JWT
jwt_secret=...                 # REQUIRED - random secure string

# Server
port=3000                      # Optional - backend port
backend_url=http://localhost:3000
frontend_url=http://localhost:5001
```

---

## Deployment Steps

### 1. Supabase Setup
1. Create project at supabase.com
2. Go to SQL Editor
3. Copy-paste `supabase-setup.sql`
4. Run script
5. Verify tables and policies created
6. Copy credentials to `.env`

### 2. Stripe Setup (Optional)
1. Create account at stripe.com
2. Create product: "Tonr Pro" - $9/month
3. Get API keys
4. Set up webhook endpoint
5. Add keys to `.env`

### 3. OpenAI Setup
1. Get API key from platform.openai.com
2. Add to `.env`
3. Monitor usage and costs

### 4. Backend
```bash
npm install
npm start  # or npm run dev for auto-reload
```

### 5. Frontend
```bash
node server.js  # Serves on localhost:5001
```

---

## Testing Checklist

### Authentication
- [ ] Signup with valid credentials
- [ ] Signup validation (short password, missing fields)
- [ ] Login with correct credentials
- [ ] Login with wrong credentials
- [ ] Rate limiting on auth endpoints

### Tier Selection
- [ ] New user has tier=NULL
- [ ] Dashboard redirects to pricing
- [ ] Can select Free tier
- [ ] Can select Pro tier (Stripe)
- [ ] Cannot access dashboard without tier

### Free Tier Restrictions
- [ ] Can do 3 refinements per day
- [ ] 4th refinement fails with error
- [ ] Can only use neutral tonality
- [ ] Other tonalities fail with error
- [ ] Counter resets at midnight

### Pro Tier
- [ ] Stripe payment flow works
- [ ] Tier updated after payment
- [ ] Unlimited refinements
- [ ] All tonalities available
- [ ] Webhook handles cancellation

### Speech Analysis
- [ ] Recording starts/stops correctly
- [ ] Transcript captures speech
- [ ] Pauses detected
- [ ] Tonality selector works
- [ ] Auto-analysis on stop
- [ ] Rating displayed correctly
- [ ] Feedback shows up

### Profile Management
- [ ] Can view profile
- [ ] Can update name
- [ ] Can change password
- [ ] Current password required
- [ ] Validation works

### Security
- [ ] RLS prevents cross-user access
- [ ] Rate limiting triggers
- [ ] Input validation catches bad data
- [ ] SQL injection attempts fail
- [ ] API keys not exposed in frontend

---

## Common Issues & Solutions

### Issue: "User not found" after signup
**Cause**: Trigger didn't create user record
**Fix**: Run supabase-setup.sql again, check trigger exists

### Issue: "Daily limit reached" immediately
**Cause**: Old sessions from previous day
**Fix**: Check date query logic, verify timezone

### Issue: Can't upgrade to Pro
**Cause**: Stripe not configured or webhook not receiving events
**Fix**: Check Stripe keys, webhook URL, signature verification

### Issue: OpenAI analysis fails
**Cause**: Invalid API key or rate limit
**Fix**: Check .env file, verify key, check OpenAI dashboard

### Issue: RLS blocks all queries
**Cause**: Using anon key instead of service role key
**Fix**: Verify backend uses service_role_key for admin operations

### Issue: Localhost bypass not working
**Cause**: Origin header not set correctly
**Fix**: Check browser sends origin/referer header

---

## File Structure

```
/Tonr
├── .env                      # Environment variables (gitignored)
├── .env.example              # Template for .env
├── .gitignore                # Git ignore rules
├── package.json              # Dependencies
├── backend-example.js        # Main backend server
├── server.js                 # Frontend static server
├── supabase-setup.sql        # Database schema
├── SETUP.md                  # Setup instructions
├── SECURITY.md               # Security documentation
├── IMPLEMENTATION_SUMMARY.md # This file
├── index.html                # Landing page
├── login.html                # Auth page
├── pricing.html              # Tier selection
├── dashboard.html            # Main app
├── styles.css                # Global styles
├── script.js                 # Landing page JS
├── auth.js                   # Auth utilities
└── dashboard.js              # Dashboard logic
```

---

## API Endpoints Summary

| Endpoint | Method | Auth | Rate Limit | Purpose |
|----------|--------|------|------------|---------|
| `/api/auth/signup` | POST | No | 5/15min | Create account |
| `/api/auth/login` | POST | No | 5/15min | Authenticate |
| `/api/user/profile` | GET | Yes | 100/15min | Get profile |
| `/api/user/profile` | PUT | Yes | 100/15min | Update profile |
| `/api/user/change-password` | POST | Yes | 100/15min | Change password |
| `/api/user/forgot-password` | POST | No | 100/15min | Request reset |
| `/api/user/tier` | GET | Yes | 100/15min | Get current tier |
| `/api/user/tier` | POST | Yes | 100/15min | Set tier (free only) |
| `/api/user/usage` | GET | Yes | 100/15min | Check daily usage |
| `/api/analyze-speech` | POST | Yes | 50/hour | Speech analysis |
| `/api/stripe/create-checkout` | POST | Yes | 100/15min | Create payment |
| `/api/stripe/webhook` | POST | No | - | Handle events |

---

## Next Steps

1. **Testing**: Run through all user flows manually
2. **Production Deploy**: Remove localhost bypass, use HTTPS
3. **Monitoring**: Set up error logging (Sentry, etc.)
4. **Analytics**: Track usage patterns
5. **Optimization**: Cache frequent queries
6. **Features**: Add more tonality options, history view, analytics

---

## Support

- **Security Issues**: support@tonr.net (do not file public issues)
- **General Support**: support@tonr.net
- **Documentation**: See SETUP.md and SECURITY.md

---

**Last Updated**: 2026-02-05
**Version**: 1.0.0

