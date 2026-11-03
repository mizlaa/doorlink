import { matchRules, withExtras, type QuoteLine, type QuoteRequest } from '@/lib/pricing/engine'
import { requestFromSpec, productLabel } from '@/lib/pricing/products'
import { accessoriesFor, accessoryLabel } from '@/lib/pricing/accessories'
import { readBookingForm, timingLabel } from '@/lib/pricing/booking'
import { splitDeposit } from '@/lib/business/deposit'
import { parseSpec, type DoorSpec } from '@/lib/configurator/options'
import { formatMoney } from '@/lib/money'
import { COMPANIES, companyById, type Company } from './data'
import {
  companyUserId,
  getDemo,
  makeId,
  makeReference,
  notify,
  update,
  type AutomatedQuote,
  type Job,
  type JobStatus,
  type QuoteOption,
} from './store'

/**
 * The marketplace's demo engine. Prices come from the real pricing engine
 * (matchRules) applied to each demo company's rules, exactly as the server
 * does it; only storage and messaging are local. No money moves: every
 * payment step records a simulated payment and says so.
 */

export const DEMO_PAYMENT_NOTE = 'Demo: payment simulated, nothing was charged'

function travelFeeFor(company: Company, postcode: string): number | null {
  const value = Number(postcode)
  let best: number | null = null
  for (const area of company.coverage) {
    if (value >= Number(area.from) && value <= Number(area.to)) {
      best = best === null ? area.travelFeeCents : Math.min(best, area.travelFeeCents)
    }
  }
  return best
}

function extrasFor(company: Company, wanted: string[], travelFeeCents: number) {
  const lines: QuoteLine[] = []
  const unpriced: string[] = []
  for (const id of wanted) {
    const priced = company.accessories.find((a) => a.accessory === id)
    if (priced) lines.push({ kind: 'accessory', label: accessoryLabel(id), amountCents: priced.priceCents, gst: priced.gst })
    else unpriced.push(id)
  }
  if (travelFeeCents > 0) lines.push({ kind: 'travel', label: 'Travel', amountCents: travelFeeCents, gst: 'INCLUSIVE' })
  return { lines, unpriced }
}

export interface CompareInput {
  spec: DoorSpec
  postcode: string
  suburb: string | null
  brand: string | null
  installRequired: boolean
  accessories: string[]
}

/** "Compare free quotes": every approved company serving the postcode, priced from its own rules. */
export function compareQuotes(input: CompareInput): string {
  const state = getDemo()
  const session = state.session!
  const request: QuoteRequest = requestFromSpec(input.spec, { brand: input.brand, installRequired: input.installRequired })
  const wanted = input.accessories.filter((id) =>
    accessoriesFor(request.product, request.motorRequired).some((a) => a.id === id)
  )
  const reference = makeReference('CMP', 8)
  const quotes: AutomatedQuote[] = []
  const unavailable: Array<{ companyId: string; name: string; reason: 'not-offered' | 'size' | 'configuration' }> = []

  for (const company of COMPANIES) {
    if (state.businessStatus[company.id] !== 'APPROVED') continue
    if (!company.products.includes(request.product)) continue
    const travel = travelFeeFor(company, input.postcode)
    if (travel === null) continue
    const result = matchRules(request, state.rules[company.id] ?? [])
    if (!result.available) {
      unavailable.push({ companyId: company.id, name: company.name, reason: result.reason })
      continue
    }
    const extras = extrasFor(company, wanted, travel)
    const options: QuoteOption[] = result.options
      .map((option) => withExtras(option, extras.lines))
      .sort((a, b) => a.totalIncGstCents - b.totalIncGstCents)
      .map((option) => ({
        id: makeId('opt'),
        ruleId: option.ruleId,
        productBrand: [option.productBrand, option.productModel].filter(Boolean).join(' ') || null,
        motorIncluded: option.motorIncluded,
        motorBrand: option.motorBrand,
        installation: option.installation,
        gst: option.gst,
        priceCents: option.priceCents,
        installPriceCents: option.installPriceCents,
        subtotalExGstCents: option.subtotalExGstCents,
        gstCents: option.gstCents,
        totalIncGstCents: option.totalIncGstCents,
        currency: option.currency,
        note: option.note,
        priceType: option.priceType,
        lines: option.lines,
        unpricedAccessories: extras.unpriced,
      }))
    quotes.push({
      reference: makeReference('QTE', 8),
      comparisonRef: reference,
      customerId: session.userId,
      companyId: company.id,
      businessName: company.name,
      product: request.product,
      productStyle: request.productStyle,
      spec: input.spec,
      widthMm: request.widthMm,
      heightMm: request.heightMm,
      requestedBrand: request.brand,
      motorRequired: request.motorRequired,
      installRequired: request.installRequired,
      postcode: input.postcode,
      accessories: wanted,
      warranty: `${company.warrantyYears} years on parts and installation`,
      leadTimeDays: company.leadTimeDays,
      status: 'ISSUED',
      options,
      acceptedOptionId: null,
      jobId: null,
      customMessage: null,
      booking: null,
      createdAt: new Date().toISOString(),
    })
  }

  update((s) => {
    s.quotes.unshift(...quotes)
    s.comparisons.unshift({
      reference,
      customerId: session.userId,
      product: request.product,
      spec: input.spec,
      widthMm: request.widthMm,
      heightMm: request.heightMm,
      postcode: input.postcode,
      suburb: input.suburb,
      requestedBrand: request.brand,
      motorRequired: request.motorRequired,
      installRequired: request.installRequired,
      accessories: wanted,
      unavailable,
      quoteRefs: quotes.map((q) => q.reference),
      createdAt: new Date().toISOString(),
    })
  })
  for (const quote of quotes) {
    const owner = companyUserId(quote.companyId)
    if (owner) {
      notify(
        owner,
        `New quote request: ${productLabel(request.product)} ${request.widthMm} × ${request.heightMm} mm`,
        `${session.name.split(' ')[0]} in ${input.postcode} was quoted ${formatMoney(quote.options[0].totalIncGstCents)} inc GST from your prices.`,
        '/pricing/quotes'
      )
    }
  }
  return reference
}

