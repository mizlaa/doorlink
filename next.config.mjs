/** @type {import('next').NextConfig} */
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
  images: { formats: ['image/avif', 'image/webp'], remotePatterns: [] },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ]
  },
}
export default nextConfig
