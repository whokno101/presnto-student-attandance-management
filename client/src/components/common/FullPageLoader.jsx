import { Loader2 } from 'lucide-react'

export default function FullPageLoader({ label = 'Loading...' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
