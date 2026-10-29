import { useCallback, useEffect, useRef, useState } from 'react'

import { getErrorMessage } from '@/lib/api'

/**
 * Fetches `fetcher(params)` and refetches whenever `params` changes (compared
 * by value). Previous data stays visible while a new request is in flight, so
 * changing a filter does not blank the page. `intervalMs` polls quietly, e.g.
 * for dashboards that must pick up new attendance (PB-12 AC-5).
 */
export default function useApiQuery(fetcher, params = {}, { intervalMs = 0, enabled = true } = {}) {
  const key = JSON.stringify(params)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    const current = requestId.current + 1
    requestId.current = current
    setLoading(true)
    setError(null)

    fetcher(JSON.parse(key))
      .then((result) => {
        if (requestId.current !== current) return
        setData(result)
        setUpdatedAt(new Date())
      })
      .catch((err) => {
        if (requestId.current !== current) return
        setError(err)
      })
      .finally(() => {
        if (requestId.current === current) setLoading(false)
      })

    return undefined
  }, [fetcher, key, reloadKey, enabled])

  useEffect(() => {
    if (!intervalMs || !enabled) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setReloadKey((k) => k + 1)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, enabled])

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  return { data, loading, error, errorMessage: error ? getErrorMessage(error) : null, refresh, updatedAt }
}

/** Debounced copy of a value (search boxes). */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
