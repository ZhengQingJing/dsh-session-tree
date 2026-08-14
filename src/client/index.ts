/** Browser entry: an additive Branches view over DSH's native fork lineage. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { BranchesView, type BranchesViewInjected } from './BranchesView.tsx'
import { en, NS, zh, type SessionTreeLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Conversation lineage and completed-turn branch controls. */
    sessionTree: SessionTreeLocaleKey
  }
}

/** Required client services; slot declaration order is handled by slots.inject. */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Register one session-scoped conversation view. The plugin deliberately
 * contributes no SessionEvent type and no Host storage: uninstalling it leaves
 * every native DSH session readable and resumable.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-tree: dictionaries')
  const t = ctx.locale.bind(NS)

  const actions = (sourceSessionId: SessionId): BranchesViewInjected => ({
    openSession(sessionId) {
      try {
        const address = ctx.sessions.subagentAddress(sessionId)
        if (address === undefined) ctx.sessions.open(sessionId)
        else ctx.sessions.openSubagent(address)
        return true
      } catch {
        return false
      }
    },
    async forkAt(seq) {
      // Do not request title mutation: the current public runtime may publish
      // the child and then throw if the follow-up rename fails. Keeping fork
      // to one Host operation narrows (but does not remove) partial success.
      const childId = await ctx.sessions.fork({
        sessionId: sourceSessionId,
        atSeq: seq,
        increaseTitle: false,
      })
      ctx.sessions.open(childId)
      return childId
    },
    async loadOlder() {
      const session = ctx.sessions.binding(sourceSessionId)?.session
      if (session === undefined) throw new Error(`dsh-session-tree: session "${sourceSessionId}" is unavailable`)
      const before = session.getSnapshot().chat.timeline.turnOrder.length
      await session.loadOlder()
      return session.getSnapshot().chat.timeline.turnOrder.length > before
    },
  })

  ctx.slots.inject(
    'conversation.view',
    () => ctx.slots.register({
      name: 'conversation.view',
      id: 'branches',
      order: 20,
      locale: NS,
      label: () => t('view.label'),
      inject: actions,
    }, BranchesView),
  )
}
