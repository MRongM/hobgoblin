# Explicit tmux Internal Terminal Launch Implementation Plan

> **For agentic workers:** Execute inline in this session. Do not create subagents, commits, branches, or network operations.

**Goal:** Remove persisted tmux settings, make native login shells the internal-terminal default, and expose explicit tmux-if-available creation actions in terminal and workspace item menus.

**Architecture:** Add a validated per-request `TerminalLaunchMode` to the internal terminal create path. The terminal worker applies it directly, while local and SSH system adapters retain their existing tmux detection and native fallback scripts. Delete tmux policy from server-owned settings and external-terminal launch paths.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Vitest, node-pty, tmux, Radix menu primitives.

## Global Constraints

- Use repo-alias imports with explicit `.ts` or `.tsx` extensions.
- Do not introduce enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Ordinary internal and external terminal launches must use the native login shell.
- Explicit tmux mode must fall back only when tmux is unavailable on the target host.
- Do not persist or synchronize terminal launch mode.
- Do not commit or push without explicit confirmation.

---

### Task 1: Define and validate launch intent

**Files:**

- Modify: `src/shared/terminal.ts`
- Test: `src/shared/terminal.test.ts`

**Produces:** `TerminalLaunchMode`, `normalizeTerminalLaunchMode(value): TerminalLaunchMode`, and optional `launchMode` on `TerminalCreateInput`.

- [ ] Add failing validation tests proving `undefined` and invalid values normalize to `native`, while `native` and `tmux-if-available` are accepted.
- [ ] Run `bun run test src/shared/terminal.test.ts` and confirm RED.
- [ ] Add the string union and normalizer; keep the wire field optional for compatibility.
- [ ] Re-run the focused test and confirm GREEN.

### Task 2: Route launch mode through the terminal catalog

**Files:**

- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/terminal/terminal.ts`
- Test: `src/server/terminal/terminal.test.ts`

**Consumes:** `TerminalCreateInput.launchMode` and `normalizeTerminalLaunchMode`.

- [ ] Add failing tests for default local native, explicit local tmux, default SSH native, and explicit SSH tmux.
- [ ] Run the focused server terminal tests and confirm RED.
- [ ] Remove settings readers from `TerminalCatalogOptions`; normalize the create request mode and pass a boolean only to the existing system invocation builders.
- [ ] Re-run focused tests and confirm GREEN.

### Task 3: Remove persisted tmux settings and external-terminal policy

**Files:**

- Modify: settings types, defaults, snapshots, bootstrap, server source/write paths, renderer projections/writes/runtime facade, and terminal settings UI under `src/shared`, `src/server`, and `src/web`.
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/remote.ts`
- Test: all colocated settings, repository, and remote tests found by `rg -l 'localTerminalTmuxEnabled|remoteTerminalTmuxEnabled|internalTerminalTmuxEnabled' src`.

- [ ] Change focused settings tests to require absence of the scoped fields and removal of legacy persisted fields after normalization.
- [ ] Change repository/remote tests to expect native external launches without `{ useTmux: ... }`.
- [ ] Run the focused tests and confirm RED.
- [ ] Remove the fields and setters through every settings layer and remove the tmux settings group from `TerminalSettings`.
- [ ] Make external-terminal server actions call their adapters without tmux policy.
- [ ] Re-run focused tests and confirm GREEN.

### Task 4: Add renderer creation actions

**Files:**

- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: terminal context/command bridge files that project `createTerminal`.
- Test: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

**Produces:** `createTerminal(base, launchMode?)`, defaulting to native transport input.

- [ ] Add failing registry/provider tests asserting native and explicit tmux request payloads.
- [ ] Run the focused tests and confirm RED.
- [ ] Thread the optional launch mode through the stable terminal context API and request bridge.
- [ ] Re-run focused tests and confirm GREEN.

### Task 5: Expose explicit tmux in the terminal topbar

**Files:**

- Modify: `src/web/components/terminal/TerminalTabs.tsx`
- Modify: topbar callers in branch, plain-workspace, and branch-workspace terminal panels.
- Modify: localized copy in `src/shared/i18n/{en,zh,ja,ko}.ts`.
- Test: `src/web/components/terminal/TerminalTabs.test.tsx` and affected panel tests.

- [ ] Add failing menu tests for native New and New with tmux actions.
- [ ] Run focused tests and confirm RED.
- [ ] Keep the direct plus button mapped to native; add a second overflow-menu action mapped to `tmux-if-available`.
- [ ] Re-run focused tests and confirm GREEN.

### Task 6: Expose explicit tmux in workspace item menus

**Files:**

- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Modify: `src/web/hooks/useProjectInternalTerminalAction.ts`
- Modify: `src/web/components/branch-list/worktree-list-item-actions.ts`
- Modify: `src/web/components/repo-workspace/WorkspaceItemContextMenu.tsx`
- Modify: project, repository, worktree, branch-workspace, and member row components that consume these action models.
- Test: affected hook, action projection, context menu, and row component tests.

- [ ] Add failing tests proving quick actions stay native while context/More menus expose tmux creation for every supported item kind.
- [ ] Run focused tests and confirm RED.
- [ ] Add one reusable tmux action alongside the existing native action and project it through existing menu models.
- [ ] Re-run focused tests and confirm GREEN.

### Task 7: Documentation and full verification

**Files:**

- Modify: `README.md`, `README.zh-CN.md`, `README.ja.md`, `README.ko.md`, and `CONTEXT.md`.
- Verify: `docs/terminal-tmux-protocol.md` remains accurate.

- [ ] Update current documentation to describe native defaults and explicit tmux creation; do not rewrite historical specs or plans.
- [ ] Run `rg -n 'localTerminalTmuxEnabled|remoteTerminalTmuxEnabled|internalTerminalTmuxEnabled|settings\.terminal-tmux' src` and require no matches.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run check:architecture`.
- [ ] Review `git diff --check` and the final diff; leave all changes uncommitted.
