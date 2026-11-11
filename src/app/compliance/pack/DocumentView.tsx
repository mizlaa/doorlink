import type { Block, ProfileKey } from '@/lib/compliance/blocks'
import { BUSINESS_DETAIL_ROWS } from '@/lib/compliance/blocks'
import type { DocumentContent } from '@/lib/compliance/blocks'
import type { ComplianceDocument } from '@/lib/compliance/catalogue'
import { COMPLIANCE_DISCLAIMER } from '@/lib/compliance/catalogue'
import { legislationFor } from '@/lib/compliance/jurisdiction'

type ProfileLike = Partial<Record<ProfileKey, unknown>> & { logoDataUri?: string | null }

/**
 * A blank in a compliance document is not an error — most of these
 * tables are meant to be completed by hand on site. So an absent value
 * renders as an empty box to write in, never as "N/A" or a dash, both
 * of which read as a statement that there is nothing to record.
 */
function value(profile: ProfileLike, key: ProfileKey | null): string {
  if (!key) return ''
  const raw = profile[key]
  if (raw === null || raw === undefined) return ''
  if (raw instanceof Date) return raw.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })
  return String(raw)
}

export function DocumentView({
  meta,
  content,
  profile,
}: {
  meta: ComplianceDocument
  content: DocumentContent
  profile: ProfileLike
}) {
  const business = value(profile, 'businessName') || '[ Business name ]'
  const logo = profile.logoDataUri ?? null

  return (
    <article className="cp-doc">
      <header className="cp-head">
        <div className="cp-head-left">
          <p className="cp-brand">{business}</p>
          <p className="cp-brand-sub">Compliance &amp; Safety Documentation</p>
        </div>
        <div className="cp-head-right">
          <p className="cp-doc-title">{meta.title}</p>
          <p className="cp-doc-ref">
            Section {meta.sectionNumber} • {meta.code}
          </p>
        </div>
      </header>

      <div className="cp-title-band">
        <h1>{meta.title}</h1>
        <p>
          Section {meta.sectionNumber} • {meta.code}
        </p>
      </div>

      <div className="cp-identity">
        <div className="cp-logo">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${business} logo`} />
          ) : (
            <span className="cp-logo-empty">[ Insert company logo ]</span>
          )}
        </div>
        <dl className="cp-identity-fields">
          <div>
            <dt>Business name</dt>
            <dd>{value(profile, 'businessName')}</dd>
          </div>
          <div>
            <dt>ABN</dt>
            <dd>{value(profile, 'abn')}</dd>
          </div>
        </dl>
      </div>

      <p className="cp-intro">{content.intro}</p>

      {content.blocks.map((block, index) => (
        <BlockView key={index} block={block} profile={profile} code={meta.code} />
      ))}

      <p className="cp-disclaimer">{COMPLIANCE_DISCLAIMER}</p>

      <footer className="cp-foot">
        <span>{business} | Compliance &amp; Safety Documentation</span>
        <span>
          {meta.code} Version: {value(profile, 'packVersion') || '________'}
        </span>
      </footer>
    </article>
  )
}

function BlockView({ block, profile, code }: { block: Block; profile: ProfileLike; code: string }) {
  switch (block.kind) {
    case 'heading':
      return (
        <h2 className="cp-band">
          <span className="cp-band-no">{block.number}</span>
          <span>{block.title}</span>
        </h2>
      )

    case 'para':
      return <p className="cp-para">{block.text}</p>

    case 'bullets':
      return (
        <ul className="cp-bullets">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )

    case 'important':
      return (
        <div className="cp-important">
          <p className="cp-important-title">{block.title ?? 'Important'}</p>
          <p>{block.text}</p>
        </div>
      )

    case 'table':
      return (
        <table className="cp-table">
          <thead>
            <tr>
              {block.head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={cell ? undefined : 'cp-blank'}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )

    case 'blankRows':
      return (
        <table className="cp-table">
          <thead>
            <tr>
              {block.head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: block.count }, (_, i) => (
              <tr key={i}>
                {block.head.map((h) => (
                  <td key={h} className="cp-blank" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )

    case 'fields':
      return (
        <table className="cp-fields">
          <tbody>
            {block.rows.map((row) => {
              const filled = value(profile, row.value)
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={filled ? undefined : 'cp-blank'}>{filled}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )

    case 'businessDetails':
      return (
        <table className="cp-fields">
          <tbody>
            {BUSINESS_DETAIL_ROWS.map((row) => {
              const filled = value(profile, row.value)
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={filled ? undefined : 'cp-blank'}>{filled}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )

    case 'documentControl':
      return (
        <>
          <p className="cp-subhead">Document control</p>
          <table className="cp-fields cp-fields-split">
            <tbody>
              <tr>
                <th scope="row">Document number</th>
                <td>{code}</td>
                <th scope="row">Version</th>
                <td className={value(profile, 'packVersion') ? undefined : 'cp-blank'}>
                  {value(profile, 'packVersion')}
                </td>
              </tr>
              <tr>
                <th scope="row">Effective date</th>
                <td className="cp-blank" />
                <th scope="row">Review date</th>
                <td className="cp-blank" />
              </tr>
              <tr>
                <th scope="row">Prepared by</th>
                <td className={value(profile, 'preparedByName') ? undefined : 'cp-blank'}>
                  {value(profile, 'preparedByName')}
                </td>
                <th scope="row">Approved by</th>
                <td className={value(profile, 'approvedByName') ? undefined : 'cp-blank'}>
                  {value(profile, 'approvedByName')}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )

    case 'legislation': {
      const list = legislationFor(value(profile, 'state') || null)
      return (
        <>
          <p className="cp-para">
            {block.lead.replace(
              'including but not limited to:',
              list.state === 'Not set'
                ? 'including but not limited to:'
                : `Where the engagement is in ${list.state}, that includes but is not limited to:`
            )}
          </p>
          <ul className="cp-bullets">
            {list.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {/* The gap is printed, not hidden. A document that quietly
              dropped the state instruments would read as though the
              Commonwealth list were the whole of the law. */}
          {list.gap && (
            <div className="cp-important cp-important-gap">
              <p className="cp-important-title">Check your jurisdiction: incomplete</p>
              <p>{list.gap}</p>
            </div>
          )}
        </>
      )
    }

    case 'checkboxes':
      return (
        <>
          {block.lead && <p className="cp-para">{block.lead}</p>}
          <ul className="cp-checks">
            {block.items.map((item) => (
              <li key={item}>
                <span className="cp-check-box" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )

    case 'signature':
      return (
        <div className="cp-signatures">
          {block.parties.map((party) => (
            <div key={party} className="cp-signature">
              <p className="cp-signature-party">{party}</p>
              {['Name', 'Position', 'Signature', 'Date'].map((label) => (
                <div key={label} className="cp-signature-line">
                  <span>{label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )
  }
}
