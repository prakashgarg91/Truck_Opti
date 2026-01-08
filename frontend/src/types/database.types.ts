// Auto-generated Supabase types - DO NOT EDIT manually
// Generated from: https://jbxncejtcbpcronndqlx.supabase.co

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      addon_purchases: {
        Row: {
          addon_type: string
          created_at: string | null
          id: string
          quantity: number
          razorpay_payment_id: string | null
          status: string | null
          subscription_id: string
          total_price: number
          unit_price: number
          valid_until: string | null
        }
        Insert: {
          addon_type: string
          created_at?: string | null
          id?: string
          quantity: number
          razorpay_payment_id?: string | null
          status?: string | null
          subscription_id: string
          total_price: number
          unit_price: number
          valid_until?: string | null
        }
        Update: {
          addon_type?: string
          created_at?: string | null
          id?: string
          quantity?: number
          razorpay_payment_id?: string | null
          status?: string | null
          subscription_id?: string
          total_price?: number
          unit_price?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addon_purchases_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cartons: {
        Row: {
          created_at: string | null
          fragile: boolean | null
          height: number
          id: string
          length: number
          name: string
          stackable: boolean | null
          updated_at: string | null
          weight: number
          width: number
        }
        Insert: {
          created_at?: string | null
          fragile?: boolean | null
          height: number
          id?: string
          length: number
          name: string
          stackable?: boolean | null
          updated_at?: string | null
          weight: number
          width: number
        }
        Update: {
          created_at?: string | null
          fragile?: boolean | null
          height?: number
          id?: string
          length?: number
          name?: string
          stackable?: boolean | null
          updated_at?: string | null
          weight?: number
          width?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string
          city: string
          created_at: string | null
          email: string | null
          gst_number: string | null
          id: string
          name: string
          phone: string
          pincode: string
          state: string
          updated_at: string | null
        }
        Insert: {
          address: string
          city: string
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          phone: string
          pincode: string
          state: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          city?: string
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          billing_period_end: string
          billing_period_start: string
          created_at: string | null
          currency: string | null
          id: string
          invoice_number: string
          paid_at: string | null
          pdf_url: string | null
          razorpay_invoice_id: string | null
          razorpay_payment_id: string | null
          status: string
          subscription_id: string
          tax_amount: number | null
          total_amount: number
          user_id: string
        }
        Insert: {
          amount: number
          billing_period_end: string
          billing_period_start: string
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_number: string
          paid_at?: string | null
          pdf_url?: string | null
          razorpay_invoice_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          subscription_id: string
          tax_amount?: number | null
          total_amount: number
          user_id: string
        }
        Update: {
          amount?: number
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_number?: string
          paid_at?: string | null
          pdf_url?: string | null
          razorpay_invoice_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          subscription_id?: string
          tax_amount?: number | null
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_results: {
        Row: {
          algorithm: string
          created_at: string | null
          id: string
          items_packed: number
          packed_boxes: Json
          shipment_id: string | null
          total_items: number
          truck_id: string | null
          unfit_items: string[] | null
          volume_utilization: number
          weight_utilization: number
        }
        Insert: {
          algorithm: string
          created_at?: string | null
          id?: string
          items_packed: number
          packed_boxes: Json
          shipment_id?: string | null
          total_items: number
          truck_id?: string | null
          unfit_items?: string[] | null
          volume_utilization: number
          weight_utilization: number
        }
        Update: {
          algorithm?: string
          created_at?: string | null
          id?: string
          items_packed?: number
          packed_boxes?: Json
          shipment_id?: string | null
          total_items?: number
          truck_id?: string | null
          unfit_items?: string[] | null
          volume_utilization?: number
          weight_utilization?: number
        }
        Relationships: [
          {
            foreignKeyName: "packing_results_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_results_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_history: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          error_message: string | null
          id: string
          invoice_id: string | null
          metadata: Json | null
          payment_method: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payment_method: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payment_method?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string | null
          destinations: string[]
          fuel_cost: number | null
          id: string
          name: string
          start_location: string
          status: string
          toll_cost: number | null
          total_cost: number | null
          total_distance: number | null
          total_time: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          destinations: string[]
          fuel_cost?: number | null
          id?: string
          name: string
          start_location: string
          status?: string
          toll_cost?: number | null
          total_cost?: number | null
          total_distance?: number | null
          total_time?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          destinations?: string[]
          fuel_cost?: number | null
          id?: string
          name?: string
          start_location?: string
          status?: string
          toll_cost?: number | null
          total_cost?: number | null
          total_distance?: number | null
          total_time?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      shipments: {
        Row: {
          created_at: string | null
          customer_id: string | null
          destination: string
          driver_name: string | null
          estimated_cost: number | null
          id: string
          latitude: number | null
          longitude: number | null
          origin: string
          shipment_id: string
          status: string
          total_volume: number | null
          total_weight: number | null
          truck_id: string | null
          updated_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          destination: string
          driver_name?: string | null
          estimated_cost?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          origin: string
          shipment_id: string
          status?: string
          total_volume?: number | null
          total_weight?: number | null
          truck_id?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          destination?: string
          driver_name?: string | null
          estimated_cost?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          origin?: string
          shipment_id?: string
          status?: string
          total_volume?: number | null
          total_weight?: number | null
          truck_id?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          api_calls_monthly: number
          created_at: string | null
          features: Json
          id: string
          is_active: boolean | null
          maps_requests_monthly: number
          name: string
          name_hi: string
          price_monthly: number
          price_yearly: number
          shipments_monthly: number
          sms_included: number
          storage_gb: number
          support_level: string
          tier: string
          trucks_limit: number
          users_limit: number
        }
        Insert: {
          api_calls_monthly: number
          created_at?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          maps_requests_monthly: number
          name: string
          name_hi: string
          price_monthly: number
          price_yearly: number
          shipments_monthly: number
          sms_included: number
          storage_gb: number
          support_level: string
          tier: string
          trucks_limit: number
          users_limit: number
        }
        Update: {
          api_calls_monthly?: number
          created_at?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          maps_requests_monthly?: number
          name?: string
          name_hi?: string
          price_monthly?: number
          price_yearly?: number
          shipments_monthly?: number
          sms_included?: number
          storage_gb?: number
          support_level?: string
          tier?: string
          trucks_limit?: number
          users_limit?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          created_at: string | null
          current_period_end: string
          current_period_start: string
          id: string
          payment_method_id: string | null
          plan_id: string
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_cycle: string
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end: string
          current_period_start: string
          id?: string
          payment_method_id?: string | null
          plan_id: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          payment_method_id?: string | null
          plan_id?: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      trucks: {
        Row: {
          available: number | null
          capacity: number
          cost_per_km: number
          created_at: string | null
          height: number
          id: string
          length: number
          name: string
          name_hi: string
          updated_at: string | null
          width: number
        }
        Insert: {
          available?: number | null
          capacity: number
          cost_per_km: number
          created_at?: string | null
          height: number
          id?: string
          length: number
          name: string
          name_hi: string
          updated_at?: string | null
          width: number
        }
        Update: {
          available?: number | null
          capacity?: number
          cost_per_km?: number
          created_at?: string | null
          height?: number
          id?: string
          length?: number
          name?: string
          name_hi?: string
          updated_at?: string | null
          width?: number
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          api_calls_used: number | null
          created_at: string | null
          id: string
          maps_requests: number | null
          period_end: string
          period_start: string
          shipments_used: number | null
          sms_sent: number | null
          storage_used_mb: number | null
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          api_calls_used?: number | null
          created_at?: string | null
          id?: string
          maps_requests?: number | null
          period_end: string
          period_start: string
          shipments_used?: number | null
          sms_sent?: number | null
          storage_used_mb?: number | null
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          api_calls_used?: number | null
          created_at?: string | null
          id?: string
          maps_requests?: number | null
          period_end?: string
          period_start?: string
          shipments_used?: number | null
          sms_sent?: number | null
          storage_used_mb?: number | null
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          google_linked: boolean | null
          id: string
          name: string | null
          phone: string | null
          phone_verified: boolean | null
          profile_picture: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          google_linked?: boolean | null
          id: string
          name?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          profile_picture?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          google_linked?: boolean | null
          id?: string
          name?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          profile_picture?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_usage_limit: {
        Args: { p_resource: string; p_user_id: string }
        Returns: boolean
      }
      generate_invoice_number: { Args: Record<string, never>; Returns: string }
      get_user_plan: {
        Args: { p_user_id: string }
        Returns: {
          expires_at: string
          plan_name: string
          status: string
          tier: string
        }[]
      }
      has_active_subscription: { Args: { p_user_id: string }; Returns: boolean }
      increment_usage: {
        Args: { p_amount?: number; p_resource: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
