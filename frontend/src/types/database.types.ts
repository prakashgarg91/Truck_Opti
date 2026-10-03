// Auto-generated Supabase types - DO NOT EDIT manually
// Regenerated with: npx supabase gen types typescript --local
// Source schema: supabase/migrations/* applied to a clean local database
// (TO-129 atomic job-offer response + driver offer read visibility, 2026-10-03;
// chain replay verified after 20261003020000_driver_offer_read_visibility.sql).
// Replaces the TO-126 regeneration of 2026-10-03.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "addon_purchases": {
                  Row: {
                    "addon_type": string,"created_at": string | null,"id": string,"quantity": number,"razorpay_payment_id": string | null,"status": string | null,"subscription_id": string,"total_price": number,"unit_price": number,"valid_until": string | null
                  }
                  Insert: {
                    "addon_type": string,"created_at"?: string | null,"id"?: string,"quantity": number,"razorpay_payment_id"?: string | null,"status"?: string | null,"subscription_id": string,"total_price": number,"unit_price": number,"valid_until"?: string | null
                  }
                  Update: {
                    "addon_type"?: string,"created_at"?: string | null,"id"?: string,"quantity"?: number,"razorpay_payment_id"?: string | null,"status"?: string | null,"subscription_id"?: string,"total_price"?: number,"unit_price"?: number,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "addon_purchases_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_jobs": {
                  Row: {
                    "agency_id": string,"assigned_at": string | null,"created_at": string | null,"driver_id": string | null,"fare": number | null,"id": string,"notes": string | null,"shipment_id": string,"status": string,"truck_id": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "agency_id": string,"assigned_at"?: string | null,"created_at"?: string | null,"driver_id"?: string | null,"fare"?: number | null,"id"?: string,"notes"?: string | null,"shipment_id": string,"status"?: string,"truck_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "agency_id"?: string,"assigned_at"?: string | null,"created_at"?: string | null,"driver_id"?: string | null,"fare"?: number | null,"id"?: string,"notes"?: string | null,"shipment_id"?: string,"status"?: string,"truck_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_jobs_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_jobs_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_jobs_shipment_id_fkey"
      columns: ["shipment_id"]
isOneToOne: false
      referencedRelation: "shipments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_jobs_truck_id_fkey"
      columns: ["truck_id"]
isOneToOne: false
      referencedRelation: "agency_trucks"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_trucks": {
                  Row: {
                    "agency_id": string,"created_at": string | null,"driver_id": string | null,"fitness_expiry": string | null,"id": string,"insurance_expiry": string | null,"is_available": boolean | null,"notes": string | null,"permit_expiry": string | null,"rc_number": string,"updated_at": string | null,"vehicle_type": string
                  }
                  Insert: {
                    "agency_id": string,"created_at"?: string | null,"driver_id"?: string | null,"fitness_expiry"?: string | null,"id"?: string,"insurance_expiry"?: string | null,"is_available"?: boolean | null,"notes"?: string | null,"permit_expiry"?: string | null,"rc_number": string,"updated_at"?: string | null,"vehicle_type": string
                  }
                  Update: {
                    "agency_id"?: string,"created_at"?: string | null,"driver_id"?: string | null,"fitness_expiry"?: string | null,"id"?: string,"insurance_expiry"?: string | null,"is_available"?: boolean | null,"notes"?: string | null,"permit_expiry"?: string | null,"rc_number"?: string,"updated_at"?: string | null,"vehicle_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_trucks_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_trucks_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"analytics_events": {
                  Row: {
                    "created_at": string | null,"event_data": Json | null,"event_type": string,"id": string,"ip_address": unknown,"session_id": string | null,"user_agent": string | null,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"event_data"?: Json | null,"event_type": string,"id"?: string,"ip_address"?: unknown,"session_id"?: string | null,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"event_data"?: Json | null,"event_type"?: string,"id"?: string,"ip_address"?: unknown,"session_id"?: string | null,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"cartons": {
                  Row: {
                    "created_at": string | null,"fragile": boolean | null,"height": number,"id": string,"length": number,"name": string,"stackable": boolean | null,"updated_at": string | null,"weight": number,"width": number
                  }
                  Insert: {
                    "created_at"?: string | null,"fragile"?: boolean | null,"height": number,"id"?: string,"length": number,"name": string,"stackable"?: boolean | null,"updated_at"?: string | null,"weight": number,"width": number
                  }
                  Update: {
                    "created_at"?: string | null,"fragile"?: boolean | null,"height"?: number,"id"?: string,"length"?: number,"name"?: string,"stackable"?: boolean | null,"updated_at"?: string | null,"weight"?: number,"width"?: number
                  }
                  Relationships: [
                    
                  ]
                },"contact_inquiries": {
                  Row: {
                    "client_submission_id": string | null,"created_at": string,"email": string,"id": string,"message": string,"name": string,"phone": string | null,"status": string,"subject": string
                  }
                  Insert: {
                    "client_submission_id"?: string | null,"created_at"?: string,"email": string,"id"?: string,"message": string,"name": string,"phone"?: string | null,"status"?: string,"subject"?: string
                  }
                  Update: {
                    "client_submission_id"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"message"?: string,"name"?: string,"phone"?: string | null,"status"?: string,"subject"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customers": {
                  Row: {
                    "address": string,"city": string,"created_at": string | null,"created_by": string | null,"email": string | null,"gst_number": string | null,"id": string,"name": string,"pan_number": string | null,"phone": string,"pincode": string,"state": string,"updated_at": string | null
                  }
                  Insert: {
                    "address": string,"city": string,"created_at"?: string | null,"created_by"?: string | null,"email"?: string | null,"gst_number"?: string | null,"id"?: string,"name": string,"pan_number"?: string | null,"phone": string,"pincode": string,"state": string,"updated_at"?: string | null
                  }
                  Update: {
                    "address"?: string,"city"?: string,"created_at"?: string | null,"created_by"?: string | null,"email"?: string | null,"gst_number"?: string | null,"id"?: string,"name"?: string,"pan_number"?: string | null,"phone"?: string,"pincode"?: string,"state"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"driver_kyc_documents": {
                  Row: {
                    "created_at": string,"driver_id": string,"id": string,"kind": string,"mime_type": string,"original_name": string | null,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"size_bytes": number,"status": string,"storage_path": string,"uploaded_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"driver_id": string,"id"?: string,"kind": string,"mime_type": string,"original_name"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"size_bytes": number,"status": string,"storage_path": string,"uploaded_at"?: string,"user_id": string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"driver_id"?: string,"id"?: string,"kind"?: string,"mime_type"?: string,"original_name"?: string | null,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"size_bytes"?: number,"status"?: string,"storage_path"?: string,"uploaded_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_kyc_documents_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_locations": {
                  Row: {
                    "accuracy_m": number | null,"driver_id": string,"heading": number | null,"lat": number,"lng": number,"speed_kmh": number | null,"updated_at": string | null
                  }
                  Insert: {
                    "accuracy_m"?: number | null,"driver_id": string,"heading"?: number | null,"lat": number,"lng": number,"speed_kmh"?: number | null,"updated_at"?: string | null
                  }
                  Update: {
                    "accuracy_m"?: number | null,"driver_id"?: string,"heading"?: number | null,"lat"?: number,"lng"?: number,"speed_kmh"?: number | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_locations_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: true
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_payouts": {
                  Row: {
                    "agency_id": string | null,"amount": number,"driver_id": string,"id": string,"note": string | null,"processed_at": string | null,"requested_at": string,"status": string,"type": string
                  }
                  Insert: {
                    "agency_id"?: string | null,"amount": number,"driver_id": string,"id"?: string,"note"?: string | null,"processed_at"?: string | null,"requested_at"?: string,"status"?: string,"type"?: string
                  }
                  Update: {
                    "agency_id"?: string | null,"amount"?: number,"driver_id"?: string,"id"?: string,"note"?: string | null,"processed_at"?: string | null,"requested_at"?: string,"status"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_payouts_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_payouts_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"drivers": {
                  Row: {
                    "aadhaar_last4": string | null,"active_job_id": string | null,"approved_at": string | null,"approved_by": string | null,"bank_account": string | null,"created_at": string | null,"date_of_birth": string | null,"dl_url": string | null,"full_name": string,"home_city": string | null,"id": string,"ifsc_code": string | null,"insurance_url": string | null,"is_online": boolean,"license_number": string | null,"pan_number": string | null,"phone": string,"rating": number | null,"rc_number": string | null,"rc_url": string | null,"rejection_reason": string | null,"selfie_url": string | null,"status": string,"total_trips": number | null,"updated_at": string | null,"upi_id": string | null,"user_id": string | null,"vehicle_capacity": number | null,"vehicle_type": string
                  }
                  Insert: {
                    "aadhaar_last4"?: string | null,"active_job_id"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"bank_account"?: string | null,"created_at"?: string | null,"date_of_birth"?: string | null,"dl_url"?: string | null,"full_name": string,"home_city"?: string | null,"id"?: string,"ifsc_code"?: string | null,"insurance_url"?: string | null,"is_online"?: boolean,"license_number"?: string | null,"pan_number"?: string | null,"phone": string,"rating"?: number | null,"rc_number"?: string | null,"rc_url"?: string | null,"rejection_reason"?: string | null,"selfie_url"?: string | null,"status"?: string,"total_trips"?: number | null,"updated_at"?: string | null,"upi_id"?: string | null,"user_id"?: string | null,"vehicle_capacity"?: number | null,"vehicle_type": string
                  }
                  Update: {
                    "aadhaar_last4"?: string | null,"active_job_id"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"bank_account"?: string | null,"created_at"?: string | null,"date_of_birth"?: string | null,"dl_url"?: string | null,"full_name"?: string,"home_city"?: string | null,"id"?: string,"ifsc_code"?: string | null,"insurance_url"?: string | null,"is_online"?: boolean,"license_number"?: string | null,"pan_number"?: string | null,"phone"?: string,"rating"?: number | null,"rc_number"?: string | null,"rc_url"?: string | null,"rejection_reason"?: string | null,"selfie_url"?: string | null,"status"?: string,"total_trips"?: number | null,"updated_at"?: string | null,"upi_id"?: string | null,"user_id"?: string | null,"vehicle_capacity"?: number | null,"vehicle_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drivers_active_job_id_fkey"
      columns: ["active_job_id"]
isOneToOne: false
      referencedRelation: "job_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount": number,"billing_period_end": string,"billing_period_start": string,"created_at": string | null,"currency": string | null,"id": string,"invoice_number": string,"paid_at": string | null,"pdf_url": string | null,"razorpay_invoice_id": string | null,"razorpay_payment_id": string | null,"status": string,"subscription_id": string,"tax_amount": number | null,"total_amount": number,"user_id": string
                  }
                  Insert: {
                    "amount": number,"billing_period_end": string,"billing_period_start": string,"created_at"?: string | null,"currency"?: string | null,"id"?: string,"invoice_number": string,"paid_at"?: string | null,"pdf_url"?: string | null,"razorpay_invoice_id"?: string | null,"razorpay_payment_id"?: string | null,"status"?: string,"subscription_id": string,"tax_amount"?: number | null,"total_amount": number,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"billing_period_end"?: string,"billing_period_start"?: string,"created_at"?: string | null,"currency"?: string | null,"id"?: string,"invoice_number"?: string,"paid_at"?: string | null,"pdf_url"?: string | null,"razorpay_invoice_id"?: string | null,"razorpay_payment_id"?: string | null,"status"?: string,"subscription_id"?: string,"tax_amount"?: number | null,"total_amount"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"job_offers": {
                  Row: {
                    "decline_reason": string | null,"delivered_at": string | null,"delivery_arrived_at": string | null,"delivery_otp": string | null,"delivery_otp_verified_at": string | null,"driver_id": string | null,"expires_at": string,"id": string,"journey_started_at": string | null,"offered_at": string | null,"photo_delivery_url": string | null,"photo_loading_url": string | null,"pickup_arrived_at": string | null,"pickup_otp": string | null,"pickup_otp_verified_at": string | null,"responded_at": string | null,"shipment_id": string | null,"status": string
                  }
                  Insert: {
                    "decline_reason"?: string | null,"delivered_at"?: string | null,"delivery_arrived_at"?: string | null,"delivery_otp"?: string | null,"delivery_otp_verified_at"?: string | null,"driver_id"?: string | null,"expires_at": string,"id"?: string,"journey_started_at"?: string | null,"offered_at"?: string | null,"photo_delivery_url"?: string | null,"photo_loading_url"?: string | null,"pickup_arrived_at"?: string | null,"pickup_otp"?: string | null,"pickup_otp_verified_at"?: string | null,"responded_at"?: string | null,"shipment_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "decline_reason"?: string | null,"delivered_at"?: string | null,"delivery_arrived_at"?: string | null,"delivery_otp"?: string | null,"delivery_otp_verified_at"?: string | null,"driver_id"?: string | null,"expires_at"?: string,"id"?: string,"journey_started_at"?: string | null,"offered_at"?: string | null,"photo_delivery_url"?: string | null,"photo_loading_url"?: string | null,"pickup_arrived_at"?: string | null,"pickup_otp"?: string | null,"pickup_otp_verified_at"?: string | null,"responded_at"?: string | null,"shipment_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_offers_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_offers_shipment_id_fkey"
      columns: ["shipment_id"]
isOneToOne: false
      referencedRelation: "shipments"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "action_label": string | null,"action_url": string | null,"created_at": string | null,"id": string,"is_read": boolean | null,"message": string,"read_at": string | null,"related_entity_id": string | null,"related_entity_type": string | null,"title": string,"type": string | null,"user_id": string
                  }
                  Insert: {
                    "action_label"?: string | null,"action_url"?: string | null,"created_at"?: string | null,"id"?: string,"is_read"?: boolean | null,"message": string,"read_at"?: string | null,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"title": string,"type"?: string | null,"user_id": string
                  }
                  Update: {
                    "action_label"?: string | null,"action_url"?: string | null,"created_at"?: string | null,"id"?: string,"is_read"?: boolean | null,"message"?: string,"read_at"?: string | null,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"title"?: string,"type"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"packing_items": {
                  Row: {
                    "category": string | null,"created_at": string | null,"fragile": boolean | null,"height": number,"id": string,"is_packed": boolean | null,"job_id": string,"length": number,"name": string,"position_x": number | null,"position_y": number | null,"position_z": number | null,"quantity": number | null,"rotation": string | null,"stackable": boolean | null,"weight": number | null,"width": number
                  }
                  Insert: {
                    "category"?: string | null,"created_at"?: string | null,"fragile"?: boolean | null,"height": number,"id"?: string,"is_packed"?: boolean | null,"job_id": string,"length": number,"name": string,"position_x"?: number | null,"position_y"?: number | null,"position_z"?: number | null,"quantity"?: number | null,"rotation"?: string | null,"stackable"?: boolean | null,"weight"?: number | null,"width": number
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string | null,"fragile"?: boolean | null,"height"?: number,"id"?: string,"is_packed"?: boolean | null,"job_id"?: string,"length"?: number,"name"?: string,"position_x"?: number | null,"position_y"?: number | null,"position_z"?: number | null,"quantity"?: number | null,"rotation"?: string | null,"stackable"?: boolean | null,"weight"?: number | null,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "packing_items_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "packing_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"packing_jobs": {
                  Row: {
                    "algorithm": string | null,"completed_at": string | null,"created_at": string | null,"id": string,"items": Json | null,"optimization_goal": string | null,"result_data": Json | null,"status": string | null,"total_cost": number | null,"truck_id": string | null,"updated_at": string | null,"user_id": string,"volume_utilization": number | null,"weight_utilization": number | null
                  }
                  Insert: {
                    "algorithm"?: string | null,"completed_at"?: string | null,"created_at"?: string | null,"id"?: string,"items"?: Json | null,"optimization_goal"?: string | null,"result_data"?: Json | null,"status"?: string | null,"total_cost"?: number | null,"truck_id"?: string | null,"updated_at"?: string | null,"user_id": string,"volume_utilization"?: number | null,"weight_utilization"?: number | null
                  }
                  Update: {
                    "algorithm"?: string | null,"completed_at"?: string | null,"created_at"?: string | null,"id"?: string,"items"?: Json | null,"optimization_goal"?: string | null,"result_data"?: Json | null,"status"?: string | null,"total_cost"?: number | null,"truck_id"?: string | null,"updated_at"?: string | null,"user_id"?: string,"volume_utilization"?: number | null,"weight_utilization"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "packing_jobs_truck_id_fkey"
      columns: ["truck_id"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["id"]
    }
                  ]
                },"packing_results": {
                  Row: {
                    "algorithm": string,"created_at": string | null,"created_by": string | null,"id": string,"items_packed": number,"packed_boxes": NonNullable<Json>,"shipment_id": string | null,"total_items": number,"truck_id": string | null,"unfit_items": (string)[] | null,"volume_utilization": number,"weight_utilization": number
                  }
                  Insert: {
                    "algorithm": string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"items_packed": number,"packed_boxes": NonNullable<Json>,"shipment_id"?: string | null,"total_items": number,"truck_id"?: string | null,"unfit_items"?: (string)[] | null,"volume_utilization": number,"weight_utilization": number
                  }
                  Update: {
                    "algorithm"?: string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"items_packed"?: number,"packed_boxes"?: NonNullable<Json>,"shipment_id"?: string | null,"total_items"?: number,"truck_id"?: string | null,"unfit_items"?: (string)[] | null,"volume_utilization"?: number,"weight_utilization"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "packing_results_shipment_id_fkey"
      columns: ["shipment_id"]
isOneToOne: false
      referencedRelation: "shipments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "packing_results_truck_id_fkey"
      columns: ["truck_id"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_history": {
                  Row: {
                    "amount": number,"created_at": string | null,"currency": string | null,"error_message": string | null,"id": string,"invoice_id": string | null,"metadata": Json | null,"payment_method": string,"razorpay_order_id": string | null,"razorpay_payment_id": string | null,"status": string,"subscription_id": string | null,"user_id": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string | null,"currency"?: string | null,"error_message"?: string | null,"id"?: string,"invoice_id"?: string | null,"metadata"?: Json | null,"payment_method": string,"razorpay_order_id"?: string | null,"razorpay_payment_id"?: string | null,"status": string,"subscription_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string | null,"currency"?: string | null,"error_message"?: string | null,"id"?: string,"invoice_id"?: string | null,"metadata"?: Json | null,"payment_method"?: string,"razorpay_order_id"?: string | null,"razorpay_payment_id"?: string | null,"status"?: string,"subscription_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_history_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_history_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"routes": {
                  Row: {
                    "created_at": string | null,"created_by": string | null,"destinations": (string)[],"fuel_cost": number | null,"id": string,"name": string,"start_location": string,"status": string,"toll_cost": number | null,"total_cost": number | null,"total_distance": number | null,"total_time": number | null,"updated_at": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"created_by"?: string | null,"destinations": (string)[],"fuel_cost"?: number | null,"id"?: string,"name": string,"start_location": string,"status"?: string,"toll_cost"?: number | null,"total_cost"?: number | null,"total_distance"?: number | null,"total_time"?: number | null,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"created_by"?: string | null,"destinations"?: (string)[],"fuel_cost"?: number | null,"id"?: string,"name"?: string,"start_location"?: string,"status"?: string,"toll_cost"?: number | null,"total_cost"?: number | null,"total_distance"?: number | null,"total_time"?: number | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"sale_order_items": {
                  Row: {
                    "category": string | null,"created_at": string | null,"description": string | null,"fragile": boolean | null,"height": number,"id": string,"length": number,"order_id": string,"product_code": string,"product_name": string,"quantity": number,"stackable": boolean | null,"total_price": number | null,"unit_price": number | null,"weight": number | null,"width": number
                  }
                  Insert: {
                    "category"?: string | null,"created_at"?: string | null,"description"?: string | null,"fragile"?: boolean | null,"height": number,"id"?: string,"length": number,"order_id": string,"product_code": string,"product_name": string,"quantity"?: number,"stackable"?: boolean | null,"total_price"?: number | null,"unit_price"?: number | null,"weight"?: number | null,"width": number
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string | null,"description"?: string | null,"fragile"?: boolean | null,"height"?: number,"id"?: string,"length"?: number,"order_id"?: string,"product_code"?: string,"product_name"?: string,"quantity"?: number,"stackable"?: boolean | null,"total_price"?: number | null,"unit_price"?: number | null,"weight"?: number | null,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "sale_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_orders": {
                  Row: {
                    "created_at": string | null,"customer_id": string | null,"delivery_address": string | null,"delivery_city": string | null,"delivery_pincode": string | null,"delivery_state": string | null,"expected_delivery_date": string | null,"id": string,"notes": string | null,"order_number": string,"packing_job_id": string | null,"priority": number | null,"processed_at": string | null,"status": string | null,"total_items": number | null,"total_value": number | null,"total_volume": number | null,"total_weight": number | null,"updated_at": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"customer_id"?: string | null,"delivery_address"?: string | null,"delivery_city"?: string | null,"delivery_pincode"?: string | null,"delivery_state"?: string | null,"expected_delivery_date"?: string | null,"id"?: string,"notes"?: string | null,"order_number": string,"packing_job_id"?: string | null,"priority"?: number | null,"processed_at"?: string | null,"status"?: string | null,"total_items"?: number | null,"total_value"?: number | null,"total_volume"?: number | null,"total_weight"?: number | null,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"customer_id"?: string | null,"delivery_address"?: string | null,"delivery_city"?: string | null,"delivery_pincode"?: string | null,"delivery_state"?: string | null,"expected_delivery_date"?: string | null,"id"?: string,"notes"?: string | null,"order_number"?: string,"packing_job_id"?: string | null,"priority"?: number | null,"processed_at"?: string | null,"status"?: string | null,"total_items"?: number | null,"total_value"?: number | null,"total_volume"?: number | null,"total_weight"?: number | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_orders_packing_job_id_fkey"
      columns: ["packing_job_id"]
isOneToOne: false
      referencedRelation: "packing_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"shipments": {
                  Row: {
                    "created_at": string | null,"created_by": string | null,"customer_id": string | null,"destination": string,"driver_name": string | null,"driver_phone": string | null,"estimated_cost": number | null,"estimated_value": number | null,"eway_bill_data": Json | null,"goods_description": string | null,"id": string,"invoice_number": string | null,"latitude": number | null,"longitude": number | null,"lr_number": string | null,"origin": string,"pickup_date": string | null,"shipment_id": string,"status": string,"total_volume": number | null,"total_weight": number | null,"truck_id": string | null,"updated_at": string | null,"vehicle_number": string | null,"vehicle_type": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"created_by"?: string | null,"customer_id"?: string | null,"destination": string,"driver_name"?: string | null,"driver_phone"?: string | null,"estimated_cost"?: number | null,"estimated_value"?: number | null,"eway_bill_data"?: Json | null,"goods_description"?: string | null,"id"?: string,"invoice_number"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"lr_number"?: string | null,"origin": string,"pickup_date"?: string | null,"shipment_id": string,"status"?: string,"total_volume"?: number | null,"total_weight"?: number | null,"truck_id"?: string | null,"updated_at"?: string | null,"vehicle_number"?: string | null,"vehicle_type"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"created_by"?: string | null,"customer_id"?: string | null,"destination"?: string,"driver_name"?: string | null,"driver_phone"?: string | null,"estimated_cost"?: number | null,"estimated_value"?: number | null,"eway_bill_data"?: Json | null,"goods_description"?: string | null,"id"?: string,"invoice_number"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"lr_number"?: string | null,"origin"?: string,"pickup_date"?: string | null,"shipment_id"?: string,"status"?: string,"total_volume"?: number | null,"total_weight"?: number | null,"truck_id"?: string | null,"updated_at"?: string | null,"vehicle_number"?: string | null,"vehicle_type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shipments_truck_id_fkey"
      columns: ["truck_id"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_plans": {
                  Row: {
                    "api_calls_monthly": number,"created_at": string | null,"features": NonNullable<Json>,"id": string,"is_active": boolean | null,"maps_requests_monthly": number,"name": string,"name_hi": string,"price_monthly": number,"price_yearly": number,"shipments_monthly": number,"sms_included": number,"storage_gb": number,"support_level": string,"tier": string,"trucks_limit": number,"users_limit": number
                  }
                  Insert: {
                    "api_calls_monthly": number,"created_at"?: string | null,"features"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean | null,"maps_requests_monthly": number,"name": string,"name_hi": string,"price_monthly": number,"price_yearly": number,"shipments_monthly": number,"sms_included": number,"storage_gb": number,"support_level": string,"tier": string,"trucks_limit": number,"users_limit": number
                  }
                  Update: {
                    "api_calls_monthly"?: number,"created_at"?: string | null,"features"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean | null,"maps_requests_monthly"?: number,"name"?: string,"name_hi"?: string,"price_monthly"?: number,"price_yearly"?: number,"shipments_monthly"?: number,"sms_included"?: number,"storage_gb"?: number,"support_level"?: string,"tier"?: string,"trucks_limit"?: number,"users_limit"?: number
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "billing_cycle": string,"cancel_at_period_end": boolean | null,"cancelled_at": string | null,"created_at": string | null,"current_period_end": string,"current_period_start": string,"id": string,"payment_method_id": string | null,"plan_id": string,"razorpay_customer_id": string | null,"razorpay_subscription_id": string | null,"status": string,"trial_end": string | null,"updated_at": string | null,"user_id": string
                  }
                  Insert: {
                    "billing_cycle": string,"cancel_at_period_end"?: boolean | null,"cancelled_at"?: string | null,"created_at"?: string | null,"current_period_end": string,"current_period_start": string,"id"?: string,"payment_method_id"?: string | null,"plan_id": string,"razorpay_customer_id"?: string | null,"razorpay_subscription_id"?: string | null,"status"?: string,"trial_end"?: string | null,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "billing_cycle"?: string,"cancel_at_period_end"?: boolean | null,"cancelled_at"?: string | null,"created_at"?: string | null,"current_period_end"?: string,"current_period_start"?: string,"id"?: string,"payment_method_id"?: string | null,"plan_id"?: string,"razorpay_customer_id"?: string | null,"razorpay_subscription_id"?: string | null,"status"?: string,"trial_end"?: string | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"transport_agencies": {
                  Row: {
                    "address": string | null,"approved_at": string | null,"approved_by": string | null,"bank_account": string | null,"city": string | null,"company_name": string,"contact_email": string | null,"contact_name": string | null,"contact_phone": string | null,"created_at": string | null,"fleet_size": number | null,"gstin": string | null,"id": string,"ifsc_code": string | null,"operating_routes": string | null,"pan_number": string | null,"pincode": string | null,"rating": number | null,"rejection_reason": string | null,"state": string | null,"status": string,"total_jobs": number | null,"transport_license": string | null,"updated_at": string | null,"user_id": string | null
                  }
                  Insert: {
                    "address"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"bank_account"?: string | null,"city"?: string | null,"company_name": string,"contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string | null,"fleet_size"?: number | null,"gstin"?: string | null,"id"?: string,"ifsc_code"?: string | null,"operating_routes"?: string | null,"pan_number"?: string | null,"pincode"?: string | null,"rating"?: number | null,"rejection_reason"?: string | null,"state"?: string | null,"status"?: string,"total_jobs"?: number | null,"transport_license"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"bank_account"?: string | null,"city"?: string | null,"company_name"?: string,"contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string | null,"fleet_size"?: number | null,"gstin"?: string | null,"id"?: string,"ifsc_code"?: string | null,"operating_routes"?: string | null,"pan_number"?: string | null,"pincode"?: string | null,"rating"?: number | null,"rejection_reason"?: string | null,"state"?: string | null,"status"?: string,"total_jobs"?: number | null,"transport_license"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"trucks": {
                  Row: {
                    "available": number | null,"capacity": number,"cost_per_km": number,"created_at": string | null,"height": number,"id": string,"length": number,"name": string,"name_hi": string,"updated_at": string | null,"width": number
                  }
                  Insert: {
                    "available"?: number | null,"capacity": number,"cost_per_km": number,"created_at"?: string | null,"height": number,"id"?: string,"length": number,"name": string,"name_hi": string,"updated_at"?: string | null,"width": number
                  }
                  Update: {
                    "available"?: number | null,"capacity"?: number,"cost_per_km"?: number,"created_at"?: string | null,"height"?: number,"id"?: string,"length"?: number,"name"?: string,"name_hi"?: string,"updated_at"?: string | null,"width"?: number
                  }
                  Relationships: [
                    
                  ]
                },"usage_tracking": {
                  Row: {
                    "api_calls_used": number | null,"created_at": string | null,"id": string,"maps_requests": number | null,"period_end": string,"period_start": string,"shipments_used": number | null,"sms_sent": number | null,"storage_used_mb": number | null,"subscription_id": string,"updated_at": string | null
                  }
                  Insert: {
                    "api_calls_used"?: number | null,"created_at"?: string | null,"id"?: string,"maps_requests"?: number | null,"period_end": string,"period_start": string,"shipments_used"?: number | null,"sms_sent"?: number | null,"storage_used_mb"?: number | null,"subscription_id": string,"updated_at"?: string | null
                  }
                  Update: {
                    "api_calls_used"?: number | null,"created_at"?: string | null,"id"?: string,"maps_requests"?: number | null,"period_end"?: string,"period_start"?: string,"shipments_used"?: number | null,"sms_sent"?: number | null,"storage_used_mb"?: number | null,"subscription_id"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_tracking_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string | null,"email": string,"google_linked": boolean | null,"id": string,"login_id": string | null,"name": string | null,"phone": string | null,"phone_verified": boolean | null,"profile_picture": string | null,"role": string,"updated_at": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"email": string,"google_linked"?: boolean | null,"id": string,"login_id"?: string | null,"name"?: string | null,"phone"?: string | null,"phone_verified"?: boolean | null,"profile_picture"?: string | null,"role"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"email"?: string,"google_linked"?: boolean | null,"id"?: string,"login_id"?: string | null,"name"?: string | null,"phone"?: string | null,"phone_verified"?: boolean | null,"profile_picture"?: string | null,"role"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "production_setup_status": {
                  Row: {
                    "row_count": number | null,"table_name": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "check_usage_limit":
{ Args: { "p_resource": string,"p_user_id": string }; Returns: boolean
                           },
"ensure_shipment_document_numbers":
{ Args: { "p_shipment_id": string }; Returns: {
              "invoice_number": string,"lr_number": string
            }[]
                           },
"generate_4digit_otp":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"generate_invoice_number":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"generate_lr_number":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_shipment_job_offer_tracking":
{ Args: { "p_shipment_id": string }; Returns: {
              "delivery_otp": string,"drivers": Json,"id": string,"photo_delivery_url": string,"photo_loading_url": string,"pickup_otp": string,"shipment_id": string,"status": string
            }[]
                           },
"get_user_plan":
{ Args: { "p_user_id": string }; Returns: {
              "expires_at": string,"plan_name": string,"status": string,"tier": string
            }[]
                           },
"has_active_subscription":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"increment_usage":
{ Args: { "p_amount"?: number,"p_resource": string,"p_user_id": string }; Returns: undefined
                           },
"is_admin_user":
{ Args: { "p_user_id"?: string }; Returns: boolean
                           },
"is_shipment_driver":
{ Args: { "p_shipment_id": string }; Returns: boolean
                           },
"persist_driver_job_offer_progress":
{ Args: { "p_extra"?: Json,"p_job_offer_id": string,"p_status"?: string }; Returns: {
              "delivered_at": string,"delivery_arrived_at": string,"job_offer_id": string,"journey_started_at": string,"photo_delivery_url": string,"photo_loading_url": string,"pickup_arrived_at": string,"status": string,"total_trips": number
            }[]
                           },
"resolve_login_identifier":
{ Args: { "p_identifier": string }; Returns: string
                           },
"respond_to_job_offer":
{ Args: { "p_accept": boolean,"p_decline_reason"?: string,"p_job_offer_id": string }; Returns: {
              "active_job_id": string,"offer_id": string,"offer_status": string,"responded_at": string
            }[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
