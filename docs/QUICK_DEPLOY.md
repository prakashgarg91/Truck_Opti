# Quick Deploy Guide

## Your Build is Ready! 🚀

**Location:** `frontend/dist/` (14.79 MB)

---

## Fastest Deploy: Surge.sh (30 seconds)

```bash
cd frontend/dist
npx surge
```

Follow the prompts. Your site will be live at `https://your-name.surge.sh`

---

## Best Deploy: Vercel (2 minutes)

1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Set:
   - Build: `cd frontend && npm run build`
   - Output: `frontend/dist`
4. Add env vars (see below)
5. Deploy

---

## Environment Variables

Add these to your hosting platform:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDk2MjIsImV4cCI6MjA4MzM4NTYyMn0.8GHh-LAeBx9RyQVjcJFbBiZrumfiqtUhe-NUedY3vqo
VITE_APP_URL=https://your-domain.com
```

---

## Important: Update Supabase

After deploying, go to:
https://supabase.com/dashboard/project/YOUR_PROJECT_REF/auth/url-configuration

Add your production URL:
```
https://your-domain.com/auth/callback
```

---

## Test Your Deployed App

1. **Login:** Try Google OAuth and Email OTP
2. **Packing:** Add items → Find Best Truck → See 3D
3. **Routes:** Create Mumbai → Delhi route
4. **Mobile:** Test on your phone

---

## 🎯 You're Ready to Sell!

Deploy and start marketing!
