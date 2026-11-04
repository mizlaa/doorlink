'use client'

import dynamic from 'next/dynamic'
import type { DoorSpec } from '@/lib/configurator/options'
import { FEATURE_3D_V2 } from '@/lib/feature-flags'
import { previewFromSpec as previewFromSpecV1, type Preview } from '@/lib/configurator/look'
import { previewFromSpec as previewFromSpecV2 } from '@/lib/configurator/look-v2'

/**
 * Picks the designer's 3D renderer. With the flag off this is the app's
 * current scene, unchanged. With it on, the upgraded engine is loaded
 * instead. Both take the same props, so the Configurator doesn't change.
 *
 * The v2 preview has the same shape but a richer look; it is cast to the
 * shared `Preview` type because the component it feeds is the v2 one.
 */
export const previewFromSpec: (spec: DoorSpec) => Preview = FEATURE_3D_V2
  ? (previewFromSpecV2 as unknown as (spec: DoorSpec) => Preview)
  : previewFromSpecV1

export const ConfiguratorScene = dynamic(
  () =>
    FEATURE_3D_V2
      ? import('@/components/three-v2/ConfiguratorScene').then((m) => m.ConfiguratorScene as unknown as ConfiguratorSceneProps)
      : import('@/components/three/ConfiguratorScene').then((m) => m.ConfiguratorScene),
  {
    ssr: false,
    loading: () => <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-rail sm:aspect-[16/10]" />,
  }
)

type ConfiguratorSceneProps = typeof import('@/components/three/ConfiguratorScene').ConfiguratorScene
