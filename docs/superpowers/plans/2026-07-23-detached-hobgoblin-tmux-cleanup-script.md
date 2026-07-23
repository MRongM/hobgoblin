# Detached Hobgoblin tmux Cleanup Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one executable repository script that closes only detached, current-protocol Hobgoblin tmux sessions.

**Architecture:** A Bash script performs server-side detached filtering, shell-side protocol-name validation, and an immediate attached-count recheck before killing by tmux session ID. A Vitest integration test replaces only the external `tmux` executable through `PATH`, exercising the real script without connecting to the user's tmux server.

**Tech Stack:** Bash, tmux format expressions, Node.js process/filesystem APIs, Execa, Vitest.

## Global Constraints

- Match only names satisfying `^hobgoblin-v1-[a-f0-9]{24}$`.
- Never kill a session whose current `session_attached` value is nonzero.
- Never connect tests to the user's real tmux server.
- Treat no server and sessions that disappear during cleanup as successful no-ops.
- Surface all other tmux failures with a nonzero exit.
- Do not add dependencies, application UI, remote cleanup, scheduling, or package scripts.
- Do not commit, push, create branches, or modify unrelated dirty-worktree files.

---

### Task 1: Build the script through red-green TDD

**Files:**

- Create: `src/system/cleanup-detached-hobgoblin-tmux-script.test.ts`
- Create: `scripts/cleanup-detached-hobgoblin-tmux.sh`

**Interfaces:**

- Consumes: `tmux list-sessions`, `tmux display-message`, and `tmux kill-session` from `PATH`.
- Produces: executable command `./scripts/cleanup-detached-hobgoblin-tmux.sh`.

- [x] **Step 1: Write the first failing integration test**

Create a Vitest harness that makes a temporary executable named `tmux`, prepends its directory to `PATH`, records complete argument lists, and runs the real cleanup script with `/bin/bash`. The initial scenario returns:

```text
$1\thobgoblin-v1-0123456789abcdef01234567
$2\tuser-session
```

Add this assertion:

```ts
test('kills detached current-protocol sessions by ID and ignores unrelated sessions', async () => {
  const run = await runScenario('eligible')

  expect(run.result.exitCode).toBe(0)
  expect(run.result.stdout).toContain('Closed hobgoblin-v1-0123456789abcdef01234567 ($1)')
  expect(run.calls).toContain('kill-session -t $1')
  expect(run.calls).not.toContain('kill-session -t $2')
})
```

- [x] **Step 2: Verify RED**

Run `bun run test -- src/system/cleanup-detached-hobgoblin-tmux-script.test.ts`.

Expected: FAIL because `scripts/cleanup-detached-hobgoblin-tmux.sh` does not exist.

- [x] **Step 3: Add the minimal listing, validation, and ID-targeted kill**

Create the Bash script with `set -euo pipefail`, these constants, a tab-delimited read loop, the full-name regex guard, and `tmux kill-session -t "${session_id}"`:

```bash
readonly DETACHED_FILTER='#{==:#{session_attached},0}'
readonly SESSION_FORMAT=$'#{session_id}\t#{session_name}'
readonly HOBGOBLIN_SESSION_PATTERN='^hobgoblin-v1-[a-f0-9]{24}$'
```

Run the focused test. Expected: PASS.

- [x] **Step 4: Add a reattachment race test and verify RED**

```ts
test('skips a detached candidate that becomes attached before cleanup', async () => {
  const run = await runScenario('reattached')

  expect(run.result.exitCode).toBe(0)
  expect(run.result.stdout).toContain('Skipped hobgoblin-v1-89abcdef0123456789abcdef ($3): attached by 1 client(s)')
  expect(run.calls).not.toContain('kill-session -t $3')
})
```

Expected: FAIL because the minimal script kills `$3` without rechecking.

- [x] **Step 5: Recheck the current attached count and verify GREEN**

Use `tmux display-message -p -t "${session_id}" '#{session_attached}'`. Reject non-numeric output, skip values greater than zero with the exact message above, and kill only zero. Run the focused test; both cases must PASS.

- [x] **Step 6: Add a no-server test and verify RED**

```ts
test('treats a missing tmux server as an empty cleanup', async () => {
  const run = await runScenario('no-server')

  expect(run.result.exitCode).toBe(0)
  expect(run.result.stdout).toBe('No detached Hobgoblin tmux sessions.')
})
```

Expected: FAIL because `list-sessions` exits nonzero.

- [x] **Step 7: Handle known no-server output and verify GREEN**

Capture combined list output. Treat only `no server running` or `no sessions` as an empty set; print the same no-op message for an empty successful list or a list with no valid Hobgoblin name. Keep all other list failures nonzero.

- [x] **Step 8: Add stable unexpected-error diagnostics and verify RED/GREEN**

Add a `list-error` scenario returning `Operation not permitted`, then assert exit code 1 and stderr containing both `unable to list detached sessions` and the original error. Verify RED, add one `fail()` helper with prefix `cleanup-detached-hobgoblin-tmux:`, then verify GREEN.

- [x] **Step 9: Add disappearance-race coverage and verify RED/GREEN**

Add one scenario where `display-message` reports `can't find session: $4` and another where `kill-session` reports `can't find session: $5`. Each expects exit zero plus `Skipped <name> (<id>): session no longer exists`. Verify RED, add a focused `is_missing_session_error()` helper, then verify GREEN. Other recheck/kill failures must still use `fail()`.

- [x] **Step 10: Prove direct executability**

Add `await access(scriptPath, constants.X_OK)`. Verify it fails before the mode change, run `chmod +x "scripts/cleanup-detached-hobgoblin-tmux.sh"`, then verify GREEN.

- [x] **Step 11: Refactor only after GREEN**

Remove duplication only when it shortens the script without merging distinct error paths. Rerun the focused test after any refactor.

### Task 2: Verify compatibility and scope

**Files:**

- Verify: `scripts/cleanup-detached-hobgoblin-tmux.sh`
- Verify: `src/system/cleanup-detached-hobgoblin-tmux-script.test.ts`
- Verify: the associated design and plan documents.

**Interfaces:**

- Consumes: repository test, typecheck, architecture, syntax, and formatting commands.
- Produces: fresh verification evidence without running cleanup against the real tmux server.

- [x] **Step 1: Check Bash syntax**

Run `bash -n "scripts/cleanup-detached-hobgoblin-tmux.sh"`. Expected: exit 0 with no output.

- [x] **Step 2: Run focused and project-required checks**

```bash
bun run test -- src/system/cleanup-detached-hobgoblin-tmux-script.test.ts
bun run typecheck
bun run check:architecture
bun run test
```

Expected: all commands exit 0. If a pre-existing dirty-worktree change causes a failure, report it without modifying that file.

- [x] **Step 3: Check formatting for new text files**

```bash
bunx prettier --check \
  "src/system/cleanup-detached-hobgoblin-tmux-script.test.ts" \
  "docs/superpowers/specs/2026-07-23-detached-hobgoblin-tmux-cleanup-script-design.md" \
  "docs/superpowers/plans/2026-07-23-detached-hobgoblin-tmux-cleanup-script.md"
```

Expected: all files use repository formatting. Bash is checked by `bash -n`.

- [x] **Step 4: Audit the scoped diff**

Run `git diff --check`, `git status --short`, and a path-scoped `git diff` for the four task-owned files. Confirm unrelated existing changes remain untouched. Do not execute the cleanup script against the real tmux server.
