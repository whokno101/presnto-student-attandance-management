import axios from 'axios'
import { clearSession, getToken } from '@/lib/storage'

/**
 * Single axios instance for the whole app.
 * - baseURL defaults to the Vite dev proxy (`/api` -> http://localhost:5001)
 * - request interceptor attaches the bearer token
 * - response interceptor handles 401/403 globally:
 *     401 -> clear storage, bounce to /login (expired or revoked session)
 *     403 -> bounce to /403 (authenticated but not allowed)
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Prevents a burst of parallel 401s from queuing several redirects.
let redirecting = false

const hardRedirect = (path) => {
  if (redirecting) return
  if (window.location.pathname === path) return
  redirecting = true
  window.location.assign(path)
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const code = error.response?.data?.error?.code
    const url = error.config?.url || ''
    const isLoginRequest = url.includes('/auth/login')
    const onLoginPage = window.location.pathname === '/login'

    if (status === 401 && !isLoginRequest && !onLoginPage) {
      clearSession()
      const reason = code === 'TOKEN_EXPIRED' ? 'expired' : code === 'ACCOUNT_INACTIVE' ? 'deactivated' : 'unauthorized'
      hardRedirect(`/login?reason=${reason}`)
    }

    if (status === 403 && !onLoginPage) {
      hardRedirect('/403')
    }

    return Promise.reject(error)
  }
)

/** Human-readable message from an axios error. */
export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') =>
  error?.response?.data?.error?.message || error?.message || fallback

/** Machine-readable code from the `{ error: { code, message } }` envelope. */
export const getErrorCode = (error) => error?.response?.data?.error?.code || null

/** Field-level errors, e.g. [{ field: 'email', message: '…' }] */
export const getErrorDetails = (error) => error?.response?.data?.error?.details || []

export default api
