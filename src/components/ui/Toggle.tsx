import { Switch } from 'radix-ui'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A labelled switch, with an optional line of explanation under the label. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  strong = false,
}: {
  label: string
  hint?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  /** A step's own switch, set in the heading weight. */
  strong?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn('block cursor-pointer', strong ? 'text-sm font-semibold' : 'text-[13px] font-medium')}
        >
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full bg-line-strong transition-colors duration-150 data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_oklch(0_0_0/0.3)] transition-transform duration-150 ease-(--ease-out-quint) data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </div>
  )
}
