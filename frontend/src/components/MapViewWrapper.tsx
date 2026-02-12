/**
 * MapViewWrapper - Smart Map Component Selector
 * 
 * Automatically uses Google Maps when API key is available,
 * falls back to Leaflet/OpenStreetMap when not configured.
 * 
 * Usage: Replace <MapView /> with <MapViewWrapper /> in your components
 */

import { lazy, Suspense } from 'react'
import type { MapMarker, MapRoute, GoogleMapViewProps } from './GoogleMapView'

function hasUsableGoogleMapsKey(key?: string): boolean {
  if (!key) return false
  const normalized = key.trim().toUpperCase()
  if (!normalized) return false
  return !normalized.includes('REPLACE_ME') && !normalized.includes('YOUR_')
}

// Lazy load both map components
const GoogleMapView = lazy(() => import('./GoogleMapView'))
const LeafletMapView = lazy(() => import('./MapView'))

// Re-export types for convenience
export type { MapMarker, MapRoute, GoogleMapViewProps as MapViewProps }

interface MapViewWrapperProps extends GoogleMapViewProps {
  /** Force a specific map provider */
  forceProvider?: 'google' | 'leaflet' | 'auto'
}

export default function MapViewWrapper({ 
  forceProvider = 'auto',
  ...props 
}: MapViewWrapperProps) {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const googleConfigured = hasUsableGoogleMapsKey(googleMapsApiKey)
  
  // Determine which provider to use
  const useGoogle = forceProvider === 'google' || (forceProvider === 'auto' && googleConfigured)
  
  return (
    <Suspense 
      fallback={
        <div 
          className="flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl"
          style={{ height: props.height || '400px' }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-500">Loading map...</span>
          </div>
        </div>
      }
    >
      {useGoogle ? (
        <GoogleMapView {...props} />
      ) : (
        <LeafletMapView {...props} />
      )}
    </Suspense>
  )
}

/**
 * Hook to check which map provider is currently active
 */
export function useMapProvider(): 'google' | 'leaflet' {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  return hasUsableGoogleMapsKey(googleMapsApiKey) ? 'google' : 'leaflet'
}

/**
 * Check if Google Maps is configured
 */
export function isGoogleMapsConfigured(): boolean {
  return hasUsableGoogleMapsKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
}
