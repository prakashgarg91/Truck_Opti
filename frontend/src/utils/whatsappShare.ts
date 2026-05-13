// WhatsApp Sharing Utility
// Formats and shares content via WhatsApp deeplinks

import type { PackingJob } from '../services/supabaseApi'
import type { Route } from '../services/supabaseApi'
import type { Shipment } from '../services/supabaseApi'

const APP_URL = window.location.origin

function buildTrackingUrl(shipmentId?: string): string {
  if (!shipmentId) return `${APP_URL}/tracking`
  return `${APP_URL}/tracking?shipment=${encodeURIComponent(shipmentId)}`
}

function buildInvoiceUrl(shipmentId: string): string {
  return `${APP_URL}/invoice/${encodeURIComponent(shipmentId)}`
}

/**
 * Encode text for WhatsApp URL
 */
function encodeForWhatsApp(text: string): string {
  return encodeURIComponent(text)
}

/**
 * Open WhatsApp with pre-filled message
 */
function openWhatsApp(text: string): void {
  const url = `https://wa.me/?text=${encodeForWhatsApp(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Share packing summary via WhatsApp
 */
export function sharePackingSummary(job: PackingJob & { truckName?: string }): void {
  const text = `📦 *TruckOpti Packing Summary*

🚛 Truck: ${job.truckName || 'Selected Truck'}
📊 Volume Utilization: ${job.volume_utilization}%
⚖️ Weight Utilization: ${job.weight_utilization}%
📋 Items: ${job.items?.length || 0} types
💰 Est. Cost: ₹${job.total_cost}

View details: ${APP_URL}/packing`

  openWhatsApp(text)
}

/**
 * Share route details via WhatsApp
 */
export function shareRouteDetails(route: Route): void {
  const destinations = route.destinations.join(' → ')
  const text = `🚚 *TruckOpti Route Plan*

📍 ${route.start_location} → ${destinations}
📏 Distance: ${Math.round(route.total_distance)} km
⏱️ Est. Time: ${Math.floor(route.total_time / 60)}h ${Math.round(route.total_time % 60)}m
💰 Total Cost: ₹${Math.round(route.total_cost)}
🛣️ Toll: ₹${Math.round(route.toll_cost)}
⛽ Fuel: ₹${Math.round(route.fuel_cost)}

View on map: ${APP_URL}/routes`

  openWhatsApp(text)
}

/**
 * Share tracking link via WhatsApp
 */
export function shareTrackingLink(shipment: Shipment): void {
  const text = `📍 *TruckOpti Shipment Tracking*

🆔 Shipment ID: ${shipment.shipment_id}
🚛 Vehicle: ${shipment.vehicle_number || 'N/A'}
👤 Driver: ${shipment.driver_name || 'N/A'}
📦 Route: ${shipment.origin} → ${shipment.destination}
📊 Status: ${shipment.status.replace('_', ' ').toUpperCase()}
⚖️ Weight: ${shipment.total_weight} kg

Track live: ${buildTrackingUrl(shipment.id)}`

  openWhatsApp(text)
}

/**
 * Share invoice via WhatsApp
 */
export function shareInvoice(invoice: {
  invoiceNumber: string
  shipmentId: string
  totalAmount: number
  gstAmount: number
  customerName: string
  origin: string
  destination: string
}): void {
  const text = `🧾 *TruckOpti Transport Invoice*

🆔 Invoice: ${invoice.invoiceNumber}
📦 Shipment: ${invoice.shipmentId}
👤 Customer: ${invoice.customerName}
🚛 Route: ${invoice.origin} → ${invoice.destination}

💰 Amount: ₹${invoice.totalAmount}
📊 GST (18%): ₹${invoice.gstAmount}
💵 *Total: ₹${invoice.totalAmount + invoice.gstAmount}*

SAC Code: 996511
View invoice: ${buildInvoiceUrl(invoice.shipmentId)}`

  openWhatsApp(text)
}

/**
 * Generate generic share text for any content
 */
export function generateShareText(type: 'packing' | 'route' | 'tracking' | 'invoice', data: Record<string, unknown>): string {
  switch (type) {
    case 'packing':
      return `📦 TruckOpti Packing - ${data.truckName || 'Optimized Load'}\nView: ${APP_URL}/packing`
    case 'route':
      return `🚚 TruckOpti Route - ${data.origin || ''} to ${data.destination || ''}\nView: ${APP_URL}/routes`
    case 'tracking': {
      const shipmentId = typeof data.shipmentId === 'string' ? data.shipmentId : undefined
      return `📍 Track your shipment: ${buildTrackingUrl(shipmentId)}`
    }
    case 'invoice':
      if (typeof data.shipmentId === 'string') {
        return `🧾 TruckOpti Invoice ${data.invoiceNumber || ''}\nAmount: ₹${data.totalAmount || 0}\nView: ${buildInvoiceUrl(data.shipmentId)}`
      }
      return `🧾 TruckOpti Invoice ${data.invoiceNumber || ''}\nAmount: ₹${data.totalAmount || 0}`
    default:
      return `Check out TruckOpti: ${APP_URL}`
  }
}
