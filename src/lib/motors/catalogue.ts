import { prisma } from '@/lib/prisma'
import { isDatabaseUnreachable } from '@/lib/db-errors'
import { SPEC, motorFromModel, type MotorCandidate } from './specs'

/**
 * Every catalogue model that declares what kind of operator it is, read
 * into a candidate the designer can match against.
 *
 * Small enough to send to the browser whole (tens of models, a handful of
 * numbers each), which keeps the shortlist instant as the customer drags
 * a size or switches material. An unreachable database gives an empty
 * list, so the designer still works and simply has no shortlist.
 */
export async function loadMotorCandidates(): Promise<MotorCandidate[]> {
  try {
    const models = await prisma.model.findMany({
      where: { specs: { some: { label: SPEC.operator } } },
      select: {
        id: true,
        slug: true,
        name: true,
        modelCode: true,
        manufacturer: { select: { name: true, slug: true } },
        specs: { select: { label: true, value: true, unit: true }, orderBy: { sortOrder: 'asc' } },
      },
    })
    return models.map(motorFromModel).filter((motor): motor is MotorCandidate => motor !== null)
  } catch (error) {
    if (isDatabaseUnreachable(error)) return []
    throw error
  }
}
