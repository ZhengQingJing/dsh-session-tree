/** Minimal session-list fields required to derive a deterministic lineage tree. */
export interface TreeSessionSummary {
  readonly sessionId: string
  readonly parentSessionId?: string
  readonly origin?: 'subagent'
  readonly updatedAt: number
  readonly createdAt?: number
}

/** The semantic kind of the session's declared parent relationship. */
export type SessionRelationshipKind = 'root' | 'fork' | 'subagent'

/** Integrity state discovered while projecting untrusted durable lineage. */
export type SessionTreeIntegrity = 'valid' | 'orphan' | 'cycle'

/** One session in the repaired, cycle-free display tree. */
export interface SessionTreeNode<TSummary extends TreeSessionSummary = TreeSessionSummary> {
  readonly sessionId: string
  readonly summary: TSummary
  /** Classifies the declared lineage independently from any integrity repair. */
  readonly relationship: SessionRelationshipKind
  readonly integrity: SessionTreeIntegrity
  readonly declaredParentSessionId?: string
  /** Parent retained in the display tree; absent for roots and repaired edges. */
  readonly treeParentSessionId?: string
  readonly children: readonly SessionTreeNode<TSummary>[]
}

/** A repeated session id ignored after its first occurrence. */
export interface DuplicateSessionDiagnostic {
  readonly kind: 'duplicate-session'
  readonly sessionId: string
  readonly keptIndex: number
  readonly duplicateIndex: number
}

/** A declared parent absent from the supplied session summaries. */
export interface OrphanSessionDiagnostic {
  readonly kind: 'orphan-session'
  readonly sessionId: string
  readonly parentSessionId: string
}

/** One complete parent cycle and the edge removed to render it as a tree. */
export interface SessionCycleDiagnostic {
  readonly kind: 'session-cycle'
  readonly sessionIds: readonly string[]
  readonly cutSessionId: string
}

/** A non-fatal lineage problem found while building the display tree. */
export type SessionTreeDiagnostic =
  | DuplicateSessionDiagnostic
  | OrphanSessionDiagnostic
  | SessionCycleDiagnostic

/** Deterministic, cycle-free projection of session summaries. */
export interface SessionTreeModel<TSummary extends TreeSessionSummary = TreeSessionSummary> {
  readonly roots: readonly SessionTreeNode<TSummary>[]
  readonly byId: ReadonlyMap<string, SessionTreeNode<TSummary>>
  readonly diagnostics: readonly SessionTreeDiagnostic[]
}

/** One pre-order display row produced without recursively walking the tree. */
export interface SessionTreeRow<TSummary extends TreeSessionSummary = TreeSessionSummary> {
  readonly node: SessionTreeNode<TSummary>
  /** Session id of this row's repaired-tree root, for iterative family filtering. */
  readonly rootId: string
  readonly depth: number
  readonly isLast: boolean
  /** Index of the parent row, sufficient to recover ancestor display state iteratively. */
  readonly parentRowIndex?: number
}

interface CanonicalSummary<TSummary extends TreeSessionSummary> {
  readonly summary: TSummary
  readonly inputIndex: number
}

interface MutableTreeNode<TSummary extends TreeSessionSummary> {
  readonly sessionId: string
  readonly summary: TSummary
  readonly relationship: SessionRelationshipKind
  readonly integrity: SessionTreeIntegrity
  readonly declaredParentSessionId?: string
  readonly treeParentSessionId?: string
  children: SessionTreeNode<TSummary>[]
}

const NO_PARENT = -1
const MISSING_PARENT = -2

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareCanonical<TSummary extends TreeSessionSummary>(
  left: CanonicalSummary<TSummary>,
  right: CanonicalSummary<TSummary>,
): number {
  if (left.summary.updatedAt !== right.summary.updatedAt) {
    return right.summary.updatedAt - left.summary.updatedAt
  }
  const leftCreatedAt = left.summary.createdAt ?? 0
  const rightCreatedAt = right.summary.createdAt ?? 0
  if (leftCreatedAt !== rightCreatedAt) return rightCreatedAt - leftCreatedAt
  return compareText(left.summary.sessionId, right.summary.sessionId)
}

