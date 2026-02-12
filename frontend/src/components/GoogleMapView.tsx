import { useState, useCallback, useEffect } from 'react'
import { 
  GoogleMap, 
  useJsApiLoader, 
  Marker, 
  InfoWindow, 
  Polyline,
  useGoogleMap
} from '@react-google-maps/api'
import { Maximize2, Minimize2, AlertCircle } from 'lucide-react'

// Map marker types with colors
const MARKER_COLORS = {
  start: '#22c55e',   // green
  end: '#ef4444',     // red
  waypoint: '#3b82f6', // blue
  truck: '#f59e0b',   // amber
}

// Google Maps libraries to load
const GOOGLE_MAPS_LIBRARIES: ("places" | "geometry" | "drawing" | "visualization")[] = ['geometry']

// Map container style
const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%'
}

// Default map options
const DEFAULT_MAP_OPTIONS = {
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  zoomControl: true,
  gestureHandling: 'cooperative',
}

export interface MapMarker {
  id: string
  position: [number, number]
  label: string
  type?: 'start' | 'end' | 'waypoint' | 'truck'
  popupContent?: React.ReactNode
}

export interface MapRoute {
  points: [number, number][]
  color?: string
  weight?: number
}

export interface GoogleMapViewProps {
  markers?: MapMarker[]
  routes?: MapRoute[]
  center?: [number, number]
  zoom?: number
  height?: string
  className?: string
  showFullscreen?: boolean
  onMarkerClick?: (marker: MapMarker) => void
}

// Custom marker component with different colors
function MapMarkerComponent({ 
  marker, 
  isOpen, 
  onToggle,
  onClick 
}: { 
  marker: MapMarker
  isOpen: boolean
  onToggle: () => void
  onClick?: (marker: MapMarker) => void
}) {
  const color = MARKER_COLORS[marker.type || 'waypoint']
  
  // SVG marker icon
  const svgIcon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
        <path fill="${color}" stroke="white" stroke-width="2" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5" fill="white"/>
      </svg>
    `)}`,
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 32)
  }

  return (
    <Marker
      position={{ lat: marker.position[0], lng: marker.position[1] }}
      icon={svgIcon}
      onClick={() => {
        onToggle()
        onClick?.(marker)
      }}
    >
      {isOpen && marker.popupContent && (
        <InfoWindow
          position={{ lat: marker.position[0], lng: marker.position[1] }}
          onCloseClick={onToggle}
        >
          <div className="min-w-[200px] p-2">
            <h4 className="font-semibold text-slate-900 mb-1">{marker.label}</h4>
            {marker.popupContent}
          </div>
        </InfoWindow>
      )}
    </Marker>
  )
}

// Map bounds controller
function MapBoundsController({ markers }: { markers: MapMarker[] }) {
  const map = useGoogleMap()
  
  useEffect(() => {
    if (map && markers.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      markers.forEach(marker => {
        bounds.extend({ lat: marker.position[0], lng: marker.position[1] })
      })
      map.fitBounds(bounds)
    }
  }, [map, markers])
  
  return null
}

export default function GoogleMapView({
  markers = [],
  routes = [],
  center = [20.5937, 78.9629], // Center of India
  zoom = 5,
  height = '400px',
  className = '',
  showFullscreen = true,
  onMarkerClick,
}: GoogleMapViewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [openMarkerId, setOpenMarkerId] = useState<string | null>(null)
  const rawGoogleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  const googleMapsApiKey = rawGoogleMapsApiKey.trim()
  const googleMapsConfigured = googleMapsApiKey.length > 0
    && !googleMapsApiKey.toUpperCase().includes('REPLACE_ME')
    && !googleMapsApiKey.toUpperCase().includes('YOUR_')
  
  // Load Google Maps API
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: googleMapsConfigured ? googleMapsApiKey : '',
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: 'en',
    region: 'IN'
  })

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen)
  }, [isFullscreen])

  const handleMarkerToggle = useCallback((markerId: string) => {
    setOpenMarkerId(prev => prev === markerId ? null : markerId)
  }, [])

  // Handle load error
  if (loadError) {
    return (
      <div 
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${className}`}
        style={{ height }}
      >
        <div className="text-center p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
            Failed to load Google Maps
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Please check your API key configuration
          </p>
        </div>
      </div>
    )
  }

  // Show loading state
  if (!isLoaded) {
    return (
      <div 
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${className}`}
        style={{ height: isFullscreen ? '100vh' : height }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading map...</span>
        </div>
      </div>
    )
  }

  // Check if API key is configured
  if (!googleMapsConfigured) {
    return (
      <div 
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${className}`}
        style={{ height }}
      >
        <div className="text-center p-6 max-w-md">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
            Google Maps API Key Required
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Please set VITE_GOOGLE_MAPS_API_KEY in your environment variables.
            Using fallback map component.
          </p>
        </div>
      </div>
    )
  }

  const mapCenter = { lat: center[0], lng: center[1] }

  return (
    <div 
      className={`relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 ${
        isFullscreen ? 'fixed inset-0 z-[100] rounded-none' : ''
      } ${className}`}
      style={{ height: isFullscreen ? '100vh' : height }}
    >
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={mapCenter}
        zoom={zoom}
        options={DEFAULT_MAP_OPTIONS}
      >
        {/* Fit bounds to markers */}
        <MapBoundsController markers={markers} />

        {/* Render routes */}
        {routes.map((route, index) => (
          <Polyline
            key={`route-${index}`}
            path={route.points.map(p => ({ lat: p[0], lng: p[1] }))}
            options={{
              strokeColor: route.color || '#3b82f6',
              strokeWeight: route.weight || 4,
              strokeOpacity: 0.8,
            }}
          />
        ))}

        {/* Render markers */}
        {markers.map((marker) => (
          <MapMarkerComponent
            key={marker.id}
            marker={marker}
            isOpen={openMarkerId === marker.id}
            onToggle={() => handleMarkerToggle(marker.id)}
            onClick={onMarkerClick}
          />
        ))}
      </GoogleMap>

      {/* Fullscreen toggle button */}
      {showFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 z-[400] bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          ) : (
            <Maximize2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          )}
        </button>
      )}

      {/* Legend overlay */}
      {markers.length > 0 && (
        <div className="absolute bottom-4 left-4 z-[400] bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKER_COLORS.start }} />
              <span className="text-slate-600 dark:text-slate-300">Start</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKER_COLORS.end }} />
              <span className="text-slate-600 dark:text-slate-300">Destination</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKER_COLORS.truck }} />
              <span className="text-slate-600 dark:text-slate-300">Truck</span>
            </div>
          </div>
        </div>
      )}

      {/* Close fullscreen button (only in fullscreen mode) */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 left-4 z-[400] bg-white dark:bg-slate-800 px-4 py-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          ← Back to app
        </button>
      )}
    </div>
  )
}
