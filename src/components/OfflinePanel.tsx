import { Check, Cpu, Trash2, Zap } from 'lucide-react'
import { AlertDialog } from 'radix-ui'
import { useState } from 'react'
import { formatBytes } from '@/lib/format-bytes'
import { ALL_ASSETS, type Asset, MODELS, ORT_WASM } from '@/lib/manifest'
import type { Hello } from '@/lib/protocol'
import { modelsNeeded, type Settings } from '@/lib/settings'
import { Section } from './SettingsPanel'
import { Button } from './ui/Button'

const LABELS: Record<string, string> = {
  ort: 'ONNX Runtime',
  denoiser: 'Denoiser, GRD',
  denoiserGan: 'Denoiser, DenoiseGAN',
  translator: 'Noise translator',
  cleaner: 'Cleaner, Full',
  cleanerFast: 'Cleaner, Fast',
}

/** The files the current settings need: the runtime and the models. */
export function neededAssets(settings: Settings): Asset[] {
  return [ORT_WASM, ...modelsNeeded(settings).map((id) => MODELS[id])]
}

/** Which device does the work, and what's saved for offline use. */
export function OfflinePanel({
  info,
  settings,
  progress,
  busy = false,
  error,
  onSave,
  onRemove,
  onClear,
}: {
  info: Hello | null
  settings: Settings
  /** 0–1 while saving. */
  progress: number | null
  /** Images are being cleaned, so files can't be deleted. */
  busy?: boolean
  /** Why the last save or delete failed, if it did. */
  error?: string | null
  onSave: () => void
  onRemove: (id: string) => void
  onClear: () => void
}) {
  const backend = info?.backend ?? 'webgpu'
  const assets = neededAssets(settings)
  const cached = new Set(info?.cached ?? [])
  const missing = assets.filter((a) => !cached.has(a.id))
  const missingBytes = missing.reduce((sum, a) => sum + a.size, 0)
  // Saved files these settings don't use, such as the other cleaner.
  const others = ALL_ASSETS.filter((a) => cached.has(a.id) && !assets.includes(a))
  const savedBytes = ALL_ASSETS.filter((a) => cached.has(a.id)).reduce((sum, a) => sum + a.size, 0)
  const locked = busy || progress !== null
  // The delete buttons stay hidden until asked for, so they can't be clicked by mistake.
  const [managing, setManaging] = useState(false)
  if (managing && savedBytes === 0) setManaging(false)
  const row = (asset: Asset) => (
    <FileRow
      key={asset.id}
      asset={asset}
      saved={cached.has(asset.id)}
      managing={managing}
      disabled={locked}
      onRemove={() => onRemove(asset.id)}
    />
  )

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
      <ul className="flex flex-col gap-1 text-xs">{assets.map(row)}</ul>
      {others.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-ink-soft">Also saved</p>
          <ul className="flex flex-col gap-1 text-xs">{others.map(row)}</ul>
        </div>
      )}
      {missing.length > 0 ? (
        <Button size="sm" onClick={onSave} disabled={progress !== null || !info}>
          {progress !== null
            ? `Saving… ${Math.round(progress * 100)}%`
            : `Save for offline use · ${formatBytes(missingBytes)}`}
        </Button>
      ) : (
        info && <p className="text-xs text-ink-soft">Saved. Works offline with these settings.</p>
      )}
      {savedBytes > 0 && (
        <div className="-ml-2.5 flex flex-wrap gap-1">
          {managing && <ClearButton size={savedBytes} disabled={locked} onConfirm={onClear} />}
          <Button size="sm" variant="ghost" aria-expanded={managing} onClick={() => setManaging((m) => !m)}>
            {managing ? 'Done' : 'Manage saved files'}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </Section>
  )
}

function FileRow({
  asset,
  saved,
  managing,
  disabled,
  onRemove,
}: {
  asset: Asset
  saved: boolean
  /** Shows the delete button. */
  managing: boolean
  disabled: boolean
  onRemove: () => void
}) {
  const label = LABELS[asset.id]
  return (
    <li className="flex h-5 items-center justify-between gap-2 text-ink-soft">
      <span className="flex items-center gap-1.5">
        {saved ? (
          <Check className="size-3.5 text-ok" strokeWidth={2.5} aria-label="Saved" />
        ) : (
          <span className="size-3.5 rounded-full border border-dashed border-line-strong" aria-label="Not saved" />
        )}
        {label}
      </span>
      <span className="flex items-center gap-1">
        <span className="tabular-nums">{formatBytes(asset.size)}</span>
        {managing && saved ? (
          <button
            type="button"
            aria-label={`Delete ${label}`}
            title="Delete"
            disabled={disabled}
            onClick={onRemove}
            className="flex size-5 items-center justify-center rounded-[4px] text-ink-faint transition-colors duration-150 hover:bg-sunken hover:text-danger disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : (
          managing && <span className="size-5" />
        )}
      </span>
    </li>
  )
}

/** Deletes every saved file, after asking. */
function ClearButton({ size, disabled, onConfirm }: { size: number; disabled: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button size="sm" variant="ghost" className="hover:text-danger" disabled={disabled}>
          <Trash2 />
          Delete all · {formatBytes(size)}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_150ms_ease-out]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-panel bg-panel p-6 shadow-float outline-none">
          <AlertDialog.Title className="text-base font-semibold">Delete saved files?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-ink-soft">
            The runtime and models ({formatBytes(size)}) are removed from this browser. They download again the next
            time you clean an image.
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button>Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button className="bg-danger text-white hover:bg-danger/90" onClick={onConfirm}>
                Delete
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
