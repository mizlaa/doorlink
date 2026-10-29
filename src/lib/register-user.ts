import { OrgMemberRole, OrgType, Role } from '@prisma/client'
import { prisma } from './prisma'
import { readBusinessDetails, type BusinessDetailsInput } from './business-details'

/** Roles that sign up as a business and give business details. */
export function roleIsBusiness(role: string): boolean {
  return role === 'TECHNICIAN' || role === 'SUPPLIER'
}

/**
 * The business half of a sign-up form: required for installers and
 * suppliers, ignored for everyone else. Validated before any account is
 * created, so a bad ABN never leaves a half-made account behind.
 */
export function readSignUpBusiness(
  role: string,
  formData: FormData
): { ok: true; business: BusinessDetailsInput | undefined } | { ok: false; error: string } {
  if (!roleIsBusiness(role)) return { ok: true, business: undefined }
  const result = readBusinessDetails(formData)
  return result.ok ? { ok: true, business: result.data } : result
}

/**
 * Creates a Doorlink account row and related profile/org records, all or
 * nothing. Business details land where the rest of the app reads them:
 * an installer's trade profile, or a supplier's organisation.
 */
export async function registerDoorlinkUser(input: {
  name: string
  email: string
  role: Role
  organizationName?: string
  business?: BusinessDetailsInput
}) {
  const { name, email, role, business } = input
  const organizationName = role === Role.SUPPLIER && business ? business.businessName : input.organizationName

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, role, phone: business?.phone ?? null } })

    if (role === Role.TECHNICIAN) {
      await tx.technicianProfile.create({
        data: {
          userId: user.id,
          ...(business && {
            businessName: business.businessName,
            businessPhone: business.phone,
            businessEmail: business.email,
            abn: business.abn,
            baseSuburb: business.suburb,
            baseState: business.state,
            basePostcode: business.postcode,
          }),
        },
      })
    }

    if ((role === Role.SUPPLIER || role === Role.MANUFACTURER) && organizationName) {
      const org = await tx.organization.create({
        data: {
          name: organizationName,
          type: role === Role.SUPPLIER ? OrgType.SUPPLIER : OrgType.MANUFACTURER,
          ...(business && {
            abn: business.abn,
            phone: business.phone,
            email: business.email,
            suburb: business.suburb,
            state: business.state,
            postcode: business.postcode,
          }),
        },
      })
      await tx.organizationMember.create({
        data: { organizationId: org.id, userId: user.id, role: OrgMemberRole.OWNER },
      })
      if (role === Role.SUPPLIER) {
        await tx.supplierProfile.create({ data: { organizationId: org.id } })
      }
    }

    return user
  })
}
