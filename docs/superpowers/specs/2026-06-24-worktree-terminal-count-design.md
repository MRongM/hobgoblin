# Worktree Terminal Count Design

## Goal

Show how many terminal sessions are currently open for each worktree in the branch list / worktree list, so users can tell at a glance whether a worktree already has active terminal activity.

## Scope

In scope:

- Add a compact terminal count badge to `BranchSummaryInline` for branches that have a worktree path.
- Count all open terminal sessions for that worktree, not just visible or focused ones.
- Reuse the existing terminal read context and worktree snapshot data.
- Keep the current unread terminal bell indicator behavior unchanged.
- Preserve the existing branch name, worktree path, dirty state, sync state, and commit metadata layout.

Out of scope:

- Changes to terminal session creation, lifecycle, or storage.
- Changes to terminal tab counts or repo tab badges.
- Changes to the worktree key format.
- Changes to bell notification semantics.
- Any new settings, filters, or user preferences for count formatting.

## Architecture

The cleanest boundary is the existing branch summary view model:

- `src/web/components/repo-workspace/BranchSummaryInline.tsx`
  - Owns the visible worktree row content.
  - Derives the worktree terminal key from `repo.id` and `branch.worktree.path`.
  - Reads the count through the existing terminal read hook.
  - Renders the new count badge only when the count is greater than zero.
- `src/web/components/terminal/terminal-session-store.ts`
  - Already exposes `useWorktreeTerminalCount(worktreeTerminalKey)`.
  - No API changes are required.

This keeps the implementation narrow. The branch list does not need a new selector, and the terminal subsystem does not need to know about the new UI signal.

## Data Flow

1. `BranchSummaryInline` checks whether the branch has `worktree?.path`.
2. If it does, it builds `worktreeTerminalKey(repo.id, branch.worktree.path)`.
3. It calls `useWorktreeTerminalCount(worktreeTerminalKey)`.
4. The hook subscribes to the existing terminal read context and returns the current session count for that worktree.
5. The UI renders a small count badge only when the value is `> 0`.

If the branch has no worktree path, the component renders nothing extra.

## Display Rules

- Show the count next to the branch name, in the same row as the existing terminal bell marker.
- Use a compact numeric badge, not a long text label.
- Display `1` as `1`, not `1 terminal`.
- Display `2+` as the numeric count only.
- Hide the badge when the count is `0`.
- Keep the existing unread bell marker visible when present.
- Do not change the worktree path line or the lower metadata line.

The count badge should read as a neutral density signal, not a status warning.

## Error Handling

No new error states are introduced.

- If there is no worktree path, the badge is omitted.
- If the terminal read context is unavailable, the existing hook behavior remains the source of truth for that layer.
- If a worktree has no open sessions, the badge is omitted.

The implementation should not add fallback parsing or guesswork around session counts. It should only consume the existing snapshot count.

## Testing

Add focused coverage for the row boundary:

- `BranchSummaryInline` renders no terminal count badge when the worktree count is `0`.
- `BranchSummaryInline` renders the count badge when the worktree count is greater than `0`.
- The badge appears only for branches with a worktree path.
- The existing unread bell marker still renders alongside the count badge.
- `BranchRow` / `BranchList` tests continue to verify worktree rows, path display, and compact layout behavior, including the new count badge.

The test surface should stay at the presentation layer. The hook and terminal session store already have the right responsibility for session counting.

## Verification

Run:

```bash
bun run test src/web/components/branch-list/BranchRow.test.tsx src/web/components/BranchList.test.tsx
bun run typecheck
```

## Notes

This design intentionally keeps the count model aligned with the current terminal registry:

- A count reflects all open sessions in a worktree.
- It does not try to distinguish active, hidden, or detached visual states.
- It does not change how bell markers work.

That keeps the UI signal simple and consistent with the rest of the workspace.
