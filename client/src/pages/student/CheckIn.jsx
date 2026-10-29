import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import jsQR from 'jsqr'
import { AlertCircle, Camera, CameraOff, CheckCircle2, Info, Loader2, ScanLine } from 'lucide-react'

import PageHeader from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getErrorCode, getErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { checkInWithToken } from '@/services/qr'

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

const TONE = {
  success: 'border-success/40 bg-success/5',
  info: 'border-primary/40 bg-primary/5',
  error: 'border-destructive/40 bg-destructive/5',
}

const ICON_TONE = { success: 'text-success', info: 'text-primary', error: 'text-destructive' }

export default function CheckIn() {
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
    <div className="space-y-5">
      <PageHeader title="Check in" description="Scan the QR code on your teacher's screen to record your attendance for today's class." />

      {busy ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            Checking you in…
          </CardContent>
        </Card>
      ) : null}

      {meta ? (
        <div role={outcome.kind === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-5', TONE[meta.tone])}>
          <meta.icon className={cn('mt-0.5 h-6 w-6 shrink-0', ICON_TONE[meta.tone])} aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">{meta.title}</p>
            <p className="text-sm">{outcome.message}</p>
            {outcome.hint ? <p className="text-sm text-muted-foreground">{outcome.hint}</p> : null}
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scanner</CardTitle>
          <CardDescription>Point your camera at the code. You can also scan it with your phone&apos;s camera app, which opens this page for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scanning ? (
            <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
              <ScanLine className="pointer-events-none absolute inset-0 m-auto h-2/3 w-2/3 text-white/70" aria-hidden="true" />
            </div>
          ) : null}
          <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

          {cameraError ? (
            <p role="alert" className="flex items-start gap-2 text-sm">
              <CameraOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              {cameraError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {scanning ? (
              <Button variant="outline" onClick={stopCamera}>
                <CameraOff className="h-4 w-4" />
                Stop camera
              </Button>
            ) : (
              <Button onClick={startCamera} disabled={busy}>
                <Camera className="h-4 w-4" />
                {outcome ? 'Scan again' : 'Start scanning'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
