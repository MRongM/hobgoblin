# Unified Tmux Session Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every eligible local and SSH internal terminal, plus built-in and third-party external terminal applications, derive and reuse the same deterministic `hobgoblin-v1-*` tmux session.

**Architecture:** Add one pure system identity module that normalizes a public descriptor and hashes its NUL-delimited fields. Terminal catalog orchestration resolves authorized canonical descriptors, while focused local/SSH and native-terminal adapters only construct invocations from that identity. Settings remain server-owned and migrate the remote-only preference to a global internal-terminal preference.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Bun 1.3, Vitest, node-pty, Hono, React 19, tmux, SSH, macOS Terminal/Ghostty adapters.

## Global Constraints

- Use `hobgoblin-v1-<24 lowercase hexadecimal characters>` and ignore all legacy `goblin-*` sessions.
- Hash exactly four UTF-8 fields joined by one `0x00`: protocol marker, normalized project root, normalized working directory, and canonical positive terminal number.
- Normalize POSIX paths lexically; do not call `realpath`, resolve symlinks, case-fold, or normalize Unicode.
- Exclude SSH endpoint, alias, branch name, display name, and ephemeral PTY IDs from identity.
- Use `tmux new-session -A`; never force-detach, kill, rename, or garbage-collect sessions.
- Fall back only when tmux is absent; surface failures from a detected tmux executable.
- Keep Node strip-only compatibility: no enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not add dependencies, branches, commits, pushes, or destructive Git actions.
- Preserve unrelated user changes in the worktree.

---

### Task 1: Deterministic tmux identity module

**Files:**

- Create: `src/system/tmux-session.ts`
- Create: `src/system/tmux-session.test.ts`
- Create: `docs/terminal-tmux-protocol.md`

**Interfaces:**

- Produces: `TmuxSessionDescriptor`, `normalizeTmuxSessionDescriptor(input): TmuxSessionDescriptor | null`, and `buildTmuxSessionName(input): string | null`.
- Consumes: only `node:crypto` and `node:path`; no settings, process, filesystem, or transport state.

- [ ] **Step 1: Write failing identity tests**

Add tests for the approved reference vector, stable lexical normalization, transport-independent inputs, logical symlink-path distinction, unsafe input rejection, and exact name syntax:

```ts
expect(
  buildTmuxSessionName({
    projectRoot: '/srv/projects/example',
    workingDirectory: '/srv/projects/example/worktrees/feature',
    terminalNumber: 1,
  }),
).toBe('hobgoblin-v1-aebf050981ac829e36100020')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/system/tmux-session.test.ts`

Expected: FAIL because `#/system/tmux-session.ts` does not exist.

- [ ] **Step 3: Implement the pure identity interface**

Normalize with `path.posix.normalize`, validate absolute/control-free paths and a safe positive integer, join fields with `String.fromCharCode(0)`, hash with SHA-256, and return the approved prefix. Keep normalized output immutable by construction:

```ts
export interface TmuxSessionDescriptor {
  projectRoot: string
  workingDirectory: string
  terminalNumber: number
}

export function normalizeTmuxSessionDescriptor(input: TmuxSessionDescriptor): TmuxSessionDescriptor | null
export function buildTmuxSessionName(input: TmuxSessionDescriptor): string | null
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test src/system/tmux-session.test.ts`

Expected: all identity tests PASS.

- [ ] **Step 5: Write the public protocol document**

Document the exact four fields, path rules, NUL-byte serialization, SHA-256 truncation, approved reference vector, and language-neutral attach/create command. State explicitly that the name is not an authorization secret.

### Task 2: Shared local and SSH invocation construction

**Files:**

