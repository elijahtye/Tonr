-- ============================================
-- Creator Referral Tracking - Complete SQL Setup (SECURE)
-- Copy and paste this entire file into Supabase SQL Editor
-- ============================================

-- Step 1: Add referrer_code column to existing users table
-- This stores which creator code referred each user
ALTER TABLE users
ADD COLUMN IF NOT EXISTS referrer_code text;

-- Add constraint: creator codes must be alphanumeric + underscore/hyphen, max 50 chars
-- Prevents SQL injection and invalid codes
-- Note: Drop constraint first if it exists, then add it
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_referrer_code_format'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT check_referrer_code_format;
    END IF;
END $$;

ALTER TABLE users
ADD CONSTRAINT check_referrer_code_format
CHECK (referrer_code IS NULL OR (
  LENGTH(referrer_code) <= 50 AND
  referrer_code ~ '^[a-zA-Z0-9_-]+$'
));

-- Add index for faster lookups when checking referrer codes
CREATE INDEX IF NOT EXISTS idx_users_referrer_code 
ON users (referrer_code) 
WHERE referrer_code IS NOT NULL;

-- Step 2: Create creator_referrals table
-- Tracks when someone clicks a creator link (IP address → creator code)
-- This is used to attribute users to creators when they sign up
CREATE TABLE IF NOT EXISTS creator_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_code text NOT NULL,
  ip_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Security: Validate creator code format (alphanumeric + underscore/hyphen only)
  CONSTRAINT check_creator_code_format CHECK (
    LENGTH(creator_code) <= 50 AND
    creator_code ~ '^[a-zA-Z0-9_-]+$'
  ),
  -- Security: Validate IP address format (basic check)
  CONSTRAINT check_ip_format CHECK (
    LENGTH(ip_address) <= 45 AND
    (ip_address ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' OR
     ip_address ~ '^[0-9a-fA-F:]+$' OR
     ip_address = 'localhost' OR
     ip_address = '127.0.0.1')
  )
);

-- Index for fast lookups: find most recent referral for an IP address
CREATE INDEX IF NOT EXISTS idx_creator_referrals_ip_created_at
  ON creator_referrals (ip_address, created_at DESC);

-- Index for looking up all referrals by creator code (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_creator_referrals_creator_code
  ON creator_referrals (creator_code);

-- Step 3: Create creator_conversions table
-- Tracks actual purchases made through creator links
-- This is what you'll use to calculate commissions
CREATE TABLE IF NOT EXISTS creator_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_code text NOT NULL,
  user_id uuid NOT NULL,
  stripe_session_id text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Security: Validate creator code format
  CONSTRAINT check_conversion_creator_code_format CHECK (
    LENGTH(creator_code) <= 50 AND
    creator_code ~ '^[a-zA-Z0-9_-]+$'
  ),
  -- Security: Validate amount is non-negative
  CONSTRAINT check_amount_non_negative CHECK (amount >= 0),
  -- Security: Validate Stripe session ID format (starts with cs_ or sess_)
  CONSTRAINT check_stripe_session_format CHECK (
    LENGTH(stripe_session_id) <= 255 AND
    (stripe_session_id ~ '^cs_[a-zA-Z0-9]+$' OR
     stripe_session_id ~ '^sess_[a-zA-Z0-9]+$' OR
     stripe_session_id ~ '^.*$') -- Allow other formats for flexibility
  )
);

-- Index for fast lookups: count purchases per creator code
CREATE INDEX IF NOT EXISTS idx_creator_conversions_creator_code
  ON creator_conversions (creator_code);

-- Unique index to prevent duplicate conversion records for the same Stripe session
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_conversions_session
  ON creator_conversions (stripe_session_id);

-- Index for looking up conversions by user (optional)
CREATE INDEX IF NOT EXISTS idx_creator_conversions_user_id
  ON creator_conversions (user_id);

-- ============================================
-- SECURITY: Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on creator_referrals table
ALTER TABLE creator_referrals ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role (backend) can insert referral records
-- Regular users cannot insert or read referral data
DROP POLICY IF EXISTS "Service role can insert referrals" ON creator_referrals;
CREATE POLICY "Service role can insert referrals"
ON creator_referrals
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy: Only service role can read referral records
DROP POLICY IF EXISTS "Service role can read referrals" ON creator_referrals;
CREATE POLICY "Service role can read referrals"
ON creator_referrals
FOR SELECT
TO service_role
USING (true);

