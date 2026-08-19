export const NS = 'sessionTree'

export const zh = {
  'view.label': '版本树',
  'title': '对话版本树',
  'intro': '在聊天页中使用已完成回复下方的 DSH 原生“分支”按钮；新会话会自动出现在这里。',
  'safety': '此视图只读取并导航原生 Session，不修改历史，也不会撤销文件、命令或其他工具副作用。',
  'tree.heading': '当前会话家族',
  'tree.empty': '当前 Session 不在已加载的谱系中。',
  'tree.current': '当前',
  'tree.root': '起点',
  'tree.fork': '分支',
  'tree.subagent': '子代理',
  'tree.orphan': '父会话未加载',
  'tree.cycle': '谱系异常（只读）',
  'tree.running': '运行中',
  'tree.openError': '无法打开该 Session；它可能是已失联的子代理节点。',
  'tree.issues': '当前家族有 {count} 个谱系异常；持久记录未被修改。',
  'tree.windowed': '谱系过大，已保留当前节点与预算内祖先，并显示附近 {visible} / {total} 项。',
} as const

export type SessionTreeLocaleKey = keyof typeof zh

export const en: Record<SessionTreeLocaleKey, string> = {
  'view.label': 'Branches',
  'title': 'Conversation branches',
  'intro': 'Use DSH\'s native Branch action below a completed reply in Chat; the child session appears here automatically.',
  'safety': 'This view only reads and navigates native Sessions. It never rewrites history or undoes files, commands, or other tool effects.',
  'tree.heading': 'Current session family',
  'tree.empty': 'The current Session is not present in the loaded lineage.',
  'tree.current': 'current',
  'tree.root': 'root',
  'tree.fork': 'branch',
  'tree.subagent': 'subagent',
  'tree.orphan': 'parent not loaded',
  'tree.cycle': 'lineage issue (read only)',
  'tree.running': 'running',
  'tree.openError': 'This Session could not be opened; it may be a detached subagent node.',
  'tree.issues': '{count} lineage issue(s) exist in this family; no durable records were changed.',
  'tree.windowed': 'This lineage is large; showing {visible} / {total} nearby entries while retaining the current node and as many ancestors as fit.',
}
