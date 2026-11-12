import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { australianMobile, verifyTwilioSignature } from './sms'

describe('sms', () => {
  it('normalises Australian mobiles and refuses anything else', () => {
    expect(australianMobile('0412 345 678')).toBe('+61412345678')
    expect(australianMobile('+61 412 345 678')).toBe('+61412345678')
    expect(australianMobile('61412345678')).toBe('+61412345678')
    expect(australianMobile('02 9876 5432')).toBeNull()
    expect(australianMobile('')).toBeNull()
  })

  it('checks Twilio signatures over the URL and sorted fields', () => {
    const url = 'https://doorlink.example/api/webhooks/twilio'
    const params = { MessageStatus: 'delivered', MessageSid: 'SM123', AccountSid: 'AC1' }
    const data = url + 'AccountSid' + 'AC1' + 'MessageSid' + 'SM123' + 'MessageStatus' + 'delivered'
    const good = createHmac('sha1', 'token').update(data).digest('base64')
    expect(verifyTwilioSignature(url, params, good, 'token')).toBe(true)
    expect(verifyTwilioSignature(url, { ...params, MessageStatus: 'failed' }, good, 'token')).toBe(false)
    expect(verifyTwilioSignature(url, params, good, 'other-token')).toBe(false)
    expect(verifyTwilioSignature(url, params, null, 'token')).toBe(false)
  })
})
