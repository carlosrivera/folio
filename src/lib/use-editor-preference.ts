import { useEffect, useState } from 'react'

export function useEditorPreference(name: string, fallback: boolean) {
  const key = `folio:editor:${name}`
  const read = () => {
    try { return localStorage.getItem(key) === null ? fallback : localStorage.getItem(key) === 'true' }
    catch { return fallback }
  }
  const [value, setValue] = useState(read)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setValue(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, fallback])
  useEffect(() => {
    try { localStorage.setItem(key, String(value)) } catch { /* Keep the session preference. */ }
  }, [key, value])
  return [value, setValue] as const
}

export function useNumberPreference(name: string, fallback: number, min: number, max: number) {
  const key = `folio:editor:${name}`
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      const value = stored === null ? fallback : Number(stored)
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
    } catch { return fallback }
  }
  const [value, setValue] = useState(read)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) setValue(read()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, fallback, min, max])
  useEffect(() => { try { localStorage.setItem(key, String(value)) } catch { /* Session only. */ } }, [key, value])
  return [value, setValue] as const
}
