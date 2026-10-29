import { useEffect, useId, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Confirmation for destructive actions (PB-14). The title and description must
 * name the item and the real effect ("history will be retained").
 *
 * `confirmText` adds a deliberate step for high-impact actions: the confirm
 * button stays disabled until the user types that exact text (e.g. a class code).
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  confirmText,
  onConfirm,
}) {
  const inputId = useId()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const typedOk = !confirmText || typed.trim().toUpperCase() === String(confirmText).toUpperCase()

  return (
    <Dialog open={open} onOpenChange={(value) => (!loading ? onOpenChange(value) : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {children}

        {confirmText ? (
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>
              Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="font-mono uppercase"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && typedOk && !loading) onConfirm()
              }}
            />
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading || !typedOk}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
