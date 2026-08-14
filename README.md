# dsh-session-tree

[中文](./README.md) | [English](./README.en.md)

`dsh-session-tree` 是一个可安装的 DeepSeek Harness（DSH）浏览器端插件。它将 DSH 原生 Session fork 呈现为不可变的对话版本树，并允许用户从任意**已加载且已完成的对话轮次**创建子分支。

> [!IMPORTANT]
> **非官方社区插件。** 本项目由社区独立开发，不隶属于 DeepSeek，也未经 DeepSeek 背书或维护。DSH 与本插件均处于预发布阶段；升级前请审阅变更，并备份重要的 DSH profile 与 Session 数据。

源码仓库：[github.com/ZhengQingJing/dsh-session-tree](https://github.com/ZhengQingJing/dsh-session-tree)

当前版本支持：

- DeepSeek Harness 源码版 `0.1.0-rc.5`（审计基线 `47f9438`）。
- DSH Client 公开 API `0.1.0-rc.5` 和 `0.1.0-rc.6`。
- Node.js `^22.19.0 || >=24.0.0`。

DSH 尚处于开发者预览阶段。为避免在未来 API 变更上作出不安全的假设，本插件的 peer dependency 仅允许上述两个已验证的预发布版本。

## 功能

- 在对话页面中新增 **版本树 / Branches** 标签页。
- 将 `SessionSummary.parentId` 投影为确定性的当前对话家族树。
- 区分普通 fork 与 subagent 谱系。
- 显示但隔离孤儿节点和循环谱系，不修改持久化记录。
- 列出当前已加载历史窗口中的已完成轮次。
- 调用 DSH 原生 `ctx.sessions.fork({ sessionId, atSeq })` 创建子 Session，然后打开新对话。
- 按需加载更早的历史轮次。
- 限制大型版本树和长对话的初始 DOM 工作量。

插件不定义自有 `SessionEvent` 类型，也不维护独立的分支数据库。卸载插件后，已创建的分支仍是普通、可读的 DSH Session。

## 安全契约

- 回溯始终创建新的子 Session；绝不截断或重写父 Session。
- 只提供已完成的 `turn/end` 检查点。
- 当 fork 请求进行中时，当前视图中的其他 fork 按钮全部禁用。
- 不自动重试不确定或部分成功的请求。界面会要求用户先检查版本树，以避免生成重复子分支。
- 禁用 `increaseTitle`，避免子 Session 已发布后又因标题修改失败而产生额外的部分成功状态。
- 谱系异常在 UI 中 fail-soft，不会被静默修复。
- 对话分支**不会**撤销文件修改、命令、Git 状态、进程、网络请求、邮件、支付或其他工具副作用。
- 不合并不同分支的上下文，也不重放工具调用。

## 安装

以下命令安装到 DSH 的 `web` profile。`dsh plugin` 会把包管理参数转发给 pnpm，因此需要先确保 `dsh` 和 pnpm 都在 `PATH` 中。

### 从 npm 安装（推荐）

npm 包是预编译制品，安装时不需要授权本地构建脚本。`0.1.0-beta.2` 起由 GitHub Actions Trusted Publisher 使用短期 OIDC 凭据发布，不在仓库中保存 npm token，并自动生成 provenance。

安装 `next` 渠道中的最新预发布版本：

```sh
dsh plugin --profile web add dsh-session-tree@next
```

如需固定本次发布版本：

```sh
dsh plugin --profile web add dsh-session-tree@0.1.0-beta.2
```

### 从 GitHub 安装

固定到已审阅的 release tag；更严格的供应链要求下，请将 tag 换成已核验的完整 commit SHA：

```sh
dsh plugin --profile web add github:ZhengQingJing/dsh-session-tree#v0.1.0-beta.2
```

Git 安装会以当前用户权限、在 agent sandbox 之外执行仓库的 `prepare` 构建脚本。请在授权前审阅 tag/commit、`package.json`、锁文件和 `prepare` 脚本。pnpm 10 及以上版本默认会拦截这类依赖构建；首次 `add` 可能按预期失败，并打印 `allowBuilds` 键及实际 profile 中 `pnpm-workspace.yaml` 的路径。只把 pnpm 输出的**精确包键**加入该文件的 `allowBuilds`，然后重跑同一条命令；不要开启全局允许所有构建脚本的选项。预编译的 npm 包或 release tarball 不需要这项授权。

### 从 GitHub Release tarball 安装

从 [Releases](https://github.com/ZhengQingJing/dsh-session-tree/releases) 下载 `dsh-session-tree-0.1.0-beta.2.tgz`，先对照该 release 提供的校验值，再执行：

```sh
dsh plugin --profile web add ./dsh-session-tree-0.1.0-beta.2.tgz
```

也可以自行构建预编译 tarball。本项目使用 pnpm `11.7.0`：

```sh
git clone https://github.com/ZhengQingJing/dsh-session-tree.git
cd dsh-session-tree
pnpm install --frozen-lockfile
pnpm run verify
pnpm pack
```

随后把 `pnpm pack` 输出的实际 `.tgz` 路径传给 `dsh plugin --profile web add`。

### 验证并启动

```sh
dsh --profile web --dump-config
dsh --profile web
```

确认配置中包含 `dsh-session-tree`。添加、更新或移除插件后，请重启 DSH 并重新加载浏览器页面；当前 DSH 浏览器端静态包 roster 不支持完整的热安装或热卸载。

## 更新

跟随 npm `next` 渠道更新：

```sh
dsh plugin --profile web update dsh-session-tree@next
```

如需锁定版本，改用 `add dsh-session-tree@<version>`。GitHub 安装请把原命令中的 tag/commit 换成已审阅的新版本后重新执行；tarball 安装请下载、校验并 `add` 新文件。更新后务必重启 DSH。

## 卸载

```sh
dsh plugin --profile web remove dsh-session-tree
```

随后重启 DSH。卸载只移除插件 UI 和配置层，不会删除已经创建的原生 DSH 子 Session。

## 使用

1. 打开一个已有对话。
2. 在对话视图标签中选择 **版本树 / Branches**。
3. 在右侧选择一个已完成的轮次。
4. 选择 **从这里创建分支 / Branch from here**。
5. DSH 创建并打开新的子 Session，原对话仍可从版本树中访问。

页面只列出当前已加载历史窗口中的轮次。如果目标检查点尚未出现，请选择 **加载更早轮次 / Load earlier turns**。

## 开发与验证

```sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check:bundle
pnpm run pack:check
```

`pnpm run verify` 会依次运行类型检查、测试、构建与 bundle 校验。

浏览器产物不是普通的 CommonJS bundle。`lib/client.js` 会被包装为 DSH module-loader factory，通过冻结的平台模块表共享 React、Cordis 和 UI 模块实例。CSS Modules 会被编译并带有插件归属标记，因此 DSH 可以随插件 fiber 移除样式。

当前实现已经过以下验证：

- 插件单元与交互测试：13/13 通过。
- DSH 原生 fork 定向回归测试：21/21 通过。
- 隔离 DSH profile 中的安装、加载、创建分支和打开子 Session 浏览器端到端验收。

## 已知限制

- 上游 fork RPC 没有调用方 operation id、持久化源见证或幂等重试契约。多个页面或进程仍可能创建重复子 Session；本插件只防止同一个已挂载视图内的重复操作。
- Host workspace attach 失败时，子 Session 可能已发布，但客户端 Promise 仍会 reject。公开 runtime 无法稳定暴露该子 Session ID，所以插件只报告“结果不确定”，不会重试。
- Session summary 包含 parent id，但不包含 `seedLength` 或解析后的 fork 边界，因此版本树无法低成本地在子边上标注精确源 seq。
- 尚不支持命名 ref、HEAD、reflog、merge、rebase、cherry-pick、分支删除、共享前缀存储或自动产物 GC。
- 每个原生子 Session 都会实体化其继承的事件前缀；大量长寿命分支会放大存储用量。
- 正在生成的 assistant chunk 不是已完成的模型上下文，不会被提供为检查点。
- 界面不会向 Trajectory 行或 `conversation.chat.turnTail` 链插入操作，因为这会替换 Produced Files 等其他 chain contributor。
- Workspace 快照和外部副作用回滚明确不在当前范围内。

## 贡献者

- [ZeXin Lin (@webDrag0n)](https://github.com/webDrag0n)

生产级事务设计与强化计划详见 [`./docs/DSH_SESSION_TREE_DESIGN.md`](./docs/DSH_SESSION_TREE_DESIGN.md)。
