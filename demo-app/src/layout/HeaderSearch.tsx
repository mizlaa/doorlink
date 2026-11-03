import Link from 'next/link'
import { navigate } from '../router'

// The app's HeaderSearch, with the form handled in the page instead of a
// full-page GET (the demo is a single static page).
export function HeaderSearch() {
  return (
    <>
      <form
        action="#"
        className="hidden items-center lg:flex"
        onSubmit={(event) => {
          event.preventDefault()
          const q = new FormData(event.currentTarget).get('q')
          navigate(`/search?q=${encodeURIComponent(String(q ?? ''))}`)
        }}
      >
        <label htmlFor="header-search" className="sr-only">
          Search Doorlink
        </label>
        <input
          id="header-search"
          name="q"
          type="search"
          placeholder="Search"
          className="h-9 w-40 rounded border border-line bg-paper px-3 text-sm text-graphite transition-[width] duration-[160ms] ease-out placeholder:text-zinc focus-visible:w-56 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal motion-reduce:transition-none lg:w-52 lg:focus-visible:w-64"
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
