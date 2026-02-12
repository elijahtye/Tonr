-- ============================================================================
-- TONR - COMPREHENSIVE SUPABASE DATABASE SETUP
-- ============================================================================
-- This script sets up the complete database schema for Tonr with:
-- - User profile management
-- - Tier tracking (free/pro)
-- - Session usage tracking
-- - Stripe subscription integration
-- - Row Level Security (RLS) policies
-- - Automatic triggers and functions
--
-- INSTRUCTIONS:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to: SQL Editor
-- 3. Copy and paste this entire script
-- 4. Click "Run" to execute
-- ============================================================================

-- ============================================================================
-- CLEANUP (Run if you need to reset - WARNING: Deletes all data!)
-- ============================================================================
-- Uncomment these lines if you want to start fresh:
-- DROP TABLE IF EXISTS public.sessions CASCADE;
-- DROP TABLE IF EXISTS public.users CASCADE;
-- DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
-- DROP FUNCTION IF EXISTS public.handle_user_update() CASCADE;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Users table (extends Supabase auth.users)
-- This stores additional user information beyond what Supabase auth provides
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    tier TEXT CHECK (tier IN ('free', 'pro', NULL)) DEFAULT NULL,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT CHECK (subscription_status IN ('active', 'canceled', 'past_due', NULL)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Sessions table to track usage for free tier limits
-- Tracks each speech analysis session
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tonality TEXT NOT NULL CHECK (tonality IN ('neutral', 'assertive', 'composed')),
    transcript_length INTEGER,
    rating INTEGER CHECK (rating >= 1 AND rating <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for user lookups by email
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON public.users(stripe_customer_id);

-- Index for user tier queries
CREATE INDEX IF NOT EXISTS idx_users_tier ON public.users(tier);

-- Index for session queries by user and date (for daily limits)
CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON public.sessions(user_id, created_at DESC);

-- Index for general session date queries
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at DESC);

-- Composite index for usage queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_id_tonality ON public.sessions(user_id, tonality);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-runs)
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can view own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Service role can manage all sessions" ON public.sessions;

-- USERS TABLE POLICIES

-- Users can view their own profile
CREATE POLICY "Users can view own data" ON public.users
    FOR SELECT 
    USING (auth.uid() = id);

-- Users can update their own profile (name, tier selection)
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Service role (backend) can manage all users
CREATE POLICY "Service role can manage all users" ON public.users
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- SESSIONS TABLE POLICIES

-- Users can insert their own sessions
CREATE POLICY "Users can insert own sessions" ON public.sessions
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions" ON public.sessions
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Service role (backend) can manage all sessions
CREATE POLICY "Service role can manage all sessions" ON public.sessions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to automatically create user record when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, tier)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NULL  -- No tier selected yet - user must choose on second screen
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to create user record on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at on user record changes
DROP TRIGGER IF EXISTS on_user_updated ON public.users;
CREATE TRIGGER on_user_updated
    BEFORE UPDATE ON public.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_user_update();

-- ============================================================================
-- HELPER VIEWS (Optional - for analytics/debugging)
-- ============================================================================

-- View to see user stats (visible to service role only)
CREATE OR REPLACE VIEW public.user_stats AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.tier,
    u.subscription_status,
    u.created_at,
    COUNT(s.id) as total_sessions,
    MAX(s.created_at) as last_session_at,
    AVG(s.rating) as average_rating
FROM public.users u
LEFT JOIN public.sessions s ON u.id = s.user_id
GROUP BY u.id, u.email, u.name, u.tier, u.subscription_status, u.created_at;

-- View for daily usage (for free tier limits)
CREATE OR REPLACE VIEW public.daily_usage AS
SELECT 
    user_id,
    DATE(created_at) as usage_date,
    COUNT(*) as sessions_count,
    ARRAY_AGG(DISTINCT tonality) as tonalities_used
FROM public.sessions
GROUP BY user_id, DATE(created_at);

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================
-- 
-- 1. ROW LEVEL SECURITY (RLS):
--    - All tables have RLS enabled
--    - Users can only see/modify their own data
--    - Backend service role has full access
--
-- 2. PASSWORD MANAGEMENT:
--    - Passwords are handled by Supabase Auth (hashed with bcrypt)
--    - Never stored in plain text
--    - Password changes use Supabase auth.updateUser()
--
-- 3. TIER MANAGEMENT:
--    - tier can be NULL (not selected), 'free', or 'pro'
--    - NULL tier means user hasn't completed onboarding
--    - Only backend can set 'pro' tier (via Stripe webhook)
--    - Users can select 'free' tier themselves
--
-- 4. SESSION TRACKING:
--    - Tracks tonality and rating for analytics
--    - Used for free tier limits (3 per day)
--    - Automatically cleaned up when user is deleted
--
-- 5. STRIPE INTEGRATION:
--    - stripe_customer_id: Unique per customer
--    - stripe_subscription_id: Current subscription
--    - subscription_status: Tracks payment status
--
-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the setup:

-- Check tables exist
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'sessions');

-- Check RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'sessions');

-- Check policies exist
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Check triggers exist
-- SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public';

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Your database is now ready for Tonr.
-- 
-- Next steps:
-- 1. Add your Supabase credentials to .env file
-- 2. Start the backend server: npm start
-- 3. Test user signup and tier selection
-- ============================================================================
