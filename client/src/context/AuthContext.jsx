import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { clearSession, getStoredUser, getToken, setStoredUser, setToken } from '@/lib/storage'

const AuthContext = createContext(null)

/**
 * Holds { user, token }. The token is mirrored into localStorage so a refresh
 * keeps the session; on mount we re-validate it against GET /api/auth/me, which
 * is also how an expired or revoked token is caught before any page renders.
 */
export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken())
  const [user, setUser] = useState(() => getStoredUser())
  // `booting` is true while we verify an existing token.
  const [booting, setBooting] = useState(() => Boolean(getToken()))
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const existing = getToken()

    if (!existing) {
      setBooting(false)
      return
    }

    let cancelled = false

    api
      .get('/auth/me')
      .then(({ data }) => {
        if (cancelled || !mounted.current) return
        setUser(data.user)
        setStoredUser(data.user)
      })
      .catch(() => {
        // The axios interceptor already redirects on 401; just drop local state.
        if (cancelled || !mounted.current) return
        clearSession()
        setTokenState(null)
        setUser(null)
      })
      .finally(() => {
        if (!cancelled && mounted.current) setBooting(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email: email.trim(), password })
    setToken(data.token)
    setStoredUser(data.user)
    setTokenState(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Logging out must never fail from the user's point of view.
    }
    clearSession()
    setTokenState(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      isAuthenticated: Boolean(token && user),
      role: user?.role ?? null,
      login,
      logout,
    }),
    [user, token, booting, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>')
  }
  return ctx
}

export default AuthContext
