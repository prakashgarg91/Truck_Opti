import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// Layouts
import MobileLayout from './layouts/MobileLayout'
import AuthLayout from './layouts/AuthLayout'
import DriverLayout from './layouts/DriverLayout'
import AgencyLayout from './layouts/AgencyLayout'

// Pages - Eager loaded (auth pages for fast auth experience)
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import OTPPage from './pages/auth/OTPPage'
import AuthCallbackPage from './pages/auth/AuthCallbackPage'

// Components
import PageSkeleton from './components/PageSkeleton'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'

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
const TestPaymentPage = import.meta.env.DEV
  ? React.lazy(() => import('./pages/TestPaymentPage'))
  : React.lazy(() => import('./pages/NotFoundPage'))

const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'))
const TermsPage = React.lazy(() => import('./pages/TermsPage'))
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage'))
const DriverRegisterPage = React.lazy(() => import('./pages/DriverRegisterPage'))
const CompanyProfilePage = React.lazy(() => import('./pages/CompanyProfilePage'))
const AdminDriversPage = React.lazy(() => import('./pages/AdminDriversPage'))
const AdminDashboardPage = React.lazy(() => import('./pages/AdminDashboardPage'))
const AdminAgenciesPage = React.lazy(() => import('./pages/AdminAgenciesPage'))
const AgencyRegisterPage = React.lazy(() => import('./pages/AgencyRegisterPage'))
const DriverDashboardPage = React.lazy(() => import('./pages/DriverDashboardPage'))
const DriverTripPage = React.lazy(() => import('./pages/DriverTripPage'))
const DriverEarningsPage = React.lazy(() => import('./pages/DriverEarningsPage'))
const DriverHistoryPage = React.lazy(() => import('./pages/DriverHistoryPage'))
const DriverDetailPage = React.lazy(() => import('./pages/DriverDetailPage'))
const AgencyDashboardPage = React.lazy(() => import('./pages/AgencyDashboardPage'))
const AgencyFleetPage = React.lazy(() => import('./pages/AgencyFleetPage'))
const AgencyJobsPage = React.lazy(() => import('./pages/AgencyJobsPage'))
const AgencyBillingPage = React.lazy(() => import('./pages/AgencyBillingPage'))
const AgencyDriversPage = React.lazy(() => import('./pages/AgencyDriversPage'))
const AgencyRatesPage = React.lazy(() => import('./pages/AgencyRatesPage'))
const NewShipmentPage = React.lazy(() => import('./pages/NewShipmentPage'))
const ShipmentHistoryPage = React.lazy(() => import('./pages/ShipmentHistoryPage'))

// Role-based home: redirects drivers/agencies to their portal, customers to Dashboard
function RoleHome() {
  const { user } = useAuthStore()
  if (user?.role === 'driver') return <Navigate to="/driver/dashboard" replace />
  if (user?.role === 'agency') return <Navigate to="/agency/dashboard" replace />
  return <Dashboard />
}

function AppContent() {
  const { initialize } = useAuthStore()

  // Initialize auth state on app mount
  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <ErrorBoundary>
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
          <Route path="/payment/success" element={<PaymentCallbackPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/subscription" element={<Navigate to="/pricing" replace />} />
          <Route path="/driver/register" element={<DriverRegisterPage />} />
          <Route path="/agency/register" element={<AgencyRegisterPage />} />
          {import.meta.env.DEV && (
            <Route path="/test-payment" element={<TestPaymentPage />} />
          )}
        </Route>

        {/* Protected routes - require authentication */}
        <Route element={
          <ProtectedRoute>
            <MobileLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<RoleHome />} />
          <Route path="/packing" element={<PackingPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/booking/new" element={<NewShipmentPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/management" element={<ManagementPage />} />
          <Route path="/management/trucks" element={<TrucksPage />} />
          <Route path="/management/cartons" element={<CartonsPage />} />
          <Route path="/management/customers" element={<CustomersPage />} />
          <Route path="/sale-orders" element={<SaleOrdersPage />} />
          <Route path="/invoice/:shipmentId" element={<InvoicePage />} />
          <Route path="/settings/company" element={<CompanyProfilePage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/drivers" element={<AdminDriversPage />} />
          <Route path="/admin/drivers/:id" element={<DriverDetailPage />} />
          <Route path="/admin/agencies" element={<AdminAgenciesPage />} />
          <Route path="/history" element={<ShipmentHistoryPage />} />
        </Route>

        {/* Driver Portal — separate layout with driver bottom nav */}
        <Route element={
          <ProtectedRoute>
            <DriverLayout />
          </ProtectedRoute>
        }>
          <Route path="/driver/dashboard" element={<DriverDashboardPage />} />
          <Route path="/driver/trip/:jobId" element={<DriverTripPage />} />
          <Route path="/driver/earnings" element={<DriverEarningsPage />} />
          <Route path="/driver/history" element={<DriverHistoryPage />} />
        </Route>

        {/* Agency Portal — separate layout with agency bottom nav */}
        <Route element={
          <ProtectedRoute>
            <AgencyLayout />
          </ProtectedRoute>
        }>
          <Route path="/agency/dashboard" element={<AgencyDashboardPage />} />
          <Route path="/agency/fleet" element={<AgencyFleetPage />} />
          <Route path="/agency/jobs" element={<AgencyJobsPage />} />
          <Route path="/agency/billing" element={<AgencyBillingPage />} />
          <Route path="/agency/drivers" element={<AgencyDriversPage />} />
          <Route path="/agency/rates" element={<AgencyRatesPage />} />
        </Route>

        {/* Catch all - show 404 page */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return <AppContent />
}
