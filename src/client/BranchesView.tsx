import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type {
  SessionId, SessionListState, SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  InjectFace, PropsLocale, TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  projectSessionTree, type SessionTreeRow, type TreeSessionSummary,
} from './tree-model.ts'
import { NS } from './locales.ts'
import css from './BranchesView.module.css'

const MAX_VISIBLE_ROWS = 200
const MAX_INDENT_DEPTH = 12

interface BranchSummary extends TreeSessionSummary {
  readonly id: SessionId
  readonly displayTitle: string
  readonly cwd?: string
  readonly running: boolean
}

/** The only action this read-only view owns: navigate to a native Session. */
export interface BranchesViewInjected {
  readonly openSession: (sessionId: SessionId) => boolean
}

export type BranchesViewProps = ConvViewProps
  & PropsLocale<typeof NS>
  & InjectFace<BranchesViewInjected>

function branchSummary(summary: SessionSummary): BranchSummary {
  return {
    id: summary.id,
    sessionId: summary.id,
    displayTitle: summary.displayTitle,
    running: summary.running,
    ...(summary.cwd === undefined ? {} : { cwd: summary.cwd }),
    ...(summary.parentId === undefined ? {} : { parentSessionId: summary.parentId }),
    ...(summary.origin === undefined ? {} : { origin: summary.origin }),
  }
}

/** Preserve Host order, then append rc.7's breadcrumb-only subagent route. */
function orderedSummaries(sessions: SessionListState): BranchSummary[] {
  const rows: BranchSummary[] = []
  const seen = new Set<SessionId>()
  for (const id of sessions.ids) {
    const summary = sessions.byId[id]
    if (summary === undefined) continue
    seen.add(id)
    rows.push(branchSummary(summary))
  }
  // `ids` deliberately excludes addressed subagents. `byId` contains the
  // complete current breadcrumb route, including ancestors needed to preserve
  // root -> child -> grandchild lineage when a deep child is opened directly.
  for (const summary of Object.values(sessions.byId)) {
    if (seen.has(summary.id)) continue
    seen.add(summary.id)
    rows.push(branchSummary(summary))
  }
  return rows
}

function currentFamily(
  rows: readonly SessionTreeRow<BranchSummary>[],
  currentId: SessionId,
): readonly SessionTreeRow<BranchSummary>[] {
  const current = rows.find(row => row.sessionId === currentId)
  if (current === undefined) return []
  return rows.filter(row => row.rootId === current.rootId)
}

function boundedWindow(
  rows: readonly SessionTreeRow<BranchSummary>[],
  currentId: SessionId,
): readonly SessionTreeRow<BranchSummary>[] {
  if (rows.length <= MAX_VISIBLE_ROWS) return rows
  const indexById = new Map(rows.map((row, index) => [row.sessionId, index]))
  const currentIndex = indexById.get(currentId)
  if (currentIndex === undefined) return []

  // Parents are core navigation targets. Reserve the whole ancestry first;
  // for a pathological chain deeper than the row cap, keep the display root
  // plus the nearest ancestors and current node.
  const ancestry: number[] = []
  const visited = new Set<string>()
  let cursor: string | undefined = currentId
  while (cursor !== undefined && !visited.has(cursor)) {
    visited.add(cursor)
    const index = indexById.get(cursor)
    if (index === undefined) break
    ancestry.push(index)
    cursor = rows[index]!.summary.parentSessionId
  }

  const selected = new Set<number>()
  const rootIndex = indexById.get(rows[currentIndex]!.rootId)
  if (rootIndex !== undefined) selected.add(rootIndex)
  for (const index of ancestry) {
    if (selected.size >= MAX_VISIBLE_ROWS) break
    selected.add(index)
  }

  // Fill the remaining budget symmetrically around the current row, then
  // return rows in their original pre-order rather than selection order.
  for (let distance = 1; selected.size < MAX_VISIBLE_ROWS; distance += 1) {
    const left = currentIndex - distance
    const right = currentIndex + distance
    if (left < 0 && right >= rows.length) break
    if (left >= 0) selected.add(left)
    if (selected.size < MAX_VISIBLE_ROWS && right < rows.length) selected.add(right)
  }
  return rows.filter((_row, index) => selected.has(index))
}

