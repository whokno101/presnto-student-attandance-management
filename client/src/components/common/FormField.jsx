import { Label } from '@/components/ui/label'
import { FormControlContext } from '@/components/ui/form-control'

/**
 * Label + control + inline error. The control (Input / SelectTrigger with
 * id === htmlFor) picks up aria-describedby and aria-invalid from context, so
 * screen readers read the error or hint when the field is focused.
 */
export default function FormField({ label, htmlFor, required, error, hint, className = '', children }) {
  const errorId = `${htmlFor}-error`
  const hintId = `${htmlFor}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      <FormControlContext.Provider value={{ id: htmlFor, describedBy, invalid: Boolean(error) }}>
        {children}
      </FormControlContext.Provider>
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
