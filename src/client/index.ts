/** Browser entry: a read-only view over DSH's native Session lineage. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { BranchesView, type BranchesViewInjected } from './BranchesView.tsx'
import { en, NS, zh, type SessionTreeLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Native Session lineage navigation. */
    sessionTree: SessionTreeLocaleKey
  }
}

/** Required client services; slot declaration order is handled by slots.inject. */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Register one session-scoped conversation view. DSH Chat owns branch
 * creation; this plugin only projects and navigates the resulting lineage.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-tree: dictionaries')
  const t = ctx.locale.bind(NS)

  const actions = (): BranchesViewInjected => ({
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
  })

  ctx.slots.inject(
    'conversation.view',
    () => ctx.slots.register({
      name: 'conversation.view',
      id: 'dsh-session-tree',
      order: 20,
      locale: NS,
      label: () => t('view.label'),
      inject: actions,
    }, BranchesView),
  )
}
