# Google OAuth Setup Guide for TruckOpti

This guide walks you through configuring Google OAuth for the TruckOpti app.

## Project Information
- **Supabase Project**: `jbxncejtcbpcronndqlx.supabase.co`
- **Redirect URI**: `https://jbxncejtcbpcronndqlx.supabase.co/auth/v1/callback`
- **Frontend URL**: `http://localhost:5173` (development) / Your production URL

---

## Step 1: Create Google Cloud OAuth 2.0 Credentials

### 1.1 Go to Google Cloud Console
1. Open [console.cloud.google.com](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Select or create a project for TruckOpti

### 1.2 Configure OAuth Consent Screen
1. Navigate to **"APIs & Services" > "OAuth consent screen"** (left sidebar)
2. Select **"External"** (for production) or **"Internal"** (for testing)
3. Click **"Create"**

#### App Information:
| Field | Value |
|-------|-------|
| App name | TruckOpti |
| User support email | Your email |
| App logo | Upload your logo (optional) |
| App domain | yourdomain.com |
| Authorized domains | yourdomain.com, localhost |
| Developer contact info | Your email |

4. Click **"Save and Continue"**
5. Add scopes: `email`, `profile`, `openid`
6. Click **"Save and Continue"**
7. Add test users (for External testing)
8. Click **"Save and Continue"**

### 1.3 Create OAuth 2.0 Client ID

1. Navigate to **"APIs & Services" > "Credentials"**
2. Click **"+ Create Credentials"** > **"OAuth client ID"**
3. Select **"Web application"**
4. Configure the following:

#### Name:
```
TruckOpti Web Client
```

#### Authorized JavaScript origins:
```
http://localhost:5173
https://your-production-domain.com
```

#### Authorized redirect URIs:
```
https://jbxncejtcbpcronndqlx.supabase.co/auth/v1/callback
```

**⚠️ Important**: This exact URI must match what's configured in Supabase.

5. Click **"Create"**
6. Copy the **Client ID** and **Client Secret** (you'll need these in Step 2)

---

## Step 2: Configure Google OAuth in Supabase Dashboard

### 2.1 Open Supabase Dashboard
1. Go to [app.supabase.com](https://app.supabase.com/)
2. Select your project: `jbxncejtcbpcronndqlx`
3. Navigate to **"Authentication" > "Providers"**

### 2.2 Enable Google Provider
1. Find **"Google"** in the provider list
2. Toggle **"Enabled"** to ON
3. Enter the credentials from Step 1:

| Field | Value |
|-------|-------|
| Client ID | Your Google Client ID (e.g., `123456789-abc123.apps.googleusercontent.com`) |
| Client Secret | Your Google Client Secret |
| Authorized Redirect URI | `https://jbxncejtcbpcronndqlx.supabase.co/auth/v1/callback` |

4. Click **"Save"**

### 2.3 Verify Configuration
1. Check that **"Site URL"** is configured:
   - Go to **"Authentication" > "URL Configuration"**
   - Site URL: `http://localhost:5173` (development)
   - Add your production URL when ready

2. Add Redirect URLs:
   - `http://localhost:5173/auth/callback`
   - `https://your-production-domain.com/auth/callback`

---

## Step 3: Update Frontend Configuration

### 3.1 Update config.toml (Local Development)

Add the following to your `supabase/config.toml`:

```toml
[auth.external.google]
enabled = true
client_id = "your-google-client-id"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "https://jbxncejtcbpcronndqlx.supabase.co/auth/v1/callback"
skip_nonce_check = false
email_optional = false
```

### 3.2 Environment Variables

Add to your `.env` file:

```bash
# Supabase
VITE_SUPABASE_URL=https://jbxncejtcbronndqlx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Google OAuth (only needed for local CLI)
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your-google-client-secret
```

---

## Step 4: Test the Integration

### 4.1 Start Development Server
```bash
cd frontend
npm run dev
```

### 4.2 Test Login Flow
1. Open `http://localhost:5173/login`
2. Click **"Continue with Google"**
3. You should be redirected to Google's sign-in page
4. After authentication, you should return to the app
5. Check browser console for any errors

### 4.3 Verify User Creation
1. Go to Supabase Dashboard > Authentication > Users
2. You should see the new user with:
   - Email from Google account
   - `google_linked: true` in user metadata

---

## Troubleshooting

### Issue: "redirect_uri_mismatch"
**Solution**: Ensure the redirect URI in Google Cloud Console exactly matches:
```
https://jbxncejtcbpcronndqlx.supabase.co/auth/v1/callback
```

### Issue: "Invalid client"
**Solution**: Check that Client ID and Client Secret are correctly copied (no extra spaces)

### Issue: "User cancelled the OAuth flow"
**Solution**: This is normal if user clicks cancel. Check browser console for details.

### Issue: CORS errors
**Solution**: Add your frontend URL to "Authorized JavaScript origins" in Google Cloud Console

---

## Security Checklist

- [ ] Client Secret never committed to git
- [ ] Production redirect URI configured
- [ ] HTTPS only for production
- [ ] Authorized domains restricted
- [ ] OAuth consent screen properly configured
- [ ] Test users added for development

---

## Verification Commands

Test the OAuth flow programmatically:

```javascript
// In browser console on LoginPage
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'http://localhost:5173/auth/callback'
  }
});

if (error) console.error('OAuth Error:', error);
else console.log('OAuth URL:', data.url);
```

---

## Next Steps

After Google OAuth is working:
1. ✅ Database Setup (completed)
2. ✅ Google OAuth (completed)
3. ⏳ Google Maps Integration (see GOOGLE_MAPS_SETUP.md)
