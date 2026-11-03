import { useSyncExternalStore } from 'react'
import type { RuleTerms, QuoteLine, PricedProductId, UnavailableReason } from '@/lib/pricing/engine'
import type { DoorSpec } from '@/lib/configurator/options'
import {
  COMPANIES,
  DEMO_ACCOUNTS,
  SEED_LEADS,
  SEED_LISTINGS,
  SEED_REVIEWS,
  seedRules,
  type DemoAccount,
  type DemoReview,
  type SeedListing,
} from './data'

/**
 * The demo's whole "database", kept in this browser's localStorage. Every
 * write goes through `update`, every read through `useDemo`, and "Reset
 * demo" puts the seed back. Nothing is sent anywhere.
 */

export interface DemoSession {
  userId: string
  email: string
  name: string
  role: DemoAccount['appRole']
  demoRole: DemoAccount['role']
  companyId?: string
}

export interface QuoteOption {
  id: string
  ruleId: string
  productBrand: string | null
  motorIncluded: boolean
  motorBrand: string | null
  installation: 'INCLUDED' | 'SEPARATE' | 'NOT_INCLUDED'
  gst: 'INCLUSIVE' | 'EXCLUSIVE'
  priceCents: number
  installPriceCents: number | null
  subtotalExGstCents: number
  gstCents: number
  totalIncGstCents: number
  currency: string
  note: string | null
  priceType: 'FIXED' | 'ESTIMATE'
  lines: QuoteLine[]
  unpricedAccessories: string[]
}

export interface AutomatedQuote {
  reference: string
  comparisonRef: string | null
  customerId: string
  companyId: string
  businessName: string
  product: PricedProductId
  productStyle: string | null
  spec: DoorSpec
  widthMm: number
  heightMm: number
  requestedBrand: string | null
  motorRequired: boolean
  installRequired: boolean
  postcode: string
  accessories: string[]
  warranty: string
  leadTimeDays: number
  status: 'ISSUED' | 'BOOKED' | 'CUSTOM_REQUESTED' | 'DECLINED'
  options: QuoteOption[]
  acceptedOptionId: string | null
  jobId: string | null
  customMessage: string | null
  booking: null | {
    name: string
    phone: string
    address: string
    suburb: string
    state: string
    postcode: string
    timing: string
    notes: string
  }
  createdAt: string
}

export interface Comparison {
  reference: string
  customerId: string
  product: PricedProductId
  spec: DoorSpec
  widthMm: number
  heightMm: number
  postcode: string
  suburb: string | null
  requestedBrand: string | null
  motorRequired: boolean
  installRequired: boolean
  accessories: string[]
  unavailable: Array<{ companyId: string; name: string; reason: UnavailableReason }>
  quoteRefs: string[]
  createdAt: string
}

export type JobStatus =
  | 'REQUESTED'
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'BUSINESS_COMPLETED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DECLINED'
  | 'DISPUTED'

export interface JobEvent {
  from: JobStatus | null
  to: JobStatus
  actorName: string
  note: string | null
  at: string
}

export interface JobPayment {
  id: string
  kind: 'DEPOSIT' | 'BALANCE' | 'FULL'
  grossCents: number
  status: 'PENDING' | 'PAID'
  paidAt: string | null
}

export interface JobUpdate {
  id: string
  authorName: string
  note: string
  photos: string[]
  at: string
}

export interface JobReview {
  rating: number
  body: string
  workmanship: number | null
  communication: number | null
  valueForMoney: number | null
  punctuality: number | null
  recommend: boolean | null
  reply: string | null
  at: string
}

export interface Job {
  id: string
  reference: string
  customerId: string
  customerName: string
  customerEmail: string
  companyId: string
  description: string
  status: JobStatus
  priceType: 'FIXED' | 'ESTIMATE'
  agreedPriceCents: number
  depositPercent: number
  quoteRef: string | null
  scheduledAt: string | null
  businessNote: string | null
  declinedReason: string | null
  termsAcceptedAt: string | null
  createdAt: string
  events: JobEvent[]
  payments: JobPayment[]
  updates: JobUpdate[]
  review: JobReview | null
  site: string
  timing: string
}

