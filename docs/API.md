# Integrations: what Doorlink supports today

The brief asked for a comparison with the garagedoorspro.app API. That
site could not be reached from the environment this work was done in (its
host is outside the allowed network), so this is a statement of what
Doorlink itself offers, not a feature-by-feature comparison.

## Available now

| Capability | How |
| --- | --- |
| Receive card payments for invoices | Stripe Checkout on the company's own Connect account; confirmed only by the signed `/api/webhooks/stripe-connect` event |
| Email delivery status | Resend webhook at `/api/webhooks/resend` (signed, Svix) |
| Invoice and receipt PDFs | `/api/invoices/{id}/pdf`, `/api/invoices/{id}/receipts/{paymentId}`, for the issuing business, the invoiced customer and admins; 404 for anyone else |
| Share an invoice without an account | `/i/{token}` and `/i/{token}/pdf`: signed, expiring, revocable links (only a hash is stored) |
| Company logos | `/api/logo/{versionId}` (immutable versions) |
| Scheduled work | `/api/cron/reminders`, `/api/cron/jobs` (bearer secret) |

## Not available yet

- A public REST API for other software to read or write jobs, customers,
  appointments or invoices. The database has an `ApiKey` table ready for
  it, but no endpoints are exposed, deliberately: nothing was built that
  hasn't been tested and permission-checked.
- Accounting sync (Xero, MYOB, QuickBooks), calendar sync (Google/Outlook),
  SMS reminders.

If an API is wanted next, the natural first endpoints are read-only
`GET /api/v1/jobs`, `/appointments` and `/invoices`, scoped to the key's
company, rate limited with the existing `api` limit, and audited.
