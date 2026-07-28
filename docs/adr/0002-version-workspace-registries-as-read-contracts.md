---
status: superseded by ADR-0003
---

# Version workspace registries as cross-client read contracts

Hobgoblin treats the versioned JSON shapes in `workspace-configs.json` and `branch-workspaces.json` as cross-client read contracts so Android can present the server-owned workspace catalog over SSH even when no Hobgoblin server process is running. The server remains the only writer; Android reads version 1, ignores unknown additive fields, strictly validates required identities, paths, and relationships, and fails closed without guessing, repairing, or writing when a version or record is invalid.

## Considered options

Requiring the server API would make Android workspace access depend on a running remote process. Reconstructing membership from the filesystem would lose configured order, lifecycle intent, and branch-workspace identity. Reading undocumented internal files would create the same coupling without an explicit compatibility obligation, so the persisted formats are promoted to narrow, versioned read contracts instead.

## Consequences

Format changes require an explicit version and compatibility decision. TypeScript and Kotlin contract tests must exercise shared privacy-safe fixtures, while all workspace and branch-workspace mutations remain server-owned.
