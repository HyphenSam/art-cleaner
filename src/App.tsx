import { Download, FolderDown, ImagePlus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { BatchStrip } from './components/BatchStrip'
import { Logo } from './components/Logo'
import { neededAssets, OfflinePanel } from './components/OfflinePanel'
import { Section, SettingsPanel } from './components/SettingsPanel'
import { Stage } from './components/Stage'
import { Button } from './components/ui/Button'
import { type EngineApi, useBatch } from './hooks/useBatch'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { useSettings } from './hooks/useSettings'
import { APP_NAME } from './lib/brand'
import { cn } from './lib/cn'
import { formatBytes } from './lib/format-bytes'
import type { Hello } from './lib/protocol'
import { modelsNeeded } from './lib/settings'

export function App({ client }: { client: EngineApi }) {
  const [settings, setSettings] = useSettings()
  const batch = useBatch(client, settings)
  const [info, setInfo] = useState<Hello | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const install = useInstallPrompt()

  const refresh = useCallback(() => {
    client.hello().then(setInfo, () => {})
  }, [client])
  useEffect(refresh, [refresh])
  // Results may have downloaded models; show them as saved.
  useEffect(() => {
    if (!batch.running) refresh()
  }, [batch.running, refresh])

  const add = useCallback(
    (files: Iterable<File>) => {
      const added = batch.add(files)
      if (added.length) setSelectedId((id) => id ?? added[0].id)
    },
    [batch],
  )

  // Files dropped or pasted anywhere on the page.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types ?? []).includes('Files')
    // Always cancel, or the browser opens whatever is dropped (an image dragged from another page
    // can carry only its URL, so it has no files) in place of the app.
    const over = (e: DragEvent) => {
      e.preventDefault()
      if (hasFiles(e)) setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (e.dataTransfer?.files?.length) add(e.dataTransfer.files)
    }
    const paste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files.length) add(e.clipboardData.files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [add])

  // ← and → move through the batch, unless a control wants the arrows.
  useEffect(() => {
    const move = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const target = e.target as HTMLElement | null
      if (
        target?.closest(
          'input:not([type="file"]), textarea, select, [role="radio"], [role="slider"], [role="switch"], [role="dialog"]',
        )
      )
        return
      const list = batch.items
      const at = list.findIndex((i) => i.id === (selectedId ?? list[0]?.id))
      const next = list[at + (e.key === 'ArrowRight' ? 1 : -1)]
      if (next) {
        e.preventDefault()
        setSelectedId(next.id)
      }
    }
    window.addEventListener('keydown', move)
    return () => window.removeEventListener('keydown', move)
  }, [batch.items, selectedId])

  const items = batch.items
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const queued = items.filter((i) => i.status === 'queued').length
  const done = items.filter((i) => i.result).length
  const nothingToDo = !settings.denoise && !settings.clean
  const cached = new Set(info?.cached ?? [])
  const firstRun = info ? neededAssets(settings).filter((a) => !cached.has(a.id)) : []

  function remove(id: string) {
    if (selected?.id === id) {
      const at = items.findIndex((i) => i.id === id)
      setSelectedId(items[at + 1]?.id ?? items[at - 1]?.id ?? null)
    }
    batch.remove(id)
  }

  async function saveOffline() {
    setSaving(0)
    setSaveError(null)
    try {
      await client.download(modelsNeeded(settings), (e) => {
        if (e.phase === 'download') setSaving(e.total ? e.loaded / e.total : 0)
      })
    } catch (error) {
      // The button comes back; the next try keeps what's already cached.
      setSaveError(`Couldn't save the files: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(null)
      refresh()
    }
  }

  async function deleteFiles(remove: () => Promise<void>) {
    setSaveError(null)
    try {
      await remove()
    } catch (error) {
      setSaveError(`Couldn't delete the files: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      refresh()
    }
  }

  async function downloadAll() {
    const zip = await batch.zip()
    const url = URL.createObjectURL(zip)
    const a = document.createElement('a')
    a.href = url
    a.download = `${APP_NAME.toLowerCase().replace(/\s+/g, '-')}-${done}-images.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const primary = batch.running ? (
    <Button size="lg" className="w-full" onClick={batch.cancel}>
      Cancel
    </Button>
  ) : queued > 0 ? (
    <Button size="lg" variant="primary" className="w-full" disabled={nothingToDo} onClick={() => void batch.start()}>
      Clean {queued} {queued === 1 ? 'image' : 'images'}
    </Button>
  ) : (
    <Button
      size="lg"
      variant="primary"
      className="w-full"
      disabled={!items.length || nothingToDo}
      onClick={() => batch.redo()}
    >
      {items.length ? 'Clean again' : 'Clean'}
    </Button>
  )

  return (
    <div className="grid min-h-dvh grid-cols-1 pb-[5.5rem] lg:h-dvh lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:pb-0">
      <header className="flex h-14 items-center justify-between gap-2 border-b border-line bg-panel px-5 lg:col-start-1 lg:row-start-1 lg:border-r">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-[15px] font-semibold">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-1">
          {install && (
            <Button size="sm" variant="ghost" onClick={install}>
              <Download />
              Install
            </Button>
          )}
          <AboutDialog />
        </div>
      </header>
      <main className="flex min-h-[62dvh] min-w-0 flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-0">
        <Stage item={selected} onBrowse={() => input.current?.click()} onRetry={(id) => batch.redo([id])} />
        {items.length > 0 && (
          <div className="border-t border-line bg-panel">
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <p className="text-xs text-ink-soft">
                {done} of {items.length} done
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>
                  <ImagePlus />
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={batch.clear}>
                  <Trash2 />
                  Clear
                </Button>
                <Button size="sm" disabled={done === 0} onClick={() => void downloadAll()}>
                  <FolderDown />
                  Download all
                </Button>
              </div>
            </div>
            <BatchStrip items={items} selectedId={selected?.id ?? null} onSelect={setSelectedId} onRemove={remove} />
          </div>
        )}
      </main>

      <aside className="flex min-h-0 flex-col border-line bg-panel lg:col-start-1 lg:row-start-2 lg:border-r">
        <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 py-6">
          <Section title="Images">
            <label className="sr-only" htmlFor="add-images">
              Add images
            </label>
            <input
              ref={input}
              id="add-images"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) add(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            <Button className="w-full" onClick={() => input.current?.click()}>
              <ImagePlus />
              Add images
            </Button>
          </Section>
          <SettingsPanel settings={settings} onChange={setSettings} />
          <OfflinePanel
            info={info}
            settings={settings}
            progress={saving}
            busy={batch.running}
            error={saveError}
            onSave={() => void saveOffline()}
            onRemove={(id) => void deleteFiles(() => client.remove([id]))}
            onClear={() => void deleteFiles(() => client.clear())}
          />
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel px-5 py-4 lg:static">
          {primary}
          {(nothingToDo || firstRun.length > 0) && (
            <p className="mt-2 text-center text-xs text-ink-soft">
              {nothingToDo
                ? 'Turn on Denoise or Clean.'
                : `The first run downloads ${formatBytes(firstRun.reduce((s, a) => s + a.size, 0))}.`}
            </p>
          )}
        </div>
      </aside>

      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-panel border-2 border-dashed border-accent bg-accent-soft/80 text-base font-semibold text-accent-text backdrop-blur-sm transition-opacity duration-150',
          dragging ? 'opacity-100' : 'opacity-0',
        )}
      >
        Drop to add
      </div>
    </div>
  )
}
