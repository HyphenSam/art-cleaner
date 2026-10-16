import { useEffect, useState } from 'react'

type InstallEvent = Event & { prompt(): Promise<void> }

/** Installs the app, where the browser offers it (Chromium); null until then
 * and after installing. Other browsers install from their own menus. */
export function useInstallPrompt(): (() => void) | null {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    const installed = () => setEvent(null)
    window.addEventListener('beforeinstallprompt', offer)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', offer)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])
  return event ? () => void event.prompt().then(() => setEvent(null)) : null
}
