import { useMemo, useState } from 'react'

/**
 * Minimal controlled-form state with lazy validation.
 *
 * - `errors` is derived on every render, so `isValid` can gate the Save button.
 * - A field's error is only *shown* once it has been touched or a submit was
 *   attempted — no red walls on a freshly opened dialog.
 */
export default function useFormState({ initialValues, validate }) {
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const errors = useMemo(() => validate(values), [values, validate])
  const isValid = Object.keys(errors).length === 0

  const setValue = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }))
  }

  const markTouched = (name) => setTouched((prev) => ({ ...prev, [name]: true }))

  const fieldError = (name) => (submitted || touched[name] ? errors[name] : undefined)

  return {
    values,
    setValue,
    setValues,
    errors,
    isValid,
    fieldError,
    markTouched,
    submitted,
    setSubmitted,
    submitting,
    setSubmitting,
  }
}
