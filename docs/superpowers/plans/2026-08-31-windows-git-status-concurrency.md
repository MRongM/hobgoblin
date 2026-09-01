# Windows Git Status Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute inline in the current worktree; do not delegate to subagents.

**Goal:** Bound Hobgoblin's process-wide worktree-status command concurrency so multi-repository refreshes cannot create an unbounded native Git/WSL/SSH process burst on Windows.

**Architecture:** Add one process-local status-read scheduler in `src/system/git/concurrency.ts`, using the existing `p-queue` dependency. Route only status-producing local and remote command paths through it. Keep per-repository lanes, write/network commands, payloads, state ownership, and realtime behavior unchanged.

**Tech Stack:** TypeScript in Node.js strip-only mode, Bun, Vitest, `p-queue` 9.3.0, native Git, WSL/SSH command runners

## Global Constraints

- Work inline in the current worktree; do not use subagents or a new worktree.
- Preserve every unrelated user-owned working-tree change; stage and commit only the files named by the active task.
- Use repo-alias imports with explicit `.ts` extensions.
- Do not add a package or setting; `p-queue` is already pinned.
- Limit status-read commands to 8 on Windows and 16 elsewhere.
- Keep Git writes and network operations outside the queue.
- Treat `R6016` as a risk mitigated by bounding process bursts, not as a proven single-cause diagnosis.
- The named `.claude/skills/grill-with-docs/SKILL.md` is absent. The plan has instead been checked directly against `docs/arch.md`, `docs/layering.md`, `docs/state-sync.md`, and `docs/realtime.md`.

---

### Task 1: Add the process-wide status-read scheduler

**Files:**

- Create: `src/system/git/concurrency.test.ts`
- Modify: `src/system/git/concurrency.ts`

**Interfaces:**

- Produces: `gitStatusReadConcurrency(platform)`, `createGitStatusReadScheduler(concurrency)`, and `scheduleGitStatusRead(task, options)`.
- Preserves: existing `mapWithConcurrency` behavior and signature.

- [ ] Create `concurrency.test.ts` with RED tests for platform limits, a hard active-task ceiling, aborting a queued task, and releasing a slot after rejection. Use a manually controlled promise gate rather than timing-dependent sleeps.

```ts
expect(gitStatusReadConcurrency('win32')).toBe(8)
expect(gitStatusReadConcurrency('linux')).toBe(16)

const scheduler = createGitStatusReadScheduler(2)
const tasks = Array.from({ length: 5 }, () =>
  scheduler.schedule(async () => {
    started += 1
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await gate
    active -= 1
  }),
)
await vi.waitFor(() => expect(started).toBe(2))
expect(maximumActive).toBe(2)
```

- [ ] Run `bun run test -- src/system/git/concurrency.test.ts` and verify it fails because the scheduler exports do not exist.
- [ ] Add `PQueue` and implement a small scheduler object. Pass the caller's signal to `queue.add` so cancellation removes a waiting task.

```ts
export function gitStatusReadConcurrency(platform: NodeJS.Platform): number {
  return platform === 'win32' ? 8 : 16
}

export function createGitStatusReadScheduler(concurrency: number): GitStatusReadScheduler {
  const queue = new PQueue({ concurrency })
  return {
    async schedule<T>(task: () => Promise<T>, options: { signal?: AbortSignal } = {}): Promise<T> {
      return await queue.add(task, { signal: options.signal })
    },
  }
}
```

- [ ] Create one module-level scheduler with `process.platform` and expose `scheduleGitStatusRead` as its production entry point.
- [ ] Re-run the focused test and confirm all scheduler tests pass.
- [ ] Commit only Task 1 files with `git commit -m "feat: add Git status read scheduler"`.

### Task 2: Route local status refreshes and snapshots through the scheduler

**Files:**

- Create: `src/system/git/status.test.ts`
- Modify: `src/system/git/status.ts`
- Modify: `src/system/git/worktrees.test.ts`
- Modify: `src/system/git/worktrees.ts`

**Interfaces:**

- Consumes: `scheduleGitStatusRead` from Task 1.
- Preserves: `getWorkingStatus`, `getWorktreeStatusEntries`, and `getWorktrees` result/error contracts.

- [ ] Add a scheduler spy that immediately executes its callback while recording each scheduled command.

```ts
const scheduleGitStatusReadMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/concurrency.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/concurrency.ts')>('#/system/git/concurrency.ts')
  return { ...actual, scheduleGitStatusRead: scheduleGitStatusReadMock }
})
```

- [ ] In the new `status.test.ts`, add RED tests proving a direct single-worktree status is scheduled once and a working-status read schedules the worktree list plus every non-bare worktree status.
- [ ] In `worktrees.test.ts`, add RED assertions proving `includeStatus: true` schedules the list and status commands while `includeStatus: false` performs the lightweight list directly.
- [ ] Run `bun run test -- src/system/git/status.test.ts src/system/git/worktrees.test.ts` and verify the scheduler assertions fail against current production code.
- [ ] Wrap the command invocation—not parsing or result handling—in `status.ts`.

