'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useActionState, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  applyDoorStyle,
  DESIGNER_START_SPEC,
  DOOR_STYLES,
  doorStyleOf,
  familyOf,
  groupsFor,
  isHexColour,
  parseSpec,
  PRODUCT_FAMILIES,
  PRODUCT_TYPES,
  sizeLimitsFor,
  specColourHex,
  specColourLabel,
  specForType,
  type DoorSpec,
  type ProductFamily,
  type ProductType,
} from '@/lib/configurator/options'
import { previewFromSpec } from '@/lib/configurator/look-v2'
import { locationLabel, type CustomerLocation } from '@/lib/location'
import type { LocalCompany } from '@/lib/pricing/local'
import { requestFromSpec } from '@/lib/pricing/products'
import type { MotorCandidate } from '@/lib/motors/specs'
import { PREVIEW_NOTE_MAX_WORDS, previewNoteWordCount } from '@/lib/configurator/preview-prompt'
import { DoorGlyph, DoorlinkMark, icons, Stars } from '@/components/designer/glyphs'
import { RigBus, type ViewMode } from '@/components/designer/scene/DesignerRig'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { MotorShortlist } from './MotorShortlist'
import {
  generateDesignImageAction,
  saveConfigurationAction,
  type ConfigurationActionState,
  type PreviewActionState,
} from './actions'
import { localQuotesAction } from './local-actions'
import './designer.css'

// The scene is WebGL and several hundred kB. It can't be server-rendered,
// and nobody who never opens the designer should download it.
const DesignerScene = dynamic(() => import('@/components/designer/scene/DesignerScene').then((m) => m.DesignerScene), {
  ssr: false,
  loading: () => (
    <div className="dz-scene-loading" role="status">
      <span className="dz-scene-loading-dot" /> Loading your home…
    </div>
  ),
})

const STORAGE_KEY = 'doorlink:design'

type TabId = 'type' | 'colour' | 'windows' | 'hardware' | 'build'

const TABS: Record<ProductFamily, Array<{ id: TabId; label: string; icon: ReactNode }>> = {
  garage: [
    { id: 'type', label: 'Door Type', icon: icons.doorType },
    { id: 'colour', label: 'Colour', icon: icons.colour },
    { id: 'windows', label: 'Windows', icon: icons.windows },
    { id: 'hardware', label: 'Hardware', icon: icons.hardware },
  ],
  gate: [
    { id: 'type', label: 'Gate Type', icon: icons.doorType },
    { id: 'colour', label: 'Colour', icon: icons.colour },
    { id: 'build', label: 'Infill', icon: icons.build },
    { id: 'hardware', label: 'Hardware', icon: icons.hardware },
  ],
  fence: [
    { id: 'type', label: 'Fence', icon: icons.build },
    { id: 'colour', label: 'Colour', icon: icons.colour },
    { id: 'build', label: 'Material', icon: icons.doorType },
  ],
  shutter: [
    { id: 'type', label: 'Shutter', icon: icons.doorType },
    { id: 'colour', label: 'Colour', icon: icons.colour },
    { id: 'hardware', label: 'Control', icon: icons.hardware },
  ],
}

/** Which option groups each tab shows, per family. Groups that don't apply to the product are skipped. */
const TAB_GROUPS: Record<ProductFamily, Partial<Record<TabId, string[]>>> = {
  garage: { windows: ['panelCount'], hardware: ['hardware', 'handles', 'opener', 'insulation'] },
  gate: { type: ['leaves'], build: ['infill', 'material'], hardware: ['hardware', 'operation', 'swingMotor', 'motorBrand'] },
  fence: { type: ['infill'], build: ['material'] },
  shutter: { type: ['slat'], hardware: ['control', 'operation', 'motorBrand'] },
}

const FAMILY_WORDS: Record<ProductFamily, { noun: string; open: string; close: string; saveAs: string; width: string }> = {
  garage: { noun: 'door', open: 'Open door', close: 'Close door', saveAs: 'My garage door', width: 'Width' },
  gate: { noun: 'gate', open: 'Open gate', close: 'Close gate', saveAs: 'My gate', width: 'Width' },
  fence: { noun: 'fence', open: '', close: '', saveAs: 'My fence', width: 'Run length' },
  shutter: { noun: 'shutter', open: 'Raise shutter', close: 'Lower shutter', saveAs: 'My shutter', width: 'Width' },
}

const QUICK_COLOURS = ['charcoal', 'black', 'chalk', 'sand', 'walnut']

/** Names that fit under a swatch. */
const SHORT_LABELS: Record<string, string> = {
  'Slate grey': 'Slate',
  'Deep forest': 'Forest',
  'Oxide red': 'Oxide',
  'Brushed steel': 'Brushed',
  'Matte black': 'Black',
}

