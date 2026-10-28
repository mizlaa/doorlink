import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing here is useful to a crawler without a session, and
      // /admin doubly so shouldn't be discoverable.
      disallow: ['/admin', '/my-listings', '/cart', '/support', '/sign-in', '/register', '/pricing', '/quotes'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
