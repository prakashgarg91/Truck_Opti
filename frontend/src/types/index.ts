// User & Authentication Types
export interface User {
  id: string
  name: string
  email: string
  phone_number?: string
  phone_verified: boolean
  google_id?: string
  location_sharing_enabled: boolean
  company?: string
  role: 'admin' | 'agency' | 'driver' | 'user'
  created_at: string
  last_login?: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  pendingPhone?: string
}

// OTP Types
export interface OTPRequest {
  phone_number: string
  channel?: 'sms' | 'whatsapp'
}

export interface OTPVerifyRequest {
  phone_number: string
  otp: string
}

export interface OTPResponse {
  message: string
  phone_number: string
  expires_in: number
}

// Truck Types (Indian Truck Catalog)
export interface TruckDimensions {
  length: number  // in meters
  width: number
  height: number
}

export interface Truck {
  id: string
  name: string
  manufacturer: string
  model: string
  dimensions: TruckDimensions
  max_weight: number  // in kg
  volume: number      // in cubic meters
  category: 'LCV' | 'ICV' | 'HCV' | 'MCV'
  axle_config: string
  fuel_type: 'diesel' | 'cng' | 'electric'
  image_url?: string
}

// Carton/Item Types
export interface Carton {
  id: string
  name: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  color?: string
  fragile?: boolean
  stackable?: boolean
  rotatable?: boolean
}

// 3D Packing Types
export interface PackingPosition {
  x: number
  y: number
  z: number
}

export interface PackedItem extends Carton {
  position: PackingPosition
  rotation: [number, number, number]
}

export interface PackingResult {
  id: string
  truck: Truck
  items: PackedItem[]
  utilization: number
  algorithm: string
  weight_used: number
  volume_used: number
  unpacked_items: Carton[]
  created_at: string
}

// Route Types
export interface Location {
  latitude: number
  longitude: number
  address?: string
  city?: string
  state?: string
  pincode?: string
}

export interface RouteStop {
  id: string
  location: Location
  type: 'pickup' | 'delivery'
  estimated_arrival?: string
  actual_arrival?: string
  status: 'pending' | 'arrived' | 'completed'
}

export interface Route {
  id: string
  name: string
  origin: Location
  destination: Location
  stops: RouteStop[]
  distance: number      // in km
  duration: number      // in minutes
  toll_cost?: number    // in INR
  fuel_cost?: number    // in INR
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
}

// Shipment Types
export interface Shipment {
  id: string
  tracking_id: string
  route: Route
  truck: Truck
  driver?: Driver
  packing_result?: PackingResult
  status: 'pending' | 'loading' | 'in_transit' | 'delivered' | 'cancelled'
  estimated_delivery?: string
  actual_delivery?: string
  created_at: string
}

// Driver Types
export interface Driver {
  id: string
  name: string
  phone: string
  license_number: string
  vehicle_assigned?: Truck
  current_location?: Location
  status: 'available' | 'on_trip' | 'offline'
  rating?: number
}

// Live Tracking Types
export interface TrackingUpdate {
  shipment_id: string
  driver_id: string
  location: Location
  speed: number
  heading: number
  timestamp: string
  battery_level?: number
}

// Geofence Types
export interface Geofence {
  id: string
  name: string
  center: Location
  radius: number  // in meters
  type: 'pickup_zone' | 'delivery_zone' | 'restricted' | 'warehouse'
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

// Algorithm Types
export type PackingAlgorithm =
  | 'skyline'
  | 'genetic'
  | 'extreme_points'
  | 'best_fit'
  | 'first_fit'
  | 'guillotine'

export interface AlgorithmOption {
  id: PackingAlgorithm
  name: string
  description: string
  speed: 'fast' | 'medium' | 'slow'
  quality: 'good' | 'better' | 'best'
  recommended_for: string[]
}

// Indian-specific Types
export interface IndianCity {
  name: string
  state: string
  coordinates: Location
  tier: 1 | 2 | 3
  has_warehouse?: boolean
}

export interface TollPlaza {
  name: string
  location: Location
  cost: {
    lcv: number
    icv: number
    hcv: number
  }
}

// Notification Types
export interface Notification {
  id: string
  type: 'shipment_update' | 'geofence_alert' | 'delivery_complete' | 'system'
  title: string
  message: string
  read: boolean
  created_at: string
  data?: Record<string, unknown>
}
