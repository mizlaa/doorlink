/**
 * Links that cannot resolve, decided from the string alone.
 *
 * This is not a substitute for fetching. `manuals:verify` asks the
 * server and is the only thing that can say a link is alive. But some
 * links are dead on their face, and those are worth catching without
 * waiting for network access — particularly the ones bulk ingest
 * introduces, which look completely healthy in a count.
 *
 * The rule for what belongs here: certainty. A check that might remove a
 * working link does more damage than the dead link it was hunting,
 * because the dead link announces itself the moment someone clicks it
 * and the wrongly-removed one is simply gone. Anything merely suspicious
 * belongs to verify, which can actually check.
 */

/** The reason a URL cannot resolve, or null if nothing is provably wrong. */
export function deadLinkReason(url: string): string | null {
  // Query and fragment are excluded: a legitimate URL may carry almost
  // anything after ? or #, and the defects below are all in the path.
  const path = url.split(/[?#]/)[0]

  // The one that prompted this. A URL copied from a search result can
  // carry the ellipsis the result used to shorten it for display, and
  // three were sitting in the catalogue reading like ordinary records.
  if (path.endsWith('...') || path.endsWith('…')) {
    return 'truncated — carries a search result’s display ellipsis'
  }
  if (/\s/.test(url)) return 'contains whitespace'
  if (url.split('://').length > 2) return 'more than one URI scheme'
  if (/[<>"\\^`{|}]/.test(url)) return 'contains a character illegal in a URL'
  try {
    const parsed = new URL(url)
    // A hostname with no dot is either a local name or a mangled URL;
    // neither is a document anyone can reach from the public site.
    if (!parsed.hostname.includes('.')) return 'hostname has no dot'
  } catch {
    return 'not a parseable URL'
  }
  return null
}
