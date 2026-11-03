import { PRODUCT_CATEGORIES, BRANDS, SEED_MANUALS } from './data'

/**
 * The product catalogue behind "Find your product". Fictional models from
 * the demo brands; every record is marked as demo data.
 */
export interface FinderModel {
  id: string
  name: string
  modelCode: string
  brand: string
  category: string
  productLine: string
  summary: string
}

export const FINDER_MODELS: FinderModel[] = [
  ['Westline', 'Sectional garage doors', 'S-Series', 'S240', 'S240 Sectional', 'Insulated sectional door for openings up to 5.4 m wide. Four or five sections, optional top-row glazing.'],
  ['Westline', 'Openers & motors', 'W-Drive', 'W-800B', 'W-800B Belt Drive', 'Quiet belt-drive opener for sectional doors up to 120 kg.'],
  ['Westline', 'Remotes & accessories', 'RF remotes', 'RF4', 'RF4 Handset', 'Four-button rolling-code remote for Westline openers.'],
  ['Summit Entry', 'Roller doors', 'R-Series', 'R220', 'R220 Roller', 'Residential roller door, 0.42 mm steel curtain, spring balanced.'],
  ['Summit Entry', 'Openers & motors', 'SE Motors', 'SE-RM700', 'SE-RM700 Roller Motor', 'Roller door operator with manual release and auto-close.'],
  ['Summit Entry', 'Springs & hardware', 'Spring kits', 'SE-EX90', 'SE-EX90 Extension Springs', 'Heavy extension spring pair with safety cables.'],
  ['Bluegum', 'Openers & motors', 'SmartDrive', 'BG-600', 'BG-600 SmartDrive', 'Sliding gate motor for gates up to 600 kg, battery backup ready.'],
  ['Bluegum', 'Openers & motors', 'RAM', 'BG-RAM 400', 'BG-RAM 400', 'Linear ram kit for swing gate leaves up to 3 m.'],
  ['Bluegum', 'Openers & motors', 'Tubular', 'BG-T20', 'BG-T20 Tubular', 'Tubular shutter motor, 10 to 50 Nm.'],
  ['Bluegum', 'Safety sensors', 'Safety', 'BG-Beam', 'BG-Beam Photo-electric', 'Reflective safety beams for gates and doors.'],
  ['Bluegum', 'Remotes & accessories', 'Controls', 'BG-KP2', 'BG-KP2 Wireless Keypad', 'Wireless wall keypad, up to 20 codes.'],
  ['MetroSpan', 'Tilt doors', 'MT-Series', 'MT-450', 'MT-450 Tilt', 'One-piece tilt door with counterbalance springs.'],
  ['MetroSpan', 'Springs & hardware', 'Rollers', 'MS-R10', 'MS-R10 Nylon Rollers', 'Set of 10 nylon rollers with 11-ball bearings.'],
  ['Crestview', 'Sliding gates', 'CV Slide', 'CV-900', 'CV-900 Slide', 'Aluminium slat sliding gate system with galvanised track.'],
  ['Crestview', 'Swing gates', 'CV Swing', 'CV-SG18', 'CV-SG18 Swing Leaf', 'Aluminium slat swing gate leaf, 1800 high.'],
  ['Crestview', 'Roller shutters', 'CV Shutters', 'CV-WS39', 'CV-WS39 Window Shutter', '39 mm aluminium window roller shutter, manual or motorised.'],
  ['Crestview', 'Springs & hardware', 'Torsion', 'CV-TS218', 'CV-TS218 Torsion Pair', 'Torsion spring pair, 218 mm × 6.0 mm wire.'],
  ['Kurrajong', 'Fencing', 'Slat fencing', 'KF-65', 'KF-65 Slat Panel', 'Aluminium slat fence panel, 65 mm slats, 2.4 m bays.'],
  ['Kurrajong', 'Fencing', 'Pool fencing', 'KF-PF12', 'KF-PF12 Pool Panel', 'Tubular aluminium pool fence panel with self-closing gate kit.'],
  ['Kurrajong', 'Swing gates', 'Gates', 'KF-PG10', 'KF-PG10 Pedestrian Gate', 'Pedestrian gate to match KF-65 fencing, 1 m wide.'],
  ['Aldgate', 'Openers & motors', 'Sectional openers', 'AG-1200', 'AG-1200 Chain Drive', 'Chain-drive opener for double sectional doors up to 150 kg.'],
  ['Aldgate', 'Openers & motors', 'Roller openers', 'AG-R90', 'AG-R90 Roller Operator', 'Roller door operator with auto-close and obstruction sensing.'],
  ['Aldgate', 'Remotes & accessories', 'Controls', 'AG-Link', 'AG-Link Smart Hub', 'Phone control and open/close alerts for Aldgate openers.'],
].map(([brand, category, productLine, modelCode, name, summary], i) => ({
  id: `mdl-${i + 1}`,
  brand,
  category,
  productLine,
  modelCode,
  name,
  summary,
}))

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function finderResponse(url: URL): { status: number; body: unknown } {
  const step = url.searchParams.get('step')
  const categoryId = url.searchParams.get('categoryId')
  const manufacturerId = url.searchParams.get('manufacturerId')
  const productLineId = url.searchParams.get('productLineId')
  const inCategory = FINDER_MODELS.filter((m) => !categoryId || slug(m.category) === categoryId)
  const forMaker = inCategory.filter((m) => !manufacturerId || slug(m.brand) === manufacturerId)
  const unique = (items: string[]) => [...new Set(items)].map((name) => ({ id: slug(name), name }))
  switch (step) {
    case 'category':
      return { status: 200, body: { step, options: PRODUCT_CATEGORIES.map((name) => ({ id: slug(name), name })) } }
    case 'manufacturer':
      return { status: 200, body: { step, options: unique(inCategory.map((m) => m.brand)).length ? unique(inCategory.map((m) => m.brand)) : BRANDS.map((name) => ({ id: slug(name), name })) } }
    case 'productLine':
      return { status: 200, body: { step, options: unique(forMaker.map((m) => m.productLine)) } }
    case 'model':
      return {
        status: 200,
        body: {
          step,
          options: forMaker
            .filter((m) => !productLineId || slug(m.productLine) === productLineId)
            .map((m) => ({ id: m.id, name: `${m.modelCode} · ${m.name}` })),
        },
      }
    case 'confirm': {
      const model = FINDER_MODELS.find((m) => m.id === url.searchParams.get('modelId'))
      if (!model) return { status: 404, body: { error: 'Model not found.' } }
      return {
        status: 200,
        body: {
          step,
          model: {
            id: model.id,
            name: model.name,
            modelCode: model.modelCode,
            summary: model.summary,
            dataSource: 'DEMO',
            manufacturer: { name: model.brand },
            category: { name: model.category },
            productLine: { name: model.productLine },
          },
        },
      }
    }
    default:
      return { status: 400, body: { error: 'Invalid finder request.' } }
  }
}

export function manualsForModel(model: FinderModel) {
  return SEED_MANUALS.filter((m) => m.brand === model.brand && m.model.split(' ')[0] === model.modelCode)
}

/** Answers the finder's /api/finder requests locally; every other request goes to the network as normal. */
export function installFinderApi() {
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, window.location.origin)
    if (url.pathname.endsWith('/api/finder')) {
      await new Promise((r) => setTimeout(r, 120))
      const { status, body } = finderResponse(url)
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }
    return original(input as RequestInfo, init)
  }
}
