// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'
import type {
  SessionId, SessionListState, SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import {
  BranchesView, type BranchesViewProps,
} from '../src/client/BranchesView.tsx'
import { en, type SessionTreeLocaleKey } from '../src/client/locales.ts'

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
})

function summary(
  id: SessionId,
  displayTitle: string,
  options: {
    readonly parentId?: SessionId
    readonly origin?: 'subagent'
    readonly running?: boolean
    readonly updatedAt?: number
  } = {},
): SessionSummary {
  return {
    id,
    displayTitle,
    running: options.running ?? false,
    blank: false,
    updatedAt: options.updatedAt ?? 0,
    ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  }
}

function sessionList(
  rows: readonly SessionSummary[] = [
    summary(ROOT, 'Root conversation'),
    summary(CURRENT, 'Current branch', { parentId: ROOT }),
    summary(SIBLING, 'Worker child', { parentId: ROOT, origin: 'subagent' }),
    summary(OUTSIDE, 'Other family'),
  ],
  current: SessionId | undefined = CURRENT,
): SessionListState {
  return {
    ids: rows.map(row => row.id),
    byId: Object.fromEntries(rows.map(row => [row.id, row])) as Record<SessionId, SessionSummary>,
    current,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
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
  readonly sessionId?: SessionId
  readonly sessions?: SessionListState
  readonly openSession?: BranchesViewProps['openSession']
}

async function mount(options: MountOptions = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mountedRoots.add(root)
  const openSession = options.openSession ?? vi.fn(() => true)
  const props = {
    sessionId: options.sessionId ?? CURRENT,
    useSession: hookOf({}),
    useProjection: vi.fn(() => undefined),
    useSessions: hookOf(options.sessions ?? sessionList()),
    openSession,
    t,
  } as unknown as BranchesViewProps

  await act(async () => {
    root.render(<BranchesView {...props} />)
  })
  return { container, openSession }
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
}

function oneButton(container: HTMLElement, label: string): HTMLButtonElement {
  const matches = buttons(container)
    .filter(button => button.textContent?.includes(label) === true)
  expect(matches, `button containing "${label}"`).toHaveLength(1)
  return matches[0]!
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => { button.click() })
}

