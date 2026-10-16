import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './ui/Button'

/** Offers a reload when a new version has been downloaded in the background. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-panel bg-panel py-2 pr-2 pl-4 text-[13px] shadow-float ring-1 ring-line"
    >
      A new version is ready.
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
    </div>
  )
}
