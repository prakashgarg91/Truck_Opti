// Auto-generated Supabase types - DO NOT EDIT manually
// Regenerated with: npx supabase gen types typescript --local
// Source schema: supabase/migrations/* applied to a clean local database
// (TO-129 atomic job-offer response + driver offer read visibility, 2026-10-03;
// chain replay verified after 20261003020000_driver_offer_read_visibility.sql).
// TO-130 (2026-10-04): hand-applied delta for 20261004000000_trip_transition_integrity.sql
// (job_offers OTP attempt/lock columns; persist_driver_job_offer_progress result_code +
// otp_attempts_remaining; is_job_trip_photo_url) because no container runtime was available
// to re-run `supabase gen types`. The delta matches the migration text exactly; regenerate
// on a machine with Docker before any further schema change.
// TO-144-D1 (2026-10-10): hand-applied delta for 20261008000000_agency_fleet_foundation.sql
// (trucks.code key; agency_trucks payload/body/PUC/maintenance/version columns + catalog FK;
// new agency_driver_employment table) following the same TO-130 precedent — the delta
// matches the migration text exactly; regenerate on a machine with Docker before relying on it.
// TO-144-D2 types delta (2026-11-04): fleet_assignment_reservations (20261010000000) and the
// seven agency membership/client/tariff/driver-invitation tables plus their RPCs
// (20261011000000) were written by scripts/db_types_drift.check.mjs --write, which introspects the
// replayed migration chain in PGlite. `node scripts/db_types_drift.check.mjs` fails on any
// difference for objects added since 20261010000000. Local-DB proof only: regenerate with the
// real generator on a Docker machine before hosted proof (TO-153).
// UI NOTE: agency_invitations.token_hash and agency_driver_invitations.token_hash appear in Row
// but authenticated has NO grant on them, so `select=*` fails; always list columns explicitly.

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
                    "agency_id": string,"body_height_m": number | null,"body_length_m": number | null,"body_width_m": number | null,"created_at": string | null,"driver_id": string | null,"fitness_expiry": string | null,"id": string,"insurance_expiry": string | null,"is_available": boolean | null,"maintenance_block_reason": string | null,"maintenance_blocked": boolean,"maintenance_blocked_until": string | null,"notes": string | null,"payload_kg": number | null,"permit_expiry": string | null,"puc_expiry": string | null,"rc_number": string,"updated_at": string | null,"vehicle_type": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"body_height_m"?: number | null,"body_length_m"?: number | null,"body_width_m"?: number | null,"created_at"?: string | null,"driver_id"?: string | null,"fitness_expiry"?: string | null,"id"?: string,"insurance_expiry"?: string | null,"is_available"?: boolean | null,"maintenance_block_reason"?: string | null,"maintenance_blocked"?: boolean,"maintenance_blocked_until"?: string | null,"notes"?: string | null,"payload_kg"?: number | null,"permit_expiry"?: string | null,"puc_expiry"?: string | null,"rc_number": string,"updated_at"?: string | null,"vehicle_type": string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"body_height_m"?: number | null,"body_length_m"?: number | null,"body_width_m"?: number | null,"created_at"?: string | null,"driver_id"?: string | null,"fitness_expiry"?: string | null,"id"?: string,"insurance_expiry"?: string | null,"is_available"?: boolean | null,"maintenance_block_reason"?: string | null,"maintenance_blocked"?: boolean,"maintenance_blocked_until"?: string | null,"notes"?: string | null,"payload_kg"?: number | null,"permit_expiry"?: string | null,"puc_expiry"?: string | null,"rc_number"?: string,"updated_at"?: string | null,"vehicle_type"?: string,"version"?: number
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
    },{
      foreignKeyName: "agency_trucks_vehicle_type_catalog_fkey"
      columns: ["vehicle_type"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["code"]
    }
                  ]
                },"agency_driver_employment": {
                  Row: {
                    "agency_id": string,"contact_phone": string | null,"created_at": string,"driver_id": string,"id": string,"licence_class": string | null,"licence_expiry": string | null,"licence_number": string | null,"status": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"contact_phone"?: string | null,"created_at"?: string,"driver_id": string,"id"?: string,"licence_class"?: string | null,"licence_expiry"?: string | null,"licence_number"?: string | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"contact_phone"?: string | null,"created_at"?: string,"driver_id"?: string,"id"?: string,"licence_class"?: string | null,"licence_expiry"?: string | null,"licence_number"?: string | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_driver_employment_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_driver_employment_driver_id_fkey"
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
                    "decline_reason": string | null,"delivered_at": string | null,"delivery_arrived_at": string | null,"delivery_otp": string | null,"delivery_otp_attempts": number,"delivery_otp_locked_until": string | null,"delivery_otp_verified_at": string | null,"driver_id": string | null,"expires_at": string,"id": string,"journey_started_at": string | null,"offered_at": string | null,"photo_delivery_url": string | null,"photo_loading_url": string | null,"pickup_arrived_at": string | null,"pickup_otp": string | null,"pickup_otp_attempts": number,"pickup_otp_locked_until": string | null,"pickup_otp_verified_at": string | null,"responded_at": string | null,"shipment_id": string | null,"status": string
                  }
                  Insert: {
                    "decline_reason"?: string | null,"delivered_at"?: string | null,"delivery_arrived_at"?: string | null,"delivery_otp"?: string | null,"delivery_otp_attempts"?: number,"delivery_otp_locked_until"?: string | null,"delivery_otp_verified_at"?: string | null,"driver_id"?: string | null,"expires_at": string,"id"?: string,"journey_started_at"?: string | null,"offered_at"?: string | null,"photo_delivery_url"?: string | null,"photo_loading_url"?: string | null,"pickup_arrived_at"?: string | null,"pickup_otp"?: string | null,"pickup_otp_attempts"?: number,"pickup_otp_locked_until"?: string | null,"pickup_otp_verified_at"?: string | null,"responded_at"?: string | null,"shipment_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "decline_reason"?: string | null,"delivered_at"?: string | null,"delivery_arrived_at"?: string | null,"delivery_otp"?: string | null,"delivery_otp_attempts"?: number,"delivery_otp_locked_until"?: string | null,"delivery_otp_verified_at"?: string | null,"driver_id"?: string | null,"expires_at"?: string,"id"?: string,"journey_started_at"?: string | null,"offered_at"?: string | null,"photo_delivery_url"?: string | null,"photo_loading_url"?: string | null,"pickup_arrived_at"?: string | null,"pickup_otp"?: string | null,"pickup_otp_attempts"?: number,"pickup_otp_locked_until"?: string | null,"pickup_otp_verified_at"?: string | null,"responded_at"?: string | null,"shipment_id"?: string | null,"status"?: string
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
                    "available": number | null,"capacity": number,"code": string,"cost_per_km": number,"created_at": string | null,"height": number,"id": string,"length": number,"name": string,"name_hi": string,"updated_at": string | null,"width": number
                  }
                  Insert: {
                    "available"?: number | null,"capacity": number,"code"?: string,"cost_per_km": number,"created_at"?: string | null,"height": number,"id"?: string,"length": number,"name": string,"name_hi": string,"updated_at"?: string | null,"width": number
                  }
                  Update: {
                    "available"?: number | null,"capacity"?: number,"code"?: string,"cost_per_km"?: number,"created_at"?: string | null,"height"?: number,"id"?: string,"length"?: number,"name"?: string,"name_hi"?: string,"updated_at"?: string | null,"width"?: number
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
                },"agency_client_agreements": {
                  Row: {
                    "agency_id": string,"client_gstin": string | null,"client_name": string,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"payment_terms_days": number | null,"status": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"client_gstin"?: string | null,"client_name": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"payment_terms_days"?: number | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"client_gstin"?: string | null,"client_name"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"payment_terms_days"?: number | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_client_agreements_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_client_contacts": {
                  Row: {
                    "agency_id": string,"agreement_id": string,"created_at": string,"email": string | null,"full_name": string,"id": string,"idempotency_key": string,"phone": string,"site_id": string | null,"status": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"agreement_id": string,"created_at"?: string,"email"?: string | null,"full_name": string,"id"?: string,"idempotency_key": string,"phone": string,"site_id"?: string | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"agreement_id"?: string,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"idempotency_key"?: string,"phone"?: string,"site_id"?: string | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_client_contacts_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_client_contacts_agreement_fk"
      columns: ["agreement_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_client_contacts_site_fk"
      columns: ["site_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_sites"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_client_sites": {
                  Row: {
                    "address_line": string,"agency_id": string,"agreement_id": string,"city": string,"created_at": string,"id": string,"idempotency_key": string,"label": string,"pincode": string,"site_kind": string,"state": string,"status": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "address_line": string,"agency_id": string,"agreement_id": string,"city": string,"created_at"?: string,"id"?: string,"idempotency_key": string,"label": string,"pincode": string,"site_kind": string,"state": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "address_line"?: string,"agency_id"?: string,"agreement_id"?: string,"city"?: string,"created_at"?: string,"id"?: string,"idempotency_key"?: string,"label"?: string,"pincode"?: string,"site_kind"?: string,"state"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_client_sites_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_client_sites_agreement_fk"
      columns: ["agreement_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_driver_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"accepted_driver_id": string | null,"agency_id": string,"created_at": string,"created_by": string | null,"employment_id": string | null,"expires_at": string,"id": string,"idempotency_key": string,"invited_phone": string,"revoked_at": string | null,"status": string,"token_hash": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"accepted_driver_id"?: string | null,"agency_id": string,"created_at"?: string,"created_by"?: string | null,"employment_id"?: string | null,"expires_at": string,"id"?: string,"idempotency_key": string,"invited_phone": string,"revoked_at"?: string | null,"status"?: string,"token_hash": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"accepted_driver_id"?: string | null,"agency_id"?: string,"created_at"?: string,"created_by"?: string | null,"employment_id"?: string | null,"expires_at"?: string,"id"?: string,"idempotency_key"?: string,"invited_phone"?: string,"revoked_at"?: string | null,"status"?: string,"token_hash"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_driver_invitations_accepted_driver_id_fkey"
      columns: ["accepted_driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_driver_invitations_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_driver_invitations_employment_id_fkey"
      columns: ["employment_id"]
isOneToOne: false
      referencedRelation: "agency_driver_employment"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"agency_id": string,"created_at": string,"created_by": string | null,"expires_at": string,"id": string,"idempotency_key": string,"invited_email": string,"revoked_at": string | null,"scope": string,"status": string,"token_hash": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"agency_id": string,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"id"?: string,"idempotency_key": string,"invited_email": string,"revoked_at"?: string | null,"scope": string,"status"?: string,"token_hash": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"agency_id"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"idempotency_key"?: string,"invited_email"?: string,"revoked_at"?: string | null,"scope"?: string,"status"?: string,"token_hash"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_invitations_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_memberships": {
                  Row: {
                    "agency_id": string,"created_at": string,"granted_at": string,"id": string,"invitation_id": string | null,"invited_by": string | null,"revoked_at": string | null,"revoked_by": string | null,"scope": string,"status": string,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"created_at"?: string,"granted_at"?: string,"id"?: string,"invitation_id"?: string | null,"invited_by"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"scope": string,"status"?: string,"updated_at"?: string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"created_at"?: string,"granted_at"?: string,"id"?: string,"invitation_id"?: string | null,"invited_by"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"scope"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_memberships_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_memberships_invitation_id_fkey"
      columns: ["invitation_id"]
isOneToOne: false
      referencedRelation: "agency_invitations"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_tariff_versions": {
                  Row: {
                    "agency_id": string,"agreement_id": string,"created_at": string,"created_by": string | null,"currency": string,"destination_key": string,"destination_label": string,"effective_from": string,"effective_to": string | null,"id": string,"idempotency_key": string,"origin_key": string,"origin_label": string,"rate_amount": number,"rate_basis": string,"supersedes_version_id": string | null,"vehicle_key": string,"vehicle_type": string | null,"version_no": number
                  }
                  Insert: {
                    "agency_id": string,"agreement_id": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"destination_key": string,"destination_label": string,"effective_from": string,"effective_to"?: string | null,"id"?: string,"idempotency_key": string,"origin_key": string,"origin_label": string,"rate_amount": number,"rate_basis": string,"supersedes_version_id"?: string | null,"vehicle_key": string,"vehicle_type"?: string | null,"version_no": number
                  }
                  Update: {
                    "agency_id"?: string,"agreement_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"destination_key"?: string,"destination_label"?: string,"effective_from"?: string,"effective_to"?: string | null,"id"?: string,"idempotency_key"?: string,"origin_key"?: string,"origin_label"?: string,"rate_amount"?: number,"rate_basis"?: string,"supersedes_version_id"?: string | null,"vehicle_key"?: string,"vehicle_type"?: string | null,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_tariff_versions_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_tariff_versions_agreement_fk"
      columns: ["agreement_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_tariff_versions_supersedes_version_id_fkey"
      columns: ["supersedes_version_id"]
isOneToOne: false
      referencedRelation: "agency_tariff_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_tariff_versions_vehicle_type_fkey"
      columns: ["vehicle_type"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["code"]
    }
                  ]
                },"fleet_assignment_reservations": {
                  Row: {
                    "agency_id": string,"agency_job_id": string,"created_at": string,"driver_employment_id": string,"driver_id": string,"id": string,"idempotency_key": string,"job_offer_id": string,"released_reason": string | null,"status": string,"updated_at": string,"vehicle_id": string,"version": number,"window_end": string,"window_start": string
                  }
                  Insert: {
                    "agency_id": string,"agency_job_id": string,"created_at"?: string,"driver_employment_id": string,"driver_id": string,"id"?: string,"idempotency_key": string,"job_offer_id": string,"released_reason"?: string | null,"status"?: string,"updated_at"?: string,"vehicle_id": string,"version"?: number,"window_end": string,"window_start": string
                  }
                  Update: {
                    "agency_id"?: string,"agency_job_id"?: string,"created_at"?: string,"driver_employment_id"?: string,"driver_id"?: string,"id"?: string,"idempotency_key"?: string,"job_offer_id"?: string,"released_reason"?: string | null,"status"?: string,"updated_at"?: string,"vehicle_id"?: string,"version"?: number,"window_end"?: string,"window_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fleet_assignment_reservations_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fleet_assignment_reservations_agency_job_id_fkey"
      columns: ["agency_job_id"]
isOneToOne: false
      referencedRelation: "agency_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fleet_assignment_reservations_driver_employment_id_fkey"
      columns: ["driver_employment_id"]
isOneToOne: false
      referencedRelation: "agency_driver_employment"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fleet_assignment_reservations_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fleet_assignment_reservations_job_offer_id_fkey"
      columns: ["job_offer_id"]
isOneToOne: false
      referencedRelation: "job_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fleet_assignment_reservations_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "agency_trucks"
      referencedColumns: ["id"]
    }
                  ]
                },"expiry_sweep_runs": {
                  Row: {
                    "as_of": string,"driver_invitations_expired": number,"error": string | null,"id": string,"invitations_expired": number,"ran_at": string,"reservations_released": number
                  }
                  Insert: {
                    "as_of": string,"driver_invitations_expired"?: number,"error"?: string | null,"id"?: string,"invitations_expired"?: number,"ran_at"?: string,"reservations_released"?: number
                  }
                  Update: {
                    "as_of"?: string,"driver_invitations_expired"?: number,"error"?: string | null,"id"?: string,"invitations_expired"?: number,"ran_at"?: string,"reservations_released"?: number
                  }
                  Relationships: [
                    
                  ]
                },"agency_order_batches": {
                  Row: {
                    "agency_id": string,"agreement_id": string,"created_at": string,"created_by": string | null,"file_hash": string,"id": string,"idempotency_key": string,"row_count": number
                  }
                  Insert: {
                    "agency_id": string,"agreement_id": string,"created_at"?: string,"created_by"?: string | null,"file_hash": string,"id"?: string,"idempotency_key": string,"row_count": number
                  }
                  Update: {
                    "agency_id"?: string,"agreement_id"?: string,"created_at"?: string,"created_by"?: string | null,"file_hash"?: string,"id"?: string,"idempotency_key"?: string,"row_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_order_batches_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_order_batches_agreement_fk"
      columns: ["agreement_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_order_lines": {
                  Row: {
                    "agency_id": string,"delivery_from": string | null,"delivery_to": string | null,"description": string | null,"drop_site_id": string | null,"fragile": boolean,"height_m": number | null,"id": string,"length_m": number | null,"line_no": number,"order_id": string,"pickup_from": string | null,"pickup_site_id": string | null,"pickup_to": string | null,"quantity": number,"sku": string,"stackable": boolean,"unit": string,"weight_per_unit_kg": number | null,"width_m": number | null
                  }
                  Insert: {
                    "agency_id": string,"delivery_from"?: string | null,"delivery_to"?: string | null,"description"?: string | null,"drop_site_id"?: string | null,"fragile"?: boolean,"height_m"?: number | null,"id"?: string,"length_m"?: number | null,"line_no": number,"order_id": string,"pickup_from"?: string | null,"pickup_site_id"?: string | null,"pickup_to"?: string | null,"quantity": number,"sku": string,"stackable"?: boolean,"unit": string,"weight_per_unit_kg"?: number | null,"width_m"?: number | null
                  }
                  Update: {
                    "agency_id"?: string,"delivery_from"?: string | null,"delivery_to"?: string | null,"description"?: string | null,"drop_site_id"?: string | null,"fragile"?: boolean,"height_m"?: number | null,"id"?: string,"length_m"?: number | null,"line_no"?: number,"order_id"?: string,"pickup_from"?: string | null,"pickup_site_id"?: string | null,"pickup_to"?: string | null,"quantity"?: number,"sku"?: string,"stackable"?: boolean,"unit"?: string,"weight_per_unit_kg"?: number | null,"width_m"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_order_lines_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_order_lines_drop_site_id_fkey"
      columns: ["drop_site_id"]
isOneToOne: false
      referencedRelation: "agency_client_sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_order_lines_order_fk"
      columns: ["order_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_orders"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_order_lines_pickup_site_id_fkey"
      columns: ["pickup_site_id"]
isOneToOne: false
      referencedRelation: "agency_client_sites"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_orders": {
                  Row: {
                    "agency_id": string,"agreement_id": string,"batch_id": string | null,"client_order_ref": string,"created_at": string,"id": string,"status": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"agreement_id": string,"batch_id"?: string | null,"client_order_ref": string,"created_at"?: string,"id"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"agreement_id"?: string,"batch_id"?: string | null,"client_order_ref"?: string,"created_at"?: string,"id"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_orders_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_orders_agreement_fk"
      columns: ["agreement_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_orders_batch_fk"
      columns: ["batch_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_order_batches"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_consignment_events": {
                  Row: {
                    "actor": string | null,"agency_id": string,"consignment_id": string,"created_at": string,"event": string,"from_status": string | null,"id": string,"idempotency_key": string | null,"note": string | null,"to_status": string,"version_after": number | null
                  }
                  Insert: {
                    "actor"?: string | null,"agency_id": string,"consignment_id": string,"created_at"?: string,"event": string,"from_status"?: string | null,"id"?: string,"idempotency_key"?: string | null,"note"?: string | null,"to_status": string,"version_after"?: number | null
                  }
                  Update: {
                    "actor"?: string | null,"agency_id"?: string,"consignment_id"?: string,"created_at"?: string,"event"?: string,"from_status"?: string | null,"id"?: string,"idempotency_key"?: string | null,"note"?: string | null,"to_status"?: string,"version_after"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_consignment_events_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_consignment_events_consignment_fk"
      columns: ["consignment_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_consignments"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_consignments": {
                  Row: {
                    "agency_id": string,"created_at": string,"gr_number": string,"id": string,"idempotency_key": string,"order_id": string,"qr_token": string,"status": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"created_at"?: string,"gr_number": string,"id"?: string,"idempotency_key": string,"order_id": string,"qr_token": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"created_at"?: string,"gr_number"?: string,"id"?: string,"idempotency_key"?: string,"order_id"?: string,"qr_token"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_consignments_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_consignments_order_fk"
      columns: ["order_id", "agency_id"]
isOneToOne: true
      referencedRelation: "agency_orders"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_driver_rates": {
                  Row: {
                    "agency_id": string,"base_paise": number,"driver_id": string,"per_km_paise": number,"per_tonne_paise": number,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"base_paise": number,"driver_id": string,"per_km_paise": number,"per_tonne_paise": number,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"base_paise"?: number,"driver_id"?: string,"per_km_paise"?: number,"per_tonne_paise"?: number,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_driver_rates_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_driver_rates_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_erp_connections": {
                  Row: {
                    "agency_id": string,"agreement_id": string,"client_id": string,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"kind": string,"name": string,"secret_hash": string,"secret_hint": string,"status": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"agreement_id": string,"client_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"kind": string,"name": string,"secret_hash": string,"secret_hint": string,"status"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"agreement_id"?: string,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: string,"name"?: string,"secret_hash"?: string,"secret_hint"?: string,"status"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_erp_connections_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_erp_connections_agreement_fk"
      columns: ["agreement_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_erp_connections_client_fk"
      columns: ["client_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_erp_events": {
                  Row: {
                    "agency_id": string,"batch_id": string | null,"connection_id": string,"external_event_id": string,"id": string,"outcome": string,"payload_hash": string,"problems": Json | null,"received_at": string
                  }
                  Insert: {
                    "agency_id": string,"batch_id"?: string | null,"connection_id": string,"external_event_id": string,"id"?: string,"outcome": string,"payload_hash": string,"problems"?: Json | null,"received_at"?: string
                  }
                  Update: {
                    "agency_id"?: string,"batch_id"?: string | null,"connection_id"?: string,"external_event_id"?: string,"id"?: string,"outcome"?: string,"payload_hash"?: string,"problems"?: Json | null,"received_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_erp_events_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_erp_events_batch_fk"
      columns: ["batch_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_order_batches"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_erp_events_connection_fk"
      columns: ["connection_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_erp_connections"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_gr_sequences": {
                  Row: {
                    "agency_id": string,"fy": string,"last_seq": number
                  }
                  Insert: {
                    "agency_id": string,"fy": string,"last_seq"?: number
                  }
                  Update: {
                    "agency_id"?: string,"fy"?: string,"last_seq"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_gr_sequences_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_incidents": {
                  Row: {
                    "agency_id": string,"created_at": string,"created_by": string | null,"dedupe_key": string,"details": Json,"id": string,"job_id": string,"kind": string,"resolution_note": string | null,"status": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"created_at"?: string,"created_by"?: string | null,"dedupe_key": string,"details"?: Json,"id"?: string,"job_id": string,"kind": string,"resolution_note"?: string | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string,"details"?: Json,"id"?: string,"job_id"?: string,"kind"?: string,"resolution_note"?: string | null,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_incidents_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_incidents_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "agency_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_invoice_lines": {
                  Row: {
                    "amount_paise": number,"description": string,"id": string,"invoice_id": string,"line_no": number,"quantity": number,"rate_paise": number
                  }
                  Insert: {
                    "amount_paise": number,"description": string,"id"?: string,"invoice_id": string,"line_no": number,"quantity": number,"rate_paise": number
                  }
                  Update: {
                    "amount_paise"?: number,"description"?: string,"id"?: string,"invoice_id"?: string,"line_no"?: number,"quantity"?: number,"rate_paise"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_invoice_lines_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "agency_invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_invoice_payments": {
                  Row: {
                    "agency_id": string,"amount_paise": number,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"invoice_id": string,"method": string,"received_on": string,"reference": string | null
                  }
                  Insert: {
                    "agency_id": string,"amount_paise": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"invoice_id": string,"method": string,"received_on": string,"reference"?: string | null
                  }
                  Update: {
                    "agency_id"?: string,"amount_paise"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"invoice_id"?: string,"method"?: string,"received_on"?: string,"reference"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_invoice_payments_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_invoice_payments_invoice_fk"
      columns: ["invoice_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_invoices"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_invoice_sequences": {
                  Row: {
                    "agency_id": string,"fy": string,"last_seq": number
                  }
                  Insert: {
                    "agency_id": string,"fy": string,"last_seq"?: number
                  }
                  Update: {
                    "agency_id"?: string,"fy"?: string,"last_seq"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_invoice_sequences_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_invoices": {
                  Row: {
                    "agency_id": string,"cancelled_at": string | null,"cancelled_reason": string | null,"cgst_paise": number,"client_id": string,"created_at": string,"created_by": string | null,"gst_rate_pct": number,"id": string,"idempotency_key": string,"igst_paise": number,"invoice_number": string,"paid_paise": number,"place_of_supply_state_code": string,"request_hash": string | null,"reverse_charge": boolean,"round_off_paise": number,"sgst_paise": number,"status": string,"subtotal_paise": number,"supplier_state_code": string,"total_paise": number,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"cancelled_at"?: string | null,"cancelled_reason"?: string | null,"cgst_paise"?: number,"client_id": string,"created_at"?: string,"created_by"?: string | null,"gst_rate_pct": number,"id"?: string,"idempotency_key": string,"igst_paise"?: number,"invoice_number": string,"paid_paise"?: number,"place_of_supply_state_code": string,"request_hash"?: string | null,"reverse_charge"?: boolean,"round_off_paise"?: number,"sgst_paise"?: number,"status"?: string,"subtotal_paise": number,"supplier_state_code": string,"total_paise": number,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"cancelled_at"?: string | null,"cancelled_reason"?: string | null,"cgst_paise"?: number,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"gst_rate_pct"?: number,"id"?: string,"idempotency_key"?: string,"igst_paise"?: number,"invoice_number"?: string,"paid_paise"?: number,"place_of_supply_state_code"?: string,"request_hash"?: string | null,"reverse_charge"?: boolean,"round_off_paise"?: number,"sgst_paise"?: number,"status"?: string,"subtotal_paise"?: number,"supplier_state_code"?: string,"total_paise"?: number,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_invoices_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_invoices_client_fk"
      columns: ["client_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_client_agreements"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_payroll_adjustments": {
                  Row: {
                    "agency_id": string,"amount_paise": number,"created_at": string,"created_by": string | null,"driver_id": string,"id": string,"kind": string,"period_id": string,"reason": string
                  }
                  Insert: {
                    "agency_id": string,"amount_paise": number,"created_at"?: string,"created_by"?: string | null,"driver_id": string,"id"?: string,"kind": string,"period_id": string,"reason": string
                  }
                  Update: {
                    "agency_id"?: string,"amount_paise"?: number,"created_at"?: string,"created_by"?: string | null,"driver_id"?: string,"id"?: string,"kind"?: string,"period_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_payroll_adjustments_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_payroll_adjustments_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_payroll_adjustments_period_fk"
      columns: ["period_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_payroll_periods"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_tracking_pings": {
                  Row: {
                    "agency_id": string,"created_at": string,"driver_id": string | null,"id": string,"job_id": string,"lat": number,"lng": number,"recorded_at": string,"speed_kmph": number | null
                  }
                  Insert: {
                    "agency_id": string,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"job_id": string,"lat": number,"lng": number,"recorded_at": string,"speed_kmph"?: number | null
                  }
                  Update: {
                    "agency_id"?: string,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"job_id"?: string,"lat"?: number,"lng"?: number,"recorded_at"?: string,"speed_kmph"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_tracking_pings_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_tracking_pings_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_tracking_pings_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "agency_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_payroll_line_jobs": {
                  Row: {
                    "agency_id": string,"completed_at": string | null,"distance_km": number | null,"driver_id": string,"id": string,"job_id": string,"line_id": string,"period_id": string,"weight_kg": number | null
                  }
                  Insert: {
                    "agency_id": string,"completed_at"?: string | null,"distance_km"?: number | null,"driver_id": string,"id"?: string,"job_id": string,"line_id": string,"period_id": string,"weight_kg"?: number | null
                  }
                  Update: {
                    "agency_id"?: string,"completed_at"?: string | null,"distance_km"?: number | null,"driver_id"?: string,"id"?: string,"job_id"?: string,"line_id"?: string,"period_id"?: string,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_payroll_line_jobs_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_payroll_line_jobs_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_payroll_line_jobs_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "agency_payroll_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_payroll_line_jobs_period_fk"
      columns: ["period_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_payroll_periods"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_payroll_lines": {
                  Row: {
                    "advances_paise": number,"agency_id": string,"base_paise": number,"carried_in_paise": number,"deductions_paise": number,"driver_id": string,"id": string,"net_paise": number,"per_km_paise": number,"per_tonne_paise": number,"period_id": string,"rate_version": number,"shortfall_paise": number,"trip_count": number,"trips_paise": number
                  }
                  Insert: {
                    "advances_paise": number,"agency_id": string,"base_paise": number,"carried_in_paise"?: number,"deductions_paise": number,"driver_id": string,"id"?: string,"net_paise": number,"per_km_paise"?: number,"per_tonne_paise"?: number,"period_id": string,"rate_version"?: number,"shortfall_paise": number,"trip_count": number,"trips_paise": number
                  }
                  Update: {
                    "advances_paise"?: number,"agency_id"?: string,"base_paise"?: number,"carried_in_paise"?: number,"deductions_paise"?: number,"driver_id"?: string,"id"?: string,"net_paise"?: number,"per_km_paise"?: number,"per_tonne_paise"?: number,"period_id"?: string,"rate_version"?: number,"shortfall_paise"?: number,"trip_count"?: number,"trips_paise"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_payroll_lines_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_payroll_lines_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_payroll_lines_period_fk"
      columns: ["period_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_payroll_periods"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_payroll_periods": {
                  Row: {
                    "agency_id": string,"close_idempotency_key": string | null,"closed_at": string | null,"closed_by": string | null,"created_at": string,"id": string,"idempotency_key": string,"period_end": string,"period_start": string,"status": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"close_idempotency_key"?: string | null,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"idempotency_key": string,"period_end": string,"period_start": string,"status"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"close_idempotency_key"?: string | null,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"idempotency_key"?: string,"period_end"?: string,"period_start"?: string,"status"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_payroll_periods_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_expenses": {
                  Row: {
                    "agency_id": string,"amount_paise": number,"category": string,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"note": string | null,"spent_on": string,"truck_id": string | null
                  }
                  Insert: {
                    "agency_id": string,"amount_paise": number,"category": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"note"?: string | null,"spent_on": string,"truck_id"?: string | null
                  }
                  Update: {
                    "agency_id"?: string,"amount_paise"?: number,"category"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"note"?: string | null,"spent_on"?: string,"truck_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_expenses_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_expenses_truck_agency_fkey"
      columns: ["truck_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_trucks"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_fuel_fills": {
                  Row: {
                    "agency_id": string,"created_at": string,"expense_id": string | null,"filled_on": string,"full_tank": boolean,"id": string,"litres": number,"odometer_km": number,"truck_id": string
                  }
                  Insert: {
                    "agency_id": string,"created_at"?: string,"expense_id"?: string | null,"filled_on": string,"full_tank"?: boolean,"id"?: string,"litres": number,"odometer_km": number,"truck_id": string
                  }
                  Update: {
                    "agency_id"?: string,"created_at"?: string,"expense_id"?: string | null,"filled_on"?: string,"full_tank"?: boolean,"id"?: string,"litres"?: number,"odometer_km"?: number,"truck_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_fuel_fills_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_fuel_fills_expense_agency_fkey"
      columns: ["expense_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_expenses"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_fuel_fills_truck_agency_fkey"
      columns: ["truck_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_trucks"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_maintenance_items": {
                  Row: {
                    "agency_id": string,"created_at": string,"id": string,"interval_days": number | null,"interval_km": number | null,"last_service_km": number | null,"last_service_on": string | null,"name": string,"truck_id": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"created_at"?: string,"id"?: string,"interval_days"?: number | null,"interval_km"?: number | null,"last_service_km"?: number | null,"last_service_on"?: string | null,"name": string,"truck_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"created_at"?: string,"id"?: string,"interval_days"?: number | null,"interval_km"?: number | null,"last_service_km"?: number | null,"last_service_on"?: string | null,"name"?: string,"truck_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_maintenance_items_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_maintenance_items_truck_agency_fkey"
      columns: ["truck_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_trucks"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_maintenance_services": {
                  Row: {
                    "agency_id": string,"cost_paise": number,"created_at": string,"created_by": string | null,"expense_id": string | null,"id": string,"idempotency_key": string,"item_id": string,"service_km": number,"service_on": string
                  }
                  Insert: {
                    "agency_id": string,"cost_paise"?: number,"created_at"?: string,"created_by"?: string | null,"expense_id"?: string | null,"id"?: string,"idempotency_key": string,"item_id": string,"service_km": number,"service_on": string
                  }
                  Update: {
                    "agency_id"?: string,"cost_paise"?: number,"created_at"?: string,"created_by"?: string | null,"expense_id"?: string | null,"id"?: string,"idempotency_key"?: string,"item_id"?: string,"service_km"?: number,"service_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_maintenance_services_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_maintenance_services_expense_agency_fkey"
      columns: ["expense_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_expenses"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_maintenance_services_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "agency_maintenance_items"
      referencedColumns: ["id"]
    }
                  ]
                },"agency_load_plan_lines": {
                  Row: {
                    "agency_id": string,"id": string,"load_id": string,"order_line_id": string,"plan_id": string,"quantity": number
                  }
                  Insert: {
                    "agency_id": string,"id"?: string,"load_id": string,"order_line_id": string,"plan_id": string,"quantity": number
                  }
                  Update: {
                    "agency_id"?: string,"id"?: string,"load_id"?: string,"order_line_id"?: string,"plan_id"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_load_plan_lines_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_load_plan_lines_load_fk"
      columns: ["load_id", "plan_id"]
isOneToOne: false
      referencedRelation: "agency_load_plan_loads"
      referencedColumns: ["id", "plan_id"]
    },{
      foreignKeyName: "agency_load_plan_lines_load_tenant_fk"
      columns: ["load_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_load_plan_loads"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_load_plan_lines_order_line_fk"
      columns: ["order_line_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_order_lines"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_load_plan_lines_plan_fk"
      columns: ["plan_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_load_plans"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_load_plan_loads": {
                  Row: {
                    "agency_id": string,"id": string,"plan_id": string,"total_kg": number,"truck_id": string,"utilization_pct": number
                  }
                  Insert: {
                    "agency_id": string,"id"?: string,"plan_id": string,"total_kg": number,"truck_id": string,"utilization_pct": number
                  }
                  Update: {
                    "agency_id"?: string,"id"?: string,"plan_id"?: string,"total_kg"?: number,"truck_id"?: string,"utilization_pct"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_load_plan_loads_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_load_plan_loads_plan_fk"
      columns: ["plan_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_load_plans"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_load_plan_loads_truck_fk"
      columns: ["truck_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_trucks"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_load_plan_unmet": {
                  Row: {
                    "agency_id": string,"id": string,"order_line_id": string,"plan_id": string,"reason": string
                  }
                  Insert: {
                    "agency_id": string,"id"?: string,"order_line_id": string,"plan_id": string,"reason": string
                  }
                  Update: {
                    "agency_id"?: string,"id"?: string,"order_line_id"?: string,"plan_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_load_plan_unmet_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_load_plan_unmet_order_line_fk"
      columns: ["order_line_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_order_lines"
      referencedColumns: ["id", "agency_id"]
    },{
      foreignKeyName: "agency_load_plan_unmet_plan_fk"
      columns: ["plan_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_load_plans"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"agency_load_plans": {
                  Row: {
                    "agency_id": string,"approved_at": string | null,"approved_by": string | null,"batch_id": string | null,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"name": string,"payload_hash": string | null,"plan_version": number,"status": string,"version": number
                  }
                  Insert: {
                    "agency_id": string,"approved_at"?: string | null,"approved_by"?: string | null,"batch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"name": string,"payload_hash"?: string | null,"plan_version"?: number,"status"?: string,"version"?: number
                  }
                  Update: {
                    "agency_id"?: string,"approved_at"?: string | null,"approved_by"?: string | null,"batch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"name"?: string,"payload_hash"?: string | null,"plan_version"?: number,"status"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agency_load_plans_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agency_load_plans_batch_fk"
      columns: ["batch_id", "agency_id"]
isOneToOne: false
      referencedRelation: "agency_order_batches"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"platform_billing_settings": {
                  Row: {
                    "address": string | null,"enforcement_enabled": boolean,"gstin": string | null,"legal_name": string | null,"sac_code": string,"state_code": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "address"?: string | null,"enforcement_enabled"?: boolean,"gstin"?: string | null,"legal_name"?: string | null,"sac_code"?: string,"state_code"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"enforcement_enabled"?: boolean,"gstin"?: string | null,"legal_name"?: string | null,"sac_code"?: string,"state_code"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"subscription_backfill_conflicts": {
                  Row: {
                    "candidate_agency_ids": string[],"chosen_agency_id": string | null,"details": Json,"id": string,"logged_at": string,"reason": string,"subscription_id": string,"user_id": string | null
                  }
                  Insert: {
                    "candidate_agency_ids"?: string[],"chosen_agency_id"?: string | null,"details"?: Json,"id"?: string,"logged_at"?: string,"reason": string,"subscription_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "candidate_agency_ids"?: string[],"chosen_agency_id"?: string | null,"details"?: Json,"id"?: string,"logged_at"?: string,"reason"?: string,"subscription_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"subscription_credit_notes": {
                  Row: {
                    "agency_id": string,"cgst_paise": number,"credit_note_number": string,"id": string,"igst_paise": number,"invoice_id": string,"issued_at": string,"refund_id": string,"sgst_paise": number,"taxable_paise": number,"total_paise": number
                  }
                  Insert: {
                    "agency_id": string,"cgst_paise"?: number,"credit_note_number": string,"id"?: string,"igst_paise"?: number,"invoice_id": string,"issued_at"?: string,"refund_id": string,"sgst_paise"?: number,"taxable_paise": number,"total_paise": number
                  }
                  Update: {
                    "agency_id"?: string,"cgst_paise"?: number,"credit_note_number"?: string,"id"?: string,"igst_paise"?: number,"invoice_id"?: string,"issued_at"?: string,"refund_id"?: string,"sgst_paise"?: number,"taxable_paise"?: number,"total_paise"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_credit_notes_invoice_fk"
      columns: ["invoice_id", "agency_id"]
isOneToOne: false
      referencedRelation: "subscription_invoices"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"subscription_invoice_counters": {
                  Row: {
                    "fy": string,"last_no": number,"series": string
                  }
                  Insert: {
                    "fy": string,"last_no": number,"series": string
                  }
                  Update: {
                    "fy"?: string,"last_no"?: number,"series"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscription_invoices": {
                  Row: {
                    "agency_id": string,"cgst_paise": number,"fy": string,"gst_rate_pct": number,"id": string,"igst_paise": number,"invoice_number": string,"issued_at": string,"place_of_supply_state_code": string,"recipient_address": string | null,"recipient_gstin": string | null,"recipient_name": string | null,"sac_code": string,"series": string,"sgst_paise": number,"supplier_address": string | null,"supplier_gstin": string,"supplier_legal_name": string | null,"supplier_state_code": string,"taxable_paise": number,"total_paise": number
                  }
                  Insert: {
                    "agency_id": string,"cgst_paise"?: number,"fy": string,"gst_rate_pct"?: number,"id"?: string,"igst_paise"?: number,"invoice_number": string,"issued_at"?: string,"place_of_supply_state_code": string,"recipient_address"?: string | null,"recipient_gstin"?: string | null,"recipient_name"?: string | null,"sac_code": string,"series"?: string,"sgst_paise"?: number,"supplier_address"?: string | null,"supplier_gstin": string,"supplier_legal_name"?: string | null,"supplier_state_code": string,"taxable_paise": number,"total_paise": number
                  }
                  Update: {
                    "agency_id"?: string,"cgst_paise"?: number,"fy"?: string,"gst_rate_pct"?: number,"id"?: string,"igst_paise"?: number,"invoice_number"?: string,"issued_at"?: string,"place_of_supply_state_code"?: string,"recipient_address"?: string | null,"recipient_gstin"?: string | null,"recipient_name"?: string | null,"sac_code"?: string,"series"?: string,"sgst_paise"?: number,"supplier_address"?: string | null,"supplier_gstin"?: string,"supplier_legal_name"?: string | null,"supplier_state_code"?: string,"taxable_paise"?: number,"total_paise"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_invoices_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_trial_claims": {
                  Row: {
                    "agency_id": string,"claimed_at": string,"claimed_by": string | null,"gstin_norm": string | null,"id": string,"phone_norm": string | null,"subscription_id": string | null
                  }
                  Insert: {
                    "agency_id": string,"claimed_at"?: string,"claimed_by"?: string | null,"gstin_norm"?: string | null,"id"?: string,"phone_norm"?: string | null,"subscription_id"?: string | null
                  }
                  Update: {
                    "agency_id"?: string,"claimed_at"?: string,"claimed_by"?: string | null,"gstin_norm"?: string | null,"id"?: string,"phone_norm"?: string | null,"subscription_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_trial_claims_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: true
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_trial_claims_subscription_fk"
      columns: ["subscription_id", "agency_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"subscription_coupon_redemptions": {
                  Row: {
                    "agency_id": string,"coupon_code": string,"cycle_no": number,"id": string,"payment_id": string,"redeemed_at": string,"subscription_id": string
                  }
                  Insert: {
                    "agency_id": string,"coupon_code": string,"cycle_no": number,"id"?: string,"payment_id": string,"redeemed_at"?: string,"subscription_id": string
                  }
                  Update: {
                    "agency_id"?: string,"coupon_code"?: string,"cycle_no"?: number,"id"?: string,"payment_id"?: string,"redeemed_at"?: string,"subscription_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_coupon_redemptions_agency_id_fkey"
      columns: ["agency_id"]
isOneToOne: false
      referencedRelation: "transport_agencies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_coupon_redemptions_coupon_code_fkey"
      columns: ["coupon_code"]
isOneToOne: false
      referencedRelation: "subscription_coupons"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "subscription_coupon_redemptions_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "payment_history"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_coupon_redemptions_subscription_fk"
      columns: ["subscription_id", "agency_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id", "agency_id"]
    }
                  ]
                },"subscription_coupons": {
                  Row: {
                    "code": string,"created_at": string,"max_cycles": number,"max_redemptions": number | null,"monthly_only": boolean,"percent_off": number,"valid_until": string | null
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"max_cycles": number,"max_redemptions"?: number | null,"monthly_only"?: boolean,"percent_off": number,"valid_until"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"max_cycles"?: number,"max_redemptions"?: number | null,"monthly_only"?: boolean,"percent_off"?: number,"valid_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"subscription_refund_exceptions": {
                  Row: {
                    "agency_id": string | null,"amount_paise": number,"created_at": string,"detail": Json,"id": string,"payment_id": string,"payment_row_id": string | null,"reason": string,"refund_id": string
                  }
                  Insert: {
                    "agency_id"?: string | null,"amount_paise": number,"created_at"?: string,"detail"?: Json,"id"?: string,"payment_id": string,"payment_row_id"?: string | null,"reason": string,"refund_id": string
                  }
                  Update: {
                    "agency_id"?: string | null,"amount_paise"?: number,"created_at"?: string,"detail"?: Json,"id"?: string,"payment_id"?: string,"payment_row_id"?: string | null,"reason"?: string,"refund_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscription_reminders": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"period_end": string,"subscription_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"period_end": string,"subscription_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"period_end"?: string,"subscription_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_reminders_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_sweep_runs": {
                  Row: {
                    "as_of": string,"finished_at": string | null,"grace_expired": number,"grace_started": number,"id": string,"reminders_created": number,"result": Json | null,"started_at": string,"trials_expired": number
                  }
                  Insert: {
                    "as_of": string,"finished_at"?: string | null,"grace_expired"?: number,"grace_started"?: number,"id"?: string,"reminders_created"?: number,"result"?: Json | null,"started_at"?: string,"trials_expired"?: number
                  }
                  Update: {
                    "as_of"?: string,"finished_at"?: string | null,"grace_expired"?: number,"grace_started"?: number,"id"?: string,"reminders_created"?: number,"result"?: Json | null,"started_at"?: string,"trials_expired"?: number
                  }
                  Relationships: [
                    
                  ]
                },"razorpay_webhook_attempts": {
                  Row: {
                    "at": string,"attempt_no": number,"event_id": string,"sqlstate_or_code": string
                  }
                  Insert: {
                    "at"?: string,"attempt_no": number,"event_id": string,"sqlstate_or_code": string
                  }
                  Update: {
                    "at"?: string,"attempt_no"?: number,"event_id"?: string,"sqlstate_or_code"?: string
                  }
                  Relationships: [
                    
                  ]
                },"razorpay_webhook_events": {
                  Row: {
                    "error": string | null,"event_id": string,"event_type": string,"order_id": string | null,"payload": Json | null,"payload_sha256": string,"payment_id": string | null,"processed_at": string,"received_at": string,"result": string
                  }
                  Insert: {
                    "error"?: string | null,"event_id": string,"event_type": string,"order_id"?: string | null,"payload"?: Json | null,"payload_sha256": string,"payment_id"?: string | null,"processed_at": string,"received_at"?: string,"result": string
                  }
                  Update: {
                    "error"?: string | null,"event_id"?: string,"event_type"?: string,"order_id"?: string | null,"payload"?: Json | null,"payload_sha256"?: string,"payment_id"?: string | null,"processed_at"?: string,"received_at"?: string,"result"?: string
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
"is_job_trip_photo_url":
{ Args: { "p_job_offer_id": string,"p_url": string,"p_user_id": string }; Returns: boolean
                           },
"is_shipment_driver":
{ Args: { "p_shipment_id": string }; Returns: boolean
                           },
"persist_driver_job_offer_progress":
{ Args: { "p_extra"?: Json,"p_job_offer_id": string,"p_status"?: string }; Returns: {
              "delivered_at": string,"delivery_arrived_at": string,"job_offer_id": string,"journey_started_at": string,"otp_attempts_remaining": number,"photo_delivery_url": string,"photo_loading_url": string,"pickup_arrived_at": string,"result_code": string,"status": string,"total_trips": number
            }[]
                           },
"resolve_login_identifier":
{ Args: { "p_identifier": string }; Returns: string
                           },
"respond_to_job_offer":
{ Args: { "p_accept": boolean,"p_decline_reason"?: string,"p_job_offer_id": string }; Returns: {
              "active_job_id": string,"offer_id": string,"offer_status": string,"responded_at": string
            }[]
                           },
"agency_caller_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"agency_client_agreement_create":
{ Args: { "p_client_gstin"?: string,"p_client_name": string,"p_idempotency_key"?: string,"p_payment_terms_days"?: number }; Returns: Json
                           },
"agency_client_agreement_update":
{ Args: { "p_agreement_id": string,"p_expected_version": number,"p_patch"?: Json }; Returns: Json
                           },
"agency_client_contact_create":
{ Args: { "p_agreement_id": string,"p_email"?: string,"p_full_name": string,"p_idempotency_key"?: string,"p_phone": string,"p_site_id"?: string }; Returns: Json
                           },
"agency_client_contact_update":
{ Args: { "p_contact_id": string,"p_expected_version": number,"p_patch"?: Json }; Returns: Json
                           },
"agency_client_site_create":
{ Args: { "p_address_line": string,"p_agreement_id": string,"p_city": string,"p_idempotency_key"?: string,"p_label": string,"p_pincode": string,"p_site_kind": string,"p_state": string }; Returns: Json
                           },
"agency_client_site_update":
{ Args: { "p_expected_version": number,"p_patch"?: Json,"p_site_id": string }; Returns: Json
                           },
"agency_driver_invitation_accept":
{ Args: { "p_token": string }; Returns: Json
                           },
"agency_driver_invitation_create":
{ Args: { "p_expires_in_days"?: number,"p_idempotency_key"?: string,"p_invited_phone": string }; Returns: Json
                           },
"agency_driver_invitation_revoke":
{ Args: { "p_expected_version": number,"p_invitation_id": string }; Returns: Json
                           },
"agency_member_accept":
{ Args: { "p_token": string }; Returns: Json
                           },
"agency_member_change_scope":
{ Args: { "p_expected_version": number,"p_membership_id": string,"p_scope": string }; Returns: Json
                           },
"agency_member_has_scope":
{ Args: { "p_agency_id": string,"p_scope": string }; Returns: boolean
                           },
"agency_member_invitation_revoke":
{ Args: { "p_expected_version": number,"p_invitation_id": string }; Returns: Json
                           },
"agency_member_invite":
{ Args: { "p_expires_in_days"?: number,"p_idempotency_key"?: string,"p_invited_email": string,"p_scope": string }; Returns: Json
                           },
"agency_member_revoke":
{ Args: { "p_expected_version": number,"p_membership_id": string }; Returns: Json
                           },
"agency_random_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"agency_tariff_rate_at":
{ Args: { "p_agreement_id": string,"p_as_of": string,"p_destination": string,"p_origin": string,"p_vehicle_type": string }; Returns: Database["public"]["Tables"]["agency_tariff_versions"]["Row"][]
                           },
"agency_tariff_version_publish":
{ Args: { "p_agreement_id": string,"p_destination": string,"p_effective_from": string,"p_effective_to"?: string,"p_idempotency_key"?: string,"p_origin": string,"p_rate_amount": number,"p_rate_basis": string,"p_supersedes_version_id"?: string,"p_vehicle_type"?: string }; Returns: Json
                           },
"agency_token_hash":
{ Args: { "p_token": string }; Returns: string
                           },
"release_fleet_assignment":
{ Args: { "p_expected_version": number,"p_reservation_id": string }; Returns: Json
                           },
"release_stale_fleet_reservations":
{ Args: { "p_agency_id"?: string,"p_as_of"?: string }; Returns: number
                           },
"reserve_fleet_assignment":
{ Args: { "p_agency_job_id": string,"p_driver_employment_id": string,"p_expected_vehicle_version": number,"p_idempotency_key": string,"p_job_offer_id": string,"p_vehicle_id": string,"p_window_end": string,"p_window_start": string }; Returns: Json
                           },
"agency_caller_agencies":
{ Args: { "p_scopes": string[] }; Returns: string[]
                           },
"resolve_caller_agency_for_scopes":
{ Args: { "p_scopes": string[] }; Returns: string
                           },
"shipment_accepts_agency_jobs":
{ Args: { "p_shipment_id": string }; Returns: boolean
                           },
"agency_job_assign_driver":
{ Args: { "p_driver_id": string,"p_job_id": string }; Returns: Json
                           },
"agency_job_set_status":
{ Args: { "p_job_id": string,"p_status": string }; Returns: Json
                           },
"agency_truck_assign_driver":
{ Args: { "p_driver_id": string,"p_expected_version": number,"p_truck_id": string }; Returns: Json
                           },
"agency_truck_unassign_driver":
{ Args: { "p_expected_version": number,"p_truck_id": string }; Returns: Json
                           },
"run_expiry_sweeps":
{ Args: { "p_as_of"?: string }; Returns: Json
                           },
"agency_driver_payout_request":
{ Args: { "p_amount": number,"p_driver_id": string,"p_idempotency_key": string,"p_note": string }; Returns: Json
                           },
"agency_order_cancel":
{ Args: { "p_expected_version": number,"p_order_id": string }; Returns: Json
                           },
"agency_order_import":
{ Args: { "p_agreement_id": string,"p_file_hash": string,"p_idempotency_key": string,"p_lines": Json }; Returns: Json
                           },
"agency_consignment_create":
{ Args: { "p_idempotency_key": string,"p_order_id": string }; Returns: Json
                           },
"agency_consignment_event":
{ Args: { "p_consignment_id": string,"p_event": string,"p_expected_version": number,"p_idempotency_key": string,"p_note": string }; Returns: Json
                           },
"agency_driver_rate_set":
{ Args: { "p_base_paise": number,"p_driver_id": string,"p_expected_version": number,"p_per_km_paise": number,"p_per_tonne_paise": number }; Returns: Json
                           },
"agency_erp_connection_create":
{ Args: { "p_agreement_id": string,"p_client_id": string,"p_idempotency_key": string,"p_kind": string,"p_name": string }; Returns: Json
                           },
"agency_erp_connection_rotate_secret":
{ Args: { "p_connection_id": string,"p_expected_version": number }; Returns: Json
                           },
"agency_erp_connection_set_status":
{ Args: { "p_connection_id": string,"p_expected_version": number,"p_to_status": string }; Returns: Json
                           },
"agency_erp_hash":
{ Args: { "p_text": string }; Returns: string
                           },
"agency_erp_new_secret":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"agency_expense_record":
{ Args: { "p_amount_paise": number,"p_category": string,"p_idempotency_key": string,"p_note": string,"p_spent_on": string,"p_truck_id": string }; Returns: Json
                           },
"agency_expense_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"agency_fuel_fill_record":
{ Args: { "p_amount_paise": number,"p_filled_on": string,"p_full_tank": boolean,"p_idempotency_key": string,"p_litres": number,"p_odometer_km": number,"p_truck_id": string }; Returns: Json
                           },
"agency_incident_open":
{ Args: { "p_dedupe_key": string,"p_details": Json,"p_job_id": string,"p_kind": string }; Returns: Json
                           },
"agency_incident_update":
{ Args: { "p_expected_version": number,"p_incident_id": string,"p_note": string,"p_to_status": string }; Returns: Json
                           },
"agency_invoice_cancel":
{ Args: { "p_expected_version": number,"p_invoice_id": string,"p_reason": string }; Returns: Json
                           },
"agency_invoice_issue":
{ Args: { "p_client_id": string,"p_gst_rate_pct": number,"p_idempotency_key": string,"p_lines": Json,"p_place_of_supply_state": string,"p_reverse_charge": boolean,"p_round_off": boolean,"p_supplier_state": string }; Returns: Json
                           },
"agency_invoice_record_payment":
{ Args: { "p_amount_paise": number,"p_expected_version": number,"p_idempotency_key": string,"p_invoice_id": string,"p_method": string,"p_received_on": string,"p_reference": string }; Returns: Json
                           },
"agency_maintenance_item_upsert":
{ Args: { "p_expected_version": number,"p_interval_days": number,"p_interval_km": number,"p_last_service_km": number,"p_last_service_on": string,"p_name": string,"p_truck_id": string }; Returns: Json
                           },
"agency_maintenance_service_done":
{ Args: { "p_cost_paise": number,"p_expected_version": number,"p_idempotency_key": string,"p_item_id": string,"p_service_km": number,"p_service_on": string }; Returns: Json
                           },
"agency_payroll_adjust":
{ Args: { "p_amount_paise": number,"p_driver_id": string,"p_kind": string,"p_period_id": string,"p_reason": string }; Returns: Json
                           },
"agency_payroll_caller_driver_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"agency_payroll_close_period":
{ Args: { "p_idempotency_key": string,"p_period_end": string,"p_period_start": string }; Returns: Json
                           },
"agency_payroll_my_lines":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"agency_trip_live":
{ Args: { "p_job_id": string }; Returns: Json
                           },
"erp_event_ingest":
{ Args: { "p_connection_id": string,"p_external_event_id": string,"p_lines": Json,"p_secret": string }; Returns: Json
                           },
"tracking_caller_driver_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"tracking_ping_record":
{ Args: { "p_job_id": string,"p_lat": number,"p_lng": number,"p_recorded_at": string,"p_speed_kmph": number }; Returns: Json
                           },
"agency_payroll_open_period":
{ Args: { "p_idempotency_key": string,"p_period_end": string,"p_period_start": string }; Returns: Json
                           },
"agency_consignment_qr":
{ Args: { "p_consignment_id": string }; Returns: Json
                           },
"agency_load_plan_approve":
{ Args: { "p_expected_version": number,"p_plan_id": string }; Returns: Json
                           },
"agency_load_plan_cancel":
{ Args: { "p_expected_version": number,"p_plan_id": string }; Returns: Json
                           },
"agency_load_plan_flatten":
{ Args: { "p_loads": Json }; Returns: {
              "load_idx": number,"line_idx": number,"truck_id": string,"order_line_id": string,"quantity": number
            }[]
                           },
"agency_load_plan_save":
{ Args: { "p_batch_id": string,"p_idempotency_key": string,"p_loads": Json,"p_name": string,"p_unmet": Json }; Returns: Json
                           },
"agency_load_plan_weight":
{ Args: { "p_quantity": number,"p_unit": string,"p_weight_per_unit": number }; Returns: number
                           },
"agency_subscription_entitlement":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"agency_subscription_start_trial":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"agency_subscription_state":
{ Args: { "p_agency_id": string }; Returns: Json
                           },
"platform_billing_settings_update":
{ Args: { "p_address": string,"p_enforcement_enabled": boolean,"p_gstin": string,"p_legal_name": string,"p_sac_code": string,"p_state_code": string }; Returns: Json
                           },
"subscription_entitlement_snapshot":
{ Args: { "p_agency_id": string }; Returns: Json
                           },
"subscription_next_invoice_number":
{ Args: { "p_at": string,"p_series": string }; Returns: string
                           },
"subscription_place_of_supply":
{ Args: { "p_agency_state": string,"p_gstin": string }; Returns: string
                           },
"subscription_row_for_user":
{ Args: { "p_statuses": string[],"p_user_id": string,"p_write"?: boolean }; Returns: string
                           },
"subscription_tax_checked":
{ Args: { "p_pos_state": string,"p_supplier_state": string,"p_taxable_paise": number }; Returns: number
                           },
"subscription_tax_split":
{ Args: { "p_pos_state": string,"p_supplier_state": string,"p_taxable_paise": number }; Returns: {
              "cgst_paise": number,"sgst_paise": number,"igst_paise": number,"total_paise": number
            }[]
                           },
"subscription_usage_visible":
{ Args: { "p_subscription_id": string }; Returns: boolean
                           },
"agency_subscription_assert":
{ Args: { "p_action": string,"p_add": number,"p_agency_id": string }; Returns: undefined
                           },
"agency_subscription_lock":
{ Args: { "p_agency_id": string }; Returns: undefined
                           },
"run_subscription_sweeps":
{ Args: { "p_as_of"?: string }; Returns: Json
                           },
"subscription_activate_payment":
{ Args: { "p_amount_paise": number,"p_currency": string,"p_method": string,"p_order_id": string,"p_payment_id": string,"p_source": string }; Returns: Json
                           },
"subscription_create_order":
{ Args: { "p_agency_id": string,"p_billing_cycle": string,"p_coupon_code": string,"p_plan_tier": string,"p_razorpay_order_id": string }; Returns: Json
                           },
"subscription_note_refund_exception":
{ Args: { "p_agency_id": string,"p_amount_paise": number,"p_detail"?: Json,"p_payment_id": string,"p_payment_row_id": string,"p_reason": string,"p_refund_id": string }; Returns: string
                           },
"subscription_note_refusal":
{ Args: { "p_error"?: string,"p_payment_id": string,"p_refusal": string,"p_row_id": string }; Returns: undefined
                           },
"subscription_quote_order":
{ Args: { "p_agency_id": string,"p_billing_cycle": string,"p_coupon_code": string,"p_plan_tier": string }; Returns: Json
                           },
"subscription_record_refund":
{ Args: { "p_amount_paise": number,"p_payment_id": string,"p_refund_id": string }; Returns: Json
                           },
"subscription_support_reopen":
{ Args: { "p_agency_id": string }; Returns: Json
                           },
"subscription_verify_webhook_signature":
{ Args: { "p_body": string,"p_secret": string,"p_signature": string }; Returns: boolean
                           },
"subscription_webhook_process":
{ Args: { "p_event_id": string,"p_event_type": string,"p_payload": Json,"p_payload_sha256": string }; Returns: Json
                           },
"subscription_cancel_pending_order":
{ Args: { "p_razorpay_order_id": string }; Returns: Json
                           },
"agency_driver_directory":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"agency_subscription_invoices":
{ Args: Record<PropertyKey, never>; Returns: Json
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
