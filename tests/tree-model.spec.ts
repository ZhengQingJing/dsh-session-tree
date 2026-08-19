import { describe, expect, it } from 'vitest'
import {
  projectSessionTree, type TreeSessionSummary,
} from '../src/client/tree-model.ts'

interface Summary extends TreeSessionSummary {
  readonly title: string
}

function summary(
  sessionId: string,
  parentSessionId?: string,
  origin?: 'subagent',
): Summary {
  return {
    sessionId,
    title: sessionId,
    ...(parentSessionId === undefined ? {} : { parentSessionId }),
    ...(origin === undefined ? {} : { origin }),
  }
}

describe('projectSessionTree', () => {
  it('keeps host root and sibling order while projecting each family in pre-order', () => {
    const rows = projectSessionTree([
      summary('root-b'),
      summary('child-seen-first', 'root-a'),
      summary('root-a'),
      summary('child-seen-second', 'root-a'),
    ])

    expect(rows.map(row => ({
      id: row.sessionId,
      rootId: row.rootId,
      depth: row.depth,
      isLast: row.isLast,
    }))).toEqual([
      { id: 'root-b', rootId: 'root-b', depth: 0, isLast: false },
      { id: 'root-a', rootId: 'root-a', depth: 0, isLast: true },
      { id: 'child-seen-first', rootId: 'root-a', depth: 1, isLast: false },
      { id: 'child-seen-second', rootId: 'root-a', depth: 1, isLast: true },
    ])
  })

  it('distinguishes roots, ordinary forks, and subagents', () => {
    const rows = projectSessionTree([
      summary('root'),
      summary('fork', 'root'),
      summary('worker', 'root', 'subagent'),
    ])

    expect(rows.map(row => [row.sessionId, row.relationship, row.integrity])).toEqual([
      ['root', 'root', 'valid'],
      ['fork', 'fork', 'valid'],
      ['worker', 'subagent', 'valid'],
    ])
  })

  it('fails soft when a declared parent is absent', () => {
    const rows = projectSessionTree([
      summary('root'),
      summary('orphan', 'not-loaded', 'subagent'),
    ])

    expect(rows.map(row => [row.sessionId, row.rootId, row.depth])).toEqual([
      ['root', 'root', 0],
      ['orphan', 'orphan', 0],
    ])
    expect(rows[1]).toMatchObject({
      relationship: 'subagent',
      integrity: 'orphan',
    })
    expect(rows[1]?.summary.parentSessionId).toBe('not-loaded')
  })

  it('fails soft on a self-cycle without rewriting its declared lineage', () => {
    const input = Object.freeze([Object.freeze(summary('self', 'self'))])
    const before = JSON.stringify(input)
    const rows = projectSessionTree(input)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      sessionId: 'self',
      rootId: 'self',
      depth: 0,
      relationship: 'fork',
      integrity: 'cycle',
    })
    expect(rows[0]?.summary).toBe(input[0])
    expect(JSON.stringify(input)).toBe(before)
  })

  it('cuts the earliest input edge in a multi-node cycle and retains descendants', () => {
    const rows = projectSessionTree([
      summary('a', 'b'),
      summary('b', 'c', 'subagent'),
      summary('c', 'a'),
      summary('child', 'b'),
      summary('grandchild', 'child'),
    ])

    expect(rows.map(row => [row.sessionId, row.rootId, row.depth])).toEqual([
      ['a', 'a', 0],
      ['c', 'a', 1],
      ['b', 'a', 2],
      ['child', 'a', 3],
      ['grandchild', 'a', 4],
    ])
    expect(rows.filter(row => row.integrity === 'cycle').map(row => row.sessionId))
      .toEqual(['a', 'c', 'b'])
    expect(rows.find(row => row.sessionId === 'b')?.relationship).toBe('subagent')
    expect(rows.find(row => row.sessionId === 'child')?.integrity).toBe('valid')
  })

  it('keeps the first duplicate id and ignores later conflicting records', () => {
    const first = Object.freeze(summary('same'))
    const duplicate = Object.freeze(summary('same', 'missing'))
    const rows = projectSessionTree(Object.freeze([first, duplicate]))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.summary).toBe(first)
    expect(rows[0]).toMatchObject({ relationship: 'root', integrity: 'valid' })
  })

  it('projects a 10k-deep chain without recursive stack growth', () => {
    const count = 10_000
    const input: Summary[] = []
    for (let index = 0; index < count; index += 1) {
      const id = `session-${String(index).padStart(5, '0')}`
      const parent = index === 0
        ? undefined
        : `session-${String(index - 1).padStart(5, '0')}`
      input.push(summary(id, parent))
    }

    const rows = projectSessionTree(input)

    expect(rows).toHaveLength(count)
    expect(rows[0]).toMatchObject({
      sessionId: 'session-00000',
      rootId: 'session-00000',
      depth: 0,
      isLast: true,
    })
    expect(rows[count - 1]).toMatchObject({
      sessionId: 'session-09999',
      rootId: 'session-00000',
      depth: count - 1,
      isLast: true,
    })
  })
})
