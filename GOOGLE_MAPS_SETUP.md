# Google Maps Integration Setup Guide

This guide walks you through configuring Google Maps for the TruckOpti app.

## Overview

The app now supports both **Google Maps** (with API key) and **Leaflet/OpenStreetMap** (fallback) automatically. The `MapViewWrapper` component detects if a Google Maps API key is configured and switches between providers.

## Project Information
- **Map Component**: `frontend/src/components/GoogleMapView.tsx`
- **Wrapper Component**: `frontend/src/components/MapViewWrapper.tsx`
- **Fallback Component**: `frontend/src/components/MapView.tsx` (Leaflet)
- **Environment Variable**: `VITE_GOOGLE_MAPS_API_KEY`

---

## Step 1: Get Google Maps API Key

### 1.1 Go to Google Cloud Console
1. Open [console.cloud.google.com](https://console.cloud.google.com/)
2. Select your TruckOpti project (same as OAuth project)
3. Navigate to **"APIs & Services" > "Credentials"**

### 1.2 Create API Key
1. Click **"+ Create Credentials"** > **"API key"**
2. Copy the generated API key
3. (Optional) Click **"Restrict Key"** to add security:
   - **Application restrictions**: HTTP referrers
   - **Website restrictions**: Add your domains
     - `localhost:5173/*` (development)
     - `your-production-domain.com/*` (production)

### 1.3 Enable Required APIs
1. Go to **"APIs & Services" > "Library"**
2. Enable these APIs:
   - ✅ **Maps JavaScript API** (required)
   - ✅ **Directions API** (for route optimization)
   - ✅ **Places API** (for location search)
   - ✅ **Geocoding API** (for address to coordinates)

---

## Step 2: Configure Environment Variables

### 2.1 Development Environment

Add to `frontend/.env.local`:

```bash
# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

### 2.2 Production Environment

Set in your hosting platform (Vercel, Netlify, etc.):

| Platform | Setting Location |
|----------|------------------|
| Vercel | Project Settings > Environment Variables |
| Netlify | Site Settings > Build & Deploy > Environment |
| AWS Amplify | Environment Variables in build settings |

---

## Step 3: Verify Integration

### 3.1 Start Development Server
```bash
cd frontend
npm run dev
```

### 3.2 Test Maps
1. Open `http://localhost:5173/routes`
2. Create a route or view existing routes
3. The map should display with Google Maps styling
4. Check browser console for any API errors

### 3.3 Verify Fallback (Optional)
1. Temporarily remove `VITE_GOOGLE_MAPS_API_KEY` from `.env.local`
2. Restart dev server
3. Maps should fallback to Leaflet/OpenStreetMap

---

## Component Usage

### Using MapViewWrapper (Recommended)

```tsx
import MapViewWrapper from '../components/MapViewWrapper'

function MyComponent() {
  const markers = [
    {
      id: '1',
      position: [19.0760, 72.8777], // [lat, lng]
      label: 'Mumbai',
      type: 'start' as const
    }
  ]

  return (
    <MapViewWrapper
      markers={markers}
      center={[20.5937, 78.9629]}
      zoom={5}
      height="400px"
    />
  )
}
```

### Props Interface

```typescript
interface MapViewProps {
  markers?: MapMarker[]       // Array of map markers
  routes?: MapRoute[]         // Array of route polylines
  center?: [number, number]   // [latitude, longitude]
  zoom?: number               // Default: 5
  height?: string            // Default: '400px'
  className?: string
  showFullscreen?: boolean   // Default: true
  onMarkerClick?: (marker: MapMarker) => void
}

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
```

---

## Troubleshooting

### Issue: "Google Maps API error: RefererNotAllowedMapError"
**Solution**: Add your domain to the API key restrictions in Google Cloud Console

### Issue: "Google Maps API error: ApiNotActivatedMapError"
**Solution**: Enable "Maps JavaScript API" in Google Cloud Console > APIs & Services > Library

### Issue: Map shows "For development purposes only"
**Solution**: Billing is not enabled. Add a payment method in Google Cloud Console.

### Issue: Map doesn't load, shows fallback
**Solution**: Check browser console. If `VITE_GOOGLE_MAPS_API_KEY` is not set, the app automatically falls back to Leaflet.

---

## Pricing Considerations

Google Maps Platform has a **$200 monthly free credit**:
- ~28,000 map loads per month
- ~40,000 Directions API calls
- After free tier: $7 per 1,000 map loads

**Tips to reduce costs**:
1. Use lazy loading for maps
2. Implement map caching where possible
3. Consider Leaflet fallback for non-critical views

---

## Migration from Leaflet

The migration is seamless:
1. ✅ Install `@react-google-maps/api`
2. ✅ Create `GoogleMapView.tsx`
3. ✅ Update imports in `RoutesPage.tsx` and `TrackingPage.tsx`
4. ✅ Add `VITE_GOOGLE_MAPS_API_KEY` to environment
5. ✅ Build and deploy

Old Leaflet maps remain as fallback - no breaking changes!

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/GoogleMapView.tsx` | New Google Maps component |
| `frontend/src/components/MapViewWrapper.tsx` | Smart provider selector |
| `frontend/src/pages/RoutesPage.tsx` | Updated to use wrapper |
| `frontend/src/pages/TrackingPage.tsx` | Updated to use wrapper |
| `frontend/.env.example` | Added API key template |
| `frontend/package.json` | Added `@react-google-maps/api` |

---

## Next Steps

After Google Maps is configured:
1. ✅ Database Setup (completed)
2. ✅ Google OAuth (completed)
3. ✅ Google Maps (completed)
4. 🚀 Production Deployment Ready!
