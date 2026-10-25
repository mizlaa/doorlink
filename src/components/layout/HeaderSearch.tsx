import Link from 'next/link'

/**
 * The header's route into search.
 *
 * A real GET form rather than a button that opens a modal: it submits
 * without JavaScript, the result is a shareable URL, and there is no
 * overlay to trap focus. On small screens it collapses to a single icon
 * link — a search field and a hamburger side by side in a 390px header
 * leaves room for neither.
 */
export function HeaderSearch() {
  return (
    <>
      <form action="/search" className="hidden items-center lg:flex">
        <label htmlFor="header-search" className="sr-only">
          Search Doorlink
        </label>
        <input
          id="header-search"
          name="q"
          type="search"
          placeholder="Search"
          className="h-9 w-40 rounded border border-line bg-paper px-3 text-sm text-graphite placeholder:text-zinc focus-visible:w-56 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal lg:w-52 lg:focus-visible:w-64"
          style={{ transition: 'width 160ms ease-out' }}
        />
      </form>

      <Link
        href="/search"
        aria-label="Search"
        className="inline-flex h-10 w-10 items-center justify-center rounded text-graphite hover:bg-rail lg:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="9.5" cy="9.5" r="5.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="m17 17-3.4-3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </Link>
    </>
  )
}
