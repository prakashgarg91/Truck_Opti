import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const session = useAuthStore.getState().session
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// =============================================================================
// AUTH API
// =============================================================================

export const authApi = {
  // OTP Authentication
  sendOTP: async (phone: string, channel: 'sms' | 'whatsapp' | 'telegram' | 'email' | 'console' = 'sms') => {
    const { data } = await api.post('/auth/send-otp', { phone, channel })
    return data
  },
  
  verifyOTP: async (phone: string, otp: string) => {
    const { data } = await api.post('/auth/verify-otp', { phone, otp })
    return data
  },
  
  resendOTP: async (phone: string, channel: 'sms' | 'whatsapp' | 'telegram' | 'email' | 'console' = 'sms') => {
    const { data } = await api.post('/auth/resend-otp', { phone, channel })
    return data
  },
  
  getOTPStatus: async (phone: string) => {
    const { data } = await api.get('/auth/otp-status', { params: { phone } })
    return data
  },
  
  // Google OAuth
  getGoogleAuthUrl: async (includeLocation = false) => {
    const { data } = await api.get('/auth/google', { 
      params: { include_location: includeLocation } 
    })
    return data
  },
  
  googleCallback: async (code: string, state: string) => {
    const { data } = await api.post('/auth/google/callback', { code, state })
    return data
  },
  
  linkGoogle: async (code: string) => {
    const { data } = await api.post('/auth/google/link', { code })
    return data
  },
  
  unlinkGoogle: async () => {
    const { data } = await api.post('/auth/google/unlink')
    return data
  },
  
  // Profile
  getProfile: async () => {
    const { data } = await api.get('/auth/me')
    return data
  },
  
  updateProfile: async (updates: { name?: string; email?: string }) => {
    const { data } = await api.put('/auth/me', updates)
    return data
  },
  
  logout: async () => {
    const { data } = await api.post('/auth/logout')
    return data
  },
}

// =============================================================================
// TRUCKS API
// =============================================================================

export const trucksApi = {
  getAll: async (params?: { category?: string; available?: boolean }) => {
    const { data } = await api.get('/trucks', { params })
    return data
  },
  
  getById: async (id: number) => {
    const { data } = await api.get(`/trucks/${id}`)
    return data
  },
  
  create: async (truck: any) => {
    const { data } = await api.post('/trucks', truck)
    return data
  },
  
  update: async (id: number, truck: any) => {
    const { data } = await api.put(`/trucks/${id}`, truck)
    return data
  },
  
  delete: async (id: number) => {
    const { data } = await api.delete(`/trucks/${id}`)
    return data
  },
  
  getIndianTrucks: async () => {
    const { data } = await api.get('/trucks/indian-catalog')
    return data
  },
}

// =============================================================================
// CARTONS API
// =============================================================================

export const cartonsApi = {
  getAll: async (params?: { category?: string }) => {
    const { data } = await api.get('/cartons', { params })
    return data
  },
  
  getById: async (id: number) => {
    const { data } = await api.get(`/cartons/${id}`)
    return data
  },
  
  create: async (carton: any) => {
    const { data } = await api.post('/cartons', carton)
    return data
  },
  
  update: async (id: number, carton: any) => {
    const { data } = await api.put(`/cartons/${id}`, carton)
    return data
  },
  
  delete: async (id: number) => {
    const { data } = await api.delete(`/cartons/${id}`)
    return data
  },
}

// =============================================================================
// CUSTOMERS API
// =============================================================================

export const customersApi = {
  getAll: async () => {
    const { data } = await api.get('/customers')
    return data
  },
  
  getById: async (id: number) => {
    const { data } = await api.get(`/customers/${id}`)
    return data
  },
  
  create: async (customer: any) => {
    const { data } = await api.post('/customers', customer)
    return data
  },
  
  update: async (id: number, customer: any) => {
    const { data } = await api.put(`/customers/${id}`, customer)
    return data
  },
  
  delete: async (id: number) => {
    const { data } = await api.delete(`/customers/${id}`)
    return data
  },
}