export function requestCustomQuote(comparisonRef: string, companyId: string, message: string) {
  const state = getDemo()
  const comparison = state.comparisons.find((c) => c.reference === comparisonRef)
  const company = companyById(companyId)
  if (!comparison || !company) return
  const spec = parseSpec(comparison.spec)
  update((s) => {
    const reference = makeReference('QTE', 8)
    s.quotes.unshift({
      reference,
      comparisonRef,
      customerId: comparison.customerId,
      companyId,
      businessName: company.name,
      product: comparison.product,
      productStyle: null,
      spec,
      widthMm: comparison.widthMm,
      heightMm: comparison.heightMm,
      requestedBrand: comparison.requestedBrand,
      motorRequired: comparison.motorRequired,
      installRequired: comparison.installRequired,
      postcode: comparison.postcode,
      accessories: comparison.accessories,
      warranty: `${company.warrantyYears} years on parts and installation`,
      leadTimeDays: company.leadTimeDays,
      status: 'CUSTOM_REQUESTED',
      options: [],
      acceptedOptionId: null,
      jobId: null,
      customMessage: message || null,
      booking: null,
      createdAt: new Date().toISOString(),
    })
    const c = s.comparisons.find((x) => x.reference === comparisonRef)
    if (c) c.quoteRefs.push(reference)
  })
}

function event(job: Job, to: JobStatus, actorName: string, note: string | null) {
  job.events.push({ from: job.status, to, actorName, note, at: new Date().toISOString() })
  job.status = to
}

