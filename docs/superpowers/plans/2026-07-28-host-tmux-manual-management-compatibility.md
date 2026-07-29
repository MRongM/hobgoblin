# Host tmux Manual Management Compatibility Plan

**Goal:** Align desktop host inventory with Android so every operationally valid Hobgoblin tmux session on the authenticated user's exact sockets can be manually inspected and closed without project-root metadata.

**Architecture:** Keep UID/socket discovery and exact-origin approvals unchanged. Remove project root from the host row contract and list format, validate Android-compatible operational metadata, preserve same-named rows on distinct origins, and re-list before close.

## Constraints

- Do not weaken exact login UID, socket/server-name, current session-name, normalized path, numeric metadata, or close-time revalidation checks.
- Do not include ordinary tmux sessions or legacy `goblin-*` names.
- Do not add persistence, polling, or package dependencies.
- Execute inline without Git commits or branch operations.

## Tasks

- [x] Add failing system and server tests proving sessions without `@hobgoblin_project_root` are listed and exact cross-origin duplicates remain independent.
- [x] Remove project root from host list output and shared host record contracts; validate only Android-compatible operational fields.
- [x] Remove project-root presentation and unused localized copy from the host dialog.
- [x] Update protocol/domain documentation and affected tests.
- [x] Move the compact topbar's project Tab behind its actions while preserving native horizontal scrolling.
- [x] Run focused tests, typecheck, full tests, architecture, formatting, and diff checks.
