# Security Guide for Tonr

## Overview
This document outlines the security measures implemented in Tonr and best practices for deployment.

## Security Features Implemented

### 1. Authentication & Authorization
- **JWT Tokens**: 7-day expiration, signed with secure secret
- **Supabase Auth**: Industry-standard authentication with bcrypt password hashing
- **Row Level Security (RLS)**: Database-level access control
- **Service Role Key**: Backend uses admin key for privileged operations

### 2. Password Security
- **Minimum Length**: 6 characters (can be increased)
- **Maximum Length**: 72 characters (bcrypt limit)
- **Hashing**: Supabase uses bcrypt with salt
- **Password Reset**: Secure email-based reset flow
- **Change Password**: Requires current password verification

### 3. Rate Limiting
- **Authentication**: 5 requests per 15 minutes
- **General API**: 100 requests per 15 minutes  
- **Speech Analysis**: 50 requests per hour
- Prevents brute force attacks and API abuse

### 4. Input Validation
- **Email Format**: Validated on signup/login
- **Password Requirements**: Length and complexity checks
- **Tier Validation**: Only 'free' or 'pro' allowed
- **Tonality Validation**: Only 'neutral', 'assertive', 'composed'
- **Name Length**: Max 100 characters
- **Body Size Limit**: 10MB max to prevent DoS

### 5. SQL Injection Prevention
- **Parameterized Queries**: Supabase client uses prepared statements
- **No Raw SQL**: All queries use Supabase query builder
- **Type Checking**: UUID, TEXT, INTEGER constraints at database level

### 6. HTTP Security Headers (via Helmet)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: HSTS enabled
- Content-Security-Policy: Configurable

### 7. CORS Protection
- **Origin Restriction**: Only configured frontend URL allowed
- **Credentials**: Properly handled with credentials flag
- **No Wildcard**: Specific origins only

### 8. Session Management
- **Token Expiration**: 7-day JWT expiration
- **Secure Storage**: Tokens stored in localStorage (HTTPS required in production)
- **Logout**: Proper token cleanup
- **No Refresh Tokens**: Service role key doesn't persist sessions

### 9. Database Security
- **Row Level Security (RLS)**: Enabled on all tables
- **Foreign Keys**: CASCADE deletion for data integrity
- **Check Constraints**: Tier, tonality, rating validation
- **Indexes**: Prevent N+1 queries and improve performance
- **Triggers**: Automatic timestamp updates

### 10. Tier & Usage Restrictions
- **Free Tier**: 3 sessions per day, neutral tone only
- **Pro Tier**: Unlimited sessions, all tones
- **Backend Enforcement**: Cannot be bypassed from frontend
- **Database Tracking**: All sessions logged with timestamp

## Potential Security Issues & Mitigations

### Issue 1: JWT Secret in Environment
**Risk**: If JWT_SECRET is compromised, attackers can forge tokens
**Mitigation**: 
- Use strong random secret (32+ characters)
- Rotate secret regularly
- Never commit .env file
- Use environment variables in production

### Issue 2: Service Role Key Exposure
**Risk**: Service role key bypasses RLS - full database access
**Mitigation**:
- Never expose in frontend
- Only use in backend
- Store in .env file
- Use anon key for client-side operations

### Issue 3: Email Enumeration
**Risk**: Attackers can determine if email exists by error messages
**Mitigation**:
- Forgot password returns same message for all emails
- Signup errors don't reveal if email exists
- Rate limiting prevents mass enumeration

### Issue 4: OpenAI API Key Exposure
**Risk**: Expensive API calls if key is exposed
**Mitigation**:
- Backend-only API calls
- Never expose key to frontend
- Rate limiting on analysis endpoint
- Usage tracking per user

### Issue 5: Stripe Webhook Security
**Risk**: Fake webhook events could grant free Pro access
**Mitigation**:
- Webhook signature verification
- Only specific events processed
- User_id metadata validation
- Idempotency checks

### Issue 6: XSS (Cross-Site Scripting)
**Risk**: User input displayed without sanitization
**Mitigation**:
- Frontend sanitizes all user input
- Content-Security-Policy headers
- No innerHTML with user data
- React/Vue auto-escaping

### Issue 7: CSRF (Cross-Site Request Forgery)
**Risk**: Malicious site could make authenticated requests
**Mitigation**:
- JWT in Authorization header (not cookies)
- CORS restrictions
- SameSite cookie attributes (if using cookies)

## Production Deployment Checklist

### Environment Variables
- [ ] Generate strong JWT_SECRET (32+ characters)
- [ ] Use production Supabase project
- [ ] Use production Stripe keys
- [ ] Set proper frontend_url
- [ ] Never commit .env file

### HTTPS/SSL
- [ ] Use HTTPS in production (required)
- [ ] Set secure cookie flags
- [ ] Enable HSTS headers
- [ ] Valid SSL certificate

### Database
- [ ] Run supabase-setup.sql on production database
- [ ] Verify RLS policies are enabled
- [ ] Test permissions with different users
- [ ] Set up automated backups

### API Keys
- [ ] Rotate all keys from development
- [ ] Use Stripe live keys (not test)
- [ ] Set up Stripe webhooks with production URL
- [ ] Monitor API usage for anomalies

### Rate Limiting
- [ ] Adjust limits based on expected traffic
- [ ] Set up IP-based rate limiting (e.g., via Cloudflare)
- [ ] Monitor for abuse patterns
- [ ] Consider captcha for signup

### Monitoring
- [ ] Set up error logging (e.g., Sentry)
- [ ] Monitor failed login attempts
- [ ] Track API usage and costs
- [ ] Alert on unusual patterns

### Code Review
- [ ] No console.log of sensitive data
- [ ] No commented-out API keys
- [ ] No test credentials in code
- [ ] Dependencies up to date

## Localhost Security Bypass

**Note**: The current implementation bypasses authentication for localhost requests. This is for development convenience only.

**IMPORTANT**: Before production deployment, remove or disable the localhost bypass in `authenticateToken` middleware:

```javascript
// REMOVE THIS IN PRODUCTION
if (isLocalhost) {
    req.user = { id: 'localhost-user', email: 'localhost@example.com' };
    return next();
}
```

## Password Change Flow

1. User provides current password and new password
2. Backend verifies current password with Supabase
3. If valid, updates password using admin API
4. Returns success/error message
5. User can continue using existing token (optional: force re-login)

## Tier Selection Security

- User can only select 'free' tier themselves
- 'pro' tier can only be set via Stripe webhook
- Tier changes are validated server-side
- Cannot bypass tier restrictions from frontend

## Session Tracking

- All sessions stored in database with timestamp
- Used for free tier daily limits
- Cannot be manipulated from frontend
- Automatically cleaned up on user deletion

## Common Vulnerabilities Prevented

✅ SQL Injection (parameterized queries)
✅ XSS (input sanitization, CSP headers)
✅ CSRF (JWT in headers, CORS)
✅ Brute Force (rate limiting)
✅ Session Hijacking (secure tokens, HTTPS)
✅ Password Storage (bcrypt hashing)
✅ API Abuse (rate limiting, authentication)
✅ Privilege Escalation (RLS, server-side validation)

## Security Contact

For security issues, contact: support@tonr.net

**Do not** file public issues for security vulnerabilities.

