import { Info, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { APP_NAME, SOURCE_URL } from '@/lib/brand'
import { MODELS } from '@/lib/manifest'

export function AboutDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label="About"
        className="flex size-8 items-center justify-center rounded-control text-ink-soft transition-colors duration-150 hover:bg-sunken hover:text-ink"
      >
        <Info className="size-4" strokeWidth={1.75} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_150ms_ease-out]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel bg-panel p-6 shadow-float outline-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-base font-semibold">{APP_NAME}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-m-1 rounded-control p-1 text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm text-ink-soft">
            Removes adversarial noise and JPEG artefacts from art. Everything runs in your browser on your own device;
            images are never uploaded. Once installed and saved for offline use, it works without a connection.
          </Dialog.Description>

          <h3 className="mt-6 text-[13px] font-semibold">Models</h3>
          <dl className="mt-3 flex flex-col gap-4 text-[13px]">
            <div>
              <dt className="font-medium">Denoiser: {MODELS.denoiser.name}</dt>
              <dd className="text-ink-soft">
                By{' '}
                <a href={MODELS.denoiser.sourceUrl} target="_blank" rel="noreferrer">
                  livinginparadise
                </a>
                . Redistributed with the author's permission; converted to ONNX.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Cleaner: 2x-AnimeSharpV4 (RCAN) and its Fast (RCAN PU) variant</dt>
              <dd className="text-ink-soft">
                By{' '}
                <a href={MODELS.cleaner.sourceUrl} target="_blank" rel="noreferrer">
                  Kim2091
                </a>
                , licensed under{' '}
                <a href={MODELS.cleaner.licenceUrl} target="_blank" rel="noreferrer">
                  CC BY-NC-SA 4.0
                </a>
                . Converted to ONNX (weights stored as 16-bit, run at 32-bit); the converted files are under the same
                licence. Not for commercial use.
              </dd>
            </div>
          </dl>

          <h3 className="mt-6 text-[13px] font-semibold">Software</h3>
          <p className="mt-3 text-[13px] text-ink-soft">
            Runs on{' '}
            <a href="https://onnxruntime.ai" target="_blank" rel="noreferrer">
              ONNX Runtime Web
            </a>{' '}
            (MIT) and{' '}
            <a href="https://github.com/jamsinclair/jSquash" target="_blank" rel="noreferrer">
              jSquash
            </a>{' '}
            codecs (Apache-2.0). {APP_NAME}'s own code is available under the MIT or Apache-2.0 licence; the models keep
            their own licences.
          </p>
          <p className="mt-3 text-[13px]">
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              Source code on GitHub
            </a>
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
