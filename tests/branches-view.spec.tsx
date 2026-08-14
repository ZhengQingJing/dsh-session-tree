// @vitest-environment jsdom

import {
  act, type ButtonHTMLAttributes, type ReactNode,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'
import type {
  ChatSnapshot, ConversationSnapshot, SessionId, SessionListState, SessionSummary, TurnLocation,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import {
  BranchesView, type BranchesViewProps,
} from '../src/client/BranchesView.tsx'
import { en, type SessionTreeLocaleKey } from '../src/client/locales.ts'

interface PrimitiveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon?: ReactNode
  readonly size?: string
  readonly variant?: string
}

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, icon, size: _size, variant: _variant, ...props }: PrimitiveButtonProps) => (
    <button {...props}>{icon}{children}</button>
  ),
  IconBranchOutline16: () => <span aria-hidden="true">branch-icon</span>,
  IconWarningOutline16: () => <span aria-hidden="true">warning-icon</span>,
  StateDot: ({ state }: { readonly state: string }) => <span data-state={state} />,
}))

const CURRENT = 'fork-current' as SessionId
const ROOT = 'root' as SessionId
const SIBLING = 'worker' as SessionId
const OUTSIDE = 'outside' as SessionId

const mountedRoots = new Set<Root>()

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots) root.unmount()
  })
  mountedRoots.clear()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function summary(
  id: SessionId,
  displayTitle: string,
  updatedAt: number,
  options: { readonly parentId?: SessionId; readonly origin?: 'subagent' } = {},
): SessionSummary {
  return {
    id,
    displayTitle,
    running: false,
    blank: false,
    updatedAt,
    ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  }
}

