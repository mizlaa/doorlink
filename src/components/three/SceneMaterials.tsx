'use client'

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import {
  createSceneTextures,
  disposeSceneTextures,
  type SceneTextureSet,
} from './proceduralTextures'

const SceneMaterialsContext = createContext<SceneTextureSet | null>(null)

export function SceneMaterialsProvider({ children }: { children: ReactNode }) {
  const { gl } = useThree()
  const textures = useMemo(
    () => createSceneTextures(gl.capabilities.getMaxAnisotropy()),
    [gl]
  )

  useEffect(() => () => disposeSceneTextures(textures), [textures])

  return <SceneMaterialsContext.Provider value={textures}>{children}</SceneMaterialsContext.Provider>
}

export function useSceneTextures(): SceneTextureSet {
  const textures = useContext(SceneMaterialsContext)
  if (!textures) throw new Error('Scene materials must be read inside SceneMaterialsProvider.')
  return textures
}