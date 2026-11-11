import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { businessCard, decodeBusinessKey } from '@/lib/pricing/business'
import { Button } from '@/components/ui/Button'
import { answerInviteAction } from '../team/actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Team invitations' }

export default async function JoinPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/business/join')
  const invites = await prisma.businessMember.findMany({ where: { userId: session.userId, status: 'INVITED' }, include: { business: { select: { businessKey: true } } } })
  const named = await Promise.all(
    invites.map(async (invite) => {
      const key = decodeBusinessKey(invite.business.businessKey)
      return { invite, name: (key && (await businessCard(key))?.name) || 'A business' }
    })
  )
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-graphite">Team invitations</h1>
      {named.length === 0 ? (
        <p className="mt-3 text-sm text-graphite-soft">No invitations waiting. When a business adds you to their team, it shows here.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {named.map(({ invite, name }) => (
            <li key={invite.id} className="rounded-lg border border-line bg-rail p-4">
              <p className="font-medium text-graphite">{name}</p>
              <p className="text-sm text-graphite-soft">Wants you as {invite.role === 'MANAGER' ? 'an office manager' : 'a technician'}.</p>
              <div className="mt-3 flex gap-2">
                <form action={answerInviteAction}>
                  <input type="hidden" name="id" value={invite.id} />
                  <input type="hidden" name="answer" value="accept" />
                  <Button type="submit">Join {name}</Button>
                </form>
                <form action={answerInviteAction}>
                  <input type="hidden" name="id" value={invite.id} />
                  <input type="hidden" name="answer" value="decline" />
                  <Button type="submit" variant="ghost">
                    No thanks
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
