import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Shared shell for the create/edit dialogs: centered, max-w-lg, two-column grid
 * on desktop that stacks on mobile, Cancel (outline) left / Save (primary,
 * spinner while submitting) right.
 */
export default function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitting = false,
  canSubmit = true,
  submitLabel = 'Save',
  children,
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => (!submitting ? onOpenChange(value) : null)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">{children}</div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