export interface Lead {
  reference: string
  title: string
  description: string
  category: string
  urgency: 'STANDARD' | 'URGENT' | 'FLEXIBLE'
  budgetFromAUD: number | null
  budgetToAUD: number | null
  suburb: string
  state: string
  postcode: string
  contactName: string
  status: 'Open' | 'Quoted' | 'Scheduled' | 'Closed'
  customerId: string | null
  createdAt: string
  responses: Array<{
    companyId: string
    priceAUD: number
    message: string
    at: string
    durationMinutes?: number | null
    availableFrom?: string | null
  }>
  /** The business whose quote the customer accepted. */
  acceptedCompanyId?: string | null
}

export interface Listing extends SeedListing {
  ownCompanyId?: string
  /** Set on listings a visitor creates in the demo. */
  ownerUserId?: string
  sellerName?: string
  createdAt: string
  status: 'ACTIVE' | 'PAUSED'
}

export interface BusinessDetails {
  businessName: string
  phone: string
  email: string
  abn: string
}

export interface Conversation {
  id: string
  /** Who started it. Businesses also see threads addressed to their name. */
  ownerUserId?: string
  withName: string
  subject: string
  messages: Array<{ from: 'me' | 'them'; text: string; at: string }>
  unread: number
}

export interface Notification {
  id: string
  userId: string
  title: string
  body: string
  href: string
  at: string
  read: boolean
}

export interface SavedDesign {
  id: string
  name: string
  spec: DoorSpec
  createdAt: string
}

export interface DemoState {
  version: 3
  session: DemoSession | null
  accounts: DemoAccount[]
  rules: Record<string, RuleTerms[]>
  businessStatus: Record<string, 'APPROVED' | 'PENDING' | 'SUSPENDED'>
  comparisons: Comparison[]
  quotes: AutomatedQuote[]
  jobs: Job[]
  leads: Lead[]
  listings: Listing[]
  reviews: DemoReview[]
  hiddenReviews: string[]
  conversations: Conversation[]
  notifications: Notification[]
  savedDesigns: SavedDesign[]
  savedListings: string[]
  complianceProfile: Record<string, string>
  manualSubmissions: Array<{
    id: string
    brand: string
    model: string
    fileName: string
    at: string
    status?: 'PENDING' | 'APPROVED' | 'REJECTED'
    submittedBy?: string
  }>
  businessDetails: Record<string, BusinessDetails>
  tickets: Array<{ id: string; userId: string; subject: string; body: string; status: 'OPEN' | 'PENDING' | 'RESOLVED'; at: string }>
}

const KEY = 'doorlink-demo-state-v4'

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

export function userIdFor(account: Pick<DemoAccount, 'role' | 'email'>): string {
  return `user-${account.role}-${account.email.split('@')[0].replace(/[^a-z0-9]/gi, '')}`
}

