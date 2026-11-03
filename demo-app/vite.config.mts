import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import baseTailwind from '../tailwind.config'

// The demo is the real Doorlink front end (../src) running in the browser
// without a server. Next.js modules and the server actions the client
// components call are swapped for local, demo-only versions here; nothing
// else in ../src is changed.
const demoRoot = import.meta.dirname
const repoSrc = path.resolve(demoRoot, '../src')
const demoSrc = path.resolve(demoRoot, 'src')

const ACTION_REDIRECTS: Record<string, string> = {
  'lib/auth-session.ts': 'actions/auth.ts',
  'app/request-technician/actions.ts': 'actions/request.ts',
  'app/configure/actions.ts': 'actions/configure.ts',
  'app/quote/actions.ts': 'actions/quote.ts',
  'app/quotes/[reference]/actions.ts': 'actions/booking.ts',
  'app/jobs/[id]/flow-actions.ts': 'actions/job-flow.ts',
  'app/jobs/actions.ts': 'actions/jobs.ts',
  'app/compare/actions.ts': 'actions/compare.ts',
  'app/compliance/actions.ts': 'actions/compliance.ts',
  'app/leads/actions.ts': 'actions/leads.ts',
  'app/pricing/actions.ts': 'actions/pricing.ts',
  'app/tools/spring-calculator/actions.ts': 'actions/spring.ts',
}
const redirects = new Map(
  Object.entries(ACTION_REDIRECTS).map(([from, to]) => [path.join(repoSrc, from), path.join(demoSrc, to)])
)

// Server-only modules must never reach the browser bundle. If one is
// imported, the build fails and names it, rather than shipping a page
// that would break at runtime.
const SERVER_ONLY = ['lib/prisma.ts', 'lib/auth.ts', 'lib/supabase/server.ts', 'lib/email.ts', 'lib/payments/stripe.ts']
const forbidden = new Set(SERVER_ONLY.map((p) => path.join(repoSrc, p)))

function demoRedirects(): Plugin {
  return {
    name: 'doorlink-demo-redirects',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source.startsWith('\0') || !importer) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      const id = resolved.id.split('?')[0]
      const target = redirects.get(id)
      if (target) return target
      if (forbidden.has(id)) {
        this.error(`Server-only module ${path.relative(repoSrc, id)} was imported by ${path.relative(demoRoot, importer)}`)
      }
      return null
    },
  }
}

/**
 * Files in public/ are referenced by absolute paths in the app's own
 * components ("/images/simulator/…"). Rewritten so the demo works from
 * any folder (GitHub Pages, a phone on the LAN), and, for the single-file
 * build, inlined as data URIs so one HTML file carries everything.
 */
const SINGLE = process.env.DEMO_SINGLE === '1'
const publicDir = path.join(demoRoot, 'public')
const MIME: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' }

function listPublic(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listPublic(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]
  )
}

function publicAssets(): Plugin {
  const files = listPublic(publicDir).filter((f) => MIME[path.extname(f)])
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rewrite = (code: string, fromCss: boolean) => {
    for (const file of files) {
      // "/x", "./x", "../x" or a bare "x", but not the tail of a longer path.
      const pattern = new RegExp(`(?<![\\w./-])(?:\\.\\.\\/|\\.\\/|\\/)?${escape(file)}`, 'g')
      if (!pattern.test(code)) continue
      const target = SINGLE
        ? `data:${MIME[path.extname(file)]};base64,${fs.readFileSync(path.join(publicDir, file)).toString('base64')}`
        : `${fromCss ? '../' : './'}${file}`
      code = code.replace(pattern, target)
    }
    return code
  }
  return {
    name: 'doorlink-demo-public-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') item.code = rewrite(item.code, false)
        else if (item.fileName.endsWith('.css') && typeof item.source === 'string') item.source = rewrite(item.source, true)
      }
    },
  }
}

export default defineConfig({
  root: demoRoot,
  base: './',
  publicDir: SINGLE ? false : publicDir,
  plugins: [demoRedirects(), publicAssets()],
  resolve: {
    alias: [
      { find: /^@demo\/(.*)$/, replacement: `${demoSrc}/$1` },
      { find: /^@\/(.*)$/, replacement: `${repoSrc}/$1` },
      { find: /^next\/link$/, replacement: path.join(demoSrc, 'stubs/next-link.tsx') },
      { find: /^next\/navigation$/, replacement: path.join(demoSrc, 'stubs/next-navigation.ts') },
      { find: /^next\/dynamic$/, replacement: path.join(demoSrc, 'stubs/next-dynamic.tsx') },
      { find: /^next\/cache$/, replacement: path.join(demoSrc, 'stubs/next-cache.ts') },
      { find: /^server-only$/, replacement: path.join(demoSrc, 'stubs/empty.ts') },
      { find: /^@prisma\/client$/, replacement: path.join(demoSrc, 'stubs/prisma-client.ts') },
    ],
    dedupe: ['react', 'react-dom', 'three'],
  },
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          ...baseTailwind,
          content: [`${repoSrc}/**/*.{ts,tsx}`, `${demoSrc}/**/*.{ts,tsx}`, `${demoRoot}/index.html`],
        }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: path.join(demoRoot, SINGLE ? 'dist-single' : 'dist'),
    emptyOutDir: true,
    // Single file: fonts inlined too, and one script with no lazy chunks.
    assetsInlineLimit: SINGLE ? 100_000_000 : 0,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      ...(SINGLE ? { output: { inlineDynamicImports: true } } : {}),
      onwarn(warning, warn) {
        // Libraries mark themselves "use client" for Next.js; meaningless in a plain browser bundle.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      },
    },
  },
  server: { port: 5199, host: true },
  preview: { port: 4199, host: true },
})