const SIZE_PRESETS: Array<{ label: string; widthMm: number; heightMm: number }> = [
  { label: 'Single · 2.4 m', widthMm: 2400, heightMm: 2100 },
  { label: 'Double · 4.8 m', widthMm: 4800, heightMm: 2100 },
  { label: 'Wide · 5.4 m', widthMm: 5400, heightMm: 2100 },
]

const metres = (mm: number) => (mm / 1000).toFixed(mm % 100 === 0 ? 1 : 2)

type QuotesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; companies: LocalCompany[]; pricesShown: boolean }
  | { status: 'error'; message: string }

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)

export function Designer({
  signedIn,
  role,
  motors = [],
  initialSpec,
  initialLocation,
  previewAvailable,
}: {
  signedIn: boolean
  role: string | null
  motors?: MotorCandidate[]
  initialSpec?: DoorSpec
  initialLocation: CustomerLocation | null
  previewAvailable: boolean
}) {
  const [spec, setSpec] = useState<DoorSpec>(initialSpec ?? DESIGNER_START_SPEC)
  const [mode, setMode] = useState<ViewMode>('3d')
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('type')
  const [sheet, setSheet] = useState<null | 'menu' | 'size' | 'location' | 'save'>(null)
  const [location, setLocation] = useState<CustomerLocation | null>(initialLocation)
  const [quotes, setQuotes] = useState<QuotesState>({ status: initialLocation ? 'loading' : 'idle' })
  const rigBus = useMemo(() => new RigBus(), [])
  const restored = useRef(false)

  // The form holds whatever is typed; everything drawn, priced or sent uses
  // the same clamped spec the server would store.
  const effective = useMemo(() => parseSpec(spec), [spec])
  const preview = useMemo(() => previewFromSpec(effective), [effective])
  // The tapped card or swatch commits at once; the WebGL update follows.
  const scenePreview = useDeferredValue(preview)
  const family = familyOf(effective.productType)
  const words = FAMILY_WORDS[family]
  const tabs = TABS[family]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'type'
  const groups = useMemo(() => groupsFor(effective.productType), [effective.productType])
  const specJson = useMemo(() => JSON.stringify(effective), [effective])

  // A design in progress survives a refresh, a sign-in round trip and the
  // back button. A design that arrived in the URL wins over a remembered one.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (initialSpec) return
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY)
      if (stored) setSpec(parseSpec(JSON.parse(stored)))
    } catch {
      // Private mode, or an old value that no longer parses: start fresh.
    }
  }, [initialSpec])
  useEffect(() => {
    if (!restored.current) return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, specJson)
    } catch {
      // Nothing to do: the design still lives in memory.
    }
  }, [specJson])

  const set = useCallback(<K extends keyof DoorSpec>(key: K, value: DoorSpec[K]) => {
    setSpec((current) => ({ ...current, [key]: value }))
  }, [])
  const setType = useCallback((productType: ProductType) => {
    setSpec((current) => {
      const next = specForType(current, productType)
      // Coming back to garage doors from a gate or shutter starts at the
      // designer's double door again, not a single.
      return familyOf(productType) === 'garage' && familyOf(current.productType) !== 'garage'
        ? { ...next, widthMm: DESIGNER_START_SPEC.widthMm, heightMm: DESIGNER_START_SPEC.heightMm }
        : next
    })
    setOpen(false)
  }, [])

  // The expanded viewer is the same canvas laid over the screen, so the
  // design and the camera carry straight across. The page behind is locked.
  useEffect(() => {
    if (!expanded && !sheet) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (sheet) setSheet(null)
      else setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [expanded, sheet])

  // ---- Local quotes: only what a price depends on triggers a new lookup.
  const pricingKey = useMemo(
    () => JSON.stringify(requestFromSpec(effective, { brand: null, installRequired: true })),
    [effective]
  )
  const latest = useRef(0)
  const specRef = useRef(specJson)
  specRef.current = specJson
  useEffect(() => {
    if (!location) {
      setQuotes({ status: 'idle' })
      return
    }
    const ticket = ++latest.current
    setQuotes((current) => (current.status === 'ready' ? current : { status: 'loading' }))
    const timer = window.setTimeout(async () => {
      try {
        const result = await localQuotesAction({ spec: specRef.current, postcode: location.postcode, suburb: location.suburb ?? '' })
        if (ticket !== latest.current) return
        setQuotes(
          result.ok
            ? { status: 'ready', companies: result.companies, pricesShown: result.pricesShown }
            : { status: 'error', message: result.error }
        )
      } catch {
        if (ticket === latest.current) setQuotes({ status: 'error', message: 'Local companies can’t be loaded right now.' })
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [pricingKey, location])

  const query = useMemo(() => {
    const params = new URLSearchParams({ spec: specJson })
    if (location) {
      params.set('postcode', location.postcode)
      if (location.suburb) params.set('suburb', location.suburb)
    }
    return params.toString()
  }, [specJson, location])

  const style = doorStyleOf(effective)
  const typeLabel = PRODUCT_TYPES.find((t) => t.id === effective.productType)?.label ?? ''
  const colourGroup = groups.find((g) => g.id === 'colour')
  const customPicker = useRef<HTMLInputElement>(null)

  const pickCustom = (hex: string) => {
    if (!isHexColour(hex)) return
    setSpec((current) => ({ ...current, colour: 'custom', customColour: hex.toUpperCase() }))
  }

  const swatch = (id: string, label: string, hex: string | undefined) => (
    <button key={id} type="button" className="dz-swatch" aria-pressed={effective.colour === id} onClick={() => set('colour', id)}>
      <span className={`dz-swatch-dot${id === 'walnut' ? ' is-wood' : ''}`} style={{ backgroundColor: hex }} />
      {label}
    </button>
  )

  const customSwatch = (
    <button
      key="custom"
      type="button"
      className="dz-swatch"
      aria-pressed={effective.colour === 'custom'}
      onClick={() => {
        if (effective.colour !== 'custom') set('colour', 'custom')
        customPicker.current?.click()
      }}
    >
      <span
        className="dz-swatch-dot is-custom"
        data-picked={effective.colour === 'custom' ? '' : undefined}
        style={{ ['--dz-picked' as string]: specColourHex(effective) }}
      />
      Custom
      <input
        ref={customPicker}
        type="color"
        tabIndex={-1}
        aria-label="Pick a custom colour"
        value={isHexColour(effective.customColour) ? effective.customColour.toLowerCase() : '#2c3033'}
        onChange={(event) => pickCustom(event.target.value)}
      />
    </button>
  )

  const optionRows = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => {
      const group = groups.find((g) => g.id === id)
      if (!group) return null
      const value = String(effective[id as keyof DoorSpec])
      if (id === 'hardware') {
        return (
          <section key={id} className="dz-panel-section">
            <div className="dz-row-head">
              <h2 className="dz-row-title">
                {group.label}
                <strong>{group.values.find((v) => v.id === value)?.label}</strong>
              </h2>
            </div>
            <div className="dz-swatches">
              {group.values.map((option) => (
                <button key={option.id} type="button" className="dz-swatch" aria-pressed={value === option.id} onClick={() => set('hardware', option.id)}>
                  <span className="dz-swatch-dot" style={{ backgroundColor: option.hex }} />
                  {SHORT_LABELS[option.label] ?? option.label}
                </button>
              ))}
            </div>
          </section>
        )
      }
      return (
        <section key={id} className="dz-panel-section">
          <div className="dz-row-head">
            <h2 className="dz-row-title">{group.label}</h2>
          </div>
          <div className="dz-chips">
            {group.values.map((option) => (
              <button
                key={option.id}
                type="button"
                className="dz-chip"
                title={option.description}
                aria-pressed={value === option.id}
                onClick={() => set(id as keyof DoorSpec, option.id as never)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )
    })

  const familyTypes = PRODUCT_TYPES.filter((type) =>
    PRODUCT_FAMILIES.find((candidate) => candidate.id === family)?.types.includes(type.id as ProductType)
  )

  let panel: ReactNode
  if (activeTab === 'type') {
    panel = (
      <>
        {family === 'garage' ? (
          <>
            {effective.productType !== 'sectional' && (
              <p className="dz-note" style={{ marginBottom: 10 }}>
                {typeLabel} door selected. Choose a style below to go back to a panel door.
              </p>
            )}
            <div className="dz-cards" role="group" aria-label="Door type">
              {DOOR_STYLES.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="dz-card"
                  title={candidate.description}
                  aria-pressed={style === candidate.id}
                  onClick={() => setSpec((current) => applyDoorStyle(current, candidate.id))}
                >
                  <DoorGlyph
                    profile={candidate.set.panelProfile}
                    windows={candidate.set.windows}
                    tone={candidate.id === 'traditional' || candidate.id === 'carriage' ? 'light' : 'dark'}
                  />
                  {candidate.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          familyTypes.length > 1 && (
            <div className="dz-chips" role="group" aria-label={`${words.noun} type`}>
              {familyTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className="dz-chip"
                  title={type.description}
                  aria-pressed={effective.productType === type.id}
                  onClick={() => setType(type.id as ProductType)}
                >
                  {type.label}
                </button>
              ))}
            </div>
          )
        )}
        {optionRows(TAB_GROUPS[family].type)}
        <section className="dz-panel-section">
          <div className="dz-row-head">
            <h2 className="dz-row-title">Choose a Colour</h2>
            <button type="button" className="dz-row-more" aria-label="More colours and finishes" onClick={() => setTab('colour')}>
              {icons.arrow}
            </button>
          </div>
          <div className="dz-swatches">
            {QUICK_COLOURS.map((id) => {
              const option = colourGroup?.values.find((v) => v.id === id)
              return option ? swatch(option.id, option.label, option.hex) : null
            })}
            {customSwatch}
          </div>
        </section>
      </>
    )
  } else if (activeTab === 'colour') {
    const finish = groups.find((g) => g.id === 'finish')
    panel = (
      <>
        <section className="dz-panel-section">
          <div className="dz-row-head">
            <h2 className="dz-row-title">
              Colour<strong>{specColourLabel(effective)}</strong>
            </h2>
          </div>
          <div className="dz-swatches">
            {colourGroup?.values.filter((v) => v.id !== 'custom').map((option) => swatch(option.id, SHORT_LABELS[option.label] ?? option.label, option.hex))}
            {customSwatch}
          </div>
        </section>
        {finish && effective.colour !== 'walnut' && optionRows(['finish'])}
        {effective.colour === 'walnut' && <p className="dz-note" style={{ marginTop: 14 }}>Walnut is a timber-look finish.</p>}
      </>
    )
  } else if (activeTab === 'windows') {
    const windowGroup = groups.find((g) => g.id === 'windows')
    panel = windowGroup && effective.panelProfile !== 'full-view' ? (
      <>
        <div className="dz-cards" data-count={windowGroup.values.length} role="group" aria-label="Windows">
          {windowGroup.values.map((option) => (
            <button key={option.id} type="button" className="dz-card" title={option.description} aria-pressed={effective.windows === option.id} onClick={() => set('windows', option.id)}>
              <DoorGlyph profile={effective.panelProfile === 'carriage' ? 'carriage' : 'flush'} windows={option.id} />
              {option.label.replace('Side stack, ', 'Stack ').replace('Wide top row', 'Wide row')}
            </button>
          ))}
        </div>
        {optionRows(TAB_GROUPS[family].windows)}
      </>
    ) : (
      <p className="dz-note">
        {effective.panelProfile === 'full-view' && effective.productType === 'sectional'
          ? 'A Full View door is glass in every panel, so there are no separate windows to choose.'
          : `A ${typeLabel.toLowerCase()} door has no windows. Choose a panel door style to add them.`}
      </p>
    )
  } else {
    panel = <>{optionRows(TAB_GROUPS[family][activeTab])}</>
  }

  const sizeLabel = `${metres(effective.widthMm)} × ${metres(effective.heightMm)} m`

  return (
    <div className="dz" data-family={family}>
      <header className="dz-header">
        <div className="dz-header-bar">
          <Link href="/" className="dz-logo" aria-label="Doorlink home">
            <DoorlinkMark className="dz-logo-mark" />
            <span>
              <span className="dz-logo-word">
                Door<b>link</b>
              </span>
              <span className="dz-logo-tag">DESIGN&nbsp;&nbsp;COMPARE&nbsp;&nbsp;INSTALL</span>
            </span>
          </Link>
          <nav className="dz-header-nav" aria-label="Designer">
            <Link href="/configure" aria-current="page">
              Design
            </Link>
            <Link href="/saved">My Designs</Link>
            <Link href="/quotes">Quotes</Link>
            <Link href={signedIn ? '/portal' : '/sign-in?next=/portal'}>{signedIn ? 'My bookings' : 'Sign in'}</Link>
          </nav>
          <button type="button" className="dz-icon-button" aria-label="Open menu" onClick={() => setSheet('menu')}>
            {icons.menu}
          </button>
        </div>
      </header>

      <div className="dz-main">
        <div className={`dz-stage${expanded ? ' is-expanded' : ''}`}>
          {/* The header's curved edge and the line that sits in it. */}
          <div className="dz-curve" aria-hidden="true">
            <svg viewBox="0 0 270 62" preserveAspectRatio="none">
              <path d="M0 0H270V62H84C50 62 42 0 8 0Z" fill="#0e1a2a" />
            </svg>
          </div>
          <p className="dz-tagline">
            A better
            <br />
            garage starts
            <br />
            at home
          </p>

          <div className="dz-viewer" role={expanded ? 'dialog' : undefined} aria-label={expanded ? 'Your design, full screen' : undefined}>
            <DesignerScene preview={scenePreview} isOpen={open} mode={mode} rigBus={rigBus} onToggle={() => setOpen((v) => !v)} />

            <div className="dz-mode" role="group" aria-label="View">
              <button type="button" aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>
                2D
              </button>
              <button type="button" aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>
                3D
              </button>
            </div>

            {expanded ? (
              <>
                <div className="dz-expanded-bar">
                  <button type="button" className="dz-pill-button" onClick={() => setExpanded(false)}>
                    {icons.close} Done
                  </button>
                </div>
                <div className="dz-expanded-tools">
                  <button type="button" className="dz-pill-button" onClick={() => rigBus.send('reset')}>
                    {icons.reset} Reset view
                  </button>
                  {words.open && (
                    <button type="button" className="dz-pill-button" onClick={() => setOpen((v) => !v)}>
                      {open ? words.close : words.open}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <button type="button" className="dz-viewer-chip" onClick={() => setSheet('size')} aria-label={`Size ${sizeLabel}. Change size`}>
                {icons.ruler}
                {sizeLabel}
              </button>
            )}

            <button
              type="button"
              className="dz-expand"
              aria-label={expanded ? 'Exit full screen' : 'View full screen'}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? icons.collapse : icons.expand}
            </button>
          </div>
        </div>

        <div className="dz-controls">
          <div className="dz-tabs" role="tablist" aria-label="Design options">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`dz-tab-${t.id}`}
                aria-selected={activeTab === t.id}
                aria-controls="dz-panel"
                className="dz-tab"
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div className="dz-panel" id="dz-panel" role="tabpanel" aria-labelledby={`dz-tab-${activeTab}`}>
            {panel}
          </div>

          <section className="dz-quotes" aria-labelledby="dz-quotes-title">
            <div className="dz-quotes-head">
              <div>
                <h2 className="dz-quotes-title" id="dz-quotes-title">
                  Compare Local Quotes
                </h2>
                <p className="dz-quotes-sub">Real prices. No obligation.</p>
              </div>
              <div className="dz-place">
                {location && (
                  <span className="dz-place-name">
                    {icons.pin}
                    {locationLabel(location)}
                  </span>
                )}
                <button type="button" className="dz-place-change" onClick={() => setSheet('location')}>
                  {location ? 'Change' : 'Set your suburb'}
                </button>
              </div>
            </div>

            {quotes.status === 'idle' && (
              <p className="dz-empty">
                <b>Where is the {words.noun} going?</b>
                Add your suburb or postcode to see the companies that work in your area.
              </p>
            )}
            {quotes.status === 'loading' && (
              <ul className="dz-company-list" aria-busy="true" aria-label="Loading local companies">
                <li className="dz-skeleton" />
                <li className="dz-skeleton" />
              </ul>
            )}
            {quotes.status === 'error' && <p className="dz-empty">{quotes.message}</p>}
            {quotes.status === 'ready' && quotes.companies.length === 0 && (
              <p className="dz-empty">
                <b>No local companies available yet</b>
                {location ? `Nobody has registered to cover ${locationLabel(location)} so far. ` : ''}You can still request a measure and we’ll
                keep it for the first company that does.
              </p>
            )}
            {quotes.status === 'ready' && quotes.companies.length > 0 && (
              <>
                <ul className="dz-company-list">
                  {quotes.companies.map((company) => (
                    <li key={company.key}>
                      <Link href={company.profileHref} className="dz-company">
                        <span className="dz-company-logo">
                          {company.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a company's own uploaded logo
                            <img src={company.logoUrl} alt="" loading="lazy" />
                          ) : (
                            initials(company.name)
                          )}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span className="dz-company-name">
                            <span>{company.name}</span>
                            {company.verified && <span className="dz-badge">VERIFIED</span>}
                          </span>
                          <span className="dz-company-rating">
                            {company.ratingAvg !== null && company.ratingCount > 0 ? (
                              <>
                                <Stars value={company.ratingAvg} />
                                <span>
                                  {company.ratingAvg.toFixed(1)} ({company.ratingCount})
                                </span>
                              </>
                            ) : (
                              <span>No reviews yet</span>
                            )}
                          </span>
                          {(company.verified || company.jobsCompleted > 0 || company.leadTimeDays) && (
                            <span className="dz-company-meta">
                              {company.verified && <span>{icons.shield} Licence &amp; insurance checked</span>}
                              {company.jobsCompleted > 0 && (
                                <span>
                                  {company.jobsCompleted} job{company.jobsCompleted === 1 ? '' : 's'} on Doorlink
                                </span>
                              )}
                              {company.leadTimeDays ? <span>About {company.leadTimeDays} days</span> : null}
                            </span>
                          )}
                        </span>
                        <span className="dz-company-price">
                          {company.price ? (
                            <>
                              <b>
                                {company.price.fromCents === company.price.toCents
                                  ? money(company.price.fromCents, company.price.currency)
                                  : `${money(company.price.fromCents, company.price.currency)} – ${money(company.price.toCents, company.price.currency)}`}
                              </b>
                              <small>
                                {company.price.estimate ? 'Estimate, ' : ''}
                                {company.price.installed ? 'installed' : 'supply only'}, inc GST
                              </small>
                            </>
                          ) : (
                            <small>{company.noPrice === 'withheld' ? 'Prices shown to customers' : 'Price on request'}</small>
                          )}
                        </span>
                        {icons.chevron}
                      </Link>
                    </li>
                  ))}
                </ul>
                {quotes.pricesShown && quotes.companies.some((c) => c.price) && (
                  <p className="dz-note" style={{ marginTop: 10 }}>
                    Prices are each company’s own for this design, in AUD.{' '}
                    <Link className="dz-link" href={`/quote?${query}`}>
                      Get itemised quotes
                    </Link>
                  </p>
                )}
              </>
            )}
          </section>

          <div className="dz-action">
            <Link href={`/measure?${query}`} className="dz-measure">
              {icons.calendar}
              Request On-Site Measure
              <span className="dz-measure-arrow">{icons.arrow}</span>
            </Link>
            <ul className="dz-trust">
              <li>{icons.check} Free</li>
              <li>{icons.check} No obligation</li>
              <li>{icons.check} Design included</li>
            </ul>
          </div>

          <div className="dz-extras">
            <div className="dz-extras-links">
              <button type="button" className="dz-link" onClick={() => setSheet('save')}>
                Save this design
              </button>
              <Link className="dz-link" href={`/quote?${query}`}>
                Itemised quotes
              </Link>
              <Link className="dz-link" href={`/request-technician?spec=${encodeURIComponent(specJson)}`}>
                Post as a job
              </Link>
            </div>

            {family !== 'garage' && (
              <div className="dz-light">
                <MotorShortlist spec={effective} motors={motors} />
              </div>
            )}

            {previewAvailable && <AiPhoto signedIn={signedIn} specJson={specJson} />}

            <p className="dz-fine">
              Generic Doorlink styles, not a specific manufacturer’s product. Your installer confirms the nearest match at the measure.
            </p>
          </div>
        </div>
      </div>

      <nav className="dz-nav" aria-label="Primary">
        <ul>
          <li>
            <Link href="/configure" aria-current="page" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              {icons.home}
              Home
            </Link>
          </li>
          <li>
            <Link href={signedIn ? '/saved#designs' : '/sign-in?next=/saved'}>
              {icons.designs}
              My Designs
            </Link>
          </li>
          <li>
            <Link href={signedIn ? '/saved#manuals' : '/sign-in?next=/saved'}>
              {icons.heart}
              Saved
            </Link>
          </li>
          <li>
            <Link href={signedIn ? '/quotes' : '/sign-in?next=/quotes'}>
              {icons.quotes}
              Quotes
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => setSheet('menu')} aria-haspopup="dialog">
              {icons.more}
              More
            </button>
          </li>
        </ul>
      </nav>

      {sheet && (
        <>
          <div className="dz-sheet-backdrop" onClick={() => setSheet(null)} />
          <div className="dz-sheet" role="dialog" aria-modal="true" aria-label={SHEET_TITLES[sheet]}>
            <div className="dz-sheet-head">
              <h2 className="dz-sheet-title">{SHEET_TITLES[sheet]}</h2>
              <button type="button" className="dz-icon-button" aria-label="Close" onClick={() => setSheet(null)}>
                {icons.close}
              </button>
            </div>

            {sheet === 'size' && (
              <SizeSheet
                spec={effective}
                widthLabel={words.width}
                family={family}
                onApply={(widthMm, heightMm) => {
                  setSpec((current) => ({ ...current, widthMm, heightMm }))
                  setSheet(null)
                }}
              />
            )}

            {sheet === 'location' && (
              <LocationSheet
                location={location}
                onApply={(next) => {
                  setLocation(next)
                  setSheet(null)
                }}
              />
            )}

            {sheet === 'save' && <SaveSheet signedIn={signedIn} specJson={specJson} defaultName={words.saveAs} />}

            {sheet === 'menu' && (
              <>
                <h3 style={{ marginTop: 0 }}>What are you designing?</h3>
                <ul className="dz-menu-list">
                  {[
                    { label: 'Garage door, panel', type: 'sectional' as ProductType },
                    { label: 'Garage door, roller', type: 'roller' as ProductType },
                    { label: 'Garage door, tilt', type: 'tilt' as ProductType },
                    { label: 'Gate', type: 'sliding-gate' as ProductType },
                    { label: 'Fence', type: 'fence' as ProductType },
                    { label: 'Window or shop shutter', type: 'window-shutter' as ProductType },
                  ].map((item) => {
                    const current =
                      familyOf(item.type) === 'garage' ? effective.productType === item.type : familyOf(item.type) === family
                    return (
                      <li key={item.type}>
                        <button
                          type="button"
                          aria-pressed={current}
                          onClick={() => {
                            if (!current) setType(item.type)
                            setTab('type')
                            setSheet(null)
                          }}
                        >
                          {item.label}
                          {current ? icons.check : icons.chevron}
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <h3>Your Doorlink</h3>
                <ul className="dz-menu-list">
                  {(signedIn
                    ? [
                        { href: '/saved', label: 'My designs' },
                        { href: '/quotes', label: 'My quotes' },
                        { href: '/portal', label: 'Appointments, invoices and receipts' },
                        { href: '/jobs', label: 'Jobs' },
                        { href: '/messages', label: 'Messages' },
                        ...(role === 'TECHNICIAN' || role === 'SUPPLIER' ? [{ href: '/business', label: 'My business' }] : []),
                        { href: '/account', label: 'Account' },
                      ]
                    : [
                        { href: `/sign-in?next=${encodeURIComponent('/configure')}`, label: 'Sign in' },
                        { href: '/register', label: 'Create a free account' },
                        { href: '/register?role=TECHNICIAN', label: 'Register your company' },
                      ]
                  ).map((item) => (
                    <li key={item.href}>
                      <Link href={item.href}>
                        {item.label}
                        {icons.chevron}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/">
                      Doorlink home
                      {icons.chevron}
                    </Link>
                  </li>
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const SHEET_TITLES = { menu: 'Menu', size: 'Opening size', location: 'Your location', save: 'Save this design' } as const

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? 'D').slice(0, 2)).toUpperCase()
}

function SizeSheet({
  spec,
  widthLabel,
  family,
  onApply,
}: {
  spec: DoorSpec
  widthLabel: string
  family: ProductFamily
  onApply: (widthMm: number, heightMm: number) => void
}) {
  const limits = sizeLimitsFor(spec.productType)
  const [width, setWidth] = useState(String(spec.widthMm))
  const [height, setHeight] = useState(String(spec.heightMm))
  const clamp = (value: string, range: { min: number; max: number }, fallback: number) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? Math.min(range.max, Math.max(range.min, Math.round(numeric))) : fallback
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onApply(clamp(width, limits.widthMm, spec.widthMm), clamp(height, limits.heightMm, spec.heightMm))
      }}
    >
      {family === 'garage' && (
        <div className="dz-chips" style={{ marginBottom: 14 }}>
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="dz-chip"
              aria-pressed={Number(width) === preset.widthMm && Number(height) === preset.heightMm}
              onClick={() => {
                setWidth(String(preset.widthMm))
                setHeight(String(preset.heightMm))
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <div className="dz-field-row">
        <label className="dz-field">
          <span>{widthLabel} (mm)</span>
          <input
            className="dz-input"
            type="number"
            inputMode="numeric"
            min={limits.widthMm.min}
            max={limits.widthMm.max}
            step={limits.widthMm.step}
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          />
        </label>
        <label className="dz-field">
          <span>Height (mm)</span>
          <input
            className="dz-input"
            type="number"
            inputMode="numeric"
            min={limits.heightMm.min}
            max={limits.heightMm.max}
            step={limits.heightMm.step}
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
        </label>
      </div>
      <p className="dz-note" style={{ marginTop: 10 }}>
        {limits.widthMm.min}–{limits.widthMm.max} mm wide, {limits.heightMm.min}–{limits.heightMm.max} mm high. A rough size is fine: the
        installer measures before anything is made.
      </p>
      <button type="submit" className="dz-primary">
        Use this size
      </button>
    </form>
  )
}

function LocationSheet({ location, onApply }: { location: CustomerLocation | null; onApply: (location: CustomerLocation) => void }) {
  const [suburb, setSuburb] = useState(location?.suburb ?? '')
  const [postcode, setPostcode] = useState(location?.postcode ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        // The same reader the server uses, so what shows here is what is looked up.
        const { readLocation } = await import('@/lib/location')
        const next = readLocation({ suburb, postcode })
        if (!next) {
          setError('Enter a 4-digit Australian postcode.')
          return
        }
        onApply(next)
      }}
    >
      <div className="dz-field-row" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <label className="dz-field">
          <span>Suburb</span>
          <input className="dz-input" autoComplete="address-level2" value={suburb} onChange={(event) => setSuburb(event.target.value)} placeholder="e.g. Paddington" />
        </label>
        <label className="dz-field">
          <span>Postcode</span>
          <input
            className="dz-input"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={4}
            required
            value={postcode}
            onChange={(event) => {
              setPostcode(event.target.value.replace(/\D/g, ''))
              setError(null)
            }}
            placeholder="4064"
          />
        </label>
      </div>
      {error && (
        <p className="dz-error" role="alert">
          {error}
        </p>
      )}
      <p className="dz-note" style={{ marginTop: 10 }}>
        Used to show companies that work in your area. Australia only.
      </p>
      <button type="submit" className="dz-primary">
        Show local companies
      </button>
    </form>
  )
}

const initialSave: ConfigurationActionState = {}

function SaveSheet({ signedIn, specJson, defaultName }: { signedIn: boolean; specJson: string; defaultName: string }) {
  const [state, formAction, pending] = useActionState(saveConfigurationAction, initialSave)
  if (!signedIn) {
    return (
      <>
        <p className="dz-note">Sign in with a free account to keep this design and come back to it on any device.</p>
        <Link className="dz-primary" href={`/sign-in?next=${encodeURIComponent(`/configure?spec=${encodeURIComponent(specJson)}`)}`}>
          Sign in to save
        </Link>
      </>
    )
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="spec" value={specJson} />
      <label className="dz-field">
        <span>Name</span>
        <input className="dz-input" name="name" maxLength={120} required defaultValue={defaultName} />
      </label>
      {state.error && (
        <p className="dz-error" role="alert">
          {state.error}
        </p>
      )}
      {state.savedId && (
        <p className="dz-ok">
          Saved.{' '}
          <Link className="dz-link" href="/saved">
            See my designs
          </Link>
        </p>
      )}
      <button type="submit" className="dz-primary" disabled={pending}>
        {pending ? 'Saving…' : 'Save design'}
      </button>
    </form>
  )
}

const initialPreviewState: PreviewActionState = {}

/** A free AI image of the design, shown only when an image provider is connected. */
function AiPhoto({ signedIn, specJson }: { signedIn: boolean; specJson: string }) {
  const [state, action, pending] = useActionState(generateDesignImageAction, initialPreviewState)
  const [note, setNote] = useState('')
  const noteWords = previewNoteWordCount(note)
  return (
    <section className="dz-light" aria-labelledby="ai-heading">
      <h2 id="ai-heading" className="flex items-center gap-2 text-sm font-semibold text-graphite">
        AI photo of your design <span className="rounded-full bg-good/15 px-2 py-0.5 text-micro font-semibold text-good">Free</span>
      </h2>
      {state.imageDataUrl && (
        <figure className="mt-3 max-w-full overflow-hidden rounded-md border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated image */}
          <img src={state.imageDataUrl} alt="AI-generated image of your design" className="block h-auto w-full max-w-full" />
          <figcaption className="border-t border-line bg-rail px-3 py-2 text-micro text-zinc-deep">
            AI-generated from your choices. Indicative only, not a manufacturer’s product photo.
          </figcaption>
        </figure>
      )}
      {!signedIn ? (
        <p className="mt-2 text-sm text-graphite-soft">
          <Link href="/sign-in?next=/configure" className="font-medium text-signal hover:text-signal-hover">
            Sign in
          </Link>{' '}
          to generate a free, realistic image of your design, on a photo of your home if you like.
        </p>
      ) : (
        <form action={action} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="spec" value={specJson} />
          <Field label="Photo of your home (optional)" htmlFor="preview-photo" hint="Add one to see the design in place.">
            <Input id="preview-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
          </Field>
          <Field label="Notes (optional)" htmlFor="preview-note" hint={`${noteWords} / ${PREVIEW_NOTE_MAX_WORDS} words.`}>
            <Textarea id="preview-note" name="note" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="For example: keep the brick piers." />
          </Field>
          {state.error && (
            <p role="alert" className="text-sm text-bad">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="secondary" disabled={pending || noteWords > PREVIEW_NOTE_MAX_WORDS}>
            {pending ? 'Generating… (up to a minute)' : state.imageDataUrl ? 'Regenerate, free' : 'Generate free AI image'}
          </Button>
        </form>
      )}
    </section>
  )
}
