import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { UpdateBanner } from './components/UpdateBanner'
import { EngineClient, type Port } from './lib/protocol'
import './index.css'

const worker = new Worker(new URL('./worker/engine.worker.ts', import.meta.url), { type: 'module' })
const client = new EngineClient(worker as unknown as Port)

// Ask the browser to keep the saved models when storage runs low.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={client} />
    <UpdateBanner />
  </StrictMode>,
)
