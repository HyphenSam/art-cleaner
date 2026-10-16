import { Check, Cpu, Zap } from 'lucide-react'
import { formatBytes } from '@/lib/format-bytes'
import { type Asset, MODELS, ORT_WASM } from '@/lib/manifest'
import type { Hello } from '@/lib/protocol'
import { type Backend, modelsNeeded, type Settings } from '@/lib/settings'
import { Section } from './SettingsPanel'
import { Button } from './ui/Button'

const LABELS: Record<string, string> = {
  ort: 'ONNX Runtime',
  denoiser: 'Denoiser',
  cleaner: 'Cleaner, Full',
  cleanerFast: 'Cleaner, Fast',
}

/** The files the current settings need: the runtime and the models. */
export function neededAssets(settings: Settings, backend: Backend): Asset[] {
  return [ORT_WASM, ...modelsNeeded(settings, backend).map((id) => MODELS[id])]
}

/** Which device does the work, and what's saved for offline use. */
export function OfflinePanel({
  info,
  settings,
  progress,
  error,
  onSave,
}: {
  info: Hello | null
  settings: Settings
  /** 0–1 while saving. */
  progress: number | null
  /** Why the last save failed, if it did. */
  error?: string | null
  onSave: () => void
}) {
  const backend = info?.backend ?? 'webgpu'
  const assets = neededAssets(settings, backend)
  const cached = new Set(info?.cached ?? [])
  const missing = assets.filter((a) => !cached.has(a.id))
  const missingBytes = missing.reduce((sum, a) => sum + a.size, 0)

  return (
    <Section title="Device">
      <div className="flex items-start gap-2.5">
        {backend === 'webgpu' ? (
          <Zap className="mt-0.5 size-4 shrink-0 text-accent-text" />
        ) : (
          <Cpu className="mt-0.5 size-4 shrink-0 text-ink-soft" />
        )}
        <div className="text-[13px]">
          <p className="font-medium">{info ? (backend === 'webgpu' ? 'WebGPU' : 'CPU') : 'Checking…'}</p>
          <p className="text-xs text-ink-soft">
            {!info
              ? ''
              : backend === 'webgpu'
                ? 'Your graphics card does the work.'
                : `No WebGPU in this browser, so the processor does the work${info.threads > 1 ? ` on ${info.threads} threads` : ''}. Cleaning is slow: minutes per image.`}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-xs">
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-center justify-between gap-2 text-ink-soft">
            <span className="flex items-center gap-1.5">
              {cached.has(asset.id) ? (
                <Check className="size-3.5 text-ok" strokeWidth={2.5} aria-label="Saved" />
              ) : (
                <span
                  className="size-3.5 rounded-full border border-dashed border-line-strong"
                  aria-label="Not saved"
                />
              )}
              {LABELS[asset.id]}
            </span>
            <span className="tabular-nums">{formatBytes(asset.size)}</span>
          </li>
        ))}
      </ul>
      {missing.length > 0 ? (
        <Button size="sm" onClick={onSave} disabled={progress !== null || !info}>
          {progress !== null
            ? `Saving… ${Math.round(progress * 100)}%`
            : `Save for offline use · ${formatBytes(missingBytes)}`}
        </Button>
      ) : (
        info && <p className="text-xs text-ink-soft">Saved. Works offline with these settings.</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </Section>
  )
}
