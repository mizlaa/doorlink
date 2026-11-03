import Link from 'next/link'
import { demoBanner } from '@/lib/demo/banner'

/**
 * The demo banner: a small fixed strip on every page, only when
 * DOORLINK_DEMO=true. To switch it off in code, return null from demoBanner().
 */
export function DemoBanner() {
  const banner = demoBanner()
  if (!banner) return null

  return (
    <div
      role="status"
      data-demo-banner
      className="fixed inset-x-0 top-0 z-[100] flex h-6 items-center justify-center gap-3 bg-caution-tint px-3 text-[11px] font-medium leading-none text-caution"
    >
      <span>{banner.text}</span>
      <Link href={banner.tourHref} className="underline underline-offset-2 hover:text-graphite">
        Guided tour
      </Link>
    </div>
  )
}
