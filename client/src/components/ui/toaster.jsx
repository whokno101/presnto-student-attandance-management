import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

import { useToast } from '@/hooks/use-toast'

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          {props.variant === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 self-start text-success" aria-hidden="true" />
          ) : props.variant === 'destructive' ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 self-start text-destructive" aria-hidden="true" />
          ) : null}
          <div className="grid flex-1 gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
