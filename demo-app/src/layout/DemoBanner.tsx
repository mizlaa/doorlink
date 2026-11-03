import Link from 'next/link'

/** The demo label shown on every page. */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <span>DEMO — sample data, no real orders or payments</span>
      <Link href="/demo">Demo guide</Link>
    </div>
  )
}
