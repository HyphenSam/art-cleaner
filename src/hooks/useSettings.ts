import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '@/lib/settings'

const KEY = 'art-cleaner:settings'

function load(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    // Storage blocked (private mode, previews): defaults every visit.
    return DEFAULT_SETTINGS
  }
}

/** The settings, remembered in this browser. */
export function useSettings() {
  const [settings, setSettings] = useState(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }, [settings])
  return [settings, setSettings] as const
}
