import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'

/**
 * Light / dark theme. The user's choice ('light' | 'dark' | 'system') is kept
 * in localStorage under its own key, so logging out (clearSession) keeps it.
 * index.html applies the same logic before first paint to avoid a flash;
 * keep the two in sync.
 */
export const THEME_KEY = 'uams.theme'
export const THEMES = ['light', 'dark', 'system']

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

const readStored = () => {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return THEMES.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored)
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches)

  // Follow OS changes while the choice is 'system'.
  useEffect(() => {
    const query = darkQuery()
    const onChange = (event) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  // Layout effect: the class must be on <html> as soon as a flushSync'd
  // setTheme returns (ThemeToggle's view transition snapshots end after).
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    // Browser chrome (mobile address bar) matches the page ground.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0b0d10' : '#ffffff')
  }, [resolvedTheme])

  const setTheme = useCallback((next) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage unavailable — choice lasts for this tab only */
    }
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
