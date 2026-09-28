import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-line bg-rail pb-16 sm:pb-0">
      <div className="mx-auto flex max-w-shell flex-col gap-4 px-4 py-8 text-sm text-zinc-deep sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Doorlink. Automated doors, connected professionals.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/manuals" className="hover:text-graphite">
            Manuals
          </Link>
          <Link href="/support" className="hover:text-graphite">
            Support
          </Link>
          <Link href="/data-sources" className="hover:text-graphite">
            Data sources
          </Link>
        </div>
      </div>
    </footer>
  )
}
