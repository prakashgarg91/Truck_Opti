import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Maximize2, Minimize2 } from 'lucide-react'

// Fix Leaflet default marker icon issue
// @ts-expect-error - Leaflet internals
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Custom marker icons
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 32px;
      height: 32px;
      background-color: ${color};
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="transform: rotate(45deg);">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  })
}

const startIcon = createCustomIcon('#22c55e') // green
const endIcon = createCustomIcon('#ef4444')   // red
const waypointIcon = createCustomIcon('#3b82f6') // blue
const truckIcon = createCustomIcon('#f59e0b') // amber

interface MapMarker {
  id: string
  position: [number, number]
  label: string
  type?: 'start' | 'end' | 'waypoint' | 'truck'
  popupContent?: React.ReactNode
}

interface MapRoute {
  points: [number, number][]
  color?: string
  weight?: number
}

interface MapViewProps {
  markers?: MapMarker[]
  routes?: MapRoute[]
  center?: [number, number]
  zoom?: number
  height?: string
  className?: string
  showFullscreen?: boolean
  onMarkerClick?: (marker: MapMarker) => void
}

// Map controller component for external control
function MapController({ 
  center, 
  markers 
}: { 
  center?: [number, number]
  markers?: MapMarker[] 
}) {
  const map = useMap()
  
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom())
    }
  }, [center, map])

  useEffect(() => {
    if (markers && markers.length > 0) {
      // Fit bounds to show all markers
      const bounds = L.latLngBounds(markers.map(m => m.position))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [markers, map])

  return null
}

export default function MapView({
  markers = [],
  routes = [],
  center = [20.5937, 78.9629], // Center of India
  zoom = 5,
  height = '400px',
  className = '',
  showFullscreen = true,
  onMarkerClick,
}: MapViewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const mapRef = useRef<L.Map | null>(null)

  const getMarkerIcon = (type?: string) => {
    switch (type) {
      case 'start':
        return startIcon
      case 'end':
        return endIcon
      case 'truck':
        return truckIcon
      case 'waypoint':
      default:
        return waypointIcon
    }
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  return (
    <div 
      className={`relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 ${
        isFullscreen ? 'fixed inset-0 z-[100] rounded-none' : ''
      } ${className}`}
      style={{ height: isFullscreen ? '100vh' : height }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController center={center} markers={markers} />

        {/* Render polylines for routes */}
        {routes.map((route, index) => (
          <Polyline
            key={`route-${index}`}
            positions={route.points}
            color={route.color || '#3b82f6'}
            weight={route.weight || 4}
            opacity={0.8}
            dashArray="10, 10"
          />
        ))}

        {/* Render markers */}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={marker.position}
            icon={getMarkerIcon(marker.type)}
            eventHandlers={{
              click: () => onMarkerClick?.(marker),
            }}
          >
            {marker.popupContent && (
              <Popup>
                <div className="min-w-[200px]">
                  <h4 className="font-semibold text-slate-900">{marker.label}</h4>
                  {marker.popupContent}
                </div>
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>

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
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-slate-600 dark:text-slate-300">Start</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-slate-600 dark:text-slate-300">Destination</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
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
