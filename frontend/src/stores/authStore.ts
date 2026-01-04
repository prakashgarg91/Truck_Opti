import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  email: string
  name: string | null
  phone_number: string | null
  phone_verified: boolean
  google_linked: boolean
  profile_picture: string | null
  role: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  pendingPhone: string | null
  
  // Actions
  setUser: (user: User) => void
  setToken: (token: string) => void
  setPendingPhone: (phone: string) => void
  login: (user: User, token: string) => void
  logout: () => void
  updateUser: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      pendingPhone: null,
      
      setUser: (user) => set({ user, isAuthenticated: true }),
      
      setToken: (token) => set({ token }),
      
      setPendingPhone: (phone) => set({ pendingPhone: phone }),
      
      login: (user, token) => set({ 
        user, 
        token, 
        isAuthenticated: true,
        pendingPhone: null 
      }),
      
      logout: () => set({ 
        user: null, 
        token: null, 
        isAuthenticated: false,
        pendingPhone: null 
      }),
      
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null
      })),
    }),
    {
      name: 'truckopti-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
