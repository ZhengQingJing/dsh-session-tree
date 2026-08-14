# Contributing

Thank you for helping improve `dsh-session-tree`.

## Before opening a change

- Use a GitHub issue for reproducible bugs, compatibility proposals, and
  substantial design changes.
- Use GitHub Security Advisories, not public issues, for vulnerabilities; see
  [SECURITY.md](./SECURITY.md).
- Keep changes compatible with the DSH versions declared in `package.json`.
- Do not weaken the immutable-parent model or imply that conversation branches
  roll back workspace or external side effects.

## Development setup

Use a supported Node.js version and the pnpm version recorded in
`package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm run verify
pnpm run pack:check
```

Dependencies are installed with lifecycle scripts disabled in CI. Project
builds and package checks run explicitly afterward.

## Pull requests

1. Create a focused branch from the current default branch.
2. Add or update tests for behavior changes.
3. Update both Chinese and English documentation when user-visible behavior
   changes.
4. Add a concise entry under `Unreleased` in [CHANGELOG.md](./CHANGELOG.md).
5. Run `pnpm run verify` and `pnpm run pack:check`.
6. Describe the motivation, user-visible behavior, safety implications, and
   validation performed in the pull request.

Avoid unrelated formatting, generated artifacts, dependency upgrades, or
lockfile changes in the same pull request. Never include credentials, real
conversation logs, or other private data in tests or fixtures.

## Code and test expectations

- Prefer public DSH APIs over internal state or undocumented persistence
  formats.
- Treat malformed lineage data as untrusted input and fail soft without
  rewriting durable session records.
- Do not automatically retry an ambiguous fork result.
- Preserve bounded rendering and iterative tree traversal for large histories.
- Keep browser bundles isolated from duplicate React, Cordis, and DSH runtime
  instances.

By submitting a contribution, you agree that it may be distributed under the
project's [MIT License](./LICENSE).
