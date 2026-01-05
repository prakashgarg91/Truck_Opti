import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// Layouts
import MobileLayout from './layouts/MobileLayout'
import AuthLayout from './layouts/AuthLayout'

// Pages
import LoginPage from './pages/auth/LoginPage'
import OTPPage from './pages/auth/OTPPage'
import Dashboard from './pages/Dashboard'
import PackingPage from './pages/PackingPage'
import RoutesPage from './pages/RoutesPage'
import TrackingPage from './pages/TrackingPage'
import ProfilePage from './pages/ProfilePage'
import ManagementPage from './pages/ManagementPage'
import TrucksPage from './pages/TrucksPage'
import CartonsPage from './pages/CartonsPage'
import CustomersPage from './pages/CustomersPage'

// Protected Route wrapper - BYPASSED FOR TESTING
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // const { isAuthenticated } = useAuthStore()
  
  // TEMPORARILY BYPASS AUTH FOR UI TESTING
  const isAuthenticated = true
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/otp" element={<OTPPage />} />
      </Route>
      
      {/* Protected routes with mobile layout */}
      <Route element={
        <ProtectedRoute>
          <MobileLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<Dashboard />} />
        <Route path="/packing" element={<PackingPage />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/tracking" element={<TrackingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/management" element={<ManagementPage />} />
        <Route path="/management/trucks" element={<TrucksPage />} />
        <Route path="/management/cartons" element={<CartonsPage />} />
        <Route path="/management/customers" element={<CustomersPage />} />
      </Route>
      
      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
