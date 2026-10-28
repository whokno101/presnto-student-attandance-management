import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { homeFor } from '@/lib/navigation'

/**
 * 403 page. Reached from <RequireRole> (direct URL access to a forbidden page) or
 * from the axios interceptor when the API answers 403 FORBIDDEN.
 */
export default function Unauthorized() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const requiredRoles = location.state?.requiredRoles

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">403 — Access denied</CardTitle>
          <CardDescription>
            {requiredRoles?.length
              ? `This page is only available to: ${requiredRoles.join(', ')}.`
              : 'You do not have permission to view this page.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.name}</span>
              <Badge variant="outline" className="capitalize">
                {user.role}
              </Badge>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate(homeFor(user?.role), { replace: true })}>
              <ArrowLeft className="h-4 w-4" />
              Back to my dashboard
            </Button>
            <Button variant="outline" asChild>
              <Link to="/login">Switch account</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
