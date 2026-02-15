import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import type { Session, Subscription } from '@supabase/supabase-js'
import { logger } from '../utils/logger'

// Store the auth subscription for potential cleanup
let authSubscription: Subscription | null = null

interface AppUser {
  id: string
  email: string
  name: string | null
  phone: string | null
  phone_verified: boolean
  google_linked: boolean
  profile_picture: string | null
  role: string
  user_metadata?: {
    avatar_url?: string
    full_name?: string
    location_sharing?: boolean
    notification_prefs?: {
      sms: boolean
      push: boolean
      email: boolean
    }
  }
}

interface AuthState {
  user: AppUser | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  pendingPhone: string | null
  
  // Actions
  initialize: () => Promise<void>
  setUser: (user: AppUser) => void
  setSession: (session: Session | null) => void
  setPendingPhone: (phone: string | null) => void
  login: (user: AppUser, session: Session) => void
  logout: () => Promise<void>
  updateUser: (updates: Partial<AppUser>) => void
  setIsLoading: (loading: boolean) => void
}

/**
 * Sync user profile to public.users table
 * Called on auth state change to ensure profile exists
 */
async function syncUserProfile(session: Session | null): Promise<AppUser | null> {
  if (!session?.user) return null
  
  const authUser = session.user
  const metadata = authUser.user_metadata || {}
  
  // Determine if signed in via Google
  const isGoogleAuth = authUser.app_metadata?.provider === 'google' || 
                       authUser.identities?.some(i => i.provider === 'google')
  
  const userData = {
    id: authUser.id,
    email: authUser.email || '',
    name: metadata.full_name || metadata.name || null,
    phone: authUser.phone || metadata.phone || null,
    phone_verified: !!authUser.phone_confirmed_at,
    google_linked: !!isGoogleAuth,
    profile_picture: metadata.avatar_url || metadata.picture || null,
    role: 'user' as const
  }
  
  try {
    // Upsert user profile to public.users table
    const { error } = await supabase
      .from('users')
      .upsert(userData, { 
        onConflict: 'id',
        ignoreDuplicates: false // Update on conflict
      })
    
    if (error) {
      logger.error('Failed to sync user profile:', error)
    }
  } catch (err) {
    logger.error('Error syncing user profile:', err)
  }
  
  return userData
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,
      pendingPhone: null,
      
      initialize: async () => {
        try {
          set({ isLoading: true })
          
          // Get current session
          const { data: { session }, error } = await supabase.auth.getSession()
          
          if (error) {
            logger.error('Error getting session:', error)
            set({ isLoading: false, isAuthenticated: false })
            return
          }
          
          if (session) {
            // Sync user profile and get app user data
            const appUser = await syncUserProfile(session)
            
            if (appUser) {
              set({
                user: appUser,
                session,
                isAuthenticated: true,
                isLoading: false
              })
            } else {
              set({ isLoading: false })
            }
          } else {
            set({ isLoading: false, isAuthenticated: false })
          }
          
          // Subscribe to auth state changes (only once)
          if (!authSubscription) {
            const { data: { subscription } } = supabase.auth.onAuthStateChange(
              async (event, session) => {
                logger.log('Auth state changed:', event)

                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                  if (session) {
                    const appUser = await syncUserProfile(session)
                    if (appUser) {
                      set({
                        user: appUser,
                        session,
                        isAuthenticated: true,
                        isLoading: false
                      })
                    }
                  }
                } else if (event === 'SIGNED_OUT') {
                  set({
                    user: null,
                    session: null,
                    isAuthenticated: false,
                    isLoading: false,
                    pendingPhone: null
                  })
                }
              }
            )
            authSubscription = subscription
          }
        } catch (err) {
          logger.error('Error initializing auth:', err)
          set({ isLoading: false, isAuthenticated: false })
        }
      },
      
      setUser: (user) => set({ user, isAuthenticated: true }),
      
      setSession: (session) => set({ session }),
      
      setPendingPhone: (phone) => set({ pendingPhone: phone }),
      
      login: (user, session) => set({ 
        user, 
        session,
        isAuthenticated: true,
        pendingPhone: null,
        isLoading: false
      }),
      
      logout: async () => {
        try {
          const { error } = await supabase.auth.signOut()
          if (error) throw error
          
          set({ 
            user: null, 
            session: null,
            isAuthenticated: false,
            isLoading: false,
            pendingPhone: null
          })
        } catch (err) {
          logger.error('Error signing out:', err)
          throw err
        }
      },
      
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null
      })),
      
      setIsLoading: (loading) => set({ isLoading: loading })
    }),
    {
      name: 'truckopti-auth',
      partialize: (state) => ({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
        pendingPhone: state.pendingPhone
      })
    }
  )
)
