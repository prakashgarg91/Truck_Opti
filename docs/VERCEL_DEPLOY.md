# Deploy to Vercel (Supabase Backend + Vercel Frontend)

## Architecture

| Layer | Platform | Purpose |
|-------|----------|---------|
| **Frontend** | Vercel | React app, 3D packing, UI |
| **Backend** | Supabase | Database, Auth, Storage |
| **Realtime** | Supabase | Live tracking |

---

## Step 1: Deploy to Vercel (2 minutes)

### Option A: Vercel Dashboard (Easiest)

1. Go to **https://vercel.com/new**
2. Import your GitHub repository
3. Configure:
   - **Framework Preset:** Vite
   - **Build Command:** `cd frontend && npm run build`
   - **Output Directory:** `frontend/dist`
   - **Install Command:** `cd frontend && npm install`
4. Click **Deploy**
5. Copy your URL (e.g., `https://truckopti.vercel.app`)

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login (opens browser)
vercel login

# Deploy
cd frontend/dist
vercel --prod
```

---

## Step 2: Add Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDk2MjIsImV4cCI6MjA4MzM4NTYyMn0.8GHh-LAeBx9RyQVjcJFbBiZrumfiqtUhe-NUedY3vqo
VITE_APP_URL=https://your-domain.vercel.app
```

---

## Step 3: Configure Supabase Auth

1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_REF/auth/url-configuration
2. Add your Vercel URL to **Redirect URLs**:
   ```
   https://truckopti.vercel.app/auth/callback
   ```
3. Click **Save**

---

## Step 4: Test Live Site

- [ ] Open `https://your-domain.vercel.app`
- [ ] Click "Continue with Google" → Login
- [ ] Navigate to Packing → Add items → See 3D
- [ ] Test on mobile

---

## Why This Architecture?

| Feature | Supabase | Vercel |
|---------|----------|--------|
| Database | ✅ PostgreSQL | ❌ |
| Auth | ✅ Built-in | ❌ |
| React Hosting | ❌ | ✅ Optimized |
| Global CDN | ❌ | ✅ Edge network |
| 3D/Maps | ❌ | ✅ Works perfectly |
| **Price** | **Free tier** | **Free tier** |

**Both have generous free tiers - perfect for starting!**

---

## Your Live URLs After Deploy

| Service | URL | Status |
|---------|-----|--------|
| **Frontend** | https://truckopti.vercel.app | Deploy here |
| **Database** | https://supabase.com/dashboard/project/YOUR_PROJECT_REF | Set your active project |
| **Auth** | Built-in | ✅ Ready |

---

## 🚀 Deploy Now!

**Go to https://vercel.com/new and deploy in 2 minutes!**
