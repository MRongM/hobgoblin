# Windows Worktree Internal Terminal Shell Menu Implementation Plan

> **Execution:** Use `executing-plans` inline in the current isolated feature worktree. Follow `test-driven-development` for every behavior change and `verification-before-completion` before reporting success.

**Goal:** Add Windows-only PowerShell and WSL internal-terminal actions to ordinary worktree, branch-workspace member, and branch-workspace root menus while preserving the global quick-action behavior.

**Architecture:** Carry a validated optional `powershell | wsl` launch intent through the shared terminal create protocol. Persist it only on the server-owned terminal session so restarts preserve the explicit choice. Compose opt-in menu actions in the existing web action pipelines and hide them for non-Windows or remote repository roots.

**Tech Stack:** TypeScript strip-only mode, React, Valibot, Bun, Vitest, server-owned node-pty terminal sessions.

**Spec:** `docs/superpowers/specs/2026-08-30-windows-worktree-internal-terminal-shell-menu-design.md`

**Constraints:** Do not change dependencies, the independent `windows/` package, global settings semantics, or trusted explicit terminal commands. Do not commit, push, merge, or clean up the harness-owned worktree without separate authorization.

## Execution Result

Implemented inline with TDD on 2026-08-30. The final focused slice passed 171/171 tests across 11 files; `bun run typecheck` and `bun run check:architecture` passed. `bun run test` completed with 4393 passing, 147 failing, and 23 skipped tests; the failures are the repository's Windows/platform baseline failures (including path, CRLF, macOS/tmux/SSH, Electron installation, and concurrent fixture assumptions), while every feature-focused file passed independently. No commit, push, merge, worktree cleanup, dependency change, or `windows/` package edit was performed.

---

### Task 1: Add The Validated Per-Create Shell Intent

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/shared/terminal.test.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-session-command-bridge.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`

- [ ] Add failing shared-protocol tests for accepted `powershell`/`wsl`, invalid-value removal, and absence compatibility.
- [ ] Run `bun run test src/shared/terminal.test.ts` and confirm RED.
- [ ] Add `WindowsInternalTerminalShellOverride = 'powershell' | 'wsl'`, an optional create field, and boundary normalization.
- [ ] Add a failing registry test that calls `createTerminal(base, 'native', 'powershell')` and expects the bridge request to carry the choice while an ordinary call omits it.
- [ ] Run `bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts` and confirm RED.
- [ ] Extend the context and command-bridge signatures and forward the optional choice.
- [ ] Run both focused tests and confirm GREEN.

### Task 2: Apply The Choice Only To Local Server Sessions

**Files:**

- Modify: `src/server/terminal/terminal-session-manager.ts`
- Modify: `src/server/terminal/terminal-session-manager-shell-preference.test.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: the focused terminal catalog test file containing local/remote create coverage

- [ ] Add failing manager tests proving an explicit session choice overrides the global preference on create and restart, while an ordinary session uses the latest global preference.
- [ ] Run `bun run test src/server/terminal/terminal-session-manager-shell-preference.test.ts` and confirm RED.
- [ ] Store the optional choice on `TerminalSession`; spawn with `session.windowsInternalTerminalShell ?? this.windowsInternalTerminalShell`.
- [ ] Add a failing catalog test proving only local create forwards the normalized choice to `ensureSession`; remote or explicit invocation semantics remain unchanged.
- [ ] Run the focused catalog test and confirm RED.
- [ ] Thread the optional choice through `EnsureTerminalCatalogInput` and `ensureLocalSession` only.
- [ ] Run the manager and catalog tests and confirm GREEN.

### Task 3: Build Reusable Menu Actions And Context Projection

**Files:**

- Modify: `src/web/hooks/branch-action-state.ts`
- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Modify: `src/web/components/branch-list/worktree-list-item-actions.ts`
- Modify: `src/web/components/branch-list/worktree-list-item-actions.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceItemContextMenu.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] Add failing projection tests for `terminalPowerShell` and `terminalWsl` menu ordering and context actions while keeping generic `terminal` as the quick action.
- [ ] Add failing context-menu tests proving an explicit action pair replaces the generic entry and dispatches both callbacks.
- [ ] Run the two focused tests and confirm RED.
- [ ] Add opt-in menu-only branch actions and extend `handleNewTerminal` to pass a shell choice.
- [ ] Project the two actions and render them as flat context-menu siblings.
- [ ] Add localized labels for both actions in all four dictionaries.
- [ ] Run the focused tests and confirm GREEN.

### Task 4: Surface Actions On The Three Eligible Windows Rows

**Files:**

- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/branch-list/BranchRow.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx`

- [ ] Add failing component tests with a mutable bootstrap platform proving the two actions appear and dispatch their exact shell choice on Windows-local roots.
- [ ] Add negative cases for Linux/macOS and remote/WSL repository identifiers, which must retain the generic internal-terminal context action.
- [ ] Run the four focused component test files and confirm RED.
- [ ] Gate action construction with `hostPlatform === 'win32' && !isRemoteRepoId(rootId)`.
- [ ] Opt ordinary and member rows into the shared branch actions, including disabled member projections.
- [ ] Extend branch-workspace root creation helpers and callbacks to carry the optional shell choice.
- [ ] Run the component slice and confirm GREEN.

### Task 5: Verify And Review

**Files:**

- Modify only files already touched if formatting or valid review fixes require it.

- [ ] Run Prettier only on changed files.
- [ ] Run all feature-focused test files in one invocation.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run check:architecture`.
- [ ] Run `bun run test`; record existing Windows `/tmp` baseline failures separately from new failures.
- [ ] Inspect `git diff --check`, `git status --short`, and the complete diff for scope, privacy-safe fixtures, and accidental `windows/` or dependency changes.
- [ ] Apply `verification-before-completion`; do not claim full-suite success unless fresh output proves it.
- [ ] Leave branch integration, commit, push, or cleanup as the final user decision.
