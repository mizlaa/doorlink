/** @type {import('next').NextConfig} */
const isReplitPreview = process.env.DOORLINK_PREVIEW === 'true'

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A normal build/type-check must never overwrite a live preview's assets.
  distDir: process.env.DOORLINK_PREVIEW === 'true' ? '.next-preview' : '.next',
  typescript: {
    tsconfigPath: process.env.DOORLINK_PREVIEW === 'true' ? 'tsconfig.preview.json' : 'tsconfig.json',
  },
  // Avoid recompiling recently visited screens while moving between tools
  // in the development preview. Production serves prebuilt routes.
  onDemandEntries: {
    maxInactiveAge: 5 * 60 * 1000,
    pagesBufferLength: 8,
  },
  // The development badge (the black circle bottom-left) is replaced by
  // the app's own loading ring; build errors still show as an overlay.
  devIndicators: false,
  images: { formats: ['image/avif', 'image/webp'], remotePatterns: [] },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    const framingHeaders = isReplitPreview
      ? [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://replit.com https://*.replit.com https://*.replit.dev https://*.replit.app",
          },
        ]
      : [{ key: 'X-Frame-Options', value: 'DENY' }]

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ...framingHeaders,
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ]
  },
}
export default nextConfig
