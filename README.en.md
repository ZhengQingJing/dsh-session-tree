# dsh-session-tree

[Chinese](./README.md) | [English](./README.en.md)

`dsh-session-tree` adds a lightweight, read-only lineage view to DeepSeek Harness (DSH). It shows the native fork tree of the current conversation and lets you navigate between parents, sibling branches, and child Sessions.

> [!IMPORTANT]
> **Unofficial community plugin.** This project is not affiliated with or endorsed by DeepSeek. DSH and this plugin are prerelease software; back up important profiles and Session data before upgrading.

This release targets:

- DeepSeek Harness `0.1.0-rc.7`.
- Node.js `^22.19.0 || >=24.0.0`.

## Install

The npm package is precompiled. It runs no local build and does not install a second DSH Client stack into the profile:

The only prerequisites are `dsh` and `pnpm` on `PATH`; `dsh plugin` forwards dependency operations to pnpm inside the profile.

pnpm 11 applies its default [`minimumReleaseAge`](https://pnpm.io/settings/dependency-resolution#minimumreleaseage) guard to releases younger than 24 hours. Pin the verified version so `@next` cannot fall back to an older release during that window:

```sh
dsh plugin --profile web add dsh-session-tree@0.2.0-beta.1
dsh --profile web
```

Open any conversation after installation. A **Branches / 版本树** tab will appear. Restart DSH and reload the browser after installing or updating the plugin.

You can inspect the composed configuration before booting:

```sh
dsh --profile web --dump-config
```

The output should contain one `dsh-session-tree` row.

## Use

1. In **Chat**, find a completed assistant reply.
2. Use DSH's native **Branch into a new conversation / 在新对话中分支** action below that reply.
3. Open the **Branches / 版本树** tab. The child Session appears automatically in the current family.
4. Select any tree node to navigate to that Session.

DSH owns branch creation. This plugin neither duplicates the fork protocol nor maintains a second branch database.

## Core boundary

- Reads native `SessionSummary.parentId` lineage and performs client-side navigation only.
- Appends no Session events, changes no parent pointer, and creates no side store.
- Handles missing parents, lineage cycles, and very large families with bounded, read-only degradation.
- Removing the plugin never deletes or changes a native Session.
- Conversation branching changes later model context only. It does **not** undo file edits, commands, Git state, processes, network requests, or other tool side effects.

## Update and remove

Update to the currently verified release:

```sh
dsh plugin --profile web update dsh-session-tree@0.2.0-beta.1
```

Remove the plugin:

```sh
dsh plugin --profile web remove dsh-session-tree
```

Restart DSH afterward. Removal only drops the view and configuration layer; existing branches remain ordinary DSH Sessions.

## Known limitations

- Public Session summaries do not yet expose the resolved fork boundary, so tree edges cannot show the exact source `seq`.
- Named refs, HEAD, merge, rebase, cherry-pick, branch deletion, and filesystem snapshots are out of scope.
- The current DSH browser plugin roster still requires a restart after install, update, or removal.
- The tree can show only Sessions known to the current client; an unloaded or detached subagent may not be navigable.

## Development

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run verify
pnpm pack --dry-run
```

The browser artifact must use DSH's lazy CommonJS factory format and share the host's React, Cordis, and Client services. Bundle, cyclic-lineage, deep-chain, and large-tree gates remain in place so reducing line count does not weaken loading or failure safety.

## Maintainer and contributor

- Maintainer: [ZhengQingJing](https://github.com/ZhengQingJing)
- Contributor: [ZeXin Lin (@webDrag0n)](https://github.com/webDrag0n)

See [DSH_SESSION_TREE_DESIGN.md](https://github.com/ZhengQingJing/dsh-session-tree/blob/main/docs/DSH_SESSION_TREE_DESIGN.md) for the concise design and safety invariants.
