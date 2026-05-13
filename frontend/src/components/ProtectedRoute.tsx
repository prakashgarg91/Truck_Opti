import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import PageSkeleton from './PageSkeleton'
import PermissionDeniedState from './PermissionDeniedState'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export function getDefaultHomePathForRole(role?: string | null) {
  if (!role) return '/'
  if (role === 'admin') return '/admin'
  if (role === 'driver') return '/driver/dashboard'
  if (role === 'agency') return '/agency/dashboard'
  return '/dashboard'
}

/**
 * ProtectedRoute - Guards routes that require authentication
 * 
 * - Shows loading skeleton while auth state is initializing
 * - Redirects to /login if not authenticated
 * - Renders a permission-denied state if the route is outside the user's allowed roles
 * - Renders children if authenticated
 */
export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const location = useLocation()

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <PageSkeleton />
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && (!user || !allowedRoles.includes(user.role))) {
    return (
      <PermissionDeniedState
        attemptedPath={location.pathname}
        allowedRoles={allowedRoles}
        homePath={getDefaultHomePathForRole(user?.role)}
      />
    )
  }

  // Render protected content
  return <>{children}</>
}
