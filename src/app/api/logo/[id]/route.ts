import { NextResponse } from 'next/server'
import { logoResponseBody } from '@/lib/branding/brand'

/**
 * A business's logo, by version. Logos are a company's public face, and a
 * version never changes once stored, so the response is cached for good.
 * A built logo is SVG generated here from validated choices, served so it
 * can't run script even if opened on its own.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[a-z0-9]{10,40}$/.test(id)) return new NextResponse('Not found', { status: 404 })
  const logo = await logoResponseBody(id)
  if (!logo) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(typeof logo.body === 'string' ? logo.body : Buffer.from(logo.body), {
    headers: {
      'Content-Type': logo.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
