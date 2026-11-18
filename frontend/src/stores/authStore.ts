import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import type { Session, Subscription } from '@supabase/supabase-js'
import { logger } from '../utils/logger'
import type { LocalAgencyProfile } from '../services/localApi'

// Store the auth subscription for potential cleanup
let authSubscription: Subscription | null = null

/**
 * Remove the Supabase client's persisted session from browser storage.
 *
 * supabase-js only removes its stored session in signOut() when the server
 * revoke succeeds (or fails with 401/403/404); on an unreachable backend it
 * returns an error and keeps the session, which would resurrect the login on
 * the next boot. This mirrors the client's own storage keys (sb-*-auth-token,
 * sb-*-code-verifier) so offline logout still ends the session on this device.
 */
function clearPersistedSupabaseSession(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('sb-') && (key.endsWith('-auth-token') || key.endsWith('-code-verifier'))) {
        window.localStorage.removeItem(key)
      }
    }
  } catch (err) {
    logger.error('Error clearing persisted Supabase session:', err)
  }
}

interface AppUser {
  id: string
  email: string
  login_id?: string | null
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
    company?: {
      name?: string
      gstin?: string
      pan?: string
      address?: string
      address_line1?: string
      address_line2?: string
      city?: string
      state?: string
      pincode?: string
      [key: string]: string | undefined
    }
  }
}

interface AuthState {
  user: AppUser | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  pendingPhone: string | null
  /** 'local' = device-held agency profile (offline-first, no backend). Supabase flows untouched. */
  authMode: 'supabase' | 'local'
  /** Agency owner (every scope). Staff members are false; non-agency identities keep the default. */
  isAgencyOwner: boolean
  /** Active staff scopes of a non-owner agency member (dispatcher, fleet_manager, finance, viewer). */
  agencyScopes: string[]

  // Actions
  initialize: () => Promise<void>
  setUser: (user: AppUser) => void
  setSession: (session: Session | null) => void
  setPendingPhone: (phone: string | null) => void
  login: (user: AppUser, session: Session) => void
  loginLocal: (profile: LocalAgencyProfile) => void
  logout: () => Promise<void>
  updateUser: (updates: Partial<AppUser>) => void
  setIsLoading: (loading: boolean) => void
}

export interface AppAccess {
  role: string
  /** true for the agency owner (and for every non-agency identity, where it is not consulted). */
  isAgencyOwner: boolean
  /** Active staff scopes of a non-owner member; empty for an owner (owner = every scope). */
  agencyScopes: string[]
}

/**
 * Resolve the app role and agency access of a signed-in user.
 *
 * 'agency' is granted to the agency OWNER (transport_agencies.user_id) and to an
 * ACTIVE staff member of an operational agency (public.agency_memberships). RLS
 * (agency_memberships_select, 20261011000000) returns a member only their own
 * ACTIVE row while the agency is operational, so a revoked member or a member of
 * a suspended agency reads nothing here and falls through to a plain user.
 */
export async function resolveAppAccess(authUser: Session['user']): Promise<AppAccess> {
  try {
    const [roleResult, agencyResult, driverResult, memberResult] = await Promise.all([
      supabase
        .from('users')
        .select('role, login_id')
        .eq('id', authUser.id)
        .maybeSingle(),
      supabase
        .from('transport_agencies')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle(),
      supabase
        .from('drivers')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle(),
      supabase
        .from('agency_memberships')
        .select('scope')
        .eq('user_id', authUser.id)
        .eq('status', 'active'),
    ])

    if (roleResult.data?.role === 'admin') {
      return { role: 'admin', isAgencyOwner: true, agencyScopes: [] }
    }

    if (agencyResult.data?.id) {
      return { role: 'agency', isAgencyOwner: true, agencyScopes: [] }
    }

    const scopes = Array.isArray(memberResult?.data)
      ? Array.from(new Set((memberResult.data as Array<{ scope?: unknown }>)
        .map((row) => row.scope)
        .filter((scope): scope is string => typeof scope === 'string' && scope.length > 0)))
      : []
    if (scopes.length > 0) {
      return { role: 'agency', isAgencyOwner: false, agencyScopes: scopes }
    }

    if (driverResult.data?.id || roleResult.data?.role === 'driver') {
      return { role: 'driver', isAgencyOwner: true, agencyScopes: [] }
    }
  } catch (err) {
    logger.error('Error resolving app role:', err)
  }

  return { role: 'user', isAgencyOwner: true, agencyScopes: [] }
}

/**
 * Sync user profile to public.users table
 * Called on auth state change to ensure profile exists
 */
