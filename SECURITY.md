# Security Policy

## Supported versions

Security fixes are provided for the latest published prerelease. DeepSeek
Harness is currently a developer preview, so compatibility and support may
change between prereleases.

## Reporting a vulnerability

Please report vulnerabilities privately through **GitHub Security Advisories
only**:

1. Open this repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability** and submit a private report.

Include the affected version, impact, reproduction steps or a proof of concept,
and any suggested mitigation. Remove secrets, access tokens, personal data, and
unrelated user content from the report.

Do not disclose an unpatched vulnerability in a public issue, discussion, pull
request, or social channel. If private vulnerability reporting is not available
for the repository, do not post the details publicly; wait for the repository
owner to enable the GitHub Security Advisories reporting channel.

No response or remediation deadline is guaranteed. Maintainers will assess the
report, coordinate disclosure through the private advisory, and publish an
appropriate fix and release notes when possible.

## Security boundary

`dsh-session-tree` only visualizes and navigates lineage already owned by DSH.
It does not create branches, append Session events, modify parent pointers, or
store an independent copy of conversation data. DSH's native Chat UI owns fork
creation and its persistence semantics.

The plugin is not a transaction, sandbox, or rollback mechanism for filesystem
changes, commands, Git state, processes, network requests, messages, payments,
or any other tool or external-system side effect. Reports based only on
expecting those effects to be reverted are outside this project's security
boundary.