// =============================================================================
// OPTIMIZATION API (3D Bin Packing)
// =============================================================================

export interface PackingRequest {
  truck_id: number
  cartons: Array<{
    carton_id: number
    quantity: number
  }>
  algorithm?: 'skyline' | 'genetic' | 'extreme_points'
  optimization_goal?: 'space' | 'weight_balance' | 'stability'
}

export const optimizationApi = {
  pack: async (request: PackingRequest) => {
    const { data } = await api.post('/optimization/pack', request)
    return data
  },
  
  getAlgorithms: async () => {
    const { data } = await api.get('/optimization/algorithms')
    return data
  },
  
  benchmark: async (request: PackingRequest) => {
    const { data } = await api.post('/optimization/benchmark', request)
    return data
  },
  
  getJob: async (jobId: string) => {
    const { data } = await api.get(`/optimization/jobs/${jobId}`)
    return data
  },
}

// =============================================================================
// LOCATION API
// =============================================================================

export const locationApi = {
  updateLocation: async (
    latitude: number, 
    longitude: number,
    options?: {
      accuracy?: number
      speed?: number
      heading?: number
      shipment_id?: string
    }
  ) => {
    const { data } = await api.post('/location/update', {
      latitude,
      longitude,
      ...options
    })
    return data
  },
  
  track: async (entityId: string, destination?: { lat: number; lng: number }) => {
    const params = destination 
      ? { dest_lat: destination.lat, dest_lng: destination.lng }
      : undefined
    const { data } = await api.get(`/location/track/${entityId}`, { params })
    return data
  },
  
  getHistory: async (entityId: string, since?: string, limit = 50) => {
    const { data } = await api.get(`/location/history/${entityId}`, {
      params: { since, limit }
    })
    return data
  },
  
  calculateETA: async (
    entityId: string, 
    destination: { lat?: number; lng?: number; city?: string }
  ) => {
    const { data } = await api.get('/location/eta', {
      params: {
        entity_id: entityId,
        dest_lat: destination.lat,
        dest_lng: destination.lng,
        dest_city: destination.city
      }
    })
    return data
  },
  
  createGeofence: async (geofence: {
    name: string
    latitude: number
    longitude: number
    radius_meters: number
    type?: string
  }) => {
    const { data } = await api.post('/location/geofence', geofence)
    return data
  },
  
  getIndianCities: async () => {
    const { data } = await api.get('/location/cities')
    return data
  },
}

// =============================================================================
// ROUTES API
// =============================================================================

export const routesApi = {
  getAll: async (params?: { status?: string }) => {
    const { data } = await api.get('/routes', { params })
    return data
  },
  
  getById: async (id: number) => {
    const { data } = await api.get(`/routes/${id}`)
    return data
  },
  
  optimize: async (request: {
    start_location: string
    destinations: string[]
    optimization_goal?: 'distance' | 'time' | 'cost'
    return_to_start?: boolean
  }) => {
    const { data } = await api.post('/routes/optimize', request)
    return data
  },
  
  getTollEstimate: async (routeId: number) => {
    const { data } = await api.get(`/routes/${routeId}/toll-estimate`)
    return data
  },
}

// =============================================================================
// SHIPMENTS API
// =============================================================================

export const shipmentsApi = {
  getAll: async (params?: { status?: string }) => {
    const { data } = await api.get('/shipments', { params })
    return data
  },
  
  getById: async (id: string) => {
    const { data } = await api.get(`/shipments/${id}`)
    return data
  },
  
  create: async (shipment: {
    customer_id: number
    route_id?: number
    items: Array<{ carton_type_id: number; quantity: number }>
  }) => {
    const { data } = await api.post('/shipments', shipment)
    return data
  },
  
  updateStatus: async (id: string, status: string) => {
    const { data } = await api.patch(`/shipments/${id}/status`, { status })
    return data
  },
}

export default api
