import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Loader2, Plane } from 'lucide-react'

import Logo, { PRODUCT_NAME } from '@/components/common/Logo'
import BoardClock from '@/components/common/BoardClock'
import DeparturesBoard from '@/components/board/DeparturesBoard'
import { Pass, PassBarcode, PassField, PassPerforation } from '@/components/board/Pass'
import ThemeToggle from '@/components/common/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/context/AuthContext'
import { getErrorCode, getErrorMessage } from '@/lib/api'
import { homeFor } from '@/lib/navigation'
import { cn, prefersReducedMotion } from '@/lib/utils'

// `code` and `home` print the destination on the pass once a demo account is filled.
const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@university.edu', code: 'ADM', home: 'Admin home' },
  { role: 'Faculty', email: 'faculty1@university.edu', code: 'FAC', home: 'Faculty home' },
  { role: 'Student', email: 'student1@university.edu', code: 'STU', home: 'Student home' },
]

const ROSTER = 140

/**
 * Sample timetable for the sign-in board. Not live data: it is labelled as a
 * sample on screen. `tick` advances the live row's check-ins and, on the second
 * tick, moves one class to another hall so the board shows a change landing.
 */
const sampleSessions = (tick) => {
  const checkedIn = Math.min(ROSTER - 12, 96 + tick * 4)
  const moved = tick >= 2
  return [
    { id: 'math110', time: '08:00', code: 'MATH 110', title: 'Calculus I', hall: 'A-101', status: { label: 'Closed · 94%', tone: 'ok' } },
    { id: 'cs201', time: '09:00', code: 'CS 201', title: 'Data Structures', hall: 'B-214', status: { label: 'Check-in', count: `${checkedIn}/${ROSTER}`, tone: 'live' } },
    { id: 'phy120', time: '10:30', code: 'PHY 120', title: 'Mechanics', hall: 'C-008', status: { label: 'Scheduled', tone: 'muted' } },
    {
      id: 'eng105',
      time: '11:00',
      code: 'ENG 105',
      title: 'Academic Writing',
      hall: moved ? 'D-302' : 'D-110',
      status: { label: moved ? 'Hall changed' : 'Scheduled', tone: 'muted' },
      changed: moved ? 'hall' : undefined,
      changedAt: moved ? 1 : undefined,
    },
    { id: 'cs240', time: '13:30', code: 'CS 240', title: 'Databases', hall: 'B-214', status: { label: 'Scheduled', tone: 'muted' } },
    { id: 'eco101', time: '15:00', code: 'ECO 101', title: 'Microeconomics', hall: 'A-220', status: { label: 'Last · 58%', tone: 'alert' } },
  ]
}

