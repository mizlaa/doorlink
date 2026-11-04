'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import type { IntroBusiness } from '@/lib/pricing/intro-businesses'

// The world is large and only runs on this page: load it after the route.
const DoorlinkWorld = dynamic(() => import('@/components/doorlink-world/DoorlinkWorld'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-paper" aria-busy="true" />,
})

export function DoorlinkExperience({ businesses }: { businesses: IntroBusiness[] }) {
  const router = useRouter()
  return <DoorlinkWorld intro businesses={businesses} onExit={() => router.push('/configure')} />
}
