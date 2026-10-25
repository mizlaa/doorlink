import type { Metadata } from 'next'
import { FinderCascade } from '@/components/finder/FinderCascade'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel'

export const metadata: Metadata = {
  title: 'Find your part',
  description: 'Work through category, manufacturer, and model to identify your garage door, motor, or lock.',
  alternates: { canonical: '/find' },
}

export default function FindPage() {
  return (
    <div className="mx-auto max-w-shell px-4 py-10">
      <h1 className="text-2xl font-semibold text-graphite">Find your product</h1>
      <p className="mt-2 max-w-prose text-graphite-soft">
        Pick the category, then the make and model.
      </p>
      <Panel className="mt-6">
        <PanelHeader>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-deep">Product finder</h2>
        </PanelHeader>
        <PanelBody>
          <FinderCascade />
        </PanelBody>
      </Panel>
    </div>
  )
}