- Create: `src/system/local-terminal.ts`
- Create: `src/system/local-terminal.test.ts`
- Modify: `src/system/remote-terminal.ts`
- Modify: `src/system/remote-terminal.test.ts`
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`

**Interfaces:**

- Consumes: `buildTmuxSessionName()` from Task 1.
- Produces: `buildManagedLocalTerminalInvocation(target, options)` and transport-specific remote invocation builders whose target contains `projectRoot`, `workingDirectory`, and `terminalNumber`.

- [ ] **Step 1: Write failing local and remote invocation tests**

Assert that enabled local and SSH invocations contain the same reference session name, use `new-session -A`, exclude endpoint data and `goblin-`, quote apostrophes safely, and contain a native-shell fallback only behind a tmux-availability check. Assert that disabled invocations retain current direct-shell behavior.

- [ ] **Step 2: Run focused invocation tests and verify RED**

Run: `bun run test src/system/local-terminal.test.ts src/system/remote-terminal.test.ts src/system/ssh/commands.test.ts`

Expected: FAIL because the local builder and new target shapes are absent.

- [ ] **Step 3: Implement the minimal invocation builders**

Use a local POSIX `/bin/sh -lc` wrapper only when tmux is enabled; otherwise let node-pty keep its current shell selection. Remove endpoint identity from remote hashing and make internal/external remote builders share the same tmux-first script construction. Preserve SSH alias solely as connection data.

- [ ] **Step 4: Run focused invocation tests and verify GREEN**

Run the Step 2 command.

Expected: all focused invocation tests PASS.

### Task 3: Resolve every internal terminal to a canonical descriptor

**Files:**

- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal.test.ts`

**Interfaces:**

- Consumes: local/SSH builders from Task 2 and `internalTerminalTmuxEnabled()` from Task 4's final interface.
- Produces: canonical project root and working-directory mapping for Git, plain workspace, branch workspace root, and member-worktree terminal creation.

- [ ] **Step 1: Add failing terminal-catalog tests**

Cover local Git, local plain workspace, local branch workspace root, SSH equivalents, member worktrees, different terminal numbers, and an authorized branch workspace request using `/srv/workspace/./feature` while the manifest persists `/srv/workspace/feature`. Assert the persisted path drives both the server key and tmux name.

- [ ] **Step 2: Run the terminal suite and verify RED**

Run: `bun run test src/server/terminal/terminal.test.ts`

Expected: new local tmux and canonical-manifest assertions FAIL.

- [ ] **Step 3: Refactor target authorization into canonical resolution**

Make branch workspace authorization return its persisted working path. Normalize ordinary remote paths with POSIX rules and local paths with `terminalSessionScope()` before creating the server key. Parse `terminal-N` once and pass the same number into either transport adapter.

- [ ] **Step 4: Enable tmux for eligible local internal terminals**

When the global preference is enabled and the platform is POSIX, pass the managed local invocation into `ensureSession`; otherwise omit command/args so the existing native shell remains unchanged. Keep Windows PTY behavior unchanged.

- [ ] **Step 5: Run the terminal suite and verify GREEN**

Run the Step 2 command.

Expected: all server terminal tests PASS.

### Task 4: Rename and migrate the global setting

**Files:**

- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/server/modules/settings-write-paths.test.ts`
- Modify: `src/server/modules/settings.test.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/runtime-settings-terminal-buttons.ts`
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`
- Modify: settings/bootstrap/native-projection test fixtures found by `rg -l 'remoteTerminalTmuxEnabled' src`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Produces: `SettingsPrefs.internalTerminalTmuxEnabled`, matching runtime/bootstrap projections, and `setInternalTerminalTmuxEnabled*` write functions.
- Migration input only: raw persisted `remoteTerminalTmuxEnabled` when the new field is absent.

- [ ] **Step 1: Write failing migration and projection tests**

Assert new-field precedence, legacy `true`/`false` migration, invalid/missing default `false`, and persisted/runtime output containing only `internalTerminalTmuxEnabled`.

- [ ] **Step 2: Run settings tests and verify RED**

Run: `bun run test src/server/modules/settings-source.test.ts src/shared/settings-snapshot.test.ts src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx`

Expected: FAIL because the new preference does not exist.

- [ ] **Step 3: Implement server-owned migration**

Replace the runtime data field with `internalTerminalTmuxEnabled`. During JSON read, choose a valid new boolean first, otherwise a valid legacy boolean, otherwise `false`. Ensure serialization writes only the runtime data shape, which no longer contains the legacy key.

- [ ] **Step 4: Rename all projections, write paths, controls, and copy**

Update TypeScript interfaces, defaults, bootstrap/runtime snapshot projections, web controllers, settings switch IDs, and all four locale strings. Retain the old identifier only in migration tests/code and historical design documents.

- [ ] **Step 5: Run all settings-related tests and verify GREEN**

Run: `bun run test src/server/modules/settings-source.test.ts src/server/modules/settings-write-paths.test.ts src/server/modules/settings.test.ts src/shared/settings-snapshot.test.ts src/shared/native-shell-projection.test.ts src/web/settings-client.test.ts src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx src/web/bootstrap.test.ts src/main/preload.test.ts src/main/rpc.test.ts`

