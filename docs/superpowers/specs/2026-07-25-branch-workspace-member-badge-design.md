# Branch Workspace Member Badge Design

**Date:** 2026-07-25  
**Status:** Approved for inline implementation

## Overview

When a repository is viewed inside a configured multi-repository workspace, its ordinary worktree list can also contain worktrees managed as members of branch workspaces. Those rows currently look identical to repository-only worktrees.

Add a neutral `branch workspace` badge to an ordinary worktree row when that exact worktree is a current member of a branch workspace belonging to the active workspace project. Chinese copy is `子工作区`, following the repository terminology in `CONTEXT.md` and `docs/ui-conventions.md`.

## Goals

- Identify branch workspace member worktrees in a workspace repository's ordinary worktree list.
- Render a compact neutral badge beside the branch name and commit hash.
- Derive membership from the existing branch workspace query snapshot.
- Keep the badge current through the existing branch workspace invalidation and refetch path.
- Preserve all branch selection, worktree actions, sorting, terminal indicators, dirtiness indicators, and detached-worktree behavior.

## Non-Goals

- Do not add a server field, persisted flag, or Zustand mirror for membership.
- Do not show the badge when the same repository is opened as a standalone project.
- Do not change the branch workspace member-summary rows.
- Do not make the badge interactive or use it as a navigation control.
- Do not display the owning branch workspace name in the badge.
- Do not change worktree lifecycle or repair behavior.

## Domain And Identity

The existing canonical term **branch workspace member worktree** already describes the worktree being marked. This feature adds presentation for that existing relationship; it does not introduce a new domain concept, so `CONTEXT.md` needs no glossary change.

Membership is identified by both:

1. the configured workspace repository member name mapped from the current `repoId`; and
2. exact equality between the rendered branch worktree path and the member record's `worktreePath`.

Branch names are not identity. A same-named worktree at another path is repository-only and must not receive the badge.

A member whose manifest progress is `removed` is no longer considered current membership. Other non-ready progress states remain durable membership, but a badge can only appear when the repository snapshot also exposes a worktree at the exact intended path.

## Data Flow And Component Boundaries

`BranchList` owns the cross-feature presentation projection because it already owns the collection of ordinary worktree rows.

1. Read the active workspace root with the existing `activeWorkspaceRootId` selector.
2. Resolve the current repository's configured member name from that workspace's `repositoryIds` and `candidates`.
3. Read the existing branch workspace query for the active workspace root. An empty root keeps the query disabled for standalone repositories.
4. Build a set of exact member worktree paths from successful query data, excluding records with `progress === 'removed'`.
5. Pass `branchWorkspaceMember` from `BranchList` through `BranchRow` to `BranchSummaryInline`.

`BranchSummaryInline` remains the sole owner of visible branch-row badges. No server, shared contract, or persistence changes are required.

## Presentation

- Add a dedicated translation key: `workspace.branch-workspace.member-badge`.
- Copy:
  - English: `branch workspace`
  - Chinese: `子工作区`
  - Japanese: `ブランチワークスペース`
  - Korean: `브랜치 워크스페이스`
- Render an `outline` badge after the branch name and optional commit hash, before terminal and Git status indicators.
- Keep the badge compact, neutral, non-interactive, and free of a duplicate icon; the row already uses the worktree icon.
- Add the same localized label to the row tooltip context.
- Do not render the badge for a branch without a worktree even if a caller supplies the flag incorrectly.

## Loading, Errors, And Edge Cases

- Successful cached data remains visible while the existing query refetches.
- Pending or failed reads without successful data fail closed and show no membership badge.
- A path mismatch shows no badge, including member drift where the target branch is checked out elsewhere.
- A `removed` member record shows no badge during an incomplete reduction or removal.
- Non-ready but still registered members may show the badge only when the exact intended worktree is present in repository data.
- Duplicate registry records collapse to one badge because membership is projected as a path set.
- Standalone project activation shows no badge even if the same repository also belongs to an open workspace project.
- Detached worktrees are outside `BranchRow` and remain unchanged.

## Testing

Use test-driven development in three focused cycles:

1. Add dictionary assertions for the dedicated badge copy, watch them fail, then add all four translations.
2. Add a `BranchRow` presentation test, watch it fail, then thread the explicit flag into `BranchSummaryInline` and render the neutral badge.
3. Add `BranchList` integration tests for exact active-workspace membership and standalone/path-mismatch exclusions, watch them fail, then derive membership from the existing query snapshot.

After focused tests pass, run:

```text
bun run typecheck
bun run check:architecture
bun run test
```

The pre-change full-suite baseline on 2026-07-25 was `3352/3354` tests passing, with unrelated timeouts in `src/server/app-factory.test.ts` and `src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx`. Final verification must distinguish those known baseline failures from regressions and rerun the affected focused tests independently.

## Grill Decisions

- **Source of truth:** Existing server-owned branch workspace snapshots; no duplicate client state.
- **Identity:** Repository member name plus exact worktree path, never branch name alone.
- **Scope:** Only the currently active multi-repository workspace project.
- **Lifecycle:** Exclude `removed`; retain durable non-ready membership when the exact worktree exists.
- **Failure mode:** Fail closed when no successful snapshot exists.
- **Copy:** Use the short categorical label `branch workspace` / `子工作区`, not the longer `member worktree` and not a variable workspace name.
- **Architecture:** Renderer-only read projection and presentation; no new backend or realtime path.

No ADR is warranted: the choice is local, reversible, and follows existing state ownership rules.

## Engineering Principles

- **KISS:** Derive one boolean at the list boundary and render one existing badge primitive.
- **YAGNI:** No configuration, navigation behavior, new API, or persisted membership flag.
- **DRY:** Reuse branch workspace query data and invalidation rather than copying membership into repository state.
- **SOLID:** `BranchList` owns collection-level membership projection; `BranchSummaryInline` owns row-summary presentation.
