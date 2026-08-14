# dsh-session-tree

[Chinese](./README.md) | [English](./README.en.md)

`dsh-session-tree` is an installable DeepSeek Harness (DSH) browser plugin. It presents native DSH Session forks as an immutable conversation tree and lets a user create a child branch from any **loaded, completed conversation turn**.

> [!IMPORTANT]
> **Unofficial community plugin.** This project is independently developed by the community. It is not affiliated with, endorsed by, or maintained by DeepSeek. Both DSH and this plugin are prerelease software; review changes and back up important DSH profiles and Session data before upgrading.

Source repository: [github.com/ZhengQingJing/dsh-session-tree](https://github.com/ZhengQingJing/dsh-session-tree)

The current version supports:

- DeepSeek Harness source version `0.1.0-rc.5` (audited baseline `47f9438`).
- DSH Client public APIs `0.1.0-rc.5` and `0.1.0-rc.6`.
- Node.js `^22.19.0 || >=24.0.0`.

DSH is still a developer preview. To avoid unsafe assumptions about future API changes, the plugin's peer dependencies admit only the two verified prereleases above.

## Features

- Adds a **Branches / 版本树** conversation tab.
- Projects `SessionSummary.parentId` into a deterministic current-family tree.
- Distinguishes ordinary forks from subagent lineage.
- Keeps orphan and cyclic lineage visible but isolated; it never modifies durable records.
- Lists completed turns from the currently loaded history window.
- Calls the native `ctx.sessions.fork({ sessionId, atSeq })`, then opens the child Session.
- Loads older history turns on demand.
- Bounds initial DOM work for large trees and long conversations.

The plugin owns no custom `SessionEvent` type and maintains no separate branch database. Removing it leaves every created branch as an ordinary, readable DSH Session.

## Safety contract

- A rewind always creates a new child Session; it never truncates or rewrites the parent Session.
- Only completed `turn/end` checkpoints are offered.
- While a fork request is pending, every other fork button in that view is disabled.
- An uncertain or partially successful request is never retried automatically. The UI tells the user to inspect the tree first, preventing an avoidable duplicate child.
- `increaseTitle` is disabled to avoid an additional partial-success state in which a child has been published but its title mutation fails.
- Lineage corruption is handled fail-soft in the UI and is never silently repaired.
- Conversation branching does **not** undo file changes, commands, Git state, processes, network requests, emails, payments, or other tool side effects.
- The plugin does not merge context across branches and does not replay tools.

## Installation

The commands below install the plugin into DSH's `web` profile. `dsh plugin` forwards package-management arguments to pnpm, so both `dsh` and pnpm must be available on `PATH`.

### Install from npm (recommended)

The npm package is precompiled, so installation does not require permission to run a local build. Starting with `0.1.0-beta.2`, GitHub Actions publishes through a Trusted Publisher with short-lived OIDC credentials: no npm token is stored in the repository, and provenance is generated automatically.

Install the latest prerelease from the `next` channel:

```sh
dsh plugin --profile web add dsh-session-tree@next
```

To pin this release instead:

```sh
dsh plugin --profile web add dsh-session-tree@0.1.0-beta.2
```

### Install from GitHub

Pin the installation to an audited release tag. For stricter supply-chain requirements, replace the tag with a verified full commit SHA:

```sh
dsh plugin --profile web add github:ZhengQingJing/dsh-session-tree#v0.1.0-beta.2
```

A Git installation runs the repository's `prepare` build script with your user permissions and outside the agent sandbox. Before granting permission, audit the tag or commit, `package.json`, lockfile, and `prepare` script. pnpm 10 and newer block dependency builds by default; the first `add` may fail as expected and print an `allowBuilds` key together with the path to the profile's `pnpm-workspace.yaml`. Add only the **exact package key printed by pnpm** to that file's `allowBuilds`, then rerun the same command. Do not enable a global allow-all-build-scripts option. Precompiled npm packages and release tarballs do not require this permission.

### Install a GitHub Release tarball

Download `dsh-session-tree-0.1.0-beta.2.tgz` from [Releases](https://github.com/ZhengQingJing/dsh-session-tree/releases), verify it against the checksum published with that release, and run:

```sh
dsh plugin --profile web add ./dsh-session-tree-0.1.0-beta.2.tgz
```

You can also build a precompiled tarball yourself. This project uses pnpm `11.7.0`:

```sh
git clone https://github.com/ZhengQingJing/dsh-session-tree.git
cd dsh-session-tree
pnpm install --frozen-lockfile
pnpm run verify
pnpm pack
```

Then pass the actual `.tgz` path printed by `pnpm pack` to `dsh plugin --profile web add`.

### Verify and start

```sh
dsh --profile web --dump-config
dsh --profile web
```

Confirm that the configuration includes `dsh-session-tree`. Restart DSH and reload the browser after adding, updating, or removing the plugin; the current DSH browser static-package roster does not support complete hot installation or removal.

## Updating

Follow the npm `next` channel with:

```sh
dsh plugin --profile web update dsh-session-tree@next
```

To pin a release, use `add dsh-session-tree@<version>` instead. For a GitHub installation, replace the tag or commit in the original command with an audited newer revision and rerun it. For a tarball installation, download, verify, and `add` the new file. Always restart DSH after an update.

## Uninstalling

```sh
dsh plugin --profile web remove dsh-session-tree
```

Restart DSH afterward. Uninstalling removes the plugin UI and configuration layer; it does not delete native DSH child Sessions that the plugin created.

## Usage

1. Open an existing conversation.
2. Select **Branches / 版本树** in the conversation view tabs.
3. Choose a completed turn on the right.
4. Select **Branch from here / 从这里创建分支**.
5. DSH creates and opens a new child Session. The original conversation remains available in the tree.

The page lists only turns in the currently loaded history window. If the target checkpoint is not visible, select **Load earlier turns / 加载更早轮次**.

## Development and verification

```sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check:bundle
pnpm run pack:check
```

`pnpm run verify` runs the type check, tests, build, and bundle validation in sequence.

The browser artifact is not a normal CommonJS bundle. `lib/client.js` is wrapped as a DSH module-loader factory and shares React, Cordis, and UI module instances through the frozen platform module table. CSS Modules are compiled and tagged with plugin ownership, allowing DSH to remove their styles with the plugin fiber.

The current implementation has been validated with:

- Plugin unit and interaction tests: 13/13 passing.
- Targeted native DSH fork regression tests: 21/21 passing.
- Browser end-to-end acceptance covering installation, loading, branch creation, and child-Session navigation in an isolated DSH profile.

## Known limitations

- The upstream fork RPC has no caller operation ID, durable source witness, or idempotent retry contract. Multiple pages or processes can still create duplicate child Sessions; this plugin only prevents duplicate gestures inside one mounted view.
- A Host workspace-attach failure may publish a child while still rejecting the client Promise. The public runtime cannot reliably expose that child Session ID, so the plugin reports an uncertain result and does not retry.
- Session summaries expose the parent ID but not `seedLength` or the resolved fork boundary, so the tree cannot cheaply annotate child edges with an exact source seq.
- Named refs, HEAD, reflog, merge, rebase, cherry-pick, branch deletion, shared-prefix storage, and automatic artifact GC are not implemented.
- Each native child Session materializes its inherited event prefix; many long-lived branches amplify storage usage.
- In-progress assistant chunks are not completed model context and are not offered as checkpoints.
- The view does not insert actions into Trajectory rows or the `conversation.chat.turnTail` chain, because doing so would replace other chain contributors such as Produced Files.
- Workspace snapshots and external side-effect rollback are explicitly out of scope.

## Contributors

- [ZeXin Lin (@webDrag0n)](https://github.com/webDrag0n)

See [`./docs/DSH_SESSION_TREE_DESIGN.md`](./docs/DSH_SESSION_TREE_DESIGN.md) for the production transaction design and hardening plan.