```ts
const output = await scheduleGitStatusRead(
  async () => await git(cwd, ['status', '--porcelain', '-z'], { signal: options?.signal }),
  { signal: options?.signal },
)
```

- [ ] In `worktrees.ts`, compute `includeStatus = options?.includeStatus !== false`. Schedule its worktree list only when `includeStatus` is true, return directly for lightweight lists, and schedule each status decoration command. Preserve `throwOnError` and abort translation.
- [ ] Re-run both focused tests and confirm they pass.
- [ ] Commit only Task 2 files with `git commit -m "fix: bound local Git status concurrency"`.

### Task 3: Route WSL and SSH status reads through the same scheduler

**Files:**

- Modify: `src/system/ssh/git.test.ts`
- Modify: `src/system/ssh/git.ts`

**Interfaces:**

- Consumes: the same `scheduleGitStatusRead` singleton as local Git.
- Preserves: injected `RemoteGitRunner`, parsed status payloads, lightweight snapshots, and cancellation result shapes.

- [ ] Add the same passthrough scheduler spy to `git.test.ts` and reset its implementation in `beforeEach`.
- [ ] Add RED assertions for these paths:
  - direct `getRemoteWorktreeStatusEntries` schedules one status command;
  - `getRemoteStatus` schedules its worktree list and every status command;
  - a status-inclusive `getRemoteSnapshot` schedules its worktree list and statuses;
  - a lightweight snapshot with `includeWorktreeStatus: false` does not schedule its worktree list.
- [ ] Run `bun run test -- src/system/ssh/git.test.ts` and verify the new scheduler assertions fail.
- [ ] Import `scheduleGitStatusRead` directly from the canonical system module and wrap the corresponding `run({ type: 'gitWorktreeList' | 'gitStatus' ... })` calls.

```ts
const status = await scheduleGitStatusRead(
  async () => await run({ type: 'gitStatus', path: worktree.path }, target, { signal: options.signal }),
  { signal: options.signal },
)
```

- [ ] Catch queue cancellation only where needed to preserve the existing `[]`/`null` cancellation contracts; rethrow non-cancellation runner failures. Correct the existing `mapWithConcurrency` calls to pass `{ signal: options.signal }` rather than the signal object itself.
- [ ] Keep remote worktree lists direct when `includeStatus` is false so write-safety and lightweight reads are not delayed behind a status fan-out.
- [ ] Re-run the focused SSH Git test and confirm it passes.
- [ ] Commit only Task 3 files with `git commit -m "fix: bound remote Git status concurrency"`.

### Task 4: Verify behavior, architecture, and diff hygiene

**Files:**

- Review: `src/system/git/concurrency.ts`
- Review: `src/system/git/status.ts`
- Review: `src/system/git/worktrees.ts`
- Review: `src/system/ssh/git.ts`
- Review: all tests and planning documents added by this plan

**Interfaces:**

- Produces: fresh evidence that the global cap works without changing architecture or unrelated code.

- [ ] Run all focused tests:

```powershell
bun run test -- src/system/git/concurrency.test.ts src/system/git/status.test.ts src/system/git/worktrees.test.ts src/system/ssh/git.test.ts
```

- [ ] Run `bun run typecheck` and fix any strip-only TypeScript or signature issue.
- [ ] Run `bun run check:architecture` and verify all enforced boundaries remain green.
- [ ] Run `bun run test` and record the exact file/test totals.
- [ ] Run `git diff --check`.
- [ ] Review `git status --short`, `git diff --stat`, and the task commits. Confirm unrelated user edits were neither modified nor staged.
- [ ] If verification requires a code correction, add a failing regression test first when practical, make the minimum fix, rerun the affected focused test, and commit the correction atomically.

## Manual Architecture Grill Result

- `src/system/git/concurrency.ts` is the narrowest common owner for native local and remote Git status resource limits.
- A renderer-only cap fails because initial snapshots, direct worktree reads, remote callers, and multiple connected clients can bypass it.
- A queue around every Git command is too broad because background reads could delay commit/pull/push flows.
- A status-only process-wide scheduler changes timing but not domain state, protocol payloads, invalidation, or UI ownership.
- Conditional scheduling of snapshot worktree lists prevents status fan-out while keeping write-safety `includeStatus: false` reads responsive.
- The same `AbortSignal` must cover both queue waiting and the eventual native command.

## Self-Review

- Spec coverage: scheduled refresh, initial snapshot, direct worktree status, local Git, WSL/SSH, cancellation, and non-goals each map to explicit tasks.
- Placeholder scan: no TODO, deferred choice, or unspecified implementation path remains.
- Type consistency: all new imports are canonical alias imports ending in `.ts`; no unsupported enum, namespace, parameter property, or import alias is introduced.
- Safety: no destructive Git operation is added or queued; existing write and network lanes are untouched.