/** Customer books one option of a quote: the job starts as a request to the business. */
export function bookQuote(formData: FormData): { error?: string; jobId?: string } {
  const state = getDemo()
  const session = state.session
  if (!session || session.role !== 'CUSTOMER') return { error: 'Sign in with the customer account this quote was issued to.' }
  const reference = String(formData.get('reference') ?? '')
  const booking = readBookingForm(formData)
  if (!booking.ok) return { error: booking.error }
  const quote = state.quotes.find((q) => q.reference === reference && q.customerId === session.userId)
  if (!quote) return { error: 'Quote not found.' }
  if (quote.status !== 'ISSUED') return { error: 'This quote has already been booked.' }
  const option = quote.options.find((o) => o.id === booking.data.optionId)
  if (!option) return { error: 'Choose one of the options on this quote.' }
  const company = companyById(quote.companyId)!
  const b = booking.data
  const jobId = makeId('job')
  const job: Job = {
    id: jobId,
    reference: makeReference('JOB', 6),
    customerId: session.userId,
    customerName: b.name,
    customerEmail: session.email,
    companyId: company.id,
    description: `${quote.productStyle ? `${quote.productStyle[0].toUpperCase()}${quote.productStyle.slice(1)} ` : ''}${productLabel(quote.product).toLowerCase()} ${quote.widthMm} × ${quote.heightMm} mm, booked from automated quote ${quote.reference}.${b.notes ? `\n\nCustomer notes: ${b.notes}` : ''}`,
    status: 'REQUESTED',
    priceType: option.priceType,
    agreedPriceCents: option.totalIncGstCents,
    depositPercent: company.depositPercent,
    quoteRef: quote.reference,
    scheduledAt: null,
    businessNote: null,
    declinedReason: null,
    termsAcceptedAt: null,
    createdAt: new Date().toISOString(),
    events: [{ from: null, to: 'REQUESTED', actorName: session.name, note: `Booked from quote ${quote.reference}`, at: new Date().toISOString() }],
    payments: [],
    updates: [],
    review: null,
    site: `${b.address}, ${b.suburb} ${b.state} ${b.postcode}`,
    timing: timingLabel(b.timing) ?? b.timing,
  }
  update((s) => {
    s.jobs.unshift(job)
    const q = s.quotes.find((x) => x.reference === reference)!
    q.status = 'BOOKED'
    q.acceptedOptionId = option.id
    q.jobId = jobId
    q.booking = { name: b.name, phone: b.phone, address: b.address, suburb: b.suburb, state: b.state, postcode: b.postcode, timing: b.timing, notes: b.notes ?? '' }
  })
  const owner = companyUserId(company.id)
  if (owner) notify(owner, `New booking: ${job.reference}`, `${b.name} booked ${formatMoney(option.totalIncGstCents)} in ${b.suburb}. Confirm it from the job.`, `/jobs/${jobId}`)
  return { jobId }
}

function mutateJob(jobId: string, fn: (job: Job) => void) {
  update((s) => {
    const job = s.jobs.find((j) => j.id === jobId)
    if (job) fn(job)
  })
}

export function jobById(jobId: string): Job | undefined {
  return getDemo().jobs.find((j) => j.id === jobId)
}

/** The business confirms: a fixed price stands, an estimate gets its final price. */
export function confirmBooking(jobId: string, actorName: string, finalPriceCents: number | null, note: string | null) {
  mutateJob(jobId, (job) => {
    if (job.status !== 'REQUESTED') return
    const price = job.priceType === 'ESTIMATE' && finalPriceCents ? finalPriceCents : job.agreedPriceCents
    job.agreedPriceCents = price
    job.businessNote = note
    const { depositCents, balanceCents } = splitDeposit(price, job.depositPercent)
    job.payments =
      balanceCents > 0
        ? [
            { id: makeId('pay'), kind: 'DEPOSIT', grossCents: depositCents, status: 'PENDING', paidAt: null },
            { id: makeId('pay'), kind: 'BALANCE', grossCents: balanceCents, status: 'PENDING', paidAt: null },
          ]
        : [{ id: makeId('pay'), kind: 'FULL', grossCents: depositCents, status: 'PENDING', paidAt: null }]
    event(job, 'AWAITING_PAYMENT', actorName, `Confirmed at ${formatMoney(price)}${note ? `. ${note}` : ''}`)
  })
  const job = jobById(jobId)
  if (job) notify(job.customerId, 'Your chosen business accepted your job', `Final price ${formatMoney(job.agreedPriceCents)}. Review it and pay to lock in your booking.`, `/jobs/${jobId}`)
}

export function declineBooking(jobId: string, actorName: string, reason: string) {
  mutateJob(jobId, (job) => {
    if (job.status !== 'REQUESTED') return
    job.declinedReason = reason
    event(job, 'DECLINED', actorName, reason)
  })
  update((s) => {
    const job = s.jobs.find((j) => j.id === jobId)
    const quote = job && s.quotes.find((q) => q.reference === job.quoteRef)
    if (quote) {
      quote.status = 'ISSUED'
      quote.acceptedOptionId = null
      quote.jobId = null
    }
  })
}

/** Accept and pay: the payment is simulated and recorded as paid. Nothing is charged. */
export function acceptAndPay(jobId: string, actorName: string) {
  mutateJob(jobId, (job) => {
    if (job.status !== 'AWAITING_PAYMENT') return
    job.termsAcceptedAt = new Date().toISOString()
    const upfront = job.payments.find((p) => p.kind !== 'BALANCE')
    if (upfront) {
      upfront.status = 'PAID'
      upfront.paidAt = new Date().toISOString()
    }
    event(job, 'PAYMENT_CONFIRMED', actorName, `${upfront?.kind === 'DEPOSIT' ? 'Deposit' : 'Payment'} of ${formatMoney(upfront?.grossCents ?? 0)} — ${DEMO_PAYMENT_NOTE}.`)
  })
  const job = jobById(jobId)
  const owner = job && companyUserId(job.companyId)
  if (job && owner) notify(owner, `Payment received (demo): ${job.reference}`, `${DEMO_PAYMENT_NOTE}. Book a time with the customer.`, `/jobs/${jobId}`)
}

