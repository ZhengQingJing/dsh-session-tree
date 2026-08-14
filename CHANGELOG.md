# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
