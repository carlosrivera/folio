import { useCallback, useEffect, useState } from 'react'

export type AppThemePreference = 'system' | 'light' | 'dark'
export type ResolvedAppTheme = 'light' | 'dark'

const STORAGE_KEY = 'folio.app-theme'
const PREFERENCES: AppThemePreference[] = ['system', 'light', 'dark']

export function readStoredPreference(): AppThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return PREFERENCES.find((candidate) => candidate === stored) ?? 'system'
  } catch {
    // Private mode or a sandboxed renderer: fall back to following the OS.
    return 'system'
  }
}

function systemTheme(): ResolvedAppTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveAppTheme(preference: AppThemePreference): ResolvedAppTheme {
  return preference === 'system' ? systemTheme() : preference
}

/** Stamp the resolved theme on <html> so the CSS needs no media query. */
export function applyAppTheme(theme: ResolvedAppTheme) {
  document.documentElement.dataset.uiTheme = theme
  document.documentElement.style.colorScheme = theme
}

/**
 * The shell's light/dark preference. "system" follows the OS live; an explicit
 * choice is persisted and wins in both directions.
 */
export function useAppTheme() {
  const [preference, setPreference] = useState<AppThemePreference>(readStoredPreference)
  const [resolved, setResolved] = useState<ResolvedAppTheme>(() => resolveAppTheme(readStoredPreference()))

  useEffect(() => {
    const next = resolveAppTheme(preference)
    setResolved(next)
    applyAppTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, [preference])

  useEffect(() => {
    if (preference !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next = systemTheme()
      setResolved(next)
      applyAppTheme(next)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  const cycle = useCallback(() => {
    setPreference((current) => PREFERENCES[(PREFERENCES.indexOf(current) + 1) % PREFERENCES.length])
  }, [])

  return { preference, resolved, setPreference, cycle }
}
