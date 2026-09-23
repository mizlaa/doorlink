import { describe, expect, it } from 'vitest'
import { deadLinkReason } from './dead-link'

describe('deadLinkReason', () => {
  it('catches a URL carrying a search result’s ellipsis', () => {
    // All three of these were real records in the catalogue. They read
    // as ordinary rows in every listing and could never have resolved.
    for (const url of [
      'https://manualzz.com/doc/6032843/h%C3%B6rmann-ecostar-liftronic-500-garage-door-opener-owner-s-...',
      'https://manualzz.com/doc/en/9971950/hormann-rotamatic-gate-operator-installation-instructions...',
      'https://manualzz.com/doc/5284446/silvelox-overlap-2.0-sectional-garage-door-installation-m...',
    ]) {
      expect(deadLinkReason(url), url).toMatch(/truncated/)
    }
  })

  it('catches the other ways a copied URL arrives broken', () => {
    expect(deadLinkReason('https://example.com/a manual.pdf')).toMatch(/whitespace/)
    expect(deadLinkReason('https://https://example.com/m.pdf')).toMatch(/scheme/)
    expect(deadLinkReason('https://example.com/<manual>.pdf')).toMatch(/illegal/)
    expect(deadLinkReason('https://localhost/manual.pdf')).toMatch(/no dot/)
    expect(deadLinkReason('not-a-url')).toMatch(/parseable/)
  })

  it('leaves alone every shape a real manual URL takes', () => {
    // Percent-encoding, spaces encoded as +, deep paths, query strings,
    // ports, plain http and a bare directory index are all normal here.
    // A false positive removes a working manual, which is worse than the
    // dead link this is hunting.
    for (const url of [
      'https://www.steel-lineautomation.com.au/uploads/7/2/0/3/7203835/rd1200.pdf',
      'https://arridgegaragedoors.co.uk/uploads/pdfs/New+Roller+Garage+Door+Installation+Manual.pdf',
      "https://overheaddoor-production-assets.azureedge.net/assets/docs/default-source/owner's-manuals/legacy-920.pdf?sfvrsn=347fa23c_4",
      'https://www.marantec.com/files/eba_download.php?file=100316.pdf&vrsn=D',
      'http://vorot.net/fileadmin/pdf/Instrukcii-po-montazhu/RotaMatic.pdf',
      'https://www.aluroll.co.uk/installer-zone/downloads/',
      'https://faac.blob.core.windows.net/web/1/root/j275-ha-732649-revd-en.pdf',
    ]) {
      expect(deadLinkReason(url), url).toBeNull()
    }
  })

  it('does not judge a legitimate query string by the path’s rules', () => {
    // An ellipsis after the ? is someone else's business; only the path
    // is evidence of truncation.
    expect(deadLinkReason('https://example.com/manual.pdf?q=a...')).toBeNull()
  })
})
