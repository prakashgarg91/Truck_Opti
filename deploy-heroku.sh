#!/bin/bash

# TruckOpti Heroku Deployment Script
# Usage: ./deploy-heroku.sh [app-name]

APP_NAME=${1:-truckopti}

echo "🚀 Deploying TruckOpti to Heroku..."
echo ""

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found. Installing..."
    npm install -g heroku
fi

# Login to Heroku
echo "🔑 Logging in to Heroku..."
heroku login

# Create Heroku app if it doesn't exist
echo "📦 Creating Heroku app: $APP_NAME"
heroku create $APP_NAME 2>/dev/null || echo "App already exists, continuing..."

# Set environment variables
echo "⚙️  Setting environment variables..."
heroku config:set VITE_SUPABASE_URL=https://jbxncejtcbpcronndqlx.supabase.co --app $APP_NAME
heroku config:set VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDk2MjIsImV4cCI6MjA4MzM4NTYyMn0.8GHh-LAeBx9RyQVjcJFbBiZrumfiqtUhe-NUedY3vqo --app $APP_NAME
heroku config:set VITE_APP_URL=https://$APP_NAME.herokuapp.com --app $APP_NAME

# Deploy
echo "📤 Deploying to Heroku..."
git add .
git commit -m "Heroku deployment $(date)" --allow-empty
git push heroku main

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your app: https://$APP_NAME.herokuapp.com"
echo ""
echo "⚠️  IMPORTANT: Update Supabase Auth redirect URL:"
echo "https://supabase.com/dashboard/project/jbxncejtcbpcronndqlx/auth/url-configuration"
echo ""
echo "Add this URL:"
echo "https://$APP_NAME.herokuapp.com/auth/callback"
