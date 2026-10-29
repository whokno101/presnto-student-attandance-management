import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { AlertCircle, ArrowLeft, Loader2, QrCode, Square, Users } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import usePolicy from '@/hooks/usePolicy'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { formatDay } from '@/lib/attendance'
import { formatTime } from '@/lib/format'
import { closeQrSession, getQrStatus, getQrToken } from '@/services/qr'

const STATUS_POLL_MS = 3000

/**
 * Teacher's check-in screen (PB-20): a rotating QR code (refetched at each
 * rotation, never generated in the browser) and the live list of students who
 * checked in. The code encodes a /check-in link, so a phone's camera app can
 * open it directly.
 */
export default function QrCheckin() {
  const { id } = useParams()
  const navigate = useNavigate()
  const policy = usePolicy()
  const { toast } = useToast()

  const [svg, setSvg] = useState('')
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [error, setError] = useState(null)
  const [closing, setClosing] = useState(false)
  const rotateAt = useRef(0)

  // Rotating code: fetch, render, schedule the next fetch at the rotation edge.
  useEffect(() => {
    let timer
    let active = true
    const load = async () => {
      try {
        const data = await getQrToken(id)
        if (!active) return
        const url = `${window.location.origin}/check-in?token=${encodeURIComponent(data.token)}`
        setSvg(await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#020817', light: '#ffffff' } }))
        setSession(data)
        rotateAt.current = Date.now() + data.rotatesInMs
        timer = setTimeout(load, data.rotatesInMs + 100)
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      }
    }
    load()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [id])

  // Countdown (visual only).
  useEffect(() => {
    const tick = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((rotateAt.current - Date.now()) / 1000))), 250)
    return () => clearInterval(tick)
  }, [])

  // Live check-in results (AC-6).
  useEffect(() => {
    let active = true
    const load = () =>
      getQrStatus(id)
        .then((data) => active && setStatus(data))
        .catch(() => {})
    load()
    const timer = setInterval(load, STATUS_POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [id])

  const end = async () => {
    setClosing(true)
    try {
      await closeQrSession(id)
      toast({ title: 'Check-in closed', description: 'The code no longer works. Mark any remaining students manually.', variant: 'success' })
      navigate('/attendance/mark')
    } catch (err) {
      toast({ title: 'Could not close check-in', description: getErrorMessage(err), variant: 'destructive' })
      setClosing(false)
    }
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={AlertCircle}
            title="Check-in is not available"
            description={error}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/attendance/mark">Back to Mark Attendance</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  const checkedIn = status?.checkedIn ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="QR check-in"
        description={session ? `${session.classCode} — ${session.className} · ${formatDay(session.date)}` : 'Preparing the code…'}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/attendance/mark">
                <ArrowLeft className="h-4 w-4" />
                Mark manually
              </Link>
            </Button>
            <Button variant="destructive" onClick={end} disabled={closing}>
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              End check-in
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scan to check in</CardTitle>
            <CardDescription>
              Students scan with the UniTrack Check in page or their phone camera. The code changes every {policy.qrRotationSeconds} seconds, so a photo of it stops working
              almost immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {svg ? (
              <div
                className="w-full max-w-[420px] rounded-xl border bg-white p-4"
                role="img"
                aria-label={`QR code for checking in to ${session?.classCode ?? 'this class'}`}
                // The SVG string comes from the qrcode library, not from user input.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="flex aspect-square w-full max-w-[420px] items-center justify-center rounded-xl border bg-muted">
                <QrCode className="h-12 w-12 animate-pulse text-muted-foreground" aria-hidden="true" />
              </div>
            )}
            <p className="text-sm text-muted-foreground" aria-hidden="true">
              New code in <span className="font-semibold tabular-nums text-foreground">{secondsLeft ?? '–'}</span> s
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checked in</CardTitle>
            <CardDescription aria-live="polite">
              {status ? `${checkedIn.length} by QR · ${status.marked} of ${status.enrolled} marked so far` : 'Loading…'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checkedIn.length ? (
              <ul className="divide-y text-sm">
                {checkedIn.map((s) => (
                  <li key={s.studentId} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{s.name}</span> <span className="font-mono text-xs text-muted-foreground">{s.studentId}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="success">Present</Badge>
                      {formatTime(s.at, policy.timeZone)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Users} title="Waiting for the first scan" description="Students appear here as they check in. Anyone without a camera can be marked manually." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
