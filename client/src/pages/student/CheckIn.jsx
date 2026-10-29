import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import jsQR from 'jsqr'
import { AlertCircle, Camera, CameraOff, CheckCircle2, Info, Loader2, QrCode, ScanLine } from 'lucide-react'

import PageHeader from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Pass, PassField, PassPerforation } from '@/components/board/Pass'
import { Signal } from '@/components/board/DeparturesBoard'
import BoardClock from '@/components/common/BoardClock'
import { useAuth } from '@/context/AuthContext'
import { getErrorCode, getErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { checkInWithToken } from '@/services/qr'
import { listMyClasses } from '@/services/classes'
import { weekBoardRows, ymdLocal } from '@/lib/board'

/** The QR holds a /check-in?token=… link; accept that or a bare token. */
const tokenFrom = (text) => {
  try {
    return new URL(text).searchParams.get('token') ?? text
  } catch {
    return text
  }
}

const OUTCOME = {
  accepted: { tone: 'success', icon: CheckCircle2, title: 'You are checked in' },
  already_checked_in: { tone: 'info', icon: Info, title: 'Already checked in' },
  already_recorded: { tone: 'info', icon: Info, title: 'Already recorded' },
  error: { tone: 'error', icon: AlertCircle, title: 'Check-in failed' },
}

const ICON_TONE = { success: 'text-success', info: 'text-primary', error: 'text-destructive' }

/** The session this pass is for: the one in progress, else the next one today. */
const todaysSession = (classes) => {
  const today = weekBoardRows(classes, [], { limit: 50 }).filter((row) => row.date === ymdLocal(new Date()))
  return today.find((row) => row.status.tone === 'live') ?? today.find((row) => row.status.label !== 'Ended') ?? null
}

export default function CheckIn() {
  const { user } = useAuth()
  // undefined while loading, null when no class remains today
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    let active = true
    listMyClasses()
      .then((classes) => active && setSession(todaysSession(classes)))
      .catch(() => active && setSession(null))
    return () => {
      active = false
    }
  }, [])
  const [searchParams, setSearchParams] = useSearchParams()
  const [outcome, setOutcome] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(0)
  const submittedRef = useRef(false)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  const submit = useCallback(
    async (raw) => {
      if (submittedRef.current) return
      submittedRef.current = true
      stopCamera()
      setBusy(true)
      try {
        const data = await checkInWithToken(tokenFrom(raw))
        setOutcome({ kind: data.result, message: data.message })
      } catch (err) {
        const code = getErrorCode(err)
        setOutcome({
          kind: 'error',
          message: getErrorMessage(err),
          hint: code === 'QR_EXPIRED' ? 'Scan the code that is on the screen now.' : null,
        })
      } finally {
        setBusy(false)
        // Do not leave a used token in the address bar or history.
        if (searchParams.get('token')) setSearchParams({}, { replace: true })
      }
    },
    [searchParams, setSearchParams, stopCamera]
  )

  // Opened from a phone camera: /check-in?token=…
  useEffect(() => {
    const token = searchParams.get('token')
    if (token) submit(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const scanFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !streamRef.current) return
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
      if (found?.data) {
        submit(found.data)
        return
      }
    }
    frameRef.current = requestAnimationFrame(scanFrame)
  }

  const startCamera = async () => {
    setOutcome(null)
    setCameraError(null)
    submittedRef.current = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot use the camera. Ask your teacher to mark you manually.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      setScanning(true)
      requestAnimationFrame(() => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
        frameRef.current = requestAnimationFrame(scanFrame)
      })
    } catch (err) {
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site, or ask your teacher to mark you manually.'
          : 'No camera is available. Ask your teacher to mark you manually.'
      )
    }
  }

  const meta = outcome ? OUTCOME[outcome.kind] ?? OUTCOME.error : null

  return (
    <div className="space-y-6">
      <PageHeader title="Check in" description="Scan the QR code on your teacher's screen to record your attendance for today's class." />

      <Pass className="mx-auto max-w-md">
        <div className="flex items-start justify-between gap-4 px-6 pb-5 pt-6">
          <h3 className="min-w-0 break-words font-display text-[1.75rem] font-bold uppercase leading-none tracking-[0.02em]">{user?.name}</h3>
          <BoardClock showDay={false} className="shrink-0 pt-1 text-muted-foreground" />
        </div>

        {session === undefined ? (
          <div className="mx-6 mb-5 h-11 animate-pulse rounded-md bg-muted" role="status" aria-label="Loading today's class" />
        ) : session ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-6 pb-5">
            <PassField label="Course" className="flex-1">{session.code}</PassField>
            {session.hall !== '—' ? <PassField label="Hall">{session.hall}</PassField> : null}
            <PassField label="Time">{session.time}</PassField>
            <p className="flex w-full min-w-0 items-center gap-2 text-sm text-muted-foreground">
              {session.status.tone === 'live' && outcome?.kind !== 'accepted' ? <Signal>In session</Signal> : null}
              <span className="truncate">{session.title}</span>
            </p>
          </div>
        ) : (
          <div className="px-6 pb-5">
            <PassField label="Course">No class left today</PassField>
            <p className="mt-1 text-sm text-muted-foreground">You can still scan a code your teacher shows; it records you for that session.</p>
          </div>
        )}

        <PassPerforation />

        <div className="space-y-4 px-6 py-5">
          {scanning ? (
            <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-md bg-shell">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
              <ScanLine className="pointer-events-none absolute inset-0 m-auto h-2/3 w-2/3 text-signal" aria-hidden="true" />
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-border" aria-hidden="true">
                <QrCode className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-[0.95rem] text-muted-foreground">
                Point your camera at the code on your teacher&apos;s screen. It changes every 15 seconds. Your phone&apos;s camera app works too.
              </p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

          {cameraError ? (
            <p role="alert" className="flex items-start gap-2 text-sm">
              <CameraOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              {cameraError}
            </p>
          ) : null}

          {scanning ? (
            <Button variant="outline" size="lg" className="w-full" onClick={stopCamera}>
              <CameraOff />
              Stop camera
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={startCamera} disabled={busy}>
              <Camera />
              {outcome ? 'Scan again' : 'Start scanning'}
            </Button>
          )}
        </div>

        {busy || meta ? (
          <>
            <PassPerforation />
            {busy ? (
              <div className="flex items-center gap-3 px-6 py-5 text-[0.95rem]" role="status">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Checking you in…
              </div>
            ) : (
              <div
                role={outcome.kind === 'error' ? 'alert' : 'status'}
                className={cn('flex gap-3 px-6 py-5', outcome.kind === 'accepted' && 'animate-signal-in')}
              >
                <meta.icon className={cn('mt-0.5 h-6 w-6 shrink-0', ICON_TONE[meta.tone])} aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-display text-xl font-bold uppercase leading-none tracking-[0.03em]">{meta.title}</p>
                  <p className="text-[0.95rem]">{outcome.message}</p>
                  {outcome.hint ? <p className="text-sm text-muted-foreground">{outcome.hint}</p> : null}
                </div>
              </div>
            )}
          </>
        ) : null}
      </Pass>
    </div>
  )
}
