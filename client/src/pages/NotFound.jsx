import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { homeFor } from '@/lib/navigation'

export default function NotFound() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Compass className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">404 — Page not found</CardTitle>
          <CardDescription>The page you are looking for does not exist or has moved.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to={user ? homeFor(user.role) : '/login'}>
              {user ? 'Back to my dashboard' : 'Go to sign in'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