export function payBalance(jobId: string, actorName: string) {
  mutateJob(jobId, (job) => {
    const balance = job.payments.find((p) => p.kind === 'BALANCE')
    if (!balance || balance.status === 'PAID') return
    balance.status = 'PAID'
    balance.paidAt = new Date().toISOString()
    job.events.push({ from: job.status, to: job.status, actorName, note: `Balance of ${formatMoney(balance.grossCents)} — ${DEMO_PAYMENT_NOTE}.`, at: new Date().toISOString() })
  })
}

export function transition(jobId: string, to: JobStatus, actorName: string, options: { scheduledAt?: string | null; note?: string | null } = {}) {
  mutateJob(jobId, (job) => {
    if (to === 'SCHEDULED' && options.scheduledAt) job.scheduledAt = new Date(options.scheduledAt).toISOString()
    event(job, to, actorName, options.note ?? (to === 'SCHEDULED' && job.scheduledAt ? `Booked for ${new Date(job.scheduledAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}` : null))
  })
  const job = jobById(jobId)
  if (!job) return
  const company = companyById(job.companyId)
  if (to === 'SCHEDULED') notify(job.customerId, `${company?.name ?? 'Your business'} booked a time`, 'Open the job to see the date.', `/jobs/${jobId}`)
  if (to === 'BUSINESS_COMPLETED') notify(job.customerId, 'The work is finished', 'Confirm it’s done, then leave a review.', `/jobs/${jobId}`)
}

export function postUpdate(jobId: string, authorName: string, note: string, photos: string[]) {
  mutateJob(jobId, (job) => {
    job.updates.unshift({ id: makeId('upd'), authorName, note, photos, at: new Date().toISOString() })
  })
  const job = jobById(jobId)
  if (job) notify(job.customerId, 'New progress update', note.slice(0, 120) || 'Photos added to your job.', `/jobs/${jobId}`)
}

export function reviewJob(jobId: string, formData: FormData): { error?: string } {
  const rating = Number(formData.get('rating') ?? 0)
  if (!(rating >= 1 && rating <= 5)) return { error: 'Choose a star rating.' }
  const score = (key: string) => {
    const v = Number(formData.get(key) ?? 0)
    return v >= 1 && v <= 5 ? v : null
  }
  const recommendRaw = formData.get('recommend')
  mutateJob(jobId, (job) => {
    job.review = {
      rating,
      body: String(formData.get('body') ?? '').trim(),
      workmanship: score('workmanship'),
      communication: score('communication'),
      valueForMoney: score('valueForMoney'),
      punctuality: score('punctuality'),
      recommend: recommendRaw === 'yes' ? true : recommendRaw === 'no' ? false : null,
      reply: job.review?.reply ?? null,
      at: new Date().toISOString(),
    }
  })
  const job = jobById(jobId)
  const owner = job && companyUserId(job.companyId)
  if (job && owner) notify(owner, `New ${rating}-star review`, 'Reply from the job page. Replies show on your profile.', `/jobs/${jobId}#review`)
  return {}
}

export function replyToReview(jobId: string, reply: string) {
  mutateJob(jobId, (job) => {
    if (job.review) job.review.reply = reply
  })
}

/** Reads a photo from a form as a small preview. It stays in this browser and is never uploaded. */
export async function photosFrom(formData: FormData, key = 'photos'): Promise<string[]> {
  const files = formData.getAll(key).filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4)
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const img = new Image()
            img.onload = () => {
              const scale = Math.min(1, 480 / Math.max(img.width, img.height))
              const canvas = document.createElement('canvas')
              canvas.width = Math.round(img.width * scale)
              canvas.height = Math.round(img.height * scale)
              canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
              resolve(canvas.toDataURL('image/jpeg', 0.8))
            }
            img.onerror = () => resolve(String(reader.result))
            img.src = String(reader.result)
          }
          reader.readAsDataURL(file)
        })
    )
  )
}

export function companyActorName(companyId: string): string {
  return companyById(companyId)?.name ?? 'The business'
}
