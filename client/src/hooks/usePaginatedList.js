import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '@/lib/api'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

/**
 * Drives a server-paginated table: debounced search, page, page size, refresh.
 *
 * `fetcher` must be a stable reference (module-level service function) and
 * resolve to `{ data, pagination }`.
 */
export default function usePaginatedList(fetcher, { initialLimit = DEFAULT_PAGE_SIZE } = {}) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(initialLimit)

  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: initialLimit, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const requestId = useRef(0)

  // 300ms debounce. Enter bypasses the wait via submitSearch().
  useEffect(() => {
    if (searchInput === search) return undefined

    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput, search])

  const submitSearch = useCallback(() => {
    setSearch(searchInput)
    setPage(1)
  }, [searchInput])

  useEffect(() => {
    const current = requestId.current + 1
    requestId.current = current
    let active = true

    setLoading(true)
    setError(null)

    fetcher({ search, page, limit })
      .then((result) => {
        // Ignore responses that were superseded by a newer request.
        if (!active || requestId.current !== current) return
        setRows(result.data ?? [])
        setPagination(result.pagination ?? { page, limit, total: 0, totalPages: 1 })
      })
      .catch((err) => {
        if (!active || requestId.current !== current) return
        setRows([])
        setError(err)
      })
      .finally(() => {
        if (active && requestId.current === current) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [fetcher, search, page, limit, reloadKey])

  // After a deletion the current page may no longer exist — step back.
  useEffect(() => {
    if (!loading && page > pagination.totalPages) {
      setPage(pagination.totalPages)
    }
  }, [loading, page, pagination.totalPages])

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])

  const changeLimit = useCallback((nextLimit) => {
    setLimit(Number(nextLimit))
    setPage(1)
  }, [])

  const total = pagination.total ?? 0
  const from = total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const to = Math.min(pagination.page * pagination.limit, total)

  return {
    rows,
    pagination,
    loading,
    error,
    errorMessage: error ? getErrorMessage(error) : null,
    searchInput,
    setSearchInput,
    submitSearch,
    page,
    setPage,
    limit,
    changeLimit,
    refresh,
    from,
    to,
    total,
  }
}
