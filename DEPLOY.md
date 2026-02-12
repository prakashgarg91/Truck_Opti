# TruckOpti Deployment Guide

## Quick Deploy (Recommended: Vercel)

### Option 1: Vercel CLI (Easiest)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy from project root
vercel --prod

# 4. Set environment variables in Vercel dashboard:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_APP_URL (your deployed URL)
```

### Option 2: Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure:
   - **Framework Preset:** Vite
   - **Build Command:** `cd frontend && npm run build`
   - **Output Directory:** `frontend/dist`
   - **Install Command:** `cd frontend && npm install`
4. Add Environment Variables (copy from `.env.production`)
5. Deploy!

---

## Alternative: Netlify

### Option 1: Netlify CLI

```bash
# 1. Install Netlify CLI
npm i -g netlify-cli

# 2. Login
netlify login

# 3. Deploy
netlify deploy --prod --dir=frontend/dist
```

### Option 2: Netlify Dashboard

1. Go to https://app.netlify.com/drop
2. Drag and drop the `frontend/dist` folder
3. Configure environment variables in Site Settings

---

## Alternative: GitHub Pages

```bash
# 1. Build the project
cd frontend
npm run build

# 2. Deploy to gh-pages branch
npx gh-pages -d dist
```

---

## Post-Deployment Checklist

### 1. Update Supabase Auth Settings

Go to https://supabase.com/dashboard/project/jbxncejtcbpcronndqlx/auth/url-configuration

Add your production URL to **Redirect URLs**:
```
https://your-domain.com/auth/callback
```

Examples:
- `https://truckopti.vercel.app/auth/callback`
- `https://truckopti.netlify.app/auth/callback`

### 2. Update Environment Variables

Make sure these are set in your hosting platform:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://jbxncejtcbpcronndqlx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `VITE_APP_URL` | Your deployed URL |

### 3. Configure Custom Domain (Optional)

If you have a custom domain (e.g., `truckopti.in`):

1. Add domain in Vercel/Netlify dashboard
2. Update DNS records
3. Add `https://truckopti.in/auth/callback` to Supabase redirect URLs
4. Update `VITE_APP_URL` to your custom domain

### 4. Test Production

```bash
# Test authentication
curl -X POST "https://jbxncejtcbpcronndqlx.supabase.co/auth/v1/otp" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

---

## Marketing Ready Checklist

### Before Going Live

- [ ] Deploy to production URL
- [ ] Test Google OAuth with production URL
- [ ] Test Email OTP
- [ ] Test 3D packing flow
- [ ] Verify all 17 pages load
- [ ] Test mobile responsiveness
- [ ] Add Google Analytics (optional)
- [ ] Add Facebook Pixel (optional)

### Sales Materials Ready

- [ ] **Demo Video:** Record 2-min walkthrough
- [ ] **Pricing Page:** `/pricing` - verify plans show correctly
- [ ] **Contact Form:** Add your email/phone
- [ ] **WhatsApp Integration:** Update business number

---

## Production URLs

| Environment | URL |
|-------------|-----|
| **Supabase Dashboard** | https://supabase.com/dashboard/project/jbxncejtcbpcronndqlx |
| **Production (Pending)** | https://truckopti.vercel.app (example) |
| **Database** | postgresql://...supabase.co |

---

## Support & Troubleshooting

### Common Issues

**404 on refresh:**
- Solution: Configure SPA fallback in hosting platform

**Auth callback fails:**
- Solution: Add production URL to Supabase redirect URLs

**CORS errors:**
- Solution: Add production URL to Supabase allowed origins

### Contact

For deployment issues, check:
1. Vercel/Netlify deployment logs
2. Browser console for errors
3. Supabase Auth logs in dashboard
