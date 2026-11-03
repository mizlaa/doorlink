import { resetDemoDataAction } from './actions'
import { Panel, PanelBody } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'

/** Demo mode only. Resets every record to the seed. */
export function ResetDemoPanel({ justReset }: { justReset: boolean }) {
  return (
    <Panel>
      <PanelBody>
        <h2 className="text-sm font-medium text-graphite">Demo data</h2>
        <p className="mt-1 text-sm text-graphite-soft">
          This is the demo database. Reset it to restore the fictional businesses, accounts, prices and reviews,
          and clear anything a visitor has added.
        </p>
        {justReset && <p className="mt-2 text-sm text-good">Demo data has been reset.</p>}
        <form action={resetDemoDataAction} className="mt-3">
          <Button type="submit" variant="secondary" size="sm">
            Reset demo data
          </Button>
        </form>
      </PanelBody>
    </Panel>
  )
}