Expected: all listed tests PASS.

### Task 5: Connect built-in external Terminal and Ghostty actions

**Files:**

- Modify: `src/system/terminals.ts`
- Modify: `src/system/terminals.test.ts`
- Modify: `src/system/apple-terminal.ts`
- Modify: `src/system/apple-terminal.test.ts`
- Modify: `src/system/ghostty.ts`
- Modify: `src/system/ghostty.test.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/server/modules/remote.ts`
- Modify: `src/server/modules/remote.test.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/server/routes/remote.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`
- Modify: `src/web/remote-client.ts`
- Modify: local external-terminal call sites under `src/web/hooks/` and `src/web/components/file-tree/`

**Interfaces:**

- Consumes: descriptor/invocation builders and `internalTerminalTmuxEnabled`.
- Produces: local external target `{ projectRoot, workingDirectory, terminalNumber: 1 }` and remote equivalent resolved from `repoId`.

- [ ] **Step 1: Write failing backend and route tests**

Assert local and remote Terminal/Ghostty actions use the same `hobgoblin-v1-*` name as an internal `terminal-1`, fall back when disabled or absent, pass project root separately from an arbitrary working folder, and never add a forced-detach option.

- [ ] **Step 2: Run focused external-terminal tests and verify RED**

Run: `bun run test src/system/terminals.test.ts src/system/apple-terminal.test.ts src/system/ghostty.test.ts src/server/modules/remote.test.ts src/server/routes/repo.test.ts src/server/routes/remote.test.ts src/web/repo-client.test.ts`

Expected: new target-shape and tmux assertions FAIL.

- [ ] **Step 3: Carry project identity through web and server boundaries**

Change local open-terminal input from one path to `{ projectRoot, workingDirectory }`. For SSH, resolve `projectRoot` from the remote repository target and retain `workingDirectory` from the validated request. Assign `terminalNumber: 1` at the server orchestration seam.

- [ ] **Step 4: Update native adapters**

When enabled on macOS, Apple Terminal and Ghostty open a new window executing the prepared local or SSH attach/create command. When disabled, retain their current direct-directory/direct-SSH behavior. Windows Terminal remains unchanged because native Windows tmux identity is outside v1.

- [ ] **Step 5: Run focused external-terminal tests and verify GREEN**

Run the Step 2 command.

Expected: all focused external-terminal tests PASS.

### Task 6: Documentation and compatibility audit

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ja.md`
- Modify: `README.ko.md`
- Modify: `docs/superpowers/specs/2026-07-23-unified-tmux-session-identity-design.md` only if implementation reveals a factual mismatch

**Interfaces:**

- Consumes: final implemented naming and preference behavior.
- Produces: accurate user-facing description and a clean legacy-reference audit.

- [ ] **Step 1: Update user documentation**

Describe local and remote internal-terminal persistence, deterministic external reuse, global opt-in behavior, missing-tmux fallback, and the intentional lack of legacy-session migration.

- [ ] **Step 2: Audit legacy names**

Run: `rg -n 'remoteTerminalTmuxEnabled|DEFAULT_REMOTE_TERMINAL_TMUX_ENABLED|buildManagedRemoteTerminalSessionName|goblin-\[a-f0-9\]|goblin-<digest>' src README*.md docs/terminal-tmux-protocol.md`

Expected: only the deliberate persisted-settings migration references remain; runtime code and current user documentation use the new vocabulary.

### Task 7: Full verification and requirements review

**Files:**

- Review all files changed by Tasks 1-6; do not modify unrelated dirty files.

**Interfaces:**

- Consumes: the complete implementation.
- Produces: fresh evidence for type, behavior, architecture, formatting, and requirement coverage.

- [ ] **Step 1: Format only touched files**

Run Prettier on the explicit changed-file list, never on the whole dirty worktree.

- [ ] **Step 2: Run complete verification**

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: every command exits 0 with no test failures or architecture violations.

- [ ] **Step 3: Inspect the final diff**

Run `git diff --check`, `git status --short`, and scoped diffs for all touched modules. Confirm unrelated pre-existing UI/font/plan changes were preserved and excluded from implementation claims.

- [ ] **Step 4: Review every approved requirement**

Check the design specification section by section: identity inputs, prefix, path rules, context mapping, local/SSH behavior, global migration, built-in external terminal behavior, third-party protocol, lifecycle, shared control, errors, tests, and docs. Report any residual gap instead of claiming completion.
