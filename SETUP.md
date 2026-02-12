# Tonr Setup Guide

## Environment Variables Setup

1. **Create a `.env` file** in the root directory (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. **Add your API Keys**:
   - **OpenAI**: Get your API key from https://platform.openai.com/api-keys
   - **Supabase**: Get your URL and key from https://supabase.com/dashboard
     - Go to Project Settings > API
     - Copy "Project URL" → `supabase_url`
     - Copy "anon public" key → `supabase_key`
   - **Stripe**: Get your keys from https://dashboard.stripe.com/apikeys
     - Copy "Secret key" → `stripe_secret_key`
     - Copy "Publishable key" → `stripe_publishable_key` (for frontend if needed)
   - **JWT Secret**: Generate a random secret key for authentication
   
   Open `.env` file and add your keys:
     ```
     openai_key=sk-your-actual-api-key-here
     supabase_url=https://your-project.supabase.co
     supabase_key=your-supabase-anon-key
     stripe_secret_key=sk_test_your-stripe-secret-key
     stripe_webhook_secret=whsec_your-webhook-secret
     jwt_secret=your-random-secret-key-here
     ```

3. **Configure other settings** (optional):
   - `openai_model`: Choose your model (gpt-4, gpt-4-turbo-preview, or gpt-3.5-turbo)
   - `port`: Backend server port (default: 3000)
   - `backend_url`: Frontend will use this to connect to backend
   - `frontend_url`: Your frontend URL for Stripe redirects

**Note**: The `.env` file is your central key hub. Add any API keys here and they'll be automatically used throughout the application.

## Supabase Database Setup

1. **Run the SQL setup script**:
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Copy and paste the contents of `supabase-setup.sql`
   - Run the script to create tables and set up Row Level Security

2. **Tables created**:
   - `users` - Stores user tier information
   - `sessions` - Tracks daily usage for free tier users

## Stripe Setup

1. **Create a product**:
   - Go to Stripe Dashboard > Products
   - Create a subscription product for $9/month (or use the code which creates it automatically)

2. **Set up webhook**:
   - Go to Stripe Dashboard > Developers > Webhooks
   - Add endpoint: `https://your-backend-url.com/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.deleted`
   - Copy the webhook signing secret to `.env` as `stripe_webhook_secret`

## Backend Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the backend server**:
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Backend will run on**: `http://localhost:3000`

## Frontend Setup

The frontend is already running on `http://localhost:5001` via the Node.js server.

## Usage

1. **Create an account or login**:
   - Navigate to `http://localhost:5001/login.html`
   - Click "Sign Up" to create a new account
   - Or click "Login" if you already have an account

2. **Access the dashboard**:
   - After logging in, you'll be redirected to the dashboard
   - The dashboard is protected - you must be logged in to access it

3. **Use the dashboard**:
   - Select your desired output tonality (Neutral, Assertive, or Composed)
   - Click "Start Recording" and speak
   - Click "Stop Recording" - analysis happens automatically
   - View your rating and feedback

4. **Logout**:
   - Click "Logout" in the header to sign out

## File Structure

- `dashboard.html` - Dashboard interface
- `dashboard.js` - Frontend JavaScript (speech recognition)
- `backend-example.js` - Backend server (OpenAI integration)
- `.env` - Your API keys and secrets (create this file)
- `.env.example` - Example environment variables
- `package.json` - Node.js dependencies

## Security Notes

- Never commit `.env` file to git (it's in `.gitignore`)
- Keep your OpenAI API key secret
- The backend handles all API calls securely

