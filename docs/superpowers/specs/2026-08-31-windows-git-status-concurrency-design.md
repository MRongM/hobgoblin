# Windows Git Status Concurrency Design

## Problem

On Windows, Hobgoblin can refresh many repositories and worktrees at the same time. A scheduled refresh starts every open repository concurrently, while each repository can also start many native `git status` processes. Initial snapshots perform a similar worktree-status fan-out. WSL and SSH repositories add wrapper processes on top of Git.

This process burst is a credible indirect trigger for the MSVC runtime error `R6016 - not enough space for thread data`. It is not proof that Git is the only possible cause, so the change should bound the known burst without claiming to diagnose every occurrence.

## Goal

Put a process-wide upper bound on native commands that belong to worktree status reads, across repositories, clients, and local/WSL/SSH backends. Preserve existing per-repository lanes and do not serialize Git writes or network operations.

## Selected Design

Add a small process-local scheduler to `src/system/git/concurrency.ts`, backed by the existing `p-queue` dependency.

- Windows limit: 8 active status-read commands.
- Other platforms: 16 active status-read commands.
- The platform-to-limit decision is a pure exported function.
- A scheduler factory is exported for deterministic unit tests.
- A module-level scheduler supplies the production `scheduleGitStatusRead` function.
- An optional `AbortSignal` is passed to the queue so a request cancelled while waiting is removed before it starts. Running commands continue to receive the same signal through their existing command options.

This scheduler is ephemeral server-process state. It is not persisted, exposed through Zustand, synchronized to clients, or added as a user setting.

## Covered Command Paths

The shared scheduler wraps only commands that participate in a worktree-status read:

- `src/system/git/status.ts`
  - `git worktree list` in `getWorkingStatus`.
  - `git status --porcelain -z` in `getWorktreeStatusEntries`, including direct single-worktree reads.
- `src/system/git/worktrees.ts`
  - `git worktree list` when status is included in a snapshot.
  - Each `git status --porcelain -z` used to decorate snapshot worktrees.
  - A list with `includeStatus: false` stays outside the queue because it does not create a status fan-out and is often used by write-safety checks.
- `src/system/ssh/git.ts`
  - Remote worktree listing and status commands in `getRemoteStatus`.
  - Remote worktree listing and status commands in `getRemoteWorktrees` only when `includeStatus` is true.
  - Direct `getRemoteWorktreeStatusEntries` reads.

The same queue is shared by native Git, WSL, and SSH command runners, so wrapper processes count against one host-wide budget.

## Explicit Non-goals

- Do not change the two-minute refresh interval.
- Do not add a renderer-only repository cap; other clients and snapshot refreshes would bypass it.
- Do not queue commit, checkout, merge, fetch, pull, push, clone, or other writes/network operations.
- Do not add retries, persistence, telemetry, or a new setting.
- Do not change response payloads, realtime invalidation, store ownership, or UI behavior.
- Do not claim the queue proves or fixes every possible source of `R6016`.

## Error and Cancellation Behavior

Command-level error handling remains unchanged. The queue only delays task start.

- If an already queued request is aborted, `p-queue` rejects it with an abort error and does not run it.
- Existing callers already translate failures or aborted signals to `[]`, `null`, `undefined`, or `cancelled` as appropriate.
- A task rejection releases its queue slot so later status reads continue.

## Tests

1. Unit-test platform limits, maximum active tasks, queued cancellation, and slot release after rejection.
2. Add local status tests proving worktree listing and each status command go through the scheduler.
3. Extend snapshot tests to prove status-inclusive reads are scheduled and `includeStatus: false` lists remain direct.
4. Extend remote Git tests to prove direct status, status refresh, and status-inclusive snapshots use the shared scheduler while lightweight worktree lists remain direct.
5. Run targeted tests, type checking, the full test suite, and the architecture guard.

## Architecture Review

- Ownership: native Git/SSH resource coordination belongs in `src/system/**`, not renderer state.
- Layering: the change does not introduce imports from server/shared code into web or Electron into system/shared code.
- State: the queue is short-lived process coordination, not restorable or coherent application state.
- Realtime: no protocol or invalidation change is required because output semantics are unchanged.
- Safety: writes remain outside the queue, and queued reads retain cancellation.

## Success Criteria

On Windows, no more than eight native worktree-status commands started through these paths can be active in one Hobgoblin server process, regardless of repository count or worktree fan-out. Existing results and cancellation semantics remain compatible, and all verification commands pass.