function seedState(): DemoState {
  const customer = DEMO_ACCOUNTS.find((a) => a.role === 'customer')!
  return {
    version: 3,
    session: null,
    accounts: DEMO_ACCOUNTS,
    rules: seedRules(),
    businessStatus: Object.fromEntries(COMPANIES.map((c) => [c.id, 'APPROVED' as const])),
    comparisons: [],
    quotes: [],
    jobs: [],
    leads: SEED_LEADS.map((l) => ({
      reference: l.reference,
      title: l.title,
      description: l.description,
      category: l.category,
      urgency: l.urgency,
      budgetFromAUD: Math.round(l.budgetAUD * 0.8),
      budgetToAUD: l.budgetAUD,
      suburb: l.suburb,
      state: l.state,
      postcode: l.postcode,
      contactName: 'Demo customer',
      status: l.status,
      customerId: null,
      createdAt: daysAgo(l.daysAgo),
      responses:
        l.status === 'Open'
          ? []
          : [{ companyId: 'company_02', priceAUD: Math.round(l.budgetAUD * 0.95), message: 'Happy to take this on. Fixed price includes removal of the old unit.', at: daysAgo(l.daysAgo - 1) }],
    })),
    listings: SEED_LISTINGS.map((l, i) => ({ ...l, createdAt: daysAgo(3 + i), status: 'ACTIVE' as const })),
    reviews: SEED_REVIEWS,
    hiddenReviews: [],
    conversations: [
      {
        id: 'c1',
        ownerUserId: userIdFor(customer),
        withName: 'Westline Door Systems',
        subject: 'Measure and quote',
        unread: 1,
        messages: [
          { from: 'me', text: 'Hi, can you measure next week? Double garage, 4800 wide.', at: daysAgo(2) },
          { from: 'them', text: 'Yes, Tuesday or Thursday morning works. We’ll confirm the price on site.', at: daysAgo(1) },
        ],
      },
      {
        id: 'c2',
        ownerUserId: userIdFor(customer),
        withName: 'Bluegum Automation',
        subject: 'BG-600 SmartDrive stock',
        unread: 0,
        messages: [
          { from: 'me', text: 'Is the BG-600 in stock for pick-up?', at: daysAgo(5) },
          { from: 'them', text: 'Two in stock at Casula. Battery backup kits too.', at: daysAgo(5) },
        ],
      },
    ],
    notifications: [
      {
        id: 'n1',
        userId: userIdFor(customer),
        title: 'Welcome to the Doorlink demo',
        body: 'Design a door, compare free quotes and book. Payments are simulated.',
        href: '/configure',
        at: daysAgo(0),
        read: false,
      },
    ],
    savedDesigns: [],
    savedListings: [],
    complianceProfile: {},
    manualSubmissions: [
      {
        id: 'ms-seed-1',
        brand: 'Summit Entry',
        model: 'SE-RM700',
        fileName: 'SE-RM700-installation-guide.pdf',
        at: daysAgo(3),
        status: 'PENDING',
        submittedBy: 'Summit Roller & Gate Co',
      },
    ],
    tickets: [],
    businessDetails: Object.fromEntries(
      COMPANIES.map((c) => [
        c.id,
        {
          businessName: c.name,
          phone: c.phone,
          email: `hello@${c.name.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
          abn: c.abn,
        },
      ])
    ),
  }
}

function load(): DemoState {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState
      // Fields added after a visitor's first load fall back to the seed.
      if (parsed.version === 3) return { ...seedState(), ...parsed }
    }
  } catch {
    // Private mode or blocked storage: the demo still runs, it just forgets on reload.
  }
  return seedState()
}

let state: DemoState = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked; the in-memory state still works for this visit.
  }
}

export function getDemo(): DemoState {
  return state
}

export function update(mutator: (draft: DemoState) => void) {
  const draft = structuredClone(state)
  mutator(draft)
  state = draft
  persist()
  listeners.forEach((l) => l())
}

export function refreshDemo() {
  state = { ...state }
  listeners.forEach((l) => l())
}

export function resetDemo() {
  const session = state.session
  state = seedState()
  state.session = session
  persist()
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDemo<T>(selector: (s: DemoState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

export function useSession(): DemoSession | null {
  return useDemo((s) => s.session)
}

export function signInAs(account: DemoAccount) {
  update((s) => {
    s.session = {
      userId: userIdFor(account),
      email: account.email,
      name: account.name,
      role: account.appRole,
      demoRole: account.role,
      companyId: account.companyId,
    }
  })
}

export function signOut() {
  update((s) => {
    s.session = null
  })
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** "DL-CMP-7KQ2M9XA": the same shape as the real app's references. */
export function makeReference(prefix: string, length = 8): string {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return `DL-${prefix}-${out}`
}

export function makeId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function notify(userId: string, title: string, body: string, href: string) {
  update((s) => {
    s.notifications.unshift({ id: makeId('n'), userId, title, body, href, at: new Date().toISOString(), read: false })
  })
}

export function companyUserId(companyId: string): string | null {
  const account = state.accounts.find((a) => a.companyId === companyId)
  return account ? userIdFor(account) : null
}
