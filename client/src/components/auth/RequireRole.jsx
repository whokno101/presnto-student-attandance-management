import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import FullPageLoader from '@/components/common/FullPageLoader'

/**
 * Role guard. Meant to be nested inside <RequireAuth>, but also re-checks auth
 * so it is safe on its own.
 *
 *   <RequireRole roles={['admin']}><ManageStudents /></RequireRole>
 */
export default function RequireRole({ roles = [], children }) {
  const { user, isAuthenticated, booting } = useAuth()
  const location = useLocation()

  if (booting) {
    return <FullPageLoader label="Checking your permissions..." />
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/403" replace state={{ from: location, requiredRoles: roles }} />
  }

  return children ?? <Outlet />
}
