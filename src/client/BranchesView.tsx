import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { SessionId, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconBranchOutline16, IconWarningOutline16, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  buildSessionTree, flattenSessionTree,
  type SessionTreeNode, type SessionTreeRow, type TreeSessionSummary,
} from './tree-model.ts'
import { NS } from './locales.ts'
import css from './BranchesView.module.css'

const INITIAL_TREE_ROWS = 200
const TREE_PAGE = 200
const INITIAL_CHECKPOINTS = 50
const CHECKPOINT_PAGE = 50
const MAX_INDENT_DEPTH = 12

/** Narrow business callbacks supplied by the registration closure. */
export interface BranchesViewInjected {
  /** Select an ordinary session or catalog-addressed subagent. */
  openSession: (sessionId: SessionId) => boolean
  /** Fork this view's source session at a completed-turn anchor and open the child. */
  forkAt: (seq: number) => Promise<SessionId>
  /** Page the current session's raw history window backwards. */
  loadOlder: () => Promise<boolean>
}

/** Full props of the session-scoped Branches conversation view. */
export type BranchesViewProps = ConvViewProps
  & PropsLocale<typeof NS>
  & InjectFace<BranchesViewInjected>

interface BranchSummary extends TreeSessionSummary {
  readonly id: SessionId
  readonly displayTitle: string
  readonly cwd?: string
  readonly running: boolean
  readonly blank: boolean
  readonly agentPreset?: string
}

interface Checkpoint {
  readonly turn: number
  readonly seq: number
  readonly time: number
}

function branchSummary(summary: SessionSummary): BranchSummary {
  return {
    id: summary.id,
    sessionId: summary.id,
    displayTitle: summary.displayTitle,
    updatedAt: summary.updatedAt,
    running: summary.running,
    blank: summary.blank,
    ...(summary.cwd === undefined ? {} : { cwd: summary.cwd }),
    ...(summary.parentId === undefined ? {} : { parentSessionId: summary.parentId }),
    ...(summary.origin === undefined ? {} : { origin: summary.origin }),
    ...(summary.agentPreset === undefined ? {} : { agentPreset: summary.agentPreset }),
  }
}

function relationshipLabel(
  node: SessionTreeNode<BranchSummary>,
  t: TranslateNS<typeof NS>,
): string {
  if (node.integrity === 'orphan') return t('tree.orphan')
  if (node.integrity === 'cycle') return t('tree.cycle')
  switch (node.relationship) {
    case 'root': return t('tree.root')
    case 'fork': return t('tree.fork')
    case 'subagent': return t('tree.subagent')
  }
}

function familyRows(
  rows: readonly SessionTreeRow<BranchSummary>[],
  currentSessionId: string,
): readonly SessionTreeRow<BranchSummary>[] {
  const current = rows.find(row => row.node.sessionId === currentSessionId)
  if (current === undefined) return rows
  return rows.filter(row => row.rootId === current.rootId)
}

function checkpointTime(time: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(time))
}

/**
 * Read-only lineage projection plus explicit completed-turn fork controls.
 * All mutation goes through the existing DSH fork API; the component never
 * writes session events, parent pointers, or workspace state.
 */