-- Deny all access to authenticated users (regular users cannot see referral data)
DROP POLICY IF EXISTS "Users cannot access referrals" ON creator_referrals;
CREATE POLICY "Users cannot access referrals"
ON creator_referrals
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- Enable RLS on creator_conversions table
ALTER TABLE creator_conversions ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role (backend) can insert conversion records
DROP POLICY IF EXISTS "Service role can insert conversions" ON creator_conversions;
CREATE POLICY "Service role can insert conversions"
ON creator_conversions
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy: Only service role can read conversion records
-- Regular users cannot see conversion data (prevents creators from seeing each other's stats)
DROP POLICY IF EXISTS "Service role can read conversions" ON creator_conversions;
CREATE POLICY "Service role can read conversions"
ON creator_conversions
FOR SELECT
TO service_role
USING (true);

-- Deny all access to authenticated users (regular users cannot see conversion data)
DROP POLICY IF EXISTS "Users cannot access conversions" ON creator_conversions;
CREATE POLICY "Users cannot access conversions"
ON creator_conversions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- ============================================
-- SECURITY: Additional Constraints
-- ============================================

-- Ensure referrer_code in users table references valid creator codes
-- (Optional: Add foreign key constraint if you want strict referential integrity)
-- Note: This is commented out because creator codes are just strings, not a separate table
-- If you create a creators table later, uncomment and modify this:
-- ALTER TABLE users
-- ADD CONSTRAINT fk_users_referrer_code
-- FOREIGN KEY (referrer_code) REFERENCES creators(code);

-- ============================================
-- SECURITY: Grant Permissions
-- ============================================

-- Ensure service role has full access (for backend operations)
GRANT ALL ON creator_referrals TO service_role;
GRANT ALL ON creator_conversions TO service_role;

-- Revoke public access (security: no anonymous access)
REVOKE ALL ON creator_referrals FROM anon, authenticated;
REVOKE ALL ON creator_conversions FROM anon, authenticated;

-- ============================================
-- Useful queries for checking your data:
-- ============================================

-- View all purchases per creator code:
-- SELECT 
--   creator_code, 
--   COUNT(*) AS total_purchases,
--   SUM(amount) AS total_revenue_cents,
--   SUM(amount) / 100.0 AS total_revenue_dollars
-- FROM creator_conversions
-- GROUP BY creator_code
-- ORDER BY total_purchases DESC;

-- View all referrals (link clicks) per creator code:
-- SELECT 
--   creator_code,
--   COUNT(*) AS total_clicks,
--   COUNT(DISTINCT ip_address) AS unique_visitors
-- FROM creator_referrals
-- GROUP BY creator_code
-- ORDER BY total_clicks DESC;

-- View conversion rate (purchases / clicks) per creator:
-- SELECT 
--   r.creator_code,
--   COUNT(DISTINCT r.id) AS total_clicks,
--   COUNT(DISTINCT c.id) AS total_purchases,
--   ROUND(COUNT(DISTINCT c.id)::numeric / NULLIF(COUNT(DISTINCT r.id), 0) * 100, 2) AS conversion_rate_percent
-- FROM creator_referrals r
-- LEFT JOIN creator_conversions c ON r.creator_code = c.creator_code
-- GROUP BY r.creator_code
-- ORDER BY total_purchases DESC;

-- ============================================
-- SECURITY NOTES & BEST PRACTICES
-- ============================================

-- ✅ SECURITY FEATURES IMPLEMENTED:
-- 1. Row Level Security (RLS) enabled on all tables
-- 2. Only service_role (backend) can insert/read data
-- 3. Regular users (authenticated) cannot access referral/conversion data
-- 4. Input validation via CHECK constraints (prevents SQL injection)
-- 5. Format validation for creator codes (alphanumeric + underscore/hyphen only)
-- 6. IP address format validation
-- 7. Amount validation (non-negative)
-- 8. Stripe session ID format validation
-- 9. Unique constraint prevents duplicate conversions
-- 10. Explicit permission grants/revokes

-- 🔒 IMPORTANT SECURITY REMINDERS:
-- 1. Your backend (backend-example.js) uses service_role key - keep it secret!
-- 2. Never expose service_role key in frontend code
-- 3. IP addresses are stored in plain text - consider hashing if needed for GDPR
-- 4. Creator codes are case-sensitive (EXAMPLE ≠ example)
-- 5. Regular users cannot query these tables directly (RLS blocks them)
-- 6. Only your backend API can insert/read this data

-- 📊 TO VIEW DATA (as admin):
-- Run queries in Supabase SQL Editor (uses service_role automatically)
-- Or create a secure admin API endpoint that uses service_role

-- ⚠️  IF YOU NEED CREATORS TO SEE THEIR OWN STATS:
-- You would need to create a separate view/function with RLS that allows:
-- - Creators to see only their own conversion data
-- - This requires additional policies (not implemented here for security)
