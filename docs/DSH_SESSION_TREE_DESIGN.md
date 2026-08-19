# dsh-session-tree：精简设计与安全边界

> 状态：`0.2.0-beta.1` 设计基线
>
> 日期：2026-08-19
>
> 上游基线：DeepSeek Harness `0.1.0-rc.7`，commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`

## 1. 产品定义

`dsh-session-tree` 是 DSH Web 的一个只读 Client 插件。它只做两件事：

1. 将 DSH 已有的 `SessionSummary.parentId` 投影成当前 Session 家族树。
2. 让用户点击节点，在原生 Session 之间导航。

创建分支不属于插件。用户在 Chat 中使用 DSH 原生的“在新对话中分支”按钮；child 创建成功后，原生 Session list 更新，树随之重新投影。

因此，这个插件不是 Git 实现，也不是第二套 Session 管理器。更准确的产品描述是：

> Lightweight read-only session lineage navigation for DeepSeek Harness.

## 2. 为什么仍需要插件

DSH rc.7 已具备原生 completed-turn fork，但默认 Workspace 浏览器有意把普通 Session 当作顶层项目展示，不把普通 fork 画成完整谱系树。

已经核实的上游机制：

- 原生 Chat 在完成轮次末尾提供 Branch 操作：
  `packages/client/ui-conversation/src/client/chat/TurnTailNodeView.tsx`。
- 原生 conversation 插件调用 `sessions.fork()` 并打开 child：
  `packages/client/ui-conversation/src/client/apply.ts`。
- Client summary 暴露 `parentId` 和 `origin`：
  `packages/client/runtime/src/client/sessions/service.ts`。
- Workspace browser 不把普通 fork 谱系投影成树：
  `packages/client/ui-workspace/src/client/tree.ts`。

插件补的是最后一项展示与导航缺口，不复制前三项。

## 3. 数据流

```text
DSH Host / Session persistence
          |
          v
SessionListState { ids, byId, current }
          |
          v
iterative, fail-soft lineage projection
          |
          v
current family, bounded around current Session
          |
          v
Branches view --click--> sessions.open / openSubagent
```

权威事实始终属于 DSH：

- Session 内容由 DSH 的事件日志拥有。
- 父子关系由 child Session 的原生 lineage 元数据拥有。
- 插件树、缩进、窗口和告警只是浏览器投影。
- 插件卸载后，所有 Session 仍由 DSH 原生读取。

## 4. 实现边界

### Host half

Node half 保留空 `apply()`。它的作用是让 Loader 挂载包、应用 `cordis.patch.yml`，并让 DSH Client module system 发现同一包的 `./client` 导出。

### Browser half

Browser half 注册一个 additive `conversation.view`：

- `id: dsh-session-tree`（使用包名命名空间，避免和其他社区视图冲突）
- `order: 20`，排在 Chat 和 Trajectory 之后
- 依赖 Cordis services：`slots`、`sessions`、`locale`
- 注入面只有 `openSession(sessionId)`

普通 Session 使用 `sessions.open()`；有可靠 catalog address 的 subagent 使用 `sessions.openSubagent()`。

### Lineage projection

投影遵循以下规则：

- 以 DSH 的 `sessions.ids` 顺序为权威顺序，不按可变时间戳重新排序。
- addressed subagent 不在 `ids` 时，从 `byId` 补齐 rc.7 投影出的整条当前 breadcrumb route，保留深层 child 的祖先关系。
- 使用迭代遍历，深链不会造成 JavaScript 调用栈溢出。
- 缺失父节点降级为只读 root。
- parent cycle 切断一个确定性展示边；绝不修改持久记录。
- 只显示当前 Session 所属家族；当前 Session 无法解析时显示空态，而不是泄出所有会话。
- 大家族最多渲染 200 行；先保留当前节点、预算内最近祖先与显示 root，再用当前节点附近的行填满剩余预算。

## 5. 必须成立的安全不变量

1. 插件不得调用 `sessions.fork()`。
2. 插件不得调用 Session append、rename、delete 或 history load mutation。
3. 插件不得写入自定义 `SessionEvent`。
4. 插件不得修改 `parentId`、原生日志或投影缓存。
5. 插件不得创建 lineage side store、ref 数据库或隐藏的第二事实源。
6. 缺失、重复或循环输入必须 fail-soft，不能自动“修复”持久记录。
7. stale Session 导航失败只能显示本地错误，不能创建、重试或删除任何东西。
8. 对话分支不得被描述成文件系统、Git 或外部服务回滚。
9. 浏览器 bundle 必须共享宿主 React、Cordis 和 DSH services，不能内联第二份运行时。
10. 安装和卸载只改变插件配置层，不改变已有 Session。

## 6. 包与安装策略

正式分发单位是一个 DSH bundle：

- `package.json` 声明 `dsh.bundle.patch` 和 `dsh.client`。
- `cordis.patch.yml` 只插入一个稳定 Loader row。
- `exports["./client"]` 指向预编译的 lazy CommonJS factory。
- npm 包不包含源码构建依赖，也不执行本地构建。

DSH、Cordis 和 React 由正在运行的 DSH 安装提供。它们保留为 optional peer compatibility metadata，并在开发环境中以精确 rc.7 版本验证；这样 `dsh plugin add` 不会向 profile 自动安装另一整套 Client dependency graph。

主要安装路径只有一条：

```sh
dsh plugin --profile web add dsh-session-tree@next
```

Git 源码安装仍可通过 `prepare` 构建，但不是面向普通用户的推荐路径。

## 7. 明确不做

- 不在插件内复制 completed-turn checkpoint 浏览器。
- 不实现自己的 fork RPC、重试、operation id 或事务协议。
- 不提供命名 branch、ref、HEAD、reflog、merge、rebase 或 cherry-pick。
- 不做 Session hard delete、自动 GC 或共享前缀存储。
- 不回滚文件、命令、进程、网络请求、消息、支付或其他工具副作用。
- 不修改 Trajectory 行或独占 `conversation.chat.turnTail` chain。
- 不把模型内部推理轨迹当作另一份 Session 日志。

## 8. 上游改进候选

如果 DSH 重新开放外部 PR，适合单独提出的最小改动是：

1. 在公开 Session summary 中暴露 `seedLength` 或解析后的 fork boundary，便于树边显示准确来源。
2. 让 `session.fork` 返回 resolved boundary 和可核对的 child receipt。
3. 改善原生 Chat Branch 的 pending/partial-success 用户反馈与重复点击保护。

这些是 DSH 原生 fork 契约的改进，不应通过恢复插件自己的写路径来绕开。

## 9. 发布门禁

每次发布至少验证：

- 类型检查、单元测试、browser component 测试和构建通过。
- self-cycle、多节点 cycle、orphan 和 10k 深链不会挂死或栈溢出。
- 超大谱系 DOM 有硬上限，当前节点始终可见。
- 普通 Session 与 addressed subagent 走正确导航入口。
- bundle 没有裸 ESM、没有第二份 React，并带有可回收的插件 CSS 标记。
- 构建产物中不存在 `sessions.fork`、`loadOlder`、Session append 或自定义事件。
- `pnpm pack --dry-run` 只包含白名单文件，不包含源码路径、secret 或 source map。
- 在隔离的 DSH rc.7 Web profile 中完成安装、加载、导航、卸载验收。

## 10. 非目标不等于未来承诺

旧设计曾讨论事务性 refs、artifact catalog、CAS、reflog 和存储优化。这些内容已从本插件路线移除。若未来有独立证据和上游契约支持，应作为新的 RFC 或独立项目重新评审，不能据此扩张当前插件的权限与数据所有权。
