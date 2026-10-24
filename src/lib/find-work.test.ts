import { describe, expect, it } from 'vitest'
import { findWorkHref } from './find-work'

describe('findWorkHref', () => {
  it('sends visitors who are not signed in to registration', () => {
    expect(findWorkHref(null)).toBe('/register')
  })

  it('sends trade accounts to the job board', () => {
    expect(findWorkHref({ role: 'TECHNICIAN' })).toBe('/leads')
  })

  it('hides the link from customers, who would only be bounced home', () => {
    // /leads redirects anyone who cannot quote back to "/", so offering
    // it to a customer would look like a broken link.
    expect(findWorkHref({ role: 'CUSTOMER' })).toBeNull()
  })
})
