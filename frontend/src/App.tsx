import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// Layouts
import MobileLayout from './layouts/MobileLayout'
import AuthLayout from './layouts/AuthLayout'

// Pages - Eager loaded (auth pages for fast auth experience)
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import OTPPage from './pages/auth/OTPPage'
import AuthCallbackPage from './pages/auth/AuthCallbackPage'

// Components
import PageSkeleton from './components/PageSkeleton'
import ProtectedRoute from './components/ProtectedRoute'

// Pages - Lazy loaded (code-split for performance)
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const PackingPage = React.lazy(() => import('./pages/PackingPage'))
const RoutesPage = React.lazy(() => import('./pages/RoutesPage'))
const TrackingPage = React.lazy(() => import('./pages/TrackingPage'))
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'))
const ManagementPage = React.lazy(() => import('./pages/ManagementPage'))
const TrucksPage = React.lazy(() => import('./pages/TrucksPage'))
const CartonsPage = React.lazy(() => import('./pages/CartonsPage'))
const CustomersPage = React.lazy(() => import('./pages/CustomersPage'))
const SaleOrdersPage = React.lazy(() => import('./pages/SaleOrdersPage'))
const InvoicePage = React.lazy(() => import('./pages/InvoicePage'))
const PricingPage = React.lazy(() => import('./pages/PricingPage'))
const CheckoutPage = React.lazy(() => import('./pages/CheckoutPage'))
const PaymentCallbackPage = React.lazy(() => import('./pages/PaymentCallbackPage'))
const TestPaymentPage = React.lazy(() => import('./pages/TestPaymentPage'))

function AppContent() {
  const { initialize } = useAuthStore()
  
  // Initialize auth state on app mount
  useEffect(() => {
    initialize()
  }, [initialize])
  
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        {/* Auth routes - accessible without authentication */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/otp" element={<OTPPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
          <Route path="/test-payment" element={<TestPaymentPage />} />
        </Route>
        
        {/* Protected routes - require authentication */}
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
          <Route path="/sale-orders" element={<SaleOrdersPage />} />
          <Route path="/invoice/:shipmentId" element={<InvoicePage />} />
        </Route>
        
        {/* Catch all - redirect to home or login based on auth state */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return <AppContent />
}
