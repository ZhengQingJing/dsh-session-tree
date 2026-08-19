# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-beta.1] - 2026-08-19

### Changed

- Target DeepSeek Harness `0.1.0-rc.7` and preserve the Host-provided Session
  ordering when projecting lineage.
- Reduce the product to one read-only **Branches** view for the current Session
  family. DSH Chat now owns all completed-turn branch creation.
- Bound large-family rendering around the current node while keeping orphaned
  and cyclic lineage visible without modifying durable records.
- Mark DSH, Cordis, and React peers as host-provided optional peers so installing
  the precompiled plugin does not pull a second DSH Client dependency graph into
  the profile.
- Trim the published artifact to runtime files, declarations, bilingual READMEs,
  license, changelog, and the bundle patch; the design document remains in the
  source repository.
- Serialize CSS module exports deterministically and require two byte-identical
  package builds before release, preserving digest-based workflow recovery.

### Removed

- The duplicate completed-turn checkpoint browser, history pagination, custom
  `sessions.fork()` call, fork mutex, and uncertain-outcome workflow.
- The runtime dependency on DSH UI primitives and the unused `react-dom` peer.
- Compatibility declarations for DSH rc.5 and rc.6.

### Security

- The plugin performs no Session mutation, event append, parent update, title
  change, or side-store write. Its only action is navigation through native DSH
  Session APIs.
- Branch creation and its failure semantics remain entirely inside DSH's native
  Chat implementation.

## [0.1.0-beta.2] - 2026-08-14

### Added

- One-command installation and updates through the npm `next` channel.
- Tokenless npm releases from GitHub Actions through Trusted Publishing, OIDC,
  and automatically generated provenance attestations.

### Changed

- The release workflow now transfers one verified archive between isolated
  verification and publishing jobs, checks npm registry digests before and
  after publishing, and keeps GitHub releases as drafts until npm succeeds.
- Chinese and English installation guidance now recommends the precompiled npm
  package while retaining checksum-verifiable GitHub Release artifacts.

### Security

- Release retries accept an existing npm version only when its SHA-1 and
  SHA-512 integrity values match the locally verified archive exactly.
- npm publishing uses short-lived GitHub OIDC credentials; no npm token is
  stored in GitHub Secrets.

## [0.1.0-beta.1] - 2026-08-14

### Added

- Initial public beta of the Git-like session tree for DeepSeek Harness.
- Immutable branching from loaded, completed `turn/end` checkpoints through the
  native DSH session fork API.
- Lineage visualization for root sessions, forks, and subagents, with fail-soft
  handling of orphaned, duplicate, or cyclic records.
- Bounded rendering, history pagination, and an in-view mutex that prevents
  accidental duplicate fork submissions.
- Chinese and English user interfaces, safety notices, documentation, tests,
  build verification, and distributable DSH plugin artifacts.

### Security

- Conversation branching never claims to roll back files, commands, processes,
  network requests, or other external side effects.
- Ambiguous or partially successful fork requests are not retried automatically.

### Contributors

- ZeXin Lin ([@webDrag0n](https://github.com/webDrag0n))
