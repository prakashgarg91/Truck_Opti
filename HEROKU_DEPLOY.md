# Deploy TruckOpti to Heroku + Supabase

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────┐
│  Heroku         │────▶│  Supabase                    │
│  (Frontend)     │     │  ├── PostgreSQL (Database)   │
│  - React App    │     │  ├── Auth (Google/Email)     │
│  - Static Build │     │  ├── Storage (Files)         │
│  - Node Server  │     │  └── Realtime (WebSocket)    │
└─────────────────┘     └──────────────────────────────┘
       ↑
   User accesses
   truckopti.herokuapp.com
```

---

## Step 1: Prepare for Heroku Deployment

### 1.1 Create Required Files

Create `Procfile` in project root:
```
web: cd frontend && npm run build && npx serve -s dist -l $PORT
```

Or for a cleaner setup, create `app.json`:
```json
{
  "name": "TruckOpti",
  "description": "3D Smart Packing & Logistics for India",
  "repository": "https://github.com/yourusername/truckopti",
  "logo": "https://truckopti.herokuapp.com/pwa-192x192.png",
  "keywords": ["react", "supabase", "logistics", "3d-packing"],
  "buildpacks": [
    {
      "url": "https://github.com/heroku/heroku-buildpack-nodejs"
    }
  ],
  "env": {
    "VITE_SUPABASE_URL": {
      "description": "Supabase Project URL",
      "required": true
    },
    "VITE_SUPABASE_ANON_KEY": {
      "description": "Supabase Anon Key",
      "required": true
    },
    "VITE_APP_URL": {
      "description": "Heroku App URL",
      "required": true
    }
  }
}
```

---

## Step 2: Deploy to Heroku

### Option A: Heroku CLI

```bash
# Login to Heroku
heroku login

# Create new app
heroku create truckopti

# Set environment variables
heroku config:set VITE_SUPABASE_URL=https://jbxncejtcbpcronndqlx.supabase.co
heroku config:set VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDk2MjIsImV4cCI6MjA4MzM4NTYyMn0.8GHh-LAeBx9RyQVjcJFbBiZrumfiqtUhe-NUedY3vqo
heroku config:set VITE_APP_URL=https://truckopti.herokuapp.com

# Deploy
git add .
git commit -m "Heroku deployment"
git push heroku main
```

### Option B: Heroku Dashboard

1. Go to https://dashboard.heroku.com/new-app
2. App name: `truckopti`
3. Region: Choose closest to India (Europe or US)
4. Click **Create app**

**Add Buildpack:**
1. Go to Settings tab
2. Add buildpack: `heroku/nodejs`

**Set Environment Variables:**
1. Go to Settings tab → Config Vars
2. Add:
   - `VITE_SUPABASE_URL`: `https://jbxncejtcbpcronndqlx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDk2MjIsImV4cCI6MjA4MzM4NTYyMn0.8GHh-LAeBx9RyQVjcJFbBiZrumfiqtUhe-NUedY3vqo`
   - `VITE_APP_URL`: `https://truckopti.herokuapp.com`

**Deploy:**
1. Go to Deploy tab
2. Connect GitHub repository
3. Enable Automatic Deploys (optional)
4. Click **Deploy Branch**

---

## Step 3: Configure Static Build for Heroku

### Option 1: Serve (Simplest)

Create `package.json` in project root:
```json
{
  "name": "truckopti",
  "version": "1.0.0",
  "scripts": {
    "heroku-postbuild": "cd frontend && npm install && npm run build",
    "start": "cd frontend/dist && npx serve -l $PORT"
  },
  "dependencies": {
    "serve": "^14.0.0"
  }
}
```

Create `Procfile`:
```
web: npm start
```

### Option 2: Express Server (More Control)

Create `server.js` in project root:
```javascript
const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Update `package.json`:
```json
{
  "name": "truckopti",
  "version": "1.0.0",
  "scripts": {
    "heroku-postbuild": "cd frontend && npm install && npm run build",
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

---

## Step 4: Configure Supabase Auth

1. Go to: https://supabase.com/dashboard/project/jbxncejtcbpcronndqlx/auth/url-configuration
2. Add your Heroku URL to **Redirect URLs**:
   ```
   https://truckopti.herokuapp.com/auth/callback
   ```
3. Click **Save**

---

## Step 5: Test Deployment

```bash
# Open app
heroku open

# View logs
heroku logs --tail
```

---

## Heroku + Supabase Cost

| Service | Free Tier | Paid (Hobby) |
|---------|-----------|--------------|
| **Heroku** | 550 dyno hours/month | $7/month |
| **Supabase** | 500MB database, 2GB bandwidth | $25/month |

**Free tier is enough to start!**

---

## Troubleshooting

### Build fails
```bash
# Check logs
heroku logs --tail

# Rebuild
heroku builds:cancel
git commit --allow-empty -m "Rebuild"
git push heroku main
```

### 404 errors on refresh
Make sure SPA fallback is configured in `server.js` or use `serve` with `-s` flag.

### Auth callback fails
Verify Supabase redirect URL includes `https://your-app.herokuapp.com/auth/callback`

---

## Deploy Now!

```bash
# Quick deploy
git add .
git commit -m "Heroku deployment"
git push heroku main
```

**Your app will be live at: https://truckopti.herokuapp.com** 🚀
