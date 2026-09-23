/**
 * Deriving a document's catalogue fields from its title and URL.
 *
 * Research arrives as a title and a link. The catalogue wants a kind, a
 * category, a region and a provenance. Everything here is that guess,
 * kept separate from the script that applies it for one reason: these
 * are the rules most likely to be wrong, and rules that live in a script
 * only get exercised by running the script over the whole corpus, where
 * a bad one looks like a plausible number rather than a failure.
 *
 * Both bugs these functions have had so far were of exactly that shape.
 * A pattern anchored `\binstall\b` matched "install" and not
 * "installation", so every install manual in a 1,400-row import landed
 * in the generic fallback — a clean run, a sensible total, and a useless
 * filter. And category, derived per document but stored per model, gave
 * a different answer for each of a model's documents and flip-flopped on
 * every re-run. Neither would have survived a test.
 */

import type { SeedModel } from '../../../scripts/manuals/schema'

/** Document kinds, in the order they are tested against a title. */
const KIND_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // An index page listing a manufacturer's manuals is a real, useful
  // record — it is how you reach documents this list could not name
  // individually — but it is not itself a manual, and it is usually
  // titled "... Installation Manuals Index", so it has to be caught
  // before the install rule claims it.
  [/\bindex\b/i, 'TECHNICAL_DOCUMENT'],
  // Order matters where titles carry more than one of these words.
  // "Installation and Operation Manual" is an install manual; "Quick
  // Start Installation Guide" is a quick start. Narrower first.
  [/\bquick[- ](start|setup|manual|reference|install)/i, 'QUICK_START'],
  [/\bwiring\b/i, 'WIRING_DIAGRAM'],
  [/\bparts?\s+(list|catalogue|catalog)/i, 'PARTS_LIST'],
  [/\bprogramming\b|\bcoding instructions\b/i, 'PROGRAMMING_GUIDE'],
  [/\btroubleshooting\b/i, 'TROUBLESHOOTING_GUIDE'],
  [/\bdeclaration of conformity\b/i, 'DECLARATION_OF_CONFORMITY'],
  [/\bwarranty\b/i, 'WARRANTY'],
  [/\bservice bulletin\b/i, 'SERVICE_BULLETIN'],
  [/\bsafety\b/i, 'SAFETY_DOCUMENT'],
  [/\b(data ?sheet|spec(ification)? sheet)\b/i, 'SPEC_SHEET'],
  // No trailing \b on the stems: "install" has to reach "installation"
  // and "installing", and "fit"/"mount" their -ing forms. An earlier
  // version anchored both ends and silently matched almost nothing —
  // every install manual in the list fell through to the generic
  // fallback, which looks fine in a count and is useless in a filter.
  [/\binstall(ation|ing|er)?\b|\bfitting\b|\bmount(ing)?\b|\bassembly\b/i, 'INSTALL_MANUAL'],
  [/\b(owner|user|operating|operation|homeowner|instruction|use and maintenance)/i, 'USER_MANUAL'],
  [/\b(technical|service)\b/i, 'TECHNICAL_DOCUMENT'],
]

export function kindFor(title: string): string {
  for (const [pattern, kind] of KIND_PATTERNS) {
    if (pattern.test(title)) return kind
  }
  return 'TECHNICAL_DOCUMENT'
}

/** Catalogue categories, matched against the model and title together. */
const CATEGORY_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // "sensor" and "detector" earn their place here: a whole class of
  // safety accessory — BEA's laser scanners, Optex's door sensors,
  // Bircher's presence detectors — names itself that way and nothing
  // else, so without them every one of those records fell through to
  // whatever the manufacturer mostly made.
  [/\b(transmitter|remote|receiver|keypad|photocell|sensing edge|safety edge|light curtain|sensor|detector|intercom|door entry|access control|video door|door phone)/i, 'remotes-accessories'],
  [/\b(high[- ]speed|rolling steel|fire (door|shutter)|industrial|dock|rapid)/i, 'industrial-high-speed-doors'],
  [/\b(sliding door operator|swing door operator|pedestrian|automatic (sliding|swing) door|revolving|slimdrive|powerturn|dura-glide|besam|tormax)/i, 'automatic-pedestrian-doors'],
  [/\b(gate|barrier|bollard|swing|sliding gate|boom)/i, 'gate-motors'],
  [/\b(roller shutter|rolling shutter|tubular motor|awning|blind|shutter)/i, 'roller-shutter-motors'],
  [/\b(garage|sectional|tilt|roller door|overhead door|up[- ]and[- ]over)/i, 'garage-door-openers'],
]

/** The matched category, or null when nothing in the text says. */
export function categoryFor(text: string): string | null {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category
  }
  return null
}

/** Used only when a manufacturer offers no evidence either. */
export const LAST_RESORT_CATEGORY = 'garage-door-openers'

/**
 * A model's category, from everything known about the model at once.
 *
 * Category lives on the model but the evidence for it is spread across
 * its documents, so deriving it from whichever document is in hand gives
 * a different answer per document and the last write wins. That was
 * survivable while records were only ever created; once a re-run started
 * recomputing them, two documents under one model would hand the
 * category back and forth and every run reported changes it had just
 * undone.
 *
 * Taking the model code plus its document titles — sorted, so document
 * order cannot change the outcome — makes the derivation a pure function
 * of the model's content, which is what "safe to re-run" requires.
 */
export function categoryForModel(modelCode: string, titles: readonly string[]): string | null {
  const sorted = [...titles].sort()
  return categoryFor(`${modelCode} ${sorted.join(' ')}`)
}

