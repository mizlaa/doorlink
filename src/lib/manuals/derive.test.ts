import { describe, expect, it } from 'vitest'
import type { SeedModel } from '../../../scripts/manuals/schema'
import {
  categoryFor,
  categoryForModel,
  dominantCategory,
  kindFor,
  originFor,
  regionFor,
} from './derive'

function model(modelCode: string, titles: string[]): SeedModel {
  return {
    modelCode,
    name: modelCode,
    category: 'garage-door-openers',
    region: 'UNKNOWN',
    aliases: [],
    documents: titles.map((title) => ({
      kind: 'INSTALL_MANUAL' as const,
      title,
      sourceUrl: `https://example.com/${encodeURIComponent(title)}`,
      origin: 'UNKNOWN' as const,
      region: 'UNKNOWN' as const,
      rights: 'LINK_ONLY' as const,
      language: 'en',
      evidence: 'test fixture',
      altSources: [],
    })),
  }
}

describe('kindFor', () => {
  it('reads installation in all the forms a title writes it', () => {
    // The bug this exists for: a pattern anchored at both ends matched
    // the bare stem only, so "Installation" — which is how titles
    // actually spell it — fell through to the generic fallback.
    for (const title of [
      'Aluroll Classic and Compact Shutter Installation Manual',
      'Nice Robus Instructions for Installing the Operator',
      'Hörmann SupraMatic Fitting Instructions',
      'Alutech Roller Shutter Assembly and Mounting Manual',
    ]) {
      expect(kindFor(title), title).toBe('INSTALL_MANUAL')
    }
  })

  it('does not let an index page pass as the manual it lists', () => {
    // These are titled "... Installation Manuals Index", so the install
    // rule would claim them if it were tested first.
    expect(kindFor('ATA Australia Installation Manuals Index')).toBe('TECHNICAL_DOCUMENT')
    expect(kindFor('Gliderol User Manuals and Install Guides Index')).toBe('TECHNICAL_DOCUMENT')
  })

  it('prefers the narrower kind when a title carries two', () => {
    expect(kindFor('LiftMaster LA400 Quick Start Installation Guide')).toBe('QUICK_START')
    expect(kindFor('Elsema Remote Coding Instructions')).toBe('PROGRAMMING_GUIDE')
    expect(kindFor('BFT Cellula Wiring Diagram and Installation Notes')).toBe('WIRING_DIAGRAM')
  })

  it('falls back rather than guessing at an unreadable title', () => {
    expect(kindFor('Tau ARM200 Series')).toBe('TECHNICAL_DOCUMENT')
  })
})

describe('categoryFor', () => {
  it('says nothing when the text says nothing', () => {
    // Returning null rather than a default is what lets the caller reach
    // for the manufacturer's other models instead.
    expect(categoryFor('FAAC E024S Control Board Manual')).toBeNull()
  })

  it('places the obvious cases', () => {
    expect(categoryFor('Nice M-Bar Road Barrier Manual')).toBe('gate-motors')
    expect(categoryFor('Somfy Oximo Tubular Motor Instructions')).toBe('roller-shutter-motors')
    expect(categoryFor('BEA LZR-Flatscan Safety Sensor Manual')).toBe('remotes-accessories')
    expect(categoryFor('Rytec Spiral High-Speed Door Manual')).toBe('industrial-high-speed-doors')
    expect(categoryFor('GEZE Slimdrive SL Automatic Sliding Door')).toBe('automatic-pedestrian-doors')
  })
})

describe('categoryForModel', () => {
  it('does not depend on the order the documents arrived in', () => {
    // Category is stored per model but derived from its documents, so
    // an order-sensitive answer means two documents under one model take
    // turns overwriting each other on every re-run.
    const titles = ['Sliding Gate Operator Manual', 'Control Board Manual']
    expect(categoryForModel('X', titles)).toBe(categoryForModel('X', [...titles].reverse()))
  })

  it('takes the model code into account, not just the titles', () => {
    expect(categoryForModel('Sliding Gate Kit', ['Manual'])).toBe('gate-motors')
  })
})

describe('dominantCategory', () => {
  it('answers with what the manufacturer mostly makes', () => {
    const models = [
      model('746', ['FAAC 746 Sliding Gate Operator Manual']),
      model('390', ['FAAC 390 Swing Gate Operator Manual']),
      model('E024S', ['FAAC E024S Control Board Manual']),
    ]
    expect(dominantCategory(models)).toBe('gate-motors')
  })

  it('counts only models that named a category themselves', () => {
    // Otherwise an unlabelled model's fallback becomes the evidence for
    // the next unlabelled model, and one bad guess spreads.
    const models = [model('E024S', ['Control Board Manual']), model('E145', ['Control Board Manual'])]
    expect(dominantCategory(models)).toBeNull()
  })
})

describe('regionFor', () => {
  it('reads the country domain', () => {
    expect(regionFor('www.steel-line.com.au', undefined)).toBe('AU')
    expect(regionFor('www.garador.co.nz', undefined)).toBe('NZ')
    expect(regionFor('www.aluroll.co.uk', undefined)).toBe('UK')
    expect(regionFor('www.ballan.it', undefined)).toBe('EU')
  })

  it('falls back to the manufacturer when a .com says nothing', () => {
    expect(regionFor('manualslib.com', 'AU')).toBe('AU')
    expect(regionFor('manualslib.com', undefined)).toBe('UNKNOWN')
  })
})

describe('originFor', () => {
  it('claims manufacturer origin only for the manufacturer’s own host', () => {
    expect(originFor('www.niceforyou.com', 'https://www.niceforyou.com/')).toBe(
      'MANUFACTURER_ORIGINAL',
    )
    expect(originFor('support.niceforyou.com', 'https://www.niceforyou.com/')).toBe(
      'MANUFACTURER_ORIGINAL',
    )
  })

  it('treats aggregators and installers as third party', () => {
    // The expensive direction to get wrong: an aggregator copy labelled
    // MANUFACTURER_ORIGINAL is an unverified document wearing an
    // official badge, which is the one thing this catalogue must not do.
    expect(originFor('www.manualslib.com', 'https://www.niceforyou.com/')).toBe('THIRD_PARTY_GUIDE')
    expect(originFor('manuals.easygates.co.uk', 'https://www.bft-automation.com/')).toBe(
      'THIRD_PARTY_GUIDE',
    )
  })

  it('does not guess when the manufacturer has no website on file', () => {
    expect(originFor('www.manualslib.com', null)).toBe('THIRD_PARTY_GUIDE')
    expect(originFor('www.manualslib.com', undefined)).toBe('THIRD_PARTY_GUIDE')
  })
})
