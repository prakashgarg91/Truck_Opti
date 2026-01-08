import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jbxncejtcbpcronndqlx.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpieG5jZWp0Y2JwY3Jvbm5kcWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDk2MjIsImV4cCI6MjA4MzM4NTYyMn0.8GHh-LAeBx9RyQVjcJFbBiZrumfiqtUhe-NUedY3vqo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