function useBoardTick() {
  const [tick, setTick] = useState(() => (prefersReducedMotion() ? 2 : 0))
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const timer = setInterval(() => setTick((t) => (t >= 6 ? t : t + 1)), 4000)
    return () => clearInterval(timer)
  }, [])
  return tick
}

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
  // Rejects protocol-relative and backslash paths ("//x", "/\\x"), which
  // browsers treat as another origin.
  const safePath = (path) => typeof path === 'string' && /^\/(?![/\\])/.test(path) && !/[\\]|%5c/i.test(path)
  const returnTo = safePath(from?.pathname) ? `${from.pathname}${from.search ?? ''}` : null
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()

  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const tick = useBoardTick()
  const sessions = useMemo(() => sampleSessions(tick), [tick])

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

  const destination = DEMO_ACCOUNTS.find((account) => account.email === form.email.trim().toLowerCase())
  const passenger = form.email.trim().split('@')[0].toUpperCase()

  const passCaption = 'font-display text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground'
  const fieldLabel = 'mb-1.5 block font-display text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground'

  return (
    <div className="relative min-h-screen bg-shell text-shell-foreground">
      <ThemeToggle className="absolute end-4 top-4 z-10 text-shell-foreground hover:bg-shell-accent hover:text-shell-foreground focus-visible:ring-shell-foreground focus-visible:ring-offset-shell" />

      <div className="mx-auto grid min-h-screen max-w-[1440px] gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-16 lg:px-14 xl:gap-24">
        <section className="order-2 min-w-0 lg:order-1" aria-labelledby="board-title">
          <Logo inverse size={36} subtitle="Attendance" className="hidden lg:flex" />

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-shell-border pb-3 lg:mt-14">
            <h2 id="board-title" className="font-display text-[1.05rem] font-semibold uppercase tracking-[0.14em] text-shell-foreground">
              Today’s sessions
            </h2>
            <BoardClock className="text-sm text-shell-muted" />
          </div>

          <DeparturesBoard rows={sessions} caption="Sample timetable of today's sessions" className="mt-1" />

          <p className="mt-4 max-w-prose text-sm text-shell-muted">
            Sample timetable. After you sign in, the board shows your own classes, live check-ins and any hall changes.
          </p>
        </section>

        <section className="order-1 lg:order-2" aria-labelledby="signin-title">
          <Logo inverse size={32} subtitle="Attendance" className="mb-6 lg:hidden" />

          <Pass className="shadow-[0_32px_80px_-32px_hsl(var(--scrim)/0.35)] dark:shadow-[0_32px_80px_-32px_rgb(0_0_0/0.75)]">
            <div className="flex items-center justify-between gap-4 bg-primary px-6 py-3.5 text-primary-foreground">
              <span className="font-display text-lg font-bold uppercase leading-none tracking-[0.08em]">{PRODUCT_NAME}</span>
              <span className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.14em]">Boarding pass</span>
            </div>

            {/* The ticket face restates the form (route, passenger); the form itself is the accessible source. */}
            <div className="px-6 pb-5 pt-5" aria-hidden="true">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className={passCaption}>From</p>
                  <p className="font-mono text-[2.5rem] font-semibold leading-none tracking-[-0.02em]">LGN</p>
                </div>
                <div className="mb-3 flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
                  <span className="h-0 flex-1 border-t-2 border-dotted border-current" />
                  <Plane className="h-5 w-5 shrink-0 text-foreground rtl:-scale-x-100" />
                  <span className="h-0 flex-1 border-t-2 border-dotted border-current" />
                </div>
                <div className="min-w-0 text-end">
                  <p className={passCaption}>To</p>
                  <p
                    key={destination?.code ?? 'none'}
                    className={cn(
                      'rounded-sm font-mono text-[2.5rem] font-semibold leading-none tracking-[-0.02em]',
                      destination ? 'animate-signal-in' : 'text-muted-foreground'
                    )}
                  >
                    {destination?.code ?? '···'}
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex justify-between gap-3 text-sm text-muted-foreground">
                <span>Sign in</span>
                <span className="truncate">{destination?.home ?? 'Your home'}</span>
              </div>

              <div className="mt-5 grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-6 border-t pt-4">
                <PassField label="Date">
                  <BoardClock showTime={false} className="text-[0.95rem]" />
                </PassField>
                <PassField label="Time">
                  <BoardClock showDay={false} className="text-[0.95rem]" />
                </PassField>
                <PassField label="Passenger" className="text-end">
                  {passenger || '—'}
                </PassField>
              </div>
            </div>

            <PassPerforation ground="bg-shell" />

            <form onSubmit={handleSubmit} noValidate className="space-y-4 px-6 pb-6 pt-5">
              <div>
                <h1 id="signin-title" className="font-display text-[1.75rem] font-bold uppercase leading-none tracking-[0.03em]">
                  Sign in
                </h1>
                <p className="mt-1.5 text-[0.95rem] text-muted-foreground">Use your university account.</p>
              </div>

              <div>
                <Label htmlFor="email" className={fieldLabel}>
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@university.edu"
                  className="h-12 font-mono text-[0.95rem]"
                  value={form.email}
                  onChange={handleChange('email')}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  disabled={submitting}
                />
                {errors.email ? (
                  <p id="email-error" role="alert" className="mt-1.5 text-sm font-medium text-destructive">
                    {errors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="password" className={fieldLabel}>
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-12 pe-12 font-mono text-[0.95rem]"
                    value={form.password}
                    onChange={handleChange('password')}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute end-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password ? (
                  <p id="password-error" role="alert" className="mt-1.5 text-sm font-medium text-destructive">
                    {errors.password}
                  </p>
                ) : null}
              </div>

              <Button type="submit" size="lg" className="mt-2 w-full justify-between" disabled={submitting}>
                <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
                {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight className="rtl:-scale-x-100" aria-hidden="true" />}
              </Button>
            </form>

            <PassPerforation ground="bg-shell" />

            <div className="px-6 pb-6 pt-5">
              <p className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Demo accounts · <span className="font-mono normal-case tracking-normal">Password@123</span>
              </p>
              <div className="mt-3 grid grid-cols-3 divide-x divide-border rounded-md border rtl:divide-x-reverse">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => fillDemo(account.email)}
                    disabled={submitting}
                    className="px-2 py-2.5 font-display text-[0.95rem] font-semibold uppercase tracking-[0.06em] transition-colors first:rounded-s-md last:rounded-e-md hover:bg-foreground hover:text-background focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {account.role}
                  </button>
                ))}
              </div>
              <PassBarcode value={form.email.trim().toLowerCase() || PRODUCT_NAME} className="mt-5 text-foreground" />
            </div>
          </Pass>
        </section>
      </div>
    </div>
  )
}