function relationshipOf(summary: TreeSessionSummary): SessionRelationshipKind {
  if (summary.parentSessionId === undefined) return 'root'
  return summary.origin === 'subagent' ? 'subagent' : 'fork'
}

/**
 * Builds a deterministic display tree without changing the summaries.
 * Duplicate ids keep their first occurrence. Missing parents become roots. For
 * each parent cycle, the highest-ranked member's parent edge is removed while
 * every cycle member and descendant remains visible.
 *
 * Roots and siblings sort by descending update time, descending creation time,
 * then ascending session id.
 *
 * @param summaries - Session list records to project.
 * @returns A cycle-free tree, id lookup, and non-fatal integrity diagnostics.
 */
export function buildSessionTree<TSummary extends TreeSessionSummary>(
  summaries: readonly TSummary[],
): SessionTreeModel<TSummary> {
  const canonical: CanonicalSummary<TSummary>[] = []
  const indexById = new Map<string, number>()
  const duplicateDiagnostics: DuplicateSessionDiagnostic[] = []

  for (let inputIndex = 0; inputIndex < summaries.length; inputIndex += 1) {
    const summary = summaries[inputIndex]!
    const keptIndex = indexById.get(summary.sessionId)
    if (keptIndex !== undefined) {
      duplicateDiagnostics.push({
        kind: 'duplicate-session',
        sessionId: summary.sessionId,
        keptIndex: canonical[keptIndex]!.inputIndex,
        duplicateIndex: inputIndex,
      })
      continue
    }
    indexById.set(summary.sessionId, canonical.length)
    canonical.push({ summary, inputIndex })
  }

  const parentIndices = new Int32Array(canonical.length)
  const orphanIndices: number[] = []
  for (let index = 0; index < canonical.length; index += 1) {
    const parentSessionId = canonical[index]!.summary.parentSessionId
    if (parentSessionId === undefined) {
      parentIndices[index] = NO_PARENT
      continue
    }
    const parentIndex = indexById.get(parentSessionId)
    if (parentIndex === undefined) {
      parentIndices[index] = MISSING_PARENT
      orphanIndices.push(index)
      continue
    }
    parentIndices[index] = parentIndex
  }

  const state = new Uint8Array(canonical.length)
  const cycleMember = new Uint8Array(canonical.length)
  const cutParent = new Uint8Array(canonical.length)
  const cycles: Array<{ readonly indices: number[]; readonly cutIndex: number }> = []

  for (let start = 0; start < canonical.length; start += 1) {
    if (state[start] !== 0) continue
    const path: number[] = []
    const position = new Map<number, number>()
    let cursor = start

    while (cursor >= 0 && state[cursor] === 0) {
      state[cursor] = 1
      position.set(cursor, path.length)
      path.push(cursor)
      cursor = parentIndices[cursor]!
    }

    if (cursor >= 0 && state[cursor] === 1) {
      const cycleStart = position.get(cursor)
      if (cycleStart !== undefined) {
        const indices = path.slice(cycleStart)
        indices.sort((left, right) => compareCanonical(canonical[left]!, canonical[right]!))
        const cutIndex = indices[0]!
        for (const index of indices) cycleMember[index] = 1
        cutParent[cutIndex] = 1
        cycles.push({ indices, cutIndex })
      }
    }

    for (const index of path) state[index] = 2
  }

  const childIndices: number[][] = Array.from({ length: canonical.length }, () => [])
  const rootIndices: number[] = []
  const effectiveParents = new Int32Array(canonical.length)
  for (let index = 0; index < canonical.length; index += 1) {
    const declaredParent = parentIndices[index]!
    const effectiveParent = declaredParent >= 0 && cutParent[index] === 0
      ? declaredParent
      : NO_PARENT
    effectiveParents[index] = effectiveParent
    if (effectiveParent === NO_PARENT) rootIndices.push(index)
    else childIndices[effectiveParent]!.push(index)
  }

  const compareIndex = (left: number, right: number): number => (
    compareCanonical(canonical[left]!, canonical[right]!)
  )
  rootIndices.sort(compareIndex)
  for (const children of childIndices) children.sort(compareIndex)

  const mutableNodes: MutableTreeNode<TSummary>[] = canonical.map((record, index) => {
    const declaredParentSessionId = record.summary.parentSessionId
    const effectiveParent = effectiveParents[index]!
    return {
      sessionId: record.summary.sessionId,
      summary: record.summary,
      relationship: relationshipOf(record.summary),
      integrity: cycleMember[index] === 1
        ? 'cycle'
        : parentIndices[index] === MISSING_PARENT ? 'orphan' : 'valid',
      ...(declaredParentSessionId === undefined ? {} : { declaredParentSessionId }),
      ...(effectiveParent < 0
        ? {}
        : { treeParentSessionId: canonical[effectiveParent]!.summary.sessionId }),
      children: [],
    }
  })

  for (let parentIndex = 0; parentIndex < childIndices.length; parentIndex += 1) {
    mutableNodes[parentIndex]!.children = childIndices[parentIndex]!
      .map(index => mutableNodes[index] as SessionTreeNode<TSummary>)
  }
  for (const node of mutableNodes) {
    node.children = Object.freeze([...node.children]) as SessionTreeNode<TSummary>[]
    Object.freeze(node)
  }

  const roots = Object.freeze(rootIndices.map(index => mutableNodes[index] as SessionTreeNode<TSummary>))
  const byId = new Map<string, SessionTreeNode<TSummary>>()
  for (const node of mutableNodes) byId.set(node.sessionId, node)

  duplicateDiagnostics.sort((left, right) => (
    compareText(left.sessionId, right.sessionId) || left.duplicateIndex - right.duplicateIndex
  ))
  orphanIndices.sort(compareIndex)
  cycles.sort((left, right) => compareIndex(left.cutIndex, right.cutIndex))
  const diagnostics: SessionTreeDiagnostic[] = [
    ...duplicateDiagnostics,
    ...orphanIndices.map((index): OrphanSessionDiagnostic => ({
      kind: 'orphan-session',
      sessionId: canonical[index]!.summary.sessionId,
      parentSessionId: canonical[index]!.summary.parentSessionId!,
    })),
    ...cycles.map(({ indices, cutIndex }): SessionCycleDiagnostic => ({
      kind: 'session-cycle',
      sessionIds: Object.freeze(indices.map(index => canonical[index]!.summary.sessionId)),
      cutSessionId: canonical[cutIndex]!.summary.sessionId,
    })),
  ]

  return Object.freeze({
    roots,
    byId: byId as ReadonlyMap<string, SessionTreeNode<TSummary>>,
    diagnostics: Object.freeze(diagnostics),
  })
}

