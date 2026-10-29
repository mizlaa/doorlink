import { describe, expect, it } from 'vitest'
import { readBookingForm, timingLabel } from './booking'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}

const good = {
  optionId: 'opt1',
  name: 'Sam Customer',
  phone: '0412 345 678',
  address: '12 Example Street',
  suburb: 'Parramatta',
  state: 'NSW',
  postcode: '2150',
  timing: 'two-weeks',
  notes: '',
}

describe('readBookingForm', () => {
  it('reads a complete booking', () => {
    expect(readBookingForm(form(good))).toEqual({
      ok: true,
      data: { ...good, notes: null },
    })
  })

  it('requires an option, a callable phone and a full site address', () => {
    expect(readBookingForm(form({ ...good, optionId: '' })).ok).toBe(false)
    expect(readBookingForm(form({ ...good, phone: '123' })).ok).toBe(false)
    expect(readBookingForm(form({ ...good, address: '' })).ok).toBe(false)
    expect(readBookingForm(form({ ...good, state: 'ZZ' })).ok).toBe(false)
    expect(readBookingForm(form({ ...good, postcode: '21500' })).ok).toBe(false)
    expect(readBookingForm(form({ ...good, timing: 'yesterday' })).ok).toBe(false)
  })

  it('labels timings in words', () => {
    expect(timingLabel('asap')).toBe('As soon as possible')
    expect(timingLabel('nope')).toBeNull()
  })
})
