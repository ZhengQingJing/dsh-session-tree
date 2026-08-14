import { describe, expect, it } from 'vitest'
import {
  buildSessionTree,
  flattenSessionTree,
  type TreeSessionSummary,
} from '../src/client/tree-model.ts'

interface Summary extends TreeSessionSummary {
  readonly title: string
}

function summary(
  sessionId: string,
  updatedAt: number,
  parentSessionId?: string,
  origin?: 'subagent',
  createdAt?: number,
): Summary {
  return {
    sessionId,
    updatedAt,
    title: sessionId,
    ...(parentSessionId === undefined ? {} : { parentSessionId }),
    ...(origin === undefined ? {} : { origin }),
    ...(createdAt === undefined ? {} : { createdAt }),
  }
}

describe('buildSessionTree', () => {
  it('sorts roots and siblings deterministically by activity, creation, and id', () => {
    const model = buildSessionTree([
      summary('root-old', 10),
      summary('root-z', 20, undefined, undefined, 4),
      summary('root-a', 20, undefined, undefined, 4),
      summary('child-old', 2, 'root-a'),
      summary('child-new', 8, 'root-a'),
      summary('child-created-new', 8, 'root-a', undefined, 9),
    ])

    expect(model.roots.map(node => node.sessionId)).toEqual(['root-a', 'root-z', 'root-old'])
    expect(model.byId.get('root-a')?.children.map(node => node.sessionId)).toEqual([
      'child-created-new',
      'child-new',
      'child-old',
    ])
  })

  it('classifies ordinary forks and subagents as different relationships', () => {
    const model = buildSessionTree([
      summary('root', 1),
      summary('fork', 2, 'root'),
      summary('worker', 3, 'root', 'subagent'),
    ])

    expect(model.byId.get('root')?.relationship).toBe('root')
    expect(model.byId.get('fork')?.relationship).toBe('fork')
    expect(model.byId.get('worker')?.relationship).toBe('subagent')
    expect(model.byId.get('fork')?.integrity).toBe('valid')
    expect(model.byId.get('worker')?.integrity).toBe('valid')
  })

  it('keeps an orphan as a root without erasing its declared relationship', () => {
    const model = buildSessionTree([
      summary('root', 1),
      summary('orphan', 2, 'missing', 'subagent'),
    ])
    const orphan = model.byId.get('orphan')

    expect(model.roots.map(node => node.sessionId)).toEqual(['orphan', 'root'])
    expect(orphan).toMatchObject({
      relationship: 'subagent',
      integrity: 'orphan',
      declaredParentSessionId: 'missing',
    })
    expect(orphan?.treeParentSessionId).toBeUndefined()
    expect(model.diagnostics).toContainEqual({
      kind: 'orphan-session',
      sessionId: 'orphan',
      parentSessionId: 'missing',
    })
  })

  it('fails soft on a self-parent and reports the complete cycle', () => {
    const model = buildSessionTree([summary('self', 1, 'self')])

    expect(model.roots.map(node => node.sessionId)).toEqual(['self'])
    expect(model.byId.get('self')).toMatchObject({
      relationship: 'fork',
      integrity: 'cycle',
      declaredParentSessionId: 'self',
    })
    expect(model.byId.get('self')?.treeParentSessionId).toBeUndefined()
    expect(model.diagnostics).toEqual([{
      kind: 'session-cycle',
      sessionIds: ['self'],
      cutSessionId: 'self',
    }])
  })

  it('cuts one deterministic edge in a multi-node cycle and retains all descendants', () => {
    const model = buildSessionTree([
      summary('a', 30, 'b'),
      summary('b', 20, 'c', 'subagent'),
      summary('c', 10, 'a'),
      summary('child', 40, 'b'),
      summary('grandchild', 50, 'child'),
    ])
    const rows = flattenSessionTree(model.roots)

    expect(model.roots.map(node => node.sessionId)).toEqual(['a'])
    expect(rows.map(row => [row.node.sessionId, row.depth])).toEqual([
      ['a', 0],
      ['c', 1],
      ['b', 2],
      ['child', 3],
      ['grandchild', 4],
    ])
    expect([...model.byId.values()].filter(node => node.integrity === 'cycle').map(node => node.sessionId).sort())
      .toEqual(['a', 'b', 'c'])
    expect(model.byId.get('b')?.relationship).toBe('subagent')
    expect(model.diagnostics).toEqual([{
      kind: 'session-cycle',
      sessionIds: ['a', 'b', 'c'],
      cutSessionId: 'a',
    }])
  })

  it('keeps the first duplicate without mutating frozen input', () => {
    const first = Object.freeze(summary('same', 1))
    const duplicate = Object.freeze(summary('same', 99, 'missing'))
    const input = Object.freeze([first, duplicate])
    const before = JSON.stringify(input)
    const model = buildSessionTree(input)

    expect(model.byId.size).toBe(1)
    expect(model.byId.get('same')?.summary).toBe(first)
    expect(model.diagnostics).toEqual([{
      kind: 'duplicate-session',
      sessionId: 'same',
      keptIndex: 0,
      duplicateIndex: 1,
    }])
    expect(JSON.stringify(input)).toBe(before)
  })

  it('builds and flattens a 10k-deep chain without recursion', () => {
    const count = 10_000
    const input: Summary[] = []
    for (let index = 0; index < count; index += 1) {
      input.push(summary(
        `session-${String(index).padStart(5, '0')}`,
        index,
        index === 0 ? undefined : `session-${String(index - 1).padStart(5, '0')}`,
      ))
    }

    const model = buildSessionTree(input)
    const rows = flattenSessionTree(model.roots)

    expect(model.byId.size).toBe(count)
    expect(rows).toHaveLength(count)
    expect(rows[0]).toMatchObject({ depth: 0, isLast: true })
    expect(rows[count - 1]).toMatchObject({ depth: count - 1, isLast: true })
    expect(rows[count - 1]?.node.sessionId).toBe('session-09999')
    expect(rows[count - 1]?.parentRowIndex).toBe(count - 2)
  })
})

describe('flattenSessionTree', () => {
  it('returns pre-order rows with sibling and parent-row metadata', () => {
    const model = buildSessionTree([
      summary('root-b', 10),
      summary('root-a', 20),
      summary('child-b', 10, 'root-a'),
      summary('child-a', 20, 'root-a'),
    ])

    expect(flattenSessionTree(model.roots).map(row => ({
      id: row.node.sessionId,
      rootId: row.rootId,
      depth: row.depth,
      isLast: row.isLast,
      parentRowIndex: row.parentRowIndex,
    }))).toEqual([
      { id: 'root-a', rootId: 'root-a', depth: 0, isLast: false, parentRowIndex: undefined },
      { id: 'child-a', rootId: 'root-a', depth: 1, isLast: false, parentRowIndex: 0 },
      { id: 'child-b', rootId: 'root-a', depth: 1, isLast: true, parentRowIndex: 0 },
      { id: 'root-b', rootId: 'root-b', depth: 0, isLast: true, parentRowIndex: undefined },
    ])
  })
})
