import { formatAbn } from '@/lib/business-details'
import { formatQuantity, receiptNumberLabel } from '@/lib/invoices/money'
import { longDate, PAYMENT_METHOD_LABELS, type InvoiceSnapshot, type PaymentLine } from '@/lib/invoices/snapshot'

const money = (cents: number, currency: string) => new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)

/**
 * An invoice as the customer sees it, drawn from the frozen copy. The same
 * component is the preview before issuing, the page a customer opens, and
 * the sample on the logo screen; the PDF is laid out to match it.
 */
export function InvoiceDocument({
  snapshot,
  logoUrl,
  payments = [],
  voided = false,
  receiptHref,
}: {
  snapshot: InvoiceSnapshot
  logoUrl: string | null
  payments?: PaymentLine[]
  voided?: boolean
  receiptHref?: (payment: PaymentLine) => string | null
}) {
  const paid = payments.reduce((sum, p) => sum + p.amountCents, 0)
  const balance = Math.max(0, snapshot.totals.totalCents - paid)
  const c = snapshot.currency
  const issuer = snapshot.issuer
  const brand = issuer.brandColour
  return (
    <article className="relative overflow-hidden rounded-lg border border-line bg-white text-[#17212f] shadow-panel" aria-label={`${snapshot.title} ${snapshot.number}`}>
      {voided && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[22vw] font-black text-bad/10 sm:text-[9rem]" aria-hidden="true">
          VOID
        </p>
      )}
      <div className="p-5 sm:p-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the business's own logo, served by version
              <img src={logoUrl} alt={`${issuer.name} logo`} className="mb-3 max-h-16 max-w-[13rem] object-contain object-left" />
            ) : (
              <p className="mb-1 text-xl font-bold" style={{ color: brand }}>
                {issuer.name}
              </p>
            )}
            {logoUrl && <p className="text-sm font-semibold">{issuer.name}</p>}
            <ul className="mt-0.5 text-micro leading-relaxed text-[#64707f]">
              {issuer.abn && <li>ABN {formatAbn(issuer.abn)}</li>}
              {issuer.addressLine && <li>{issuer.addressLine}</li>}
              {(issuer.suburb || issuer.postcode) && <li>{[issuer.suburb, issuer.state, issuer.postcode].filter(Boolean).join(' ')}</li>}
              {issuer.phone && <li>{issuer.phone}</li>}
              {issuer.email && <li>{issuer.email}</li>}
            </ul>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-xl font-bold uppercase tracking-wide" style={{ color: brand }}>
              {snapshot.title}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm sm:justify-end">
              <dt className="text-[#64707f]">Invoice number</dt>
              <dd className="font-semibold sm:text-right">{snapshot.number}</dd>
              <dt className="text-[#64707f]">Invoice date</dt>
              <dd className="font-semibold sm:text-right">{longDate(snapshot.issueDate)}</dd>
              {snapshot.dueDate && (
                <>
                  <dt className="text-[#64707f]">Due date</dt>
                  <dd className="font-semibold sm:text-right">{longDate(snapshot.dueDate)}</dd>
                </>
              )}
            </dl>
          </div>
        </header>

        <div className="mt-6 grid gap-4 border-t border-[#dce4ec] pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-micro font-semibold uppercase tracking-wide text-[#64707f]">Bill to</p>
            <p className="mt-1 font-semibold">{snapshot.customer.name}</p>
            {snapshot.customer.email && <p className="text-[#64707f]">{snapshot.customer.email}</p>}
            {snapshot.customer.phone && <p className="text-[#64707f]">{snapshot.customer.phone}</p>}
          </div>
          {snapshot.property && (
            <div>
              <p className="text-micro font-semibold uppercase tracking-wide text-[#64707f]">Site address</p>
              <p className="mt-1">{snapshot.property.addressLine}</p>
              <p className="text-[#64707f]">
                {snapshot.property.suburb} {snapshot.property.state} {snapshot.property.postcode}
              </p>
              {snapshot.jobReference && <p className="text-[#64707f]">Job {snapshot.jobReference}</p>}
            </div>
          )}
        </div>

        <div className="mt-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-micro font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: brand }}>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Qty</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Unit price</th>
                {snapshot.gstRegistered && <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">GST</th>}
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.lines.map((line, i) => (
                <tr key={i} className={i % 2 ? 'bg-[#f7f9fb]' : undefined}>
                  <td className="px-3 py-2.5 align-top">
                    {line.description}
                    {/* On a phone the quantity, rate and GST sit under the description. */}
                    <span className="mt-0.5 block text-micro tabular-nums text-[#64707f] sm:hidden">
                      {formatQuantity(line.quantityX100)} × {money(line.unitPriceCents, c)}
                      {snapshot.gstRegistered ? ` · ${line.gstApplicable ? 'GST 10%' : 'GST-free'}` : ''}
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-right align-top tabular-nums sm:table-cell">{formatQuantity(line.quantityX100)}</td>
                  <td className="hidden px-2 py-2.5 text-right align-top tabular-nums sm:table-cell">{money(line.unitPriceCents, c)}</td>
                  {snapshot.gstRegistered && <td className="hidden px-2 py-2.5 text-right align-top text-micro text-[#64707f] sm:table-cell">{line.gstApplicable ? '10%' : 'Free'}</td>}
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">{money(line.amountCents, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-6 border-t border-[#dce4ec] pt-4 sm:flex-row sm:justify-between">
          <div className="min-w-0 max-w-sm text-sm text-[#64707f]">
            <p>
              {snapshot.gstRegistered
                ? snapshot.pricesIncludeGst
                  ? `Prices include GST. The total price includes GST of ${money(snapshot.totals.gstCents, c)}.`
                  : 'Prices are shown before GST; GST is added to the total.'
                : 'No GST has been charged.'}
            </p>
            <p className="mt-3 text-micro font-semibold uppercase tracking-wide">Terms</p>
            <p className="text-[#17212f]">{snapshot.terms}</p>
            {snapshot.notes && (
              <>
                <p className="mt-3 text-micro font-semibold uppercase tracking-wide">Notes</p>
                <p className="whitespace-pre-wrap text-[#17212f]">{snapshot.notes}</p>
              </>
            )}
            {snapshot.footer && (
              <>
                <p className="mt-3 text-micro font-semibold uppercase tracking-wide">How to pay</p>
                <p className="whitespace-pre-wrap text-[#17212f]">{snapshot.footer}</p>
              </>
            )}
          </div>
          <dl className="w-full shrink-0 text-sm sm:w-72">
            {snapshot.gstRegistered && (
              <>
                <div className="flex justify-between py-1">
                  <dt className="text-[#64707f]">Subtotal (before GST)</dt>
                  <dd className="tabular-nums">{money(snapshot.totals.subtotalExGstCents, c)}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-[#64707f]">GST (10%)</dt>
                  <dd className="tabular-nums">{money(snapshot.totals.gstCents, c)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-[#dce4ec] py-2 text-base font-bold">
              <dt>{snapshot.gstRegistered ? 'Total including GST' : 'Total'}</dt>
              <dd className="tabular-nums">{money(snapshot.totals.totalCents, c)}</dd>
            </div>
            {payments.map((payment, i) => {
              const href = receiptHref?.(payment) ?? null
              return (
                <div key={i} className="flex justify-between gap-3 py-1 text-micro text-[#64707f]">
                  <dt>
                    Paid {longDate(payment.date)} · {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    {href && (
                      <>
                        {' · '}
                        <a href={href} className="font-medium text-signal hover:text-signal-hover">
                          Receipt {receiptNumberLabel(payment.receiptNumber)}
                        </a>
                      </>
                    )}
                  </dt>
                  <dd className="tabular-nums">-{money(payment.amountCents, c)}</dd>
                </div>
              )
            })}
            <div className={`mt-2 flex items-center justify-between rounded-md px-3 py-2.5 ${balance === 0 ? 'bg-good/10' : 'bg-signal-tint'}`}>
              <dt className="font-bold">{balance === 0 ? 'Paid in full' : 'Balance due'}</dt>
              <dd className="text-lg font-bold tabular-nums" style={{ color: balance === 0 ? '#2E7D46' : brand }}>
                {money(balance, c)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  )
}
