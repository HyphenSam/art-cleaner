import { RadioGroup } from 'radix-ui'
import { cn } from '@/lib/cn'

/** A row of mutually exclusive choices (a radio group, arrow keys move). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  fit = false,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
  /** Each option as wide as its label instead of sharing the width. */
  fit?: boolean
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      orientation="horizontal"
      className={cn('flex rounded-control bg-sunken p-0.5', className)}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            fit ? 'px-3' : 'min-w-0 flex-1 truncate px-2',
            'h-7 rounded-[6px] text-[13px] font-medium text-ink-soft transition-colors duration-150',
            'hover:text-ink data-[state=checked]:bg-panel data-[state=checked]:text-ink data-[state=checked]:shadow-[0_1px_2px_oklch(0_0_0/0.12),0_0_0_0.5px_var(--color-line-strong)]',
            'focus-visible:outline-offset-0',
          )}
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
