// Example Backend Endpoint for OpenAI Integration
// This should run on your server, not in the browser

// Install: npm install express openai dotenv cors @supabase/supabase-js stripe jsonwebtoken express-rate-limit helmet

const express = require('express');
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet()); // Adds various HTTP headers for security
app.use(express.json({ limit: '10mb' })); // Limit body size to prevent DoS

// CORS configuration - more permissive for development
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        
        // Allow localhost on any port for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        
        // In production, check against whitelist
        const allowedOrigins = [process.env.frontend_url || 'http://localhost:5001'];
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Rate limiting to prevent abuse
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const analysisLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 analysis requests per hour
    message: { error: 'Analysis rate limit exceeded, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Initialize Supabase client
const supabaseUrl = process.env.supabase_url || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.supabase_service_role_key || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.supabase_key || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️  ERROR: Supabase configuration missing!');
    console.error('   Please add to .env:');
    console.error('   supabase_url=https://your-project.supabase.co');
    console.error('   supabase_key=your-anon-key');
    console.error('   supabase_service_role_key=your-service-role-key');
}

// Use service role key for backend operations (admin access, bypasses RLS)
// Falls back to anon key if service role key not provided (for development)
const supabase = createClient(
    supabaseUrl, 
    supabaseServiceKey || supabaseAnonKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Initialize Stripe
const stripeSecretKey = process.env.stripe_secret_key || process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? Stripe(stripeSecretKey) : null;

if (!stripeSecretKey) {
    console.warn('⚠️  WARNING: Stripe secret key not found. Payment features will not work.');
    console.warn('   Add to .env: stripe_secret_key=sk_test_your-key');
}

// JWT secret (in production, use a secure random string from .env)
const JWT_SECRET = process.env.jwt_secret || process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Authentication middleware - allows localhost without auth
function authenticateToken(req, res, next) {
    // Allow localhost requests without authentication
    const origin = req.headers.origin || req.headers.referer || '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || 
                       req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');
    
    if (isLocalhost) {
        // Create a mock user for localhost
        req.user = { id: 'localhost-user', email: 'localhost@example.com' };
        return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Initialize OpenAI client - reads from .env file
const openaiApiKey = process.env.openai_key || process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    console.error('⚠️  ERROR: OpenAI API key not found in .env file!');
    console.error('   Please add: openai_key=sk-your-key-here');
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: openaiApiKey
});

// Auth Routes with Supabase
app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Create user in Supabase (Supabase handles password hashing)
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: name
                }
            }
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        // User record will be created automatically by trigger, but ensure tier is set
        await supabase
            .from('users')
            .upsert({
                id: data.user.id,
                tier: null // No tier selected yet - user must choose
            }, {
                onConflict: 'id'
            });

        // Generate token
        const token = jwt.sign(
            { id: data.user.id, email: data.user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: data.user.id,
                name: name,
                email: data.user.email,
                tier: null
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Authenticate with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Get user tier from users table
        const { data: userData } = await supabase
            .from('users')
            .select('tier')
            .eq('id', data.user.id)
            .single();

        const tier = userData?.tier || null; // null means no tier selected yet

        // Generate token
        const token = jwt.sign(
            { id: data.user.id, email: data.user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: data.user.id,
                name: data.user.user_metadata?.name || email,
                email: data.user.email,
                tier: tier
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
});

// Apply general API rate limiting to all /api routes
app.use('/api', apiLimiter);

// Get current user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        // Get user data from Supabase
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, email, name, tier, created_at')
            .eq('id', req.user.id)
            .single();

        if (userError || !userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get auth user metadata
        const { data: authData } = await supabase.auth.admin.getUserById(req.user.id);

        res.json({
            id: userData.id,
            email: userData.email,
            name: userData.name || authData?.user?.user_metadata?.name || userData.email.split('@')[0],
            tier: userData.tier,
            createdAt: userData.created_at
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update user profile (name)
app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (name.length > 100) {
            return res.status(400).json({ error: 'Name is too long (max 100 characters)' });
        }

        // Update in users table
        const { error: updateError } = await supabase
            .from('users')
            .update({ name: name.trim() })
            .eq('id', req.user.id);

        if (updateError) {
            throw updateError;
        }

        // Also update in auth metadata for consistency
        await supabase.auth.admin.updateUserById(req.user.id, {
            user_metadata: { name: name.trim() }
        });

        res.json({ success: true, name: name.trim() });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Change password
app.post('/api/user/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        if (newPassword.length > 72) {
            return res.status(400).json({ error: 'Password is too long (max 72 characters)' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'New password must be different from current password' });
        }

        // Get user email
        const { data: userData } = await supabase
            .from('users')
            .select('email')
            .eq('id', req.user.id)
            .single();

        if (!userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password by attempting to sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: userData.email,
            password: currentPassword
        });

        if (signInError) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Update password using admin API
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            req.user.id,
            { password: newPassword }
        );

        if (updateError) {
            throw updateError;
        }

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Request password reset email
app.post('/api/user/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Send password reset email via Supabase
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.frontend_url || 'http://localhost:5001'}/reset-password.html`
        });

        if (error) {
            throw error;
        }

        // Always return success to prevent email enumeration
        res.json({ 
            success: true, 
            message: 'If an account exists with this email, you will receive a password reset link.' 
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        // Still return success to prevent email enumeration
        res.json({ 
            success: true, 
            message: 'If an account exists with this email, you will receive a password reset link.' 
        });
    }
});

// Get user tier
app.get('/api/user/tier', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('tier')
            .eq('id', req.user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ tier: data?.tier || null });
    } catch (error) {
        console.error('Get tier error:', error);
        res.status(500).json({ error: 'Failed to get tier' });
    }
});

// Set user tier (for free tier selection)
app.post('/api/user/tier', authenticateToken, async (req, res) => {
    try {
        const { tier } = req.body;

        if (!tier || (tier !== 'free' && tier !== 'pro')) {
            return res.status(400).json({ error: 'Invalid tier' });
        }

        // Check if user exists in users table, if not create
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('id', req.user.id)
            .single();

        if (!existingUser) {
            // Create user record
            await supabase
                .from('users')
                .insert({
                    id: req.user.id,
                    tier: tier
                });
        } else {
            // Update tier (only allow setting to free, pro is set via Stripe)
            if (tier === 'free') {
                await supabase
                    .from('users')
                    .update({ tier: 'free' })
                    .eq('id', req.user.id);
            }
        }

        res.json({ tier: tier });
    } catch (error) {
        console.error('Set tier error:', error);
        res.status(500).json({ error: 'Failed to set tier' });
    }
});

// Check usage limits
app.get('/api/user/usage', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
            .from('sessions')
            .select('id')
            .eq('user_id', req.user.id)
            .gte('created_at', `${today}T00:00:00.000Z`)
            .lt('created_at', `${today}T23:59:59.999Z`);

        if (error) {
            console.error('Usage check error:', error);
            return res.status(500).json({ error: 'Failed to check usage' });
        }

        const usageCount = data?.length || 0;

        // Get user tier
        const { data: userData } = await supabase
            .from('users')
            .select('tier')
            .eq('id', req.user.id)
            .single();

        const tier = userData?.tier || 'free';
        const limit = tier === 'pro' ? Infinity : 3;
        const remaining = tier === 'pro' ? Infinity : Math.max(0, limit - usageCount);

        res.json({
            tier,
            usageCount,
            limit: tier === 'pro' ? 'unlimited' : limit,
            remaining: tier === 'pro' ? 'unlimited' : remaining,
            canUse: tier === 'pro' || remaining > 0
        });
    } catch (error) {
        console.error('Usage check error:', error);
        res.status(500).json({ error: 'Failed to check usage' });
    }
});

// Stripe checkout session
app.post('/api/stripe/create-checkout', authenticateToken, async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Tonr Pro',
                            description: 'Unlimited refinements and full tone control'
                        },
                        unit_amount: 900, // $9.00
                        recurring: {
                            interval: 'month'
                        }
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.frontend_url || 'http://localhost:5001'}/dashboard.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.frontend_url || 'http://localhost:5001'}/pricing.html`,
            client_reference_id: req.user.id,
            metadata: {
                user_id: req.user.id
            }
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Stripe webhook (for subscription updates)
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.stripe_webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle subscription events
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata.user_id;

        // Update user tier to pro
        await supabase
            .from('users')
            .update({ tier: 'pro' })
            .eq('id', userId);
    }

    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const userId = subscription.metadata.user_id;

        // Downgrade user to free tier
        await supabase
            .from('users')
            .update({ tier: 'free' })
            .eq('id', userId);
    }

    res.json({ received: true });
});