function relationshipLabel(
  row: SessionTreeRow<BranchSummary>,
  t: TranslateNS<typeof NS>,
): string {
  if (row.integrity === 'orphan') return t('tree.orphan')
  if (row.integrity === 'cycle') return t('tree.cycle')
  switch (row.relationship) {
    case 'root': return t('tree.root')
    case 'fork': return t('tree.fork')
    case 'subagent': return t('tree.subagent')
  }
}

/** Read-only lineage projection; native DSH Chat owns branch creation. */
export function BranchesView({
  sessionId, useSessions, openSession, t,
}: BranchesViewProps) {
  const sessions = useSessions(value => value)
  const [notice, setNotice] = useState<string | null>(null)

  const projection = useMemo(
    () => projectSessionTree(orderedSummaries(sessions)),
    [sessionId, sessions],
  )
  const family = useMemo(
    () => currentFamily(projection, sessionId),
    [projection, sessionId],
  )
  const visibleRows = useMemo(
    () => boundedWindow(family, sessionId),
    [family, sessionId],
  )
  const issueCount = family.filter(row => row.integrity !== 'valid').length

  useEffect(() => { setNotice(null) }, [sessionId])

  const selectSession = (id: SessionId): void => {
    if (id === sessionId) return
    setNotice(null)
    if (!openSession(id)) setNotice(t('tree.openError'))
  }

  return (
    <div className={css.root}>
      <header className={css.header}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
        <p className={css.safety}>{t('safety')}</p>
      </header>

      {notice !== null && <p className={css.notice} role="status">{notice}</p>}

      <section className={css.panel} aria-labelledby="session-tree-heading">
        <div className={css.panelHeader}>
          <h3 id="session-tree-heading" className={css.panelTitle}>{t('tree.heading')}</h3>
          <span className={css.count}>{family.length}</span>
        </div>

        {issueCount > 0 && (
          <p className={css.diagnostics} role="status">
            {t('tree.issues', { count: issueCount })}
          </p>
        )}
        {family.length > visibleRows.length && (
          <p className={css.windowed}>
            {t('tree.windowed', { visible: visibleRows.length, total: family.length })}
          </p>
        )}

        {visibleRows.length === 0
          ? <p className={css.empty}>{t('tree.empty')}</p>
          : (
              <ol className={css.tree}>
                {visibleRows.map((row) => {
                  const summary = row.summary
                  const current = summary.id === sessionId
                  const style = {
                    '--session-tree-indent': `${Math.min(row.depth, MAX_INDENT_DEPTH) * 18}px`,
                  } as CSSProperties
                  return (
                    <li key={summary.id} className={css.treeItem} style={style}>
                      <button
                        type="button"
                        className={css.sessionButton}
                        aria-current={current ? 'page' : undefined}
                        title={`${summary.displayTitle}\n${summary.id}${summary.cwd === undefined ? '' : `\n${summary.cwd}`}`}
                        onClick={() => { selectSession(summary.id) }}
                      >
                        <span className={css.branchGlyph} aria-hidden>
                          {row.depth === 0 ? '●' : row.isLast ? '└' : '├'}
                        </span>
                        <span
                          className={summary.running ? css.stateDotRunning : css.stateDot}
                          aria-hidden
                        />
                        <span className={css.sessionText}>
                          <span className={css.sessionTitle}>{summary.displayTitle}</span>
                          <span className={css.sessionMeta}>
                            <span>{relationshipLabel(row, t)}</span>
                            {summary.running && <span>{t('tree.running')}</span>}
                          </span>
                        </span>
                        {current && <span className={css.currentBadge}>{t('tree.current')}</span>}
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
      </section>
    </div>
  )
}
