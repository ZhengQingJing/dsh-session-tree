/** Fields needed to project the Host-owned session lineage. */
export interface TreeSessionSummary {
  readonly sessionId: string
  readonly parentSessionId?: string
  readonly origin?: 'subagent'
}

export type SessionRelationship = 'root' | 'fork' | 'subagent'
export type SessionIntegrity = 'valid' | 'orphan' | 'cycle'

/** One pre-order row in the read-only display tree. */
export interface SessionTreeRow<TSummary extends TreeSessionSummary = TreeSessionSummary> {
  readonly sessionId: string
  readonly rootId: string
  readonly summary: TSummary
  readonly depth: number
  readonly isLast: boolean
  readonly relationship: SessionRelationship
  readonly integrity: SessionIntegrity
}

interface Canonical<TSummary extends TreeSessionSummary> {
  readonly summary: TSummary
}

const ROOT = -1
const MISSING_PARENT = -2

function relationshipOf(summary: TreeSessionSummary): SessionRelationship {
  if (summary.parentSessionId === undefined) return 'root'
  return summary.origin === 'subagent' ? 'subagent' : 'fork'
}

/**
 * Project summaries into a deterministic, cycle-free tree without mutating
 * durable lineage. Duplicate ids keep their first record, missing parents
 * become roots, and one deterministic edge is cut from every parent cycle.
 * The walk is iterative so corrupt or synthetic deep chains cannot overflow
 * the browser stack.
 */
export function projectSessionTree<TSummary extends TreeSessionSummary>(
  summaries: readonly TSummary[],
): readonly SessionTreeRow<TSummary>[] {
  const canonical: Canonical<TSummary>[] = []
  const indexById = new Map<string, number>()

  for (const summary of summaries) {
    if (indexById.has(summary.sessionId)) continue
    indexById.set(summary.sessionId, canonical.length)
    canonical.push({ summary })
  }

  const parents = new Int32Array(canonical.length)
  for (let index = 0; index < canonical.length; index += 1) {
    const parentId = canonical[index]!.summary.parentSessionId
    if (parentId === undefined) {
      parents[index] = ROOT
      continue
    }
    const parentIndex = indexById.get(parentId)
    if (parentIndex === undefined) {
      parents[index] = MISSING_PARENT
    } else {
      parents[index] = parentIndex
    }
  }

  // Parent links form a functional graph, so every component has at most one
  // cycle. Cut its earliest input member so Host list order stays authoritative.
  const state = new Uint8Array(canonical.length)
  const cycleMember = new Uint8Array(canonical.length)
  const cutParent = new Uint8Array(canonical.length)
  for (let start = 0; start < canonical.length; start += 1) {
    if (state[start] !== 0) continue
    const path: number[] = []
    const pathIndex = new Map<number, number>()
    let cursor = start

    while (cursor >= 0 && state[cursor] === 0) {
      state[cursor] = 1
      pathIndex.set(cursor, path.length)
      path.push(cursor)
      cursor = parents[cursor]!
    }

    if (cursor >= 0 && state[cursor] === 1) {
      const cycleStart = pathIndex.get(cursor)
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart)
        let cutIndex = cycle[0]!
        for (const index of cycle) cycleMember[index] = 1
        for (const index of cycle) cutIndex = Math.min(cutIndex, index)
        cutParent[cutIndex] = 1
      }
    }
    for (const index of path) state[index] = 2
  }

  const roots: number[] = []
  const children: number[][] = Array.from({ length: canonical.length }, () => [])
  for (let index = 0; index < canonical.length; index += 1) {
    const parent = parents[index]!
    if (parent < 0 || cutParent[index] === 1) roots.push(index)
    else children[parent]!.push(index)
  }
  interface PendingRow {
    readonly index: number
    readonly rootId: string
    readonly depth: number
    readonly isLast: boolean
  }

  const pending: PendingRow[] = []
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const rootIndex = roots[index]!
    pending.push({
      index: rootIndex,
      rootId: canonical[rootIndex]!.summary.sessionId,
      depth: 0,
      isLast: index === roots.length - 1,
    })
  }

  const rows: SessionTreeRow<TSummary>[] = []
  while (pending.length > 0) {
    const current = pending.pop()!
    const summary = canonical[current.index]!.summary
    rows.push({
      sessionId: summary.sessionId,
      rootId: current.rootId,
      summary,
      depth: current.depth,
      isLast: current.isLast,
      relationship: relationshipOf(summary),
      integrity: cycleMember[current.index] === 1
        ? 'cycle'
        : parents[current.index] === MISSING_PARENT ? 'orphan' : 'valid',
    })
    const childList = children[current.index]!
    for (let index = childList.length - 1; index >= 0; index -= 1) {
      pending.push({
        index: childList[index]!,
        rootId: current.rootId,
        depth: current.depth + 1,
        isLast: index === childList.length - 1,
      })
    }
  }

  return rows
}