/**
 * Flattens tree roots into pre-order rows using an explicit stack.
 *
 * @param roots - Cycle-free roots returned by {@link buildSessionTree}.
 * @returns Rows with depth, sibling position, and parent row indexes.
 */
export function flattenSessionTree<TSummary extends TreeSessionSummary>(
  roots: readonly SessionTreeNode<TSummary>[],
): readonly SessionTreeRow<TSummary>[] {
  interface PendingRow {
    readonly node: SessionTreeNode<TSummary>
    readonly rootId: string
    readonly depth: number
    readonly isLast: boolean
    readonly parentRowIndex?: number
  }

  const rows: SessionTreeRow<TSummary>[] = []
  const pending: PendingRow[] = []
  const visited = new Set<SessionTreeNode<TSummary>>()
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const node = roots[index]!
    pending.push({ node, rootId: node.sessionId, depth: 0, isLast: index === roots.length - 1 })
  }

  while (pending.length > 0) {
    const current = pending.pop()!
    if (visited.has(current.node)) continue
    visited.add(current.node)
    const rowIndex = rows.length
    rows.push(Object.freeze({
      node: current.node,
      rootId: current.rootId,
      depth: current.depth,
      isLast: current.isLast,
      ...(current.parentRowIndex === undefined ? {} : { parentRowIndex: current.parentRowIndex }),
    }))
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        node: current.node.children[index]!,
        rootId: current.rootId,
        depth: current.depth + 1,
        isLast: index === current.node.children.length - 1,
        parentRowIndex: rowIndex,
      })
    }
  }

  return Object.freeze(rows)
}