describe('BranchesView', () => {
  it('renders only the current session family as a read-only lineage navigator', async () => {
    const { container } = await mount()

    expect(container.textContent).toContain('Root conversation')
    expect(container.textContent).toContain('Current branch')
    expect(container.textContent).toContain('Worker child')
    expect(container.textContent).not.toContain('Other family')
    expect(oneButton(container, 'Root conversation').textContent).toContain('root')
    expect(oneButton(container, 'Current branch').textContent).toContain('branch')
    expect(oneButton(container, 'Worker child').textContent).toContain('subagent')
    expect(oneButton(container, 'Current branch').getAttribute('aria-current')).toBe('page')

    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(container.querySelector('#session-checkpoints-heading')).toBeNull()
    expect(container.textContent).not.toContain('Branch from here')
  })

  it('keeps rc.7 breadcrumb-only subagent ancestors when a deep child is addressed', async () => {
    const child = 'breadcrumb-child' as SessionId
    const grandchild = 'breadcrumb-grandchild' as SessionId
    const root = summary(ROOT, 'Root conversation')
    const childSummary = summary(child, 'Breadcrumb child', {
      parentId: ROOT,
      origin: 'subagent',
    })
    const grandchildSummary = summary(grandchild, 'Addressed grandchild', {
      parentId: child,
      origin: 'subagent',
    })
    const sessions: SessionListState = {
      ...sessionList([root], grandchild),
      // rc.7 excludes the addressed route from ids but materializes the whole
      // breadcrumb in byId so navigation can recover each parent address.
      ids: [ROOT],
      byId: {
        [ROOT]: root,
        [grandchild]: grandchildSummary,
        [child]: childSummary,
      } as Record<SessionId, SessionSummary>,
      currentAddress: {
        parentSessionId: child,
        childSessionId: grandchild,
        mode: 'continuable',
      },
    }

    const { container } = await mount({ sessionId: grandchild, sessions })

    expect(buttons(container).map(button => button.textContent)).toEqual([
      expect.stringContaining('Root conversation'),
      expect.stringContaining('Breadcrumb child'),
      expect.stringContaining('Addressed grandchild'),
    ])
    expect(oneButton(container, 'Breadcrumb child').textContent).toContain('subagent')
    expect(oneButton(container, 'Addressed grandchild').textContent).toContain('subagent')
    expect(oneButton(container, 'Addressed grandchild').getAttribute('aria-current')).toBe('page')
    expect(container.textContent).not.toContain('lineage issue')
  })

  it('shows an empty state instead of another family when the current id is absent', async () => {
    const missing = 'not-loaded' as SessionId
    const sessions = sessionList([
      summary(ROOT, 'Unrelated root'),
      summary(SIBLING, 'Unrelated child', { parentId: ROOT }),
    ], missing)

    const { container } = await mount({ sessionId: missing, sessions })

    expect(buttons(container)).toHaveLength(0)
    expect(container.textContent).toContain(
      'The current Session is not present in the loaded lineage.',
    )
    expect(container.textContent).not.toContain('Unrelated root')
    expect(container.textContent).not.toContain('Unrelated child')
  })

  it('does nothing for the current node and navigates to another native Session once', async () => {
    const openSession = vi.fn(() => true)
    const { container } = await mount({ openSession })

    await click(oneButton(container, 'Current branch'))
    expect(openSession).not.toHaveBeenCalled()

    await click(oneButton(container, 'Worker child'))
    expect(openSession).toHaveBeenCalledTimes(1)
    expect(openSession).toHaveBeenCalledWith(SIBLING)
  })

  it('reports a navigation failure without changing or removing lineage rows', async () => {
    const openSession = vi.fn(() => false)
    const { container } = await mount({ openSession })

    await click(oneButton(container, 'Worker child'))

    expect(openSession).toHaveBeenCalledWith(SIBLING)
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'This Session could not be opened; it may be a detached subagent node.',
    )
    expect(oneButton(container, 'Root conversation')).toBeDefined()
    expect(oneButton(container, 'Current branch')).toBeDefined()
    expect(oneButton(container, 'Worker child')).toBeDefined()
  })

  it('surfaces corrupt loaded lineage read-only and keeps it navigable', async () => {
    const cycleA = 'cycle-a' as SessionId
    const cycleB = 'cycle-b' as SessionId
    const sessions = sessionList([
      summary(cycleA, 'Cycle A', { parentId: cycleB }),
      summary(cycleB, 'Cycle B', { parentId: cycleA }),
    ], cycleA)
    const { container, openSession } = await mount({ sessionId: cycleA, sessions })

    expect(container.textContent).toContain(
      '2 lineage issue(s) exist in this family; no durable records were changed.',
    )
    expect(oneButton(container, 'Cycle A').textContent).toContain('lineage issue (read only)')
    expect(oneButton(container, 'Cycle B').textContent).toContain('lineage issue (read only)')

    await click(oneButton(container, 'Cycle B'))
    expect(openSession).toHaveBeenCalledWith(cycleB)
  })

  it('caps a large family at 200 rows while retaining the current node', async () => {
    const rootId = 'large-root' as SessionId
    const rows: SessionSummary[] = [summary(rootId, 'Large root')]
    for (let index = 1; index < 250; index += 1) {
      const id = `large-${String(index).padStart(3, '0')}` as SessionId
      rows.push(summary(id, `Large child ${String(index).padStart(3, '0')}`, {
        parentId: rootId,
      }))
    }
    const currentId = 'large-125' as SessionId
    const sessions = sessionList(rows, currentId)
    const { container } = await mount({ sessionId: currentId, sessions })

    expect(buttons(container)).toHaveLength(200)
    expect(oneButton(container, 'Large root')).toBeDefined()
    expect(oneButton(container, 'Large child 125').getAttribute('aria-current')).toBe('page')
    expect(container.textContent).toContain(
      'This lineage is large; showing 200 / 250 nearby entries while retaining the current node and as many ancestors as fit.',
    )
    expect(container.textContent).toContain('Large child 026')
    expect(container.textContent).toContain('Large child 224')
    expect(container.textContent).not.toContain('Large child 025')
    expect(container.textContent).not.toContain('Large child 225')
  })

  it('retains a distant parent chain before filling a large-family window', async () => {
    const rootId = 'window-root' as SessionId
    const parentId = 'window-parent' as SessionId
    const blockerId = 'window-blocker' as SessionId
    const currentId = 'window-current' as SessionId
    const rows: SessionSummary[] = [
      summary(rootId, 'Window root'),
      summary(parentId, 'Distant parent', { parentId: rootId }),
      summary(blockerId, 'Large earlier sibling', { parentId }),
    ]
    let previous = blockerId
    for (let index = 0; index < 210; index += 1) {
      const id = `blocker-child-${index}` as SessionId
      rows.push(summary(id, `Blocker child ${index}`, { parentId: previous }))
      previous = id
    }
    rows.push(summary(currentId, 'Current after subtree', { parentId }))

    const { container } = await mount({
      sessionId: currentId,
      sessions: sessionList(rows, currentId),
    })

    expect(buttons(container)).toHaveLength(200)
    expect(oneButton(container, 'Window root')).toBeDefined()
    expect(oneButton(container, 'Distant parent')).toBeDefined()
    expect(oneButton(container, 'Current after subtree').getAttribute('aria-current')).toBe('page')
  })
})
