import { createContext, useContext } from 'react'

/**
 * Set by <FormField> so the control it labels can describe itself to assistive
 * technology without every form passing aria props by hand.
 */
export const FormControlContext = createContext(null)

/**
 * aria-describedby / aria-invalid for a control, but only when the control is
 * the one the surrounding FormField labels (matching id) — a search box or
 * other control nested in a field never inherits its error.
 */
export const useFormControlProps = (id) => {
  const field = useContext(FormControlContext)
  if (!field || !id || field.id !== id) return {}
  return {
    'aria-describedby': field.describedBy,
    'aria-invalid': field.invalid || undefined,
  }
}
