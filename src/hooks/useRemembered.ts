import { useEffect, useState } from 'react'

/** A value remembered in this browser under `key`; `parse` checks what was
 * saved and falls back to a default for anything invalid. */
export function useRemembered<T>(key: string, parse: (saved: unknown) => T) {
  const [value, setValue] = useState(() => {
    try {
      return parse(JSON.parse(localStorage.getItem(key) ?? 'null'))
    } catch {
      // Storage blocked (private mode, previews): defaults every visit.
      return parse(null)
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }, [key, value])
  return [value, setValue] as const
}
