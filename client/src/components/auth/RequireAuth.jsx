import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import FullPageLoader from '@/components/common/FullPageLoader'

/**
 * Blocks the whole authenticated app tree.
 * - while a stored token is being verified: loader
 * - no token: redirect to /login, remembering where the user was heading
 */
export default function RequireAuth({ children }) {
  const { isAuthenticated, booting } = useAuth()
  const location = useLocation()

  if (booting) {
    return <FullPageLoader label="Checking your session..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children ?? <Outlet />
}
