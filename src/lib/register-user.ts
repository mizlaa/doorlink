import { OrgMemberRole, OrgType, Role } from '@prisma/client'
import { prisma } from './prisma'

/** Creates a Doorlink account row and related profile/org records. */
export async function registerDoorlinkUser(input: {
  name: string
  email: string
  role: Role
  organizationName?: string
}) {
  const { name, email, role, organizationName } = input

  const user = await prisma.user.create({ data: { name, email, role } })

  if (role === Role.TECHNICIAN) {
    await prisma.technicianProfile.create({ data: { userId: user.id } })
  }

  if ((role === Role.SUPPLIER || role === Role.MANUFACTURER) && organizationName) {
    const org = await prisma.organization.create({
      data: {
        name: organizationName,
        type: role === Role.SUPPLIER ? OrgType.SUPPLIER : OrgType.MANUFACTURER,
      },
    })
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: OrgMemberRole.OWNER },
    })
    if (role === Role.SUPPLIER) {
      await prisma.supplierProfile.create({ data: { organizationId: org.id } })
    }
  }

  return user
}
