import { companyById, type DemoAccount } from './data'
import { userIdFor, type Conversation, type DemoSession } from './store'

/**
 * Conversations are stored once. The person who started one sees it as
 * "me"; a business also sees threads addressed to it, with the sides
 * flipped, so a buyer's enquiry turns up in the seller's inbox.
 */
export interface ConversationView {
  conversation: Conversation
  /** True when the signed-in user is the business the thread was addressed to. */
  flipped: boolean
  counterpart: string
  unread: number
}

export function conversationsFor(
  conversations: Conversation[],
  session: DemoSession | null,
  accounts: DemoAccount[]
): ConversationView[] {
  if (!session) return []
  const companyName = session.companyId ? companyById(session.companyId)?.name : undefined
  const out: ConversationView[] = []
  for (const c of conversations) {
    if (c.ownerUserId === session.userId) {
      out.push({ conversation: c, flipped: false, counterpart: c.withName, unread: c.unread })
    } else if (companyName && c.withName === companyName) {
      const owner = accounts.find((a) => userIdFor(a) === c.ownerUserId)
      const lastFromOwner = c.messages.length > 0 && c.messages[c.messages.length - 1].from === 'me'
      out.push({ conversation: c, flipped: true, counterpart: owner?.name ?? 'A Doorlink customer', unread: lastFromOwner ? 1 : 0 })
    }
  }
  return out
}
