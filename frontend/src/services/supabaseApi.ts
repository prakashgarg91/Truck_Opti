import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

const getAuthErrorMessage = (
  error: { code?: string; message?: string } | null | undefined,
  fallback: string
): string => {
  const code = error?.code
  const message = error?.message?.toLowerCase() || ''

  if (code === 'otp_disabled') {
    return 'Email OTP is not enabled for this project. Please use Google sign-in or ask admin to enable OTP signups.'
  }

  if (code === 'email_address_invalid') {
    return 'Please enter a valid deliverable email address.'
  }

  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || message.includes('rate limit')) {
    return 'Too many OTP requests. Please wait a minute and try again.'
  }

  if (message.includes('signup is disabled')) {
    return 'Email signup is currently unavailable. Please use Google sign-in or contact support.'
  }

  return fallback
}

const getSafeAuthFailureMessage = (error: unknown, fallback: string): string => {
  if (error instanceof UserFacingError) {
    return error.message
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  const lowered = message.toLowerCase()

  if (
    lowered.includes('failed to fetch') ||
    lowered.includes('networkerror') ||
    lowered.includes('network request failed') ||
    lowered.includes('err_name_not_resolved') ||
    lowered.includes('load failed')
  ) {
    return 'Authentication service is currently unreachable. Please try again shortly or use Google sign-in if available.'
  }

  if (lowered.includes('expired') && (lowered.includes('otp') || lowered.includes('token'))) {
    return 'This verification code has expired. Please request a new one.'
  }

  if (
    (lowered.includes('invalid otp') || lowered.includes('invalid token')) ||
    (lowered.includes('token') && lowered.includes('invalid'))
  ) {
    return 'The verification code is invalid. Please try again.'
  }

  return fallback
}

// ============= TYPES =============
export interface Truck {
  id: string
  name: string
  name_hi: string
  length: number
  width: number
  height: number
  capacity: number
  cost_per_km: number
  available: number
  created_at?: string
  updated_at?: string
}

export interface Carton {
  id: string
  name: string
  length: number
  width: number
  height: number
  weight: number
  fragile: boolean
  stackable: boolean
  created_at?: string
  updated_at?: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  address: string
  city: string
  state?: string
  pincode?: string
  gst_number?: string | null
  created_at?: string
  updated_at?: string
  created_by?: string
}

export interface Shipment {
  id: string
  shipment_id: string
  customer_id: string
  created_by?: string
  truck_id: string
  origin: string
  destination: string
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled'
  total_weight: number
  total_volume: number
  estimated_cost: number
  driver_name: string | null
  driver_phone: string | null
  vehicle_number: string | null
  latitude: number | null
  longitude: number | null
  sale_order_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface Route {
  id: string
  name: string
  start_location: string
  destinations: string[]
  total_distance: number
  total_time: number
  total_cost: number
  toll_cost: number
  fuel_cost: number
  status: 'planned' | 'active' | 'completed'
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface PackingResult {
  id: string
  shipment_id: string | null
  truck_id: string
  algorithm: string
  items_packed: number
  total_items: number
  volume_utilization: number
  weight_utilization: number
  packed_boxes: object
  unfit_items: string[]
  created_by?: string
  created_at?: string
}

// ============= TRUCKS API =============
export const trucksSupabaseApi = {
  async getAll(): Promise<Truck[]> {
    const { data, error } = await supabase
      .from('trucks')
      .select('*')
      .order('name')
    if (error) throw error
    return (data as Truck[]) || []
  },

  async getById(id: string): Promise<Truck | null> {
    const { data, error } = await supabase
      .from('trucks')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Truck
  },

  async create(truck: Omit<Truck, 'id' | 'created_at' | 'updated_at'>): Promise<Truck> {
    const { data, error } = await supabase
      .from('trucks')
      .insert(truck)
      .select()
      .single()
    if (error) throw error
    return data as Truck
  },

  async update(id: string, truck: Partial<Truck>): Promise<Truck> {
    const { data, error } = await supabase
      .from('trucks')
      .update(truck)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Truck
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('trucks')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// ============= CARTONS API =============
export const cartonsSupabaseApi = {
  async getAll(): Promise<Carton[]> {
    const { data, error } = await supabase
      .from('cartons')
      .select('*')
      .order('name')
    if (error) throw error
    return (data as Carton[]) || []
  },

  async getById(id: string): Promise<Carton | null> {
    const { data, error } = await supabase
      .from('cartons')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Carton
  },

  async create(carton: Omit<Carton, 'id' | 'created_at' | 'updated_at'>): Promise<Carton> {
    const { data, error } = await supabase
      .from('cartons')
      .insert(carton)
      .select()
      .single()
    if (error) throw error
    return data as Carton
  },

  async update(id: string, carton: Partial<Carton>): Promise<Carton> {
    const { data, error } = await supabase
      .from('cartons')
      .update(carton)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Carton
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('cartons')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// ============= CUSTOMERS API =============
export const customersSupabaseApi = {
  async getAll(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name')
    if (error) throw error
    return (data as Customer[]) || []
  },

  async getById(id: string): Promise<Customer | null> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Customer
  },

  async create(customer: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .insert(customer)
      .select()
      .single()
    if (error) throw error
    return data as Customer
  },

  async update(id: string, customer: Partial<Customer>): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .update(customer)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Customer
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async search(query: string): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%,city.ilike.%${query}%`)
      .order('name')
    if (error) throw error
    return (data as Customer[]) || []
  }
}

// ============= SHIPMENTS API =============
export const shipmentsSupabaseApi = {
  async getAll(filters?: { status?: string }): Promise<Shipment[]> {
    let query = supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    
    const { data, error } = await query
    if (error) throw error
    return (data as Shipment[]) || []
  },

  async getById(id: string): Promise<Shipment | null> {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Shipment
  },

  async create(shipment: Omit<Shipment, 'id' | 'created_at' | 'updated_at'>): Promise<Shipment> {
    const { data, error } = await supabase
      .from('shipments')
      .insert(shipment)
      .select()
      .single()
    if (error) throw error
    return data as Shipment
  },

  async updateStatus(id: string, status: Shipment['status']): Promise<Shipment> {
    const { data, error } = await supabase
      .from('shipments')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Shipment
  },

  async updateLocation(id: string, latitude: number, longitude: number): Promise<Shipment> {
    const { data, error } = await supabase
      .from('shipments')
      .update({ latitude, longitude })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Shipment
  },

  async update(id: string, data: Partial<Shipment>): Promise<Shipment> {
    const { data: result, error } = await supabase
      .from('shipments')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return result as Shipment
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// ============= ROUTES API =============
export const routesSupabaseApi = {
  async getAll(): Promise<Route[]> {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as Route[]) || []
  },

  async getById(id: string): Promise<Route | null> {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Route
  },

  async create(route: Omit<Route, 'id' | 'created_at' | 'updated_at'>): Promise<Route> {
    const { data, error } = await supabase
      .from('routes')
      .insert(route)
      .select()
      .single()
    if (error) throw error
    return data as Route
  },

  async update(id: string, route: Partial<Route>): Promise<Route> {
    const { data, error } = await supabase
      .from('routes')
      .update(route)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Route
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('routes')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// ============= PACKING RESULTS API =============
export const packingSupabaseApi = {
  async saveResult(result: Omit<PackingResult, 'id' | 'created_at'>): Promise<PackingResult> {
    const { data, error } = await supabase
      .from('packing_results')
      .insert(result)
      .select()
      .single()
    if (error) throw error
    return data as PackingResult
  },

  async getHistory(limit = 10): Promise<PackingResult[]> {
    const { data, error } = await supabase
      .from('packing_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as PackingResult[]) || []
  }
}

// ============= AUTH API (Supabase Auth) =============
export const authSupabaseApi = {
  async signInWithPhone(phone: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<void> {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          channel
        }
      })
      if (error) {
        // Provide user-friendly message when phone/SMS provider is not configured
        if (
          error.message?.toLowerCase().includes('provider') ||
          error.message?.toLowerCase().includes('sms') ||
          (error as any).code === 'phone_provider_disabled' ||
          error.message?.toLowerCase().includes('not set up') ||
          error.message?.toLowerCase().includes('phone sign')
        ) {
          throw new UserFacingError(
            'Phone OTP is currently unavailable. Please use Email OTP or Google sign-in instead.'
          )
        }
        throw error
      }
    } catch (error) {
      throw new UserFacingError(
        getSafeAuthFailureMessage(
          error,
          'Unable to start phone verification right now. Please try again later or use another sign-in method.'
        )
      )
    }
  },

  async signInWithEmail(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false // Login only - don't create new users
        }
      })
      if (error) throw new UserFacingError(getAuthErrorMessage(error, 'Unable to send email OTP right now. Please try again later or use Google sign-in.'))
    } catch (error) {
      throw new UserFacingError(
        getSafeAuthFailureMessage(
          error,
          'Unable to send email OTP right now. Please try again later or use Google sign-in.'
        )
      )
    }
  },

  async signUpWithEmail(email: string, name?: string): Promise<void> {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: name ? { full_name: name, name } : undefined
        }
      })
      if (error) throw new UserFacingError(getAuthErrorMessage(error, 'Unable to start email signup right now. Please try again later or use Google sign-up.'))
    } catch (error) {
      throw new UserFacingError(
        getSafeAuthFailureMessage(
          error,
          'Unable to start email signup right now. Please try again later or use Google sign-up.'
        )
      )
    }
  },

  async verifyPhoneOtp(phone: string, token: string) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms'
      })
      if (error) throw error
      return data
    } catch (error) {
      throw new UserFacingError(
        getSafeAuthFailureMessage(
          error,
          'Unable to verify phone OTP right now. Please request a fresh code or try another sign-in method.'
        )
      )
    }
  },

  async verifyEmailOtp(email: string, token: string) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email'
      })
      if (error) throw error
      return data
    } catch (error) {
      throw new UserFacingError(
        getSafeAuthFailureMessage(
          error,
          'Unable to verify email OTP right now. Please request a fresh code or try Google sign-in.'
        )
      )
    }
  },

  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })
      if (error) throw error
      return data
    } catch (error) {
      throw new UserFacingError(
        getSafeAuthFailureMessage(
          error,
          'Unable to start Google sign-in right now. Please try again later.'
        )
      )
    }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    return data.user
  },

  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// ============= PACKING JOBS API =============
export interface PackingJob {
  id?: string
  user_id: string
  truck_id?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  items: PackingJobItem[]
  volume_utilization: number
  weight_utilization: number
  total_cost: number
  algorithm: string
  optimization_goal: string
  result_data?: object
  created_at?: string
  updated_at?: string
}

export interface PackingJobItem {
  id?: string
  job_id?: string
  name: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  fragile: boolean
  stackable: boolean
  category?: string
  position_x?: number
  position_y?: number
  position_z?: number
  rotation?: string
  is_packed?: boolean
}

export const packingJobsSupabaseApi = {
  async createJob(job: Omit<PackingJob, 'id' | 'created_at' | 'updated_at'>): Promise<PackingJob> {
    const { data, error } = await supabase
      .from('packing_jobs')
      .insert(job)
      .select()
      .single()
    if (error) throw error
    return data as PackingJob
  },

  async addJobItems(items: Omit<PackingJobItem, 'id'>[]): Promise<PackingJobItem[]> {
    const { data, error } = await supabase
      .from('packing_items')
      .insert(items)
      .select()
    if (error) throw error
    return data as PackingJobItem[]
  },

  async getUserJobs(limit = 10): Promise<PackingJob[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    
    const { data, error } = await supabase
      .from('packing_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as PackingJob[]) || []
  },

  async getJobItems(jobId: string): Promise<PackingJobItem[]> {
    const { data, error } = await supabase
      .from('packing_items')
      .select('*')
      .eq('job_id', jobId)
    if (error) throw error
    return (data as PackingJobItem[]) || []
  },

  async updateJob(id: string, data: Partial<PackingJob>): Promise<PackingJob> {
    const { data: result, error } = await supabase
      .from('packing_jobs')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return result as PackingJob
  },

  async deleteJob(id: string): Promise<void> {
    await supabase.from('packing_items').delete().eq('job_id', id)
    const { error } = await supabase
      .from('packing_jobs')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// ============= NOTIFICATIONS API =============
export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  is_read: boolean
  action_url?: string
  action_label?: string
  created_at: string
  read_at?: string
}

export const notificationsSupabaseApi = {
  async create(notification: { title: string; message: string; type: Notification['type']; action_url?: string; action_label?: string }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { error } = await supabase
      .from('notifications')
      .insert({ ...notification, user_id: user.id, is_read: false })
    if (error) throw error
  },

  async getUnreadCount(): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    if (error) throw error
    return count || 0
  },

  async getNotifications(limit = 20): Promise<Notification[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as Notification[]) || []
  },

  async markAsRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async markAllAsRead(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false)
    if (error) throw error
  },

  async clearAll(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id)
    if (error) throw error
  },

  subscribeToNotifications(userId: string, callback: (payload: unknown) => void) {
    return supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, 
        callback
      )
      .subscribe()
  },

  unsubscribe(channel: ReturnType<typeof supabase.channel>) {
    supabase.removeChannel(channel)
  }
}

// ============= ANALYTICS EVENTS API =============
export interface AnalyticsEvent {
  id?: string
  user_id?: string
  event_type: string
  event_data?: object
  session_id?: string
  created_at?: string
}

export const analyticsSupabaseApi = {
  async trackEvent(event: Omit<AnalyticsEvent, 'id' | 'created_at'>): Promise<void> {
    const { error } = await supabase
      .from('analytics_events')
      .insert(event)
    if (error) throw error
  },

  async getWeeklyPackingCounts(): Promise<{ day: string; count: number }[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const { data, error } = await supabase
      .from('packing_jobs')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
    
    if (error) throw error
    
    // Group by day
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const counts = days.map(day => ({ day, count: 0 }))
    
    data?.forEach((job: any) => {
      const date = new Date(job.created_at)
      const dayIndex = date.getDay()
      counts[dayIndex].count++
    })
    
    return counts
  },

  async getRecentActivity(limit = 5): Promise<AnalyticsEvent[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    
    const { data, error } = await supabase
      .from('analytics_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as AnalyticsEvent[]) || []
  }
}

// ============= SALE ORDER TYPES =============
export interface SaleOrder {
  id: string
  order_number: string
  customer_id: string | null
  customer_name?: string
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
  total_items: number
  total_weight: number
  total_volume: number
  delivery_city: string
  created_at?: string
  updated_at?: string
}

export interface SaleOrderItem {
  id: string
  order_id: string
  product_code?: string
  product_name: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  created_at?: string
}

// ============= SALE ORDERS API =============
export const saleOrdersSupabaseApi = {
  async getAll(): Promise<SaleOrder[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    
    const { data, error } = await supabase
      .from('sale_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as SaleOrder[]) || []
  },

  async getById(id: string): Promise<(SaleOrder & { items: SaleOrderItem[] }) | null> {
    const { data: order, error: orderError } = await supabase
      .from('sale_orders')
      .select('*')
      .eq('id', id)
      .single()
    if (orderError) throw orderError
    
    const { data: items, error: itemsError } = await supabase
      .from('sale_order_items')
      .select('*')
      .eq('order_id', id)
    if (itemsError) throw itemsError
    
    return { ...order, items: items || [] } as SaleOrder & { items: SaleOrderItem[] }
  },

  async create(order: Omit<SaleOrder, 'id' | 'created_at' | 'updated_at'>, items: Omit<SaleOrderItem, 'id' | 'created_at' | 'order_id'>[]): Promise<SaleOrder> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    
    // Create order
    const { data: newOrder, error: orderError } = await supabase
      .from('sale_orders')
      .insert({ ...order, user_id: user.id })
      .select()
      .single()
    if (orderError) throw orderError
    
    // Create items
    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('sale_order_items')
        .insert(items.map(item => ({
          ...item,
          order_id: newOrder.id,
          product_code: item.product_name.toUpperCase().replace(/\s+/g, '-').slice(0, 20)
        })))
      if (itemsError) throw itemsError
    }
    
    return newOrder as SaleOrder
  },

  async updateStatus(id: string, status: SaleOrder['status']): Promise<SaleOrder> {
    const { data, error } = await supabase
      .from('sale_orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as SaleOrder
  },

  async delete(id: string): Promise<void> {
    // Items will be deleted via cascade
    const { error } = await supabase
      .from('sale_orders')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async getRecent(limit = 3): Promise<SaleOrder[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    
    const { data, error } = await supabase
      .from('sale_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as SaleOrder[]) || []
  }
}

// ============= REALTIME SUBSCRIPTIONS =============
export const realtimeSupabase = {
  subscribeToShipments(callback: (payload: unknown) => void) {
    return supabase
      .channel('shipments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, callback)
      .subscribe()
  },

  subscribeToTrucks(callback: (payload: unknown) => void) {
    return supabase
      .channel('trucks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trucks' }, callback)
      .subscribe()
  },

  unsubscribe(channel: ReturnType<typeof supabase.channel>) {
    supabase.removeChannel(channel)
  }
}
