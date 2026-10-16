import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)

  // jsdom has no layout, so nothing to observe.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  let urls = 0
  URL.createObjectURL ??= () => `blob:test/${++urls}`
  URL.revokeObjectURL ??= () => {}
}
