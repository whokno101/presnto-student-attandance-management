import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'

import Logo from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/context/AuthContext'
import { getErrorCode, getErrorMessage } from '@/lib/api'
import { homeFor } from '@/lib/navigation'

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@university.edu' },
  { role: 'Faculty', email: 'faculty1@university.edu' },
  { role: 'Student', email: 'student1@university.edu' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const REASON_MESSAGES = {
  expired: {
    title: 'Session expired',
    description: 'Your session timed out. Please sign in again.',
    variant: 'destructive',
  },
  deactivated: {
    title: 'Account deactivated',
    description: 'This account is no longer active. Contact an administrator.',
    variant: 'destructive',
  },
  unauthorized: {
    title: 'Please sign in',
    description: 'You need to be signed in to view that page.',
    variant: 'default',
  },
}

export default function Login() {
  const { login, isAuthenticated, user, booting } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Where RequireAuth was sending the user (e.g. a scanned /check-in?token=…
  // link). Only in-app paths are honoured, never an external URL.
  const from = location.state?.from
  const returnTo = from?.pathname && from.pathname.startsWith('/') && !from.pathname.startsWith('//') ? `${from.pathname}${from.search ?? ''}` : null
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()

  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reason = searchParams.get('reason')
  const reasonNotice = useMemo(() => (reason ? REASON_MESSAGES[reason] : null), [reason])

  // Surface the reason the user was bounced here (expired token, 403, ...).
  useEffect(() => {
    if (!reasonNotice) return
    toast({
      title: reasonNotice.title,
      description: reasonNotice.description,
      variant: reasonNotice.variant,
    })
    const next = new URLSearchParams(searchParams)
    next.delete('reason')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!booting && isAuthenticated) {
    return <Navigate to={homeFor(user?.role)} replace />
  }

  const validate = () => {
    const next = {}
    if (!form.email.trim()) next.email = 'Email is required'
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address'
    if (!form.password) next.password = 'Password is required'
    else if (form.password.length < 6) next.password = 'Password must be at least 6 characters'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    if (!validate()) return

    setSubmitting(true)
    try {
      const signedIn = await login(form.email, form.password)
      toast({
        title: `Welcome back, ${signedIn.name.split(' ')[0]}`,
        description: `Signed in as ${signedIn.role}.`,
        variant: 'success',
      })
      navigate(returnTo ?? homeFor(signedIn.role), { replace: true })
    } catch (error) {
      const code = getErrorCode(error)
      const description =
        code === 'ACCOUNT_INACTIVE'
          ? 'This account has been deactivated. Contact an administrator.'
          : getErrorMessage(error, 'Unable to sign in. Please try again.')
      toast({ title: 'Sign in failed', description, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const fillDemo = (email) => {
    setForm({ email, password: 'Password@123' })
    setErrors({})
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 sm:p-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-lg md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-primary p-8 text-primary-foreground md:flex">
          <Logo inverse subtitle="Attendance System" />
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold leading-tight">Attendance, without the paperwork.</h2>
            <p className="text-sm">
              One place for administrators, faculty and students to manage classes, rosters and daily attendance.
            </p>
          </div>
          <ul className="space-y-2 text-sm">
            <li>Role-based access for admins, faculty and students</li>
            <li>Mark and review attendance in seconds</li>
            <li>Live per-class attendance percentages</li>
          </ul>
        </div>

        <div className="p-6 sm:p-8">
          <Card className="border-0 shadow-none">
            <CardHeader className="px-0 pt-0">
              <Logo className="mb-4 md:hidden" subtitle="Attendance System" />
              <CardTitle className="text-2xl">Sign in</CardTitle>
              <CardDescription>Use your university account to continue.</CardDescription>
            </CardHeader>

            <CardContent className="px-0 pb-0">
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@university.edu"
                      className="pl-9"
                      value={form.email}
                      onChange={handleChange('email')}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'email-error' : undefined}
                      disabled={submitting}
                    />
                  </div>
                  {errors.email ? (
                    <p id="email-error" role="alert" className="text-xs font-medium text-destructive">
                      {errors.email}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      value={form.password}
                      onChange={handleChange('password')}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? 'password-error' : undefined}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password ? (
                    <p id="password-error" role="alert" className="text-xs font-medium text-destructive">
                      {errors.password}
                    </p>
                  ) : null}
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-dashed p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Demo accounts · password Password@123
                </p>
                <div className="flex flex-wrap gap-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <Button
                      key={account.email}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fillDemo(account.email)}
                      disabled={submitting}
                    >
                      {account.role}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
