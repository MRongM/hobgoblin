# Managed tmux Mouse Scroll Implementation Plan

> **For agentic workers:** Execute inline in this session. Do not create subagents, commits, branches, or network operations.

**Goal:** Enable tmux mouse handling whenever Hobgoblin creates or attaches to a managed tmux session.

**Architecture:** Extend the existing local and remote tmux attach-or-create shell commands with a second command in the same tmux command queue. Apply `mouse on` only to the exact deterministic Hobgoblin session; keep native-shell fallbacks and non-tmux launches unchanged.

**Tech Stack:** TypeScript 6 strip-only mode, Vitest, POSIX shell, tmux.

## Global Constraints

- Use repo-alias imports with explicit `.ts` extensions.
- Do not introduce enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Keep `new-session -A` attach-or-create semantics and native-shell fallback behavior unchanged.
- Set `mouse on` only on the exact target session; do not use `-g` or modify `~/.tmux.conf`.
- Do not alter renderer wheel handling, tmux key bindings, or `history-limit`.
- Do not commit or push without explicit confirmation.

---

### Task 1: Add session-scoped mouse enablement to tmux startup

**Files:**

- Modify: `src/system/local-terminal.test.ts`
- Modify: `src/system/remote-terminal.test.ts`
- Modify: `src/system/local-terminal.ts`
- Modify: `src/system/remote-terminal.ts`

**Interfaces:**

- Consumes: the existing deterministic session name returned by `buildTmuxSessionName`.
- Produces: local and SSH scripts containing `tmux new-session -A ... \\; set-option -t '=<session-name>:' mouse on` when `useTmux` is `true`.

- [x] **Step 1: Write failing local and remote invocation assertions**

  Extend each tmux-enabled builder test with an assertion for the full command queue:

  ```ts
  expect(invocation?.script).toContain(
    "exec tmux new-session -A -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature' \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on",
  )
  expect(invocation?.script).not.toContain('set-option -g')
  ```

  Preserve the existing disabled-tmux assertion that the script contains no tmux command.

- [x] **Step 2: Run focused tests and confirm RED**

  Run:

  ```sh
  bun run test src/system/local-terminal.test.ts src/system/remote-terminal.test.ts
  ```

  Expected: the new full-command assertions fail because the generated scripts stop after `new-session -A`.

- [x] **Step 3: Implement the minimal command-queue change**

  In both builders, append the escaped tmux command separator and exact-target session option to the existing `exec tmux` line:

  ```ts
  `  exec tmux new-session -A -s ${shellQuote(sessionName)} -c ${shellQuote(workingDirectory)} \\; set-option -t ${shellQuote(`=${sessionName}:`)} mouse on`
  ```

  Use the local descriptor working directory in `local-terminal.ts` and the remote target working directory in `remote-terminal.ts`. Do not add a shared abstraction solely for these two existing parallel command builders.

- [x] **Step 4: Re-run focused tests and confirm GREEN**

  Run:

  ```sh
  bun run test src/system/local-terminal.test.ts src/system/remote-terminal.test.ts
  ```

  Expected: both test files pass.

- [x] **Step 5: Verify all project gates**

  Run:

  ```sh
  bun run typecheck
  bun run test
  bun run check:architecture
  git diff --check
  ```

  Expected: every command exits successfully. Review the final diff and leave all changes uncommitted.