export function BranchesView({
  sessionId, useSession, useSessions, openSession, forkAt, loadOlder, t,
}: BranchesViewProps) {
  const sessions = useSessions(value => value)
  const timeline = useSession(value => value.chat.timeline)
  const hasMore = useSession(value => value.hasMore)
  const loadingOlder = useSession(value => value.loadingOlder)
  const [treeLimit, setTreeLimit] = useState(INITIAL_TREE_ROWS)
  const [checkpointLimit, setCheckpointLimit] = useState(INITIAL_CHECKPOINTS)
  const [pendingSeq, setPendingSeq] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // State drives the UI, while this synchronous guard closes the same-render
  // gap in which two gestures could otherwise both observe pendingSeq=null.
  const forkInFlight = useRef(false)

  const model = useMemo(() => buildSessionTree(
    Object.values(sessions.byId).map(branchSummary),
  ), [sessions.byId])
  const allFamilyRows = useMemo(
    () => familyRows(flattenSessionTree(model.roots), sessionId),
    [model, sessionId],
  )
  const currentRootId = allFamilyRows[0]?.rootId

  useEffect(() => {
    setTreeLimit(INITIAL_TREE_ROWS)
    setCheckpointLimit(INITIAL_CHECKPOINTS)
    setNotice(null)
  }, [currentRootId, sessionId])

  const checkpoints = useMemo<readonly Checkpoint[]>(() => {
    const result: Checkpoint[] = []
    for (let index = timeline.turnOrder.length - 1; index >= 0; index -= 1) {
      const turn = timeline.turnOrder[index]!
      const end = timeline.turns.get(turn)?.end
      if (end !== undefined) result.push({ turn, seq: end.seq, time: end.time })
    }
    return result
  }, [timeline])

  const visibleRows = allFamilyRows.slice(0, treeLimit)
  const remainingRows = allFamilyRows.length - visibleRows.length
  const visibleCheckpoints = checkpoints.slice(0, checkpointLimit)
  const remainingCheckpoints = checkpoints.length - visibleCheckpoints.length

  const selectSession = (id: SessionId): void => {
    if (id === sessionId) return
    if (!openSession(id)) setNotice(t('tree.openError'))
  }

  const createBranch = async (seq: number): Promise<void> => {
    if (forkInFlight.current) return
    forkInFlight.current = true
    setPendingSeq(seq)
    setNotice(null)
    try {
      await forkAt(seq)
    } catch {
      // A Host workspace-attach or title failure may still have committed the
      // child. Never retry an unknown outcome: the list projection will expose
      // a partial success and the user can open that one child from the tree.
      setNotice(t('fork.uncertain'))
    } finally {
      forkInFlight.current = false
      setPendingSeq(null)
    }
  }

  const pageOlder = async (): Promise<void> => {
    setNotice(null)
    try {
      await loadOlder()
    } catch {
      setNotice(t('checkpoints.loadError'))
    }
  }

  return (
    <div className={css.root}>
      <header className={css.header}>
        <div>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </div>
        <div className={css.safety} role="note">
          <IconWarningOutline16 />
          <span>{t('safety')}</span>
        </div>
      </header>

      {notice !== null && <div className={css.notice} role="status">{notice}</div>}

      <div className={css.columns}>
        <section className={css.panel} aria-labelledby="session-tree-heading">
          <div className={css.panelHeader}>
            <h3 id="session-tree-heading" className={css.panelTitle}>{t('tree.heading')}</h3>
            <span className={css.count}>{allFamilyRows.length}</span>
          </div>
          {model.diagnostics.length > 0 && (
            <p className={css.diagnostics} role="status">
              {t('diagnostics', { count: model.diagnostics.length })}
            </p>
          )}
          {visibleRows.length === 0
            ? <p className={css.empty}>{t('tree.empty')}</p>
            : (
                <ol className={css.tree}>
                  {visibleRows.map((row) => {
                    const summary = row.node.summary
                    const current = summary.id === sessionId
                    const depthStyle = {
                      '--session-tree-indent': `${Math.min(row.depth, MAX_INDENT_DEPTH) * 18}px`,
                    } as CSSProperties
                    return (
                      <li key={summary.id} className={css.treeItem} style={depthStyle}>
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
                          <StateDot state={summary.running ? 'ongoing' : 'done'} />
                          <span className={css.sessionText}>
                            <span className={css.sessionTitle}>{summary.displayTitle}</span>
                            <span className={css.sessionMeta}>
                              <span>{relationshipLabel(row.node, t)}</span>
                              {summary.blank && <span>{t('tree.blank')}</span>}
                              {summary.running && <span>{t('tree.running')}</span>}
                              {row.depth > MAX_INDENT_DEPTH && <span>depth {row.depth}</span>}
                            </span>
                          </span>
                          {current && <span className={css.currentBadge}>{t('tree.current')}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )}
          {remainingRows > 0 && (
            <div className={css.moreBlock}>
              <p>{t('tree.limited', { count: visibleRows.length })}</p>
              <Button size="sm" variant="outline" onClick={() => { setTreeLimit(limit => limit + TREE_PAGE) }}>
                {t('tree.more', { count: Math.min(TREE_PAGE, remainingRows) })}
              </Button>
            </div>
          )}
        </section>

        <section className={css.panel} aria-labelledby="session-checkpoints-heading">
          <div className={css.panelHeader}>
            <h3 id="session-checkpoints-heading" className={css.panelTitle}>{t('checkpoints.heading')}</h3>
            <span className={css.count}>{checkpoints.length}</span>
          </div>
          {visibleCheckpoints.length === 0
            ? <p className={css.empty}>{t('checkpoints.empty')}</p>
            : (
                <ol className={css.checkpoints}>
                  {visibleCheckpoints.map(checkpoint => (
                    <li key={checkpoint.seq} className={css.checkpoint}>
                      <span className={css.checkpointText}>
                        <strong>{t('checkpoints.turn', { turn: checkpoint.turn })}</strong>
                        <span>{checkpointTime(checkpoint.time)} · {t('checkpoints.seq', { seq: checkpoint.seq })}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<IconBranchOutline16 />}
                        disabled={pendingSeq !== null}
                        onClick={() => { void createBranch(checkpoint.seq) }}
                      >
                        {pendingSeq === checkpoint.seq
                          ? t('checkpoints.branching')
                          : t('checkpoints.branch')}
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
          <div className={css.checkpointActions}>
            {remainingCheckpoints > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setCheckpointLimit(limit => limit + CHECKPOINT_PAGE) }}
              >
                {t('checkpoints.moreLoaded', { count: Math.min(CHECKPOINT_PAGE, remainingCheckpoints) })}
              </Button>
            )}
            {hasMore && (
              <Button
                size="sm"
                variant="outline"
                disabled={loadingOlder || pendingSeq !== null}
                onClick={() => { void pageOlder() }}
              >
                {loadingOlder ? t('checkpoints.loadingOlder') : t('checkpoints.loadOlder')}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