/**
 * What a manufacturer mostly makes, from the models that named it
 * themselves.
 *
 * Plenty of titles say nothing about the product — "FAAC E024S Control
 * Board Manual" names a part, not a door — and sending every one of
 * those to a fixed default put two thirds of the catalogue under garage
 * door openers, including barriers and bollards. A brand is rarely
 * ambiguous even when one of its documents is, so the better guess for
 * an unlabelled FAAC record is whatever the labelled FAAC records are.
 *
 * Counted only over models that matched a pattern, so a fallback can
 * never become the evidence for the next fallback. Ties break
 * alphabetically to keep the result the same on every run.
 */
export function dominantCategory(models: readonly SeedModel[]): string | null {
  const counts = new Map<string, number>()
  for (const model of models) {
    const matched = categoryForModel(
      model.modelCode,
      model.documents.map((d) => d.title),
    )
    if (matched) counts.set(matched, (counts.get(matched) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

/** Regions, inferred from the host's country domain. */
const REGION_BY_TLD: Record<string, string> = {
  au: 'AU',
  nz: 'NZ',
  uk: 'UK',
  ca: 'CA',
  de: 'EU',
  it: 'EU',
  fr: 'EU',
  es: 'EU',
  nl: 'EU',
  pl: 'EU',
  pt: 'EU',
  dk: 'EU',
  se: 'EU',
  eu: 'EU',
  ch: 'EU',
  at: 'EU',
  be: 'EU',
  ie: 'EU',
  lt: 'EU',
  cz: 'EU',
  hu: 'EU',
  ua: 'EU',
  ru: 'EU',
  za: 'GLOBAL',
  us: 'US',
  com: 'GLOBAL',
}

export function regionFor(host: string, manufacturerCountry: string | undefined): string {
  const parts = host.split('.')
  const last = parts[parts.length - 1]
  const secondLast = parts[parts.length - 2]
  // .co.uk and .com.au put the meaningful part second from the end.
  if ((last === 'uk' || last === 'au' || last === 'nz' || last === 'za') && secondLast) {
    return REGION_BY_TLD[last] ?? 'UNKNOWN'
  }
  if (REGION_BY_TLD[last] && REGION_BY_TLD[last] !== 'GLOBAL') return REGION_BY_TLD[last]
  // A .com tells you nothing, so fall back to where the manufacturer is.
  if (manufacturerCountry) {
    const byCountry: Record<string, string> = {
      AU: 'AU', NZ: 'NZ', GB: 'UK', US: 'US', CA: 'CA',
      DE: 'EU', IT: 'EU', FR: 'EU', ES: 'EU', NL: 'EU', PL: 'EU', BE: 'EU',
      AT: 'EU', CH: 'EU', PT: 'EU', DK: 'EU', SE: 'EU', CZ: 'EU', SI: 'EU', IE: 'EU',
    }
    return byCountry[manufacturerCountry] ?? 'UNKNOWN'
  }
  return 'UNKNOWN'
}

/**
 * Whether the document sits on the manufacturer's own site.
 *
 * Compared on the registrable-ish tail of the host rather than an exact
 * match, because a manufacturer's documents routinely live on a
 * subdomain or a regional domain of the same brand. Getting this wrong
 * in the permissive direction is the expensive mistake — an aggregator
 * copy labelled MANUFACTURER_ORIGINAL is exactly the "unverified
 * document presented as official" this catalogue is built to avoid — so
 * anything that is not clearly the manufacturer's own host is third
 * party.
 */
/**
 * A host's registrable name and the suffix after it: "hormann" and
 * "co.uk" for www.hormann.co.uk, "manymanuals" and "com" for
 * marantec.manymanuals.com. Only the two-level country forms that
 * actually appear in the catalogue are recognised (co.uk, com.au and
 * their kin); anything else takes the last label as the suffix.
 */
function registrable(host: string): { label: string; suffix: string } {
  const parts = host.split('.')
  const last = parts[parts.length - 1]
  const second = parts[parts.length - 2]
  if (last.length === 2 && ['co', 'com', 'net', 'org', 'ac', 'gov'].includes(second)) {
    return { label: parts[parts.length - 3] ?? '', suffix: `${second}.${last}` }
  }
  return { label: second ?? '', suffix: last }
}

export function originFor(host: string, website: string | null | undefined): string {
  if (!website) return 'THIRD_PARTY_GUIDE'
  let siteHost: string
  try {
    siteHost = new URL(website).hostname.replace(/^www\./, '')
  } catch {
    return 'THIRD_PARTY_GUIDE'
  }
  const docHost = host.replace(/^www\./, '')
  if (docHost === siteHost) return 'MANUFACTURER_ORIGINAL'
  // A subdomain of the manufacturer's own site.
  if (docHost.endsWith(`.${siteHost}`)) return 'MANUFACTURER_ORIGINAL'
  // The same brand under another country's domain — hormann.co.uk for
  // hormann.com. Compared on the registrable name, not the first label:
  // an aggregator that files each brand under its own subdomain
  // (marantec.manymanuals.com) and a dealer that does the same
  // (manusa.parkan.ua) both lead with the brand, and matching there
  // badged their copies as the manufacturer's own. The other domain
  // must also be a country domain or share the site's suffix, since a
  // brand name under a generic TLD like .help is as easily anyone's.
  const site = registrable(siteHost)
  const doc = registrable(docHost)
  const countryDomain = /^([a-z]{2}|(co|com|net|org|ac|gov)\.[a-z]{2})$/.test(doc.suffix)
  if (
    site.label.length >= 4 &&
    doc.label === site.label &&
    (countryDomain || doc.suffix === site.suffix)
  ) {
    return 'MANUFACTURER_ORIGINAL'
  }
  return 'THIRD_PARTY_GUIDE'
}
