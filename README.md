# dsh-session-tree

[中文](./README.md) | [English](./README.en.md)

`dsh-session-tree` 为 DeepSeek Harness（DSH）补充一个轻量、只读的会话谱系视图：查看当前对话的原生 fork 树，并在父会话、兄弟分支和子会话之间跳转。

> [!IMPORTANT]
> **非官方社区插件。** 本项目不隶属于 DeepSeek，也未经 DeepSeek 背书。DSH 与本插件仍处于预发布阶段，升级前请备份重要的 profile 和 Session 数据。

当前版本面向：

- DeepSeek Harness `0.1.0-rc.7`。
- Node.js `^22.19.0 || >=24.0.0`。

## 安装

npm 包已经预编译，不需要运行本地构建脚本，也不会为 profile 再安装一整套 DSH Client 依赖：

前置条件只有 `dsh` 和 `pnpm` 已在 `PATH` 中；`dsh plugin` 会把依赖操作转交给 profile 内的 pnpm。

```sh
dsh plugin --profile web add dsh-session-tree@next
dsh --profile web
```

安装后打开任意对话，页面会新增 **版本树 / Branches** 标签。如果刚安装或更新过插件，请重启 DSH 并重新加载浏览器页面。

可在启动前检查组合结果：

```sh
dsh --profile web --dump-config
```

输出中应包含一条 `dsh-session-tree` 配置行。

## 使用

1. 在 **Chat** 中找到一个已完成的 assistant 回复。
2. 使用回复操作区里 DSH 原生的 **在新对话中分支 / Branch into a new conversation** 按钮。
3. 打开 **版本树 / Branches** 标签，新建的子 Session 会自动出现在当前会话家族中。
4. 点击树中的节点即可切换到对应 Session。

分支创建由 DSH 自己完成；本插件不复制 fork 协议，也不维护另一份分支数据库。

## 核心边界

- 只读取 DSH 原生 `SessionSummary.parentId` 谱系并执行客户端导航。
- 不追加 Session 事件，不修改 parent pointer，不创建 side store。
- 对缺失父节点、循环谱系和超大谱系进行有界、只读的降级展示。
- 卸载插件不会删除或改变任何原生 Session。
- 对话分支只改变后续模型上下文；它**不会**撤销文件修改、命令、Git 状态、进程、网络请求或其他工具副作用。

## 更新与卸载

更新预发布版本：

```sh
dsh plugin --profile web update dsh-session-tree@next
```

卸载：

```sh
dsh plugin --profile web remove dsh-session-tree
```

完成后重启 DSH。卸载只移除视图与配置层，现有分支仍是普通的 DSH Session。

## 已知限制

- 公开 Session summary 暂不包含解析后的 fork 边界，因此树边不能标注精确源 `seq`。
- 不提供命名 ref、HEAD、merge、rebase、cherry-pick、分支删除或文件系统快照。
- 当前 DSH 浏览器端插件 roster 在安装、更新或移除后仍需要重启。
- 树只展示当前客户端已经知道的 Session；尚未加载或已失联的 subagent 可能不可导航。

## 开发

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run verify
pnpm pack --dry-run
```

浏览器产物必须使用 DSH 的 lazy CommonJS factory 格式，并共享宿主的 React、Cordis 与 Client services。项目保留 bundle、循环谱系、深链和大型树门禁，避免为追求代码行数而削弱加载与故障安全。

## 维护者与贡献者

- 维护者：[ZhengQingJing](https://github.com/ZhengQingJing)
- 贡献者：[ZeXin Lin (@webDrag0n)](https://github.com/webDrag0n)

简要设计和安全不变量见 [DSH_SESSION_TREE_DESIGN.md](https://github.com/ZhengQingJing/dsh-session-tree/blob/main/docs/DSH_SESSION_TREE_DESIGN.md)。
