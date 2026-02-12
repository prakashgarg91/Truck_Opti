import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import PageSkeleton from './PageSkeleton'

interface ProtectedRouteProps {
  children: React.ReactNode
}

/**
 * ProtectedRoute - Guards routes that require authentication
 * 
 * - Shows loading skeleton while auth state is initializing
 * - Redirects to /login if not authenticated
 * - Renders children if authenticated
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore()
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
  
  // Render protected content
  return <>{children}</>
}
