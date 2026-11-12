import { cn } from '@/lib/utils'

/**
 * Doorlink's official logo: the "DL" badge and the "Doorlink" wordmark.
 * One component for every place the platform's own brand appears (the
 * site header, the designer header), so it can't drift. Drawn with type
 * rather than a bitmap, so it stays sharp at any pixel density.
 *
 * `tone="onDark"` is the same lockup reversed for navy backgrounds: a light
 * badge with dark letters and a white wordmark. Size it with font-size on
 * the element or className: everything scales from 1em = the wordmark.
 */
export function DoorlinkLogo({ tone = 'onLight', className }: { tone?: 'onLight' | 'onDark'; className?: string }) {
  const dark = tone === 'onDark'
  return (
    <span className={cn('inline-flex items-center font-semibold leading-none tracking-tight', className)} style={{ gap: '0.56em' }}>
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center font-bold tracking-normal"
        style={{
          width: '1.56em',
          height: '1.56em',
          borderRadius: '0.22em',
          fontSize: '1em',
          background: dark ? '#F4F7FB' : '#17324D',
          color: dark ? '#17324D' : '#F4F7FB',
        }}
      >
        <span style={{ fontSize: '0.56em', letterSpacing: '0.01em' }}>DL</span>
      </span>
      <span style={{ color: dark ? '#FFFFFF' : undefined }}>Doorlink</span>
    </span>
  )
}
