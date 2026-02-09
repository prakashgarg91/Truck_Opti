import { supabase } from '../lib/supabase'

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
  state: string
  pincode: string
  gst_number: string | null
  created_at?: string
  updated_at?: string
}

export interface Shipment {
  id: string
  shipment_id: string
  customer_id: string
  truck_id: string
  origin: string
  destination: string
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled'
  total_weight: number
  total_volume: number
  estimated_cost: number
  driver_name: string | null
  vehicle_number: string | null
  latitude: number | null
  longitude: number | null
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
  async signInWithPhone(phone: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms'
      }
    })
    if (error) throw error
  },

  async verifyOtp(phone: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms'
    })
    if (error) throw error
    return data
  },

  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    if (error) throw error
    return data
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