function sessionList(): SessionListState {
  const rows = [
    summary(ROOT, 'Root conversation', 10),
    summary(CURRENT, 'Current branch', 30, { parentId: ROOT }),
    summary(SIBLING, 'Worker child', 20, { parentId: ROOT, origin: 'subagent' }),
    summary(OUTSIDE, 'Other family', 40),
  ]
  return {
    ids: rows.map(row => row.id),
    byId: Object.fromEntries(rows.map(row => [row.id, row])) as Record<SessionId, SessionSummary>,
    current: CURRENT,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function turn(turnNumber: number, end?: { readonly seq: number; readonly time: number }): TurnLocation {
  return {
    turn: turnNumber,
    start: undefined,
    end: end as TurnLocation['end'],
    status: end === undefined ? 'open' : 'closed',
    steps: [],
    data: { get: () => undefined },
  }
}

function conversation(options: {
  readonly hasMore?: boolean
  readonly loadingOlder?: boolean
} = {}): ConversationSnapshot {
  const timeline = {
    turnOrder: [1, 2, 3],
    turns: new Map([
      [1, turn(1, { seq: 11, time: Date.UTC(2026, 0, 1, 1) })],
      [2, turn(2, { seq: 22, time: Date.UTC(2026, 0, 1, 2) })],
      [3, turn(3)],
    ]),
  }
  const chat: ChatSnapshot = {
    order: [],
    nodes: { get: () => undefined, values: () => [] },
    locations: { getTurn: () => [], getStep: () => [] },
    timeline,
    legacy: {
      nodes: [],
      turnTimings: new Map(),
      turnEnds: new Map(),
      partial: null,
      runningCalls: [],
    },
  }
  return {
    sessionId: CURRENT,
    views: { get: () => undefined },
    chat,
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map([[1, 11], [2, 22]]),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: options.hasMore ?? true,
    loadingOlder: options.loadingOlder ?? false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  }
}

function hookOf<T>(snapshot: T): SnapshotSelectorHook<T> {
  return function useFixtureSnapshot<Selection>(
    selector: (value: T) => Selection,
  ): Selection {
    return selector(snapshot)
  }
}

const t: BranchesViewProps['t'] = (key, params) => {
  let result: string = en[key as SessionTreeLocaleKey]
  for (const [name, value] of Object.entries(params ?? {})) {
    result = result.replaceAll(`{${name}}`, String(value))
  }
  return result
}

interface MountOptions {
  readonly forkAt?: BranchesViewProps['forkAt']
  readonly loadOlder?: BranchesViewProps['loadOlder']
  readonly openSession?: BranchesViewProps['openSession']
  readonly snapshot?: ConversationSnapshot
  readonly sessions?: SessionListState
}

async function mount(options: MountOptions = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mountedRoots.add(root)
  const forkAt = options.forkAt ?? vi.fn(() => Promise.resolve('child' as SessionId))
  const loadOlder = options.loadOlder ?? vi.fn(() => Promise.resolve(true))
  const openSession = options.openSession ?? vi.fn(() => true)
  const props = {
    sessionId: CURRENT,
    useSession: hookOf(options.snapshot ?? conversation()),
    useSessions: hookOf(options.sessions ?? sessionList()),
    forkAt,
    loadOlder,
    openSession,
    t,
  } as unknown as BranchesViewProps

  await act(async () => {
    root.render(<BranchesView {...props} />)
  })
  return { container, forkAt, loadOlder, openSession }
}

function buttons(container: HTMLElement, label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .filter(button => button.textContent?.includes(label) === true)
}

function oneButton(container: HTMLElement, label: string): HTMLButtonElement {
  const matches = buttons(container, label)
  expect(matches, `button containing "${label}"`).toHaveLength(1)
  return matches[0]!
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('BranchesView', () => {
  it('renders only the active lineage family and completed-turn checkpoints newest first', async () => {
    const { container } = await mount()

    expect(container.textContent).toContain('Root conversation')
    expect(container.textContent).toContain('Current branch')
    expect(container.textContent).toContain('Worker child')
    expect(container.textContent).not.toContain('Other family')
    expect(container.textContent).toContain('root')
    expect(container.textContent).toContain('branch')
    expect(container.textContent).toContain('subagent')
    expect(oneButton(container, 'Current branch').getAttribute('aria-current')).toBe('page')

    const checkpointHeading = container.querySelector('#session-checkpoints-heading')
    const checkpointPanel = checkpointHeading?.closest('section')
    expect(checkpointPanel).not.toBeNull()
    const checkpointLabels = Array.from(checkpointPanel!.querySelectorAll('li strong'))
      .map(node => node.textContent)
    expect(checkpointLabels).toEqual(['Turn 2', 'Turn 1'])
    expect(checkpointPanel!.textContent).toContain('event #22')
    expect(checkpointPanel!.textContent).toContain('event #11')
    expect(checkpointPanel!.textContent).not.toContain('Turn 3')
  })

  it('submits the selected completed-turn anchor once and clears pending state on success', async () => {
    const forkAt = vi.fn(() => Promise.resolve('new-child' as SessionId))
    const { container } = await mount({ forkAt })

    await click(buttons(container, 'Branch from here')[0]!)

    expect(forkAt).toHaveBeenCalledTimes(1)
    expect(forkAt).toHaveBeenCalledWith(22)
    expect(buttons(container, 'Branch from here')).toHaveLength(2)
    expect(container.querySelector('[role="status"]')?.textContent ?? '').not.toContain(
      'did not receive a complete confirmation',
    )
  })

  it('disables every fork while one is pending and ignores further gestures', async () => {
    const pending = deferred<SessionId>()
    const forkAt = vi.fn(() => pending.promise)
    const { container } = await mount({ forkAt })
    const initialForkButtons = buttons(container, 'Branch from here')

    await click(initialForkButtons[0]!)

    const pendingButton = oneButton(container, 'Creating…')
    const allCheckpointButtons = [pendingButton, ...buttons(container, 'Branch from here')]
    expect(allCheckpointButtons).toHaveLength(2)
    expect(allCheckpointButtons.every(button => button.disabled)).toBe(true)
    expect(oneButton(container, 'Load earlier turns').disabled).toBe(true)

    await click(allCheckpointButtons[0]!)
    await click(allCheckpointButtons[1]!)
    expect(forkAt).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve('new-child' as SessionId)
      await pending.promise
    })
    expect(buttons(container, 'Branch from here').every(button => !button.disabled)).toBe(true)
  })

  it('shows an uncertain-outcome notice after fork rejection without automatically retrying', async () => {
    vi.useFakeTimers()
    const forkAt = vi.fn(() => Promise.reject(new Error('workspace attachment failed')))
    const { container } = await mount({ forkAt })

    await click(buttons(container, 'Branch from here')[0]!)
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'did not receive a complete confirmation',
    )
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'will not be retried automatically',
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(forkAt).toHaveBeenCalledTimes(1)
    expect(buttons(container, 'Branch from here').every(button => !button.disabled)).toBe(true)
  })

  it('reports an earlier-history load failure without removing loaded checkpoints', async () => {
    const loadOlder = vi.fn(() => Promise.reject(new Error('history unavailable')))
    const { container } = await mount({ loadOlder })

    await click(oneButton(container, 'Load earlier turns'))

    expect(loadOlder).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Earlier history could not be loaded. Existing records were not affected.',
    )
    expect(container.textContent).toContain('Turn 2')
    expect(container.textContent).toContain('Turn 1')
    expect(oneButton(container, 'Load earlier turns').disabled).toBe(false)
  })
})
