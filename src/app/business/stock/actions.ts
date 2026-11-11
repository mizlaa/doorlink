'use server'

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { businessAction } from '@/lib/business/guard'
import { parseDollars, parseQuantity } from '@/lib/invoices/money'
import { lowStockAlerts } from '@/lib/invoices/service'
import { prisma } from '@/lib/prisma'

export type StockState = { error?: string; ok?: boolean; message?: string }
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
/** A quantity in hundredths; zero allowed where it makes sense (a count, an empty shelf). */
const quantity = (value: string, options: { allowZero?: boolean } = {}) => (options.allowZero && /^0+(\.0+)?$/.test(value.trim()) ? 0 : parseQuantity(value))

export async function addStockItemAction(_prev: StockState, form: FormData): Promise<StockState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const name = text(form, 'name')
  if (name.length < 2 || name.length > 120) return { error: 'Enter the item name.' }
  const onHand = quantity(text(form, 'onHand') || '0', { allowZero: true })
  const reorder = quantity(text(form, 'reorder') || '0', { allowZero: true })
  if (onHand === null || reorder === null) return { error: 'Quantities are numbers, like 4 or 2.5.' }
  const sell = text(form, 'sell') ? parseDollars(text(form, 'sell')) : null
  if (text(form, 'sell') && sell === null) return { error: 'Enter the sell price in dollars, or leave it blank.' }
  const item = await prisma.stockItem.create({
    data: {
      businessId: gate.business.businessId,
      name,
      sku: text(form, 'sku').slice(0, 40) || null,
      unit: text(form, 'unit').slice(0, 16) || 'each',
      onHandX100: onHand,
      reorderX100: reorder,
      sellPriceCents: sell,
      movements: onHand ? { create: { deltaX100: onHand, reason: 'COUNT', note: 'Opening stock', createdById: gate.session.userId } } : undefined,
    },
  })
  await audit({ actorId: gate.session.userId, action: 'stock.item.create', entityType: 'StockItem', entityId: item.id })
  await lowStockAlerts(gate.business)
  revalidatePath('/business/stock')
  return { ok: true, message: `Added ${name}.` }
}

/** Received, used or counted. A count sets the level; the others move it. */
export async function adjustStockAction(_prev: StockState, form: FormData): Promise<StockState> {
  const gate = await businessAction('TECHNICIAN')
  if (!gate.ok) return { error: gate.error }
  const id = text(form, 'id')
  const kind = text(form, 'kind')
  if (!['RECEIVED', 'USED', 'COUNT'].includes(kind)) return { error: 'Choose received, used or counted.' }
  const amount = quantity(text(form, 'quantity'), { allowZero: kind === 'COUNT' })
  if (amount === null) return { error: 'Enter a quantity.' }
  const done = await prisma.$transaction(async (tx) => {
    // Lock the row so two people adjusting at once both count.
    const rows = await tx.$queryRaw<Array<{ onHandX100: number }>>`SELECT "onHandX100" FROM "StockItem" WHERE id = ${id} AND "businessId" = ${gate.business.businessId} AND "archivedAt" IS NULL FOR UPDATE`
    if (rows.length === 0) return false
    const delta = kind === 'COUNT' ? amount - rows[0].onHandX100 : kind === 'USED' ? -amount : amount
    await tx.stockItem.update({ where: { id }, data: { onHandX100: { increment: delta } } })
    await tx.stockMovement.create({ data: { itemId: id, deltaX100: delta, reason: kind, note: text(form, 'note').slice(0, 200) || null, createdById: gate.session.userId } })
    return true
  })
  if (!done) return { error: 'That item isn’t in your stock.' }
  await lowStockAlerts(gate.business)
  revalidatePath('/business/stock')
  return { ok: true }
}

export async function updateStockItemAction(_prev: StockState, form: FormData): Promise<StockState> {
  const gate = await businessAction('MANAGER')
  if (!gate.ok) return { error: gate.error }
  const reorder = quantity(text(form, 'reorder') || '0', { allowZero: true })
  if (reorder === null) return { error: 'The reorder level is a number.' }
  const archive = text(form, 'archive') === '1'
  const updated = await prisma.stockItem.updateMany({ where: { id: text(form, 'id'), businessId: gate.business.businessId }, data: archive ? { archivedAt: new Date() } : { reorderX100: reorder } })
  if (updated.count === 0) return { error: 'That item isn’t in your stock.' }
  await lowStockAlerts(gate.business)
  revalidatePath('/business/stock')
  return { ok: true }
}
