import { logoUrl } from '@/lib/branding/brand'
import { initialsFor } from '@/lib/branding/logo'
import { cn } from '@/lib/utils'

/**
 * A business's own logo from its profile (the same version invoices use),
 * or a tidy initials tile in its brand colour when it has none.
 */
export function BusinessLogoTile({ name, logoVersionId, brandColour, size = 'md' }: { name: string; logoVersionId: string | null; brandColour: string | null; size?: 'sm' | 'md' }) {
  const url = logoUrl(logoVersionId)
  const box = size === 'sm' ? 'h-9 w-14' : 'h-12 w-[4.5rem] sm:h-14 sm:w-20'
  if (url)
    return (
      <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white p-1', box)}>
        <img src={url} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
      </span>
    )
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-lg font-bold tracking-wide text-white', size === 'sm' ? 'h-9 w-9 text-xs' : 'h-12 w-12 text-base sm:h-14 sm:w-14')}
      style={{ background: brandColour ?? '#17324D' }}
    >
      {initialsFor(name)}
    </span>
  )
}
