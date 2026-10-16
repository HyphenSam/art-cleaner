/** The mark: a picture half noisy, half clean, split on the diagonal. Same
 * drawing as public/icon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <path d="M9 7h14a2 2 0 0 1 2 2v14z" fill="#fff" />
      <g fill="#fff" fillOpacity="0.85">
        <circle cx="9.5" cy="12.5" r="1.1" />
        <circle cx="9.5" cy="17" r="1.1" />
        <circle cx="9.5" cy="21.5" r="1.1" />
        <circle cx="14" cy="17" r="1.1" />
        <circle cx="14" cy="21.5" r="1.1" />
        <circle cx="18.5" cy="21.5" r="1.1" />
      </g>
    </svg>
  )
}