// Tonality descriptions for prompt customization
const tonalityDescriptions = {
    neutral: {
        name: "Neutral",
        description: "clean, natural communication style",
        focus: "Focus on clarity, natural flow, and balanced delivery."
    },
    assertive: {
        name: "Assertive",
        description: "direct, decisive communication style",
        focus: "Focus on directness, confidence, and decisive language patterns."
    },
    composed: {
        name: "Composed",
        description: "calm, controlled communication style",
        focus: "Focus on calm delivery, controlled pacing, and measured responses."
    }
};

// Protect analyze-speech endpoint with authentication and tier restrictions
app.post('/api/analyze-speech', analysisLimiter, authenticateToken, async (req, res) => {
    try {
        const { transcript, tonality = 'neutral' } = req.body;

        // Check if localhost - skip tier restrictions
        const origin = req.headers.origin || req.headers.referer || '';
        const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || 
                           req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');
        
        let tier = 'pro'; // Default to pro for localhost
        
        if (!isLocalhost) {
            // Get user tier and usage
            const { data: userData } = await supabase
                .from('users')
                .select('tier')
                .eq('id', req.user.id)
                .single();

            tier = userData?.tier;
            
            // Check if user has selected a tier
            if (!tier) {
                return res.status(403).json({ 
                    error: 'Please select a tier before using the dashboard. Visit pricing page to choose Free or Pro.' 
                });
            }

            // Check usage limits for free tier
            if (tier === 'free') {
                const today = new Date().toISOString().split('T')[0];
                const { data: sessions } = await supabase
                    .from('sessions')
                    .select('id')
                    .eq('user_id', req.user.id)
                    .gte('created_at', `${today}T00:00:00.000Z`)
                    .lt('created_at', `${today}T23:59:59.999Z`);

                if (sessions && sessions.length >= 3) {
                    return res.status(403).json({ 
                        error: 'Daily limit reached. Upgrade to Pro for unlimited refinements.' 
                    });
                }

                // Free tier can only use neutral tonality
                if (tonality !== 'neutral') {
                    return res.status(403).json({ 
                        error: 'Free tier can only use neutral tonality. Upgrade to Pro for full tone control.' 
                    });
                }
            }
        }

        // Record session (skip for localhost)
        if (!isLocalhost) {
            await supabase
                .from('sessions')
                .insert({
                    user_id: req.user.id,
                    tonality: tonality,
                    created_at: new Date().toISOString()
                });
        }

        if (!transcript || transcript.trim().length === 0) {
            return res.status(400).json({ error: 'Transcript is required' });
        }

        const tonalityInfo = tonalityDescriptions[tonality] || tonalityDescriptions.neutral;

        const prompt = `You are a speech communication coach specializing in ${tonalityInfo.name.toLowerCase()} communication style (${tonalityInfo.description}).

Analyze the following speech transcript and provide:
1. A rating from 1-100 based on:
   - Clarity and articulation
   - Confidence and presence
   - Use of filler words
   - Pacing and pauses
   - Alignment with ${tonalityInfo.name.toLowerCase()} communication style
   - Overall communication effectiveness

2. Specific areas for improvement (3-5 bullet points) that help the speaker achieve a more ${tonalityInfo.name.toLowerCase()} tone. ${tonalityInfo.focus}

Transcript: "${transcript}"

Respond in JSON format:
{
  "rating": <number 1-100>,
  "feedback": ["point 1", "point 2", "point 3"]
}`;

        const completion = await openai.chat.completions.create({
            model: process.env.openai_model || process.env.OPENAI_MODEL || "gpt-4",
            messages: [
                {
                    role: "system",
                    content: `You are an expert speech communication coach specializing in ${tonalityInfo.name.toLowerCase()} communication. Provide constructive, actionable feedback.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        const response = JSON.parse(completion.choices[0].message.content);
        
        res.json(response);
    } catch (error) {
        console.error('OpenAI API error:', error);
        res.status(500).json({ 
            error: 'Failed to analyze speech',
            details: error.message 
        });
    }
});

const PORT = process.env.port || process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ Tonr backend server running on port ${PORT}\n`);
    console.log('Configuration Status:');
    console.log(`  OpenAI API Key: ${openaiApiKey ? '✅ Configured' : '❌ Missing'}`);
    console.log(`  Supabase URL: ${supabaseUrl ? '✅ Configured' : '❌ Missing'}`);
    console.log(`  Supabase Key: ${supabaseAnonKey ? '✅ Configured' : '❌ Missing'}`);
    console.log(`  Supabase Service Role: ${supabaseServiceKey ? '✅ Configured' : '⚠️  Using anon key (not recommended for production)'}`);
    console.log(`  Stripe Secret Key: ${stripeSecretKey ? '✅ Configured' : '⚠️  Missing (payments disabled)'}`);
    console.log(`  JWT Secret: ${JWT_SECRET && JWT_SECRET !== 'your-secret-key-change-in-production' ? '✅ Configured' : '⚠️  Using default (change in production)'}\n`);
});

