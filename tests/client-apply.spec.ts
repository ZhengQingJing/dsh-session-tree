import { describe, expect, it, vi } from 'vitest'
import type { SessionId, SubagentAddress } from '@deepseek-ai/dsh-client-runtime/client'
import { apply } from '../src/client/index.ts'
import type { BranchesViewInjected } from '../src/client/BranchesView.tsx'

function clientHarness(options: {
  readonly address?: SubagentAddress
  readonly openThrows?: boolean
} = {}) {
  const open = vi.fn(() => {
    if (options.openThrows === true) throw new Error('stale session')
  })
  const openSubagent = vi.fn()
  const subagentAddress = vi.fn(() => options.address)
  let actions: BranchesViewInjected | undefined

  const register = vi.fn((descriptor: { inject: () => BranchesViewInjected }) => {
    actions = descriptor.inject()
    return vi.fn()
  })
  const inject = vi.fn((_name: string, setup: () => unknown) => setup())
  const localeRegister = vi.fn(() => vi.fn())
  const ctx = {
    effect: (setup: () => unknown) => setup(),
    locale: {
      register: localeRegister,
      bind: () => vi.fn(() => ''),
    },
    sessions: { open, openSubagent, subagentAddress },
    slots: { inject, register },
  }

  apply(ctx as never)
  if (actions === undefined) throw new Error('conversation view actions were not registered')
  return {
    actions, inject, register, open, openSubagent, subagentAddress,
  }
}

describe('client apply', () => {
  it('registers a namespaced conversation view and opens ordinary Sessions', () => {
    const sessionId = 'ordinary' as SessionId
    const harness = clientHarness()

    expect(harness.inject).toHaveBeenCalledWith('conversation.view', expect.any(Function))
    expect(harness.register.mock.calls[0]?.[0]).toMatchObject({
      name: 'conversation.view',
      id: 'dsh-session-tree',
      order: 20,
    })
    expect(harness.actions.openSession(sessionId)).toBe(true)
    expect(harness.subagentAddress).toHaveBeenCalledWith(sessionId)
    expect(harness.open).toHaveBeenCalledWith(sessionId)
    expect(harness.openSubagent).not.toHaveBeenCalled()
  })

  it('uses the retained native address for an addressed subagent', () => {
    const sessionId = 'child' as SessionId
    const address: SubagentAddress = {
      parentSessionId: 'parent' as SessionId,
      childSessionId: sessionId,
      mode: 'continuable',
    }
    const harness = clientHarness({ address })

    expect(harness.actions.openSession(sessionId)).toBe(true)
    expect(harness.openSubagent).toHaveBeenCalledWith(address)
    expect(harness.open).not.toHaveBeenCalled()
  })

  it('folds a stale navigation exception into a local false result', () => {
    const sessionId = 'stale' as SessionId
    const harness = clientHarness({ openThrows: true })

    expect(harness.actions.openSession(sessionId)).toBe(false)
    expect(harness.open).toHaveBeenCalledWith(sessionId)
    expect(harness.openSubagent).not.toHaveBeenCalled()
  })
})
