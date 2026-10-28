import { Label } from '@/components/ui/label'

/**
 * Label + control + inline error. Errors render in red under the field and are
 * announced to screen readers via aria-describedby on the control.
 */
export default function FormField({ label, htmlFor, required, error, hint, className = '', children }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
