# Project list change-count badge (design)

Date: 2026-07-23
Status: approved (user confirmed the aggregation scope and authorized autonomous execution)

## Problem

Project rows in the sidebar project list show aggregate terminal state but do
not show aggregate Git changes. Users need a single change-count badge after
each project name so they can compare project dirtiness without opening each
project.

## Aggregation contract

- An ordinary Git project sums `status.entries.length` across all of its
  worktrees.
- A multi-repository workspace sums the same value across every configured
  member repository and all of their worktrees.
- A plain workspace without Git repository members has a count of zero.
- A zero count does not render a badge.

The count uses the renderer's existing runtime-coherent repo projection. It
does not introduce a persisted value, a server endpoint, or a second source of
truth.

## Considered approaches

1. Extend `ProjectSummary` in `useProjectSummaries` with `changeCount`
   (selected). This keeps membership lookup and aggregation in one shared read
   projection and gives every consumer a stable summary.
2. Subscribe to `useReposStore` independently from every project row. This
   avoids changing `ProjectSummary`, but duplicates project-membership logic
   and creates one additional subscription per row.
3. Add an aggregate field to the server snapshot. This makes the value
   explicit across clients, but duplicates a value already derivable from the
   runtime-coherent status projection and expands the contract unnecessarily.

## Design

`useProjectSummaries` will sum the known status entries for the root project
and its configured member repositories, expose the result as required
`ProjectSummary.changeCount`, and include the number in
`projectSummariesEqual` so status refreshes trigger consumers.

`SidebarProjectList` will render the existing attention-style change badge
immediately after the project name and before terminal status. It will reuse
the established `GitCompareArrows` icon, compact badge classes, and
`branch-status.worktree-dirty` accessible label used by workspace repository
and branch-workspace rows.

The focus-mode dropdown and collapsed project header remain unchanged; this
request targets the inline sidebar project list.

## Verification

- Prove the summary selector accumulates multiple worktrees and multiple
  configured member repositories.
- Prove project rows render the accumulated number and omit the badge at zero.
- Run the project switcher/list tests, typecheck, architecture check, and the
  complete test suite.

## Out of scope

- Persisting aggregate counts.
- Triggering additional status refreshes.
- Adding the badge to the collapsed header or focus-mode dropdown.
- Changing existing terminal badges or per-repository badges.
