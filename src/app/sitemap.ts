import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'

// Production's schema may not be initialized until publishing completes.
// Database-backed sitemap entries must be read at request time, not at build.
export const dynamic = 'force-dynamic'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Only genuinely public, indexable routes — not /admin, /my-listings,
// /cart, /support, or auth screens, which need a session to do anything
// useful and have nothing for a crawler to index.
const STATIC_ROUTES = ['', '/find', '/find/unknown', '/data-sources', '/marketplace']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }))

  let models: { id: string; updatedAt: Date }[] = []
  try {
    models = await prisma.model.findMany({ select: { id: true, updatedAt: true } })
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error
    // A database outage shouldn't take the sitemap down entirely —
    // crawlers still get the static routes instead of a 500.
  }

  const modelEntries: MetadataRoute.Sitemap = models.map((model) => ({
    url: `${siteUrl}/model/${model.id}`,
    lastModified: model.updatedAt,
  }))

  return [...staticEntries, ...modelEntries]
}
