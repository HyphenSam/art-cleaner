import { ChevronRight } from 'lucide-react'
import { Collapsible, Slider } from 'radix-ui'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { type DenoiserChoice, type OutputFormat, type Settings } from '@/lib/settings'
import { Segmented } from './ui/Segmented'
import { Toggle } from './ui/Toggle'

const DENOISERS: { value: DenoiserChoice; label: string }[] = [
  { value: 'grd', label: 'GRD' },
  { value: 'gan', label: 'DenoiseGAN' },
]

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'webp-lossless', label: 'WebP' },
  { value: 'webp', label: 'Lossy WebP' },
]

const PASSES = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
]

export function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (settings: Settings) => void }) {
  const set = (change: Partial<Settings>) => onChange({ ...settings, ...change })
  const [more, setMore] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <Section title="Steps">
        <div className="flex flex-col gap-3">
          <Toggle
            strong
            label="Denoise"
            hint="Removes adversarial noise."
            checked={settings.denoise}
            onChange={(denoise) => set({ denoise })}
          />
          {settings.denoise && (
            <>
              <Field label="Model" hint="GRD is recommended. DenoiseGAN is about 2.5× slower.">
                <Segmented
                  label="Denoiser model"
                  value={settings.denoiser}
                  options={DENOISERS}
                  onChange={(denoiser) => set({ denoiser })}
                />
              </Field>
              {settings.denoiser === 'gan' && (
                <Toggle
                  label="Noise translator"
                  hint="Removes Gaussian and other unfamiliar noise more strongly. Can soften fine detail."
                  checked={settings.translator}
                  onChange={(translator) => set({ translator })}
                />
              )}
              <Collapsible.Root open={more} onOpenChange={setMore}>
                <Collapsible.Trigger className="group -ml-1 flex items-center gap-1 rounded-md px-1 text-xs font-medium text-ink-soft hover:text-ink">
                  <ChevronRight className="size-3.5 transition-transform duration-150 group-data-[state=open]:rotate-90" />
                  More options
                </Collapsible.Trigger>
                <Collapsible.Content className="mt-3 flex flex-col gap-3 border-l border-line pl-3">
                  <Field label="Passes" hint="Each pass runs over the last one's result.">
                    <Segmented
                      label="Passes"
                      value={String(settings.passes)}
                      options={PASSES}
                      onChange={(v) => set({ passes: Number(v) })}
                    />
                  </Field>
                  <Toggle
                    label="Maximum quality"
                    hint="Averages 24 rotated and flipped runs. About 24× slower."
                    checked={settings.maxQuality}
                    onChange={(maxQuality) => set({ maxQuality })}
                  />
                </Collapsible.Content>
              </Collapsible.Root>
            </>
          )}
        </div>

        <div className="h-px bg-line" />

        <div className="flex flex-col gap-3">
          <Toggle
            strong
            label="Clean"
            hint="Removes JPEG artefacts with IllustrationJaNai."
            checked={settings.clean}
            onChange={(clean) => set({ clean })}
          />
          {settings.clean && (
            <Toggle
              label="Keep 2× size"
              hint="Saves the upscaled image instead of scaling it back down."
              checked={settings.keepUpscaled}
              onChange={(keepUpscaled) => set({ keepUpscaled })}
            />
          )}
        </div>
      </Section>

      <Section title="Output">
        <Segmented label="Format" value={settings.format} options={FORMATS} onChange={(format) => set({ format })} />
        {settings.format === 'webp' && (
          <Field label="Quality" value={String(settings.quality)}>
            <Slider.Root
              className="relative flex h-5 touch-none items-center select-none"
              min={1}
              max={100}
              step={1}
              value={[settings.quality]}
              onValueChange={([quality]) => set({ quality })}
            >
              <Slider.Track className="relative h-1 grow rounded-full bg-line-strong">
                <Slider.Range className="absolute h-full rounded-full bg-accent" />
              </Slider.Track>
              <Slider.Thumb
                aria-label="Quality"
                className="block size-4 rounded-full bg-white shadow-[0_0_0_1px_var(--color-line-strong),0_1px_3px_oklch(0_0_0/0.25)] focus-visible:outline-2 focus-visible:outline-accent"
              />
            </Slider.Root>
          </Field>
        )}
        <p className="text-xs text-ink-soft">
          {settings.format === 'png'
            ? 'Lossless, optimised. Keeps transparency.'
            : settings.format === 'webp-lossless'
              ? 'Lossless, and usually smaller than PNG.'
              : 'Smallest files. Some detail is lost; higher quality loses less.'}
        </p>
      </Section>
    </div>
  )
}

export function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <h2 className="text-[13px] font-medium text-ink-soft">{title}</h2>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  value,
  children,
}: {
  label: string
  hint?: string
  value?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[13px] font-medium">
        <span>{label}</span>
        {value && <span className="text-ink-soft tabular-nums">{value}</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  )
}