async function syncUserProfile(session: Session | null): Promise<{ user: AppUser; access: AppAccess } | null> {
  if (!session?.user) return null

  const authUser = session.user
  const metadata = authUser.user_metadata || {}

  // Determine if signed in via Google
  const isGoogleAuth = authUser.app_metadata?.provider === 'google' ||
    authUser.identities?.some(i => i.provider === 'google')

  // Upsert user profile WITHOUT role (never overwrite role via sync)
  const upsertData = {
    id: authUser.id,
    email: authUser.email || '',
    name: metadata.full_name || metadata.name || null,
    phone: authUser.phone || metadata.phone || null,
    phone_verified: !!authUser.phone_confirmed_at,
    google_linked: !!isGoogleAuth,
    profile_picture: metadata.avatar_url || metadata.picture || null,
  }

  try {
    // Upsert user profile to public.users — role column is NOT included so it is preserved
    const { error } = await supabase
      .from('users')
      .upsert(upsertData, {
        onConflict: 'id',
        ignoreDuplicates: false
      })

    if (error) {
      logger.error('Failed to sync user profile:', error)
    }
  } catch (err) {
    logger.error('Error syncing user profile:', err)
  }

  let loginId: string | null = null

  try {
    const { data } = await supabase
      .from('users')
      .select('login_id')
      .eq('id', authUser.id)
      .maybeSingle()

    loginId = data?.login_id ?? null
  } catch (err) {
    logger.error('Error loading user login ID:', err)
  }

  const access = await resolveAppAccess(authUser)

  const userData = {
    id: authUser.id,
    email: authUser.email || '',
    login_id: loginId,
    name: metadata.full_name || metadata.name || null,
    phone: authUser.phone || metadata.phone || null,
    phone_verified: !!authUser.phone_confirmed_at,
    google_linked: !!isGoogleAuth,
    profile_picture: metadata.avatar_url || metadata.picture || null,
    user_metadata: metadata,
    role: access.role
  }

  return { user: userData, access }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,
      pendingPhone: null,
      authMode: 'supabase',
      isAgencyOwner: true,
      agencyScopes: [],

      initialize: async () => {
        try {
          set({ isLoading: true })

          // Get current session (may fail when the backend is unreachable)
          const { data: { session }, error } = await supabase.auth.getSession()

          if (error) {
            // No verified cloud session: an unreachable or failing backend is
            // treated like "no session" so device-local access still works.
            logger.error('Error getting session:', error)
          }

          if (session) {
            // Sync user profile and get app user data
            const synced = await syncUserProfile(session)

            if (synced) {
              set({
                user: synced.user,
                isAgencyOwner: synced.access.isAgencyOwner,
                agencyScopes: synced.access.agencyScopes,
                session,
                isAuthenticated: true,
                isLoading: false
              })
            } else {
              set({ isLoading: false })
            }
          } else {
            // No Supabase session: resume a persisted local (offline-first)
            // session if one was established on this device.
            const { authMode, user } = get()
            if (authMode === 'local' && user) {
              set({ isAuthenticated: true, isLoading: false })
            } else {
              set({ isLoading: false, isAuthenticated: false })
            }
          }

          // Subscribe to auth state changes (only once)
          if (!authSubscription) {
            const { data: { subscription } } = supabase.auth.onAuthStateChange(
              async (event, session) => {
                logger.log('Auth state changed:', event)

                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                  if (session) {
                    const synced = await syncUserProfile(session)
                    if (synced) {
                      set({
                        user: synced.user,
                        isAgencyOwner: synced.access.isAgencyOwner,
                        agencyScopes: synced.access.agencyScopes,
                        session,
                        authMode: 'supabase',
                        isAuthenticated: true,
                        isLoading: false
                      })
                    }
                  }
                } else if (event === 'SIGNED_OUT') {
                  const { authMode, user } = get()
                  if (authMode === 'local' && user) {
                    // A Supabase sign-out (e.g. a revoked cloud token at boot)
                    // must not evict an active device-local session.
                    set({ session: null, isLoading: false })
                  } else {
                    set({
                      user: null,
                      session: null,
                      isAgencyOwner: true,
                      agencyScopes: [],
                      authMode: 'supabase',
                      isAuthenticated: false,
                      isLoading: false,
                      pendingPhone: null
                    })
                  }
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
        isAgencyOwner: true,
        agencyScopes: [],
        authMode: 'supabase',
        isAuthenticated: true,
        pendingPhone: null,
        isLoading: false
      }),

      loginLocal: (profile) => set({
        user: {
          id: `local:${profile.id}`,
          email: '',
          name: profile.contact_name || profile.company_name,
          phone: profile.contact_phone,
          phone_verified: false,
          google_linked: false,
          profile_picture: null,
          role: profile.role,
          user_metadata: { company: { name: profile.company_name } },
        },
        session: null,
        isAgencyOwner: true,
        agencyScopes: [],
        authMode: 'local',
        isAuthenticated: true,
        pendingPhone: null,
        isLoading: false
      }),

      logout: async () => {
        const clear = () => set({
          user: null,
          session: null,
          isAgencyOwner: true,
          agencyScopes: [],
          authMode: 'supabase',
          isAuthenticated: false,
          isLoading: false,
          pendingPhone: null
        })
        // Device-local sessions hold no Supabase session: logout is purely local.
        if (!get().session) {
          clear()
          return
        }
        try {
          const { error } = await supabase.auth.signOut()
          if (error) throw error
        } catch (err) {
          // Offline logout must still work: supabase-js keeps its stored
          // session when the revoke call fails, so clear it here too.
          logger.error('Error signing out:', err)
          clearPersistedSupabaseSession()
        }
        clear()
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
        authMode: state.authMode,
        isAgencyOwner: state.isAgencyOwner,
        agencyScopes: state.agencyScopes,
        // isAuthenticated intentionally excluded: hydrated as false on cold boot, set only after initialize() validates session
        pendingPhone: state.pendingPhone
      })
    }
  )
)
