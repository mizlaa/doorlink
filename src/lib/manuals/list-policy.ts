/**
 * Which research-list rows become catalogue records.
 *
 * Only direct PDF links are kept. An index page or an aggregator's
 * viewer page (ManualsLib, Manualzz and the like) is not a manufacturer
 * document, and the importer would present it as if it were. Those
 * links stay in the research list as a record of what was found; they
 * just never reach the seed files.
 *
 * Both list importers — ingest-list.ts and ingest-link-list.ts — read
 * these rules from here, so the catalogue cannot hold one policy for
 * rows added one way and another for rows added the other.
 */

/** Sub-brands filed under the manufacturer that owns them, by slug. */
export const SAME_MANUFACTURER: Readonly<Record<string, string>> = {
  'assa-abloy-besam': 'besam',
  'automatic-technology-ata': 'automatic-technology',
  'marantec-america': 'marantec',
  'nice-apollo': 'nice',
  'came-bpt': 'came',
  'genius-faac': 'faac',
  'hansa-nice': 'nice',
}

/** True when the URL's path, ignoring any query or fragment, is a PDF. */
export function isPdf(url: string): boolean {
  const path = url.split(/[?#]/)[0] ?? ''
  return path.toLowerCase().endsWith('.pdf')
}

/** True for a page that lists manuals rather than being one. */
export function isIndex(title: string): boolean {
  return /\bindex\b/i.test(title)
}

/** Whether a row with this URL and title belongs in the catalogue. */
export function keepsRow(url: string, title: string): boolean {
  return isPdf(url) && !isIndex(title)
}
