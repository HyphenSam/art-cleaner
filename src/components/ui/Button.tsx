import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-line-strong disabled:text-ink-faint',
  secondary: 'bg-panel text-ink shadow-[0_0_0_1px_var(--color-line-strong)] hover:bg-sunken disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink disabled:text-ink-faint',
}

const SIZES = {
  sm: 'h-7 gap-1.5 px-2.5 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-4 text-[15px]',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
