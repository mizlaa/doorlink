'use client'

import { usePathname } from 'next/navigation'
import { switchBusinessAction } from './switch/actions'

/** For people who work in more than one business: pick which one every screen shows. */
export function BusinessSwitcher({ choices, currentId }: { choices: Array<{ id: string; name: string }>; currentId: string }) {
  const pathname = usePathname()
  return (
    <form action={switchBusinessAction} className="flex shrink-0 items-center gap-1.5">
      <input type="hidden" name="back" value={pathname} />
      <label htmlFor="business-switch" className="sr-only">
        Business
      </label>
      <select
        id="business-switch"
        name="businessId"
        defaultValue={currentId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="field-select h-9 max-w-[11rem] appearance-none truncate rounded border border-line bg-rail pl-2.5 pr-8 text-sm text-graphite"
      >
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="h-9 rounded border border-line px-2 text-sm">
          Switch
        </button>
      </noscript>
    </form>
  )
}
