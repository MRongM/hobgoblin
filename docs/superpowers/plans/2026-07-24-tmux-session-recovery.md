# Tmux Session Recovery Implementation Plan

> Executed inline in the active workspace. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open every associated tmux session from one menu action while restoring stable terminal numbers and preventing unsafe tmux closure when an exact name/slot match is unavailable.

**Architecture:** Store normalized initial path and slot number in tmux session metadata, then recognize a session only when those fields reproduce its deterministic v1 name for the current project root. A server-owned realtime batch action performs one strict associated-session discovery, assigns collision-free internal slots, attaches by exact name, and publishes whether application-driven tmux closure is safe.

**Tech Stack:** TypeScript 6 strip-only mode, tmux user options, Hono/WebSocket terminal protocol, React 19, Vitest 4, Bun 1.3.

## Global Constraints

- Keep `hobgoblin-v1-<24 lowercase hex>` session names backward compatible.
- Associate sessions only when normalized `@hobgoblin_init_path` exactly equals the selected terminal path and the metadata reproduces the listed name.
- Treat tmux as the durable source of terminal-number metadata; do not add an application persistence map.
- Ignore legacy, missing, corrupt, and mismatched identity metadata; never infer ownership from a name alone.
- Never offer or execute application-driven tmux closure when the exact name does not match the assigned slot hash.
- Preserve native-terminal behavior and tmux-unavailable shell fallback.
- Update English, Simplified Chinese, Japanese, and Korean copy together.
- Do not modify unrelated dirty-worktree files or create Git commits.

---

### Task 1: Add strict recoverable tmux identity metadata

**Files:**
- Modify: `src/shared/tmux-cleanup.ts`
- Modify: `src/system/tmux-session.ts`
- Modify: `src/system/tmux-session.test.ts`
- Modify: `src/system/tmux-cleanup.ts`
- Modify: `src/system/tmux-cleanup.test.ts`
- Modify: `src/system/local-terminal.ts`
- Modify: `src/system/local-terminal.test.ts`
- Modify: `src/system/remote-terminal.ts`
- Modify: `src/system/remote-terminal.test.ts`
- Modify: `src/system/ssh/commands.test.ts`

**Interfaces:**
- Produces: `TMUX_INIT_PATH_OPTION`, `TMUX_TERMINAL_NUMBER_OPTION`, required `TmuxSessionRecord` identity fields, and strict metadata validation.
- Consumes: existing v1 hash construction and exact session-list parsing.

- [x] **Step 1: Write failing parser, inference, and command-generation tests**

Assert that list rows read both user options, corrupt/blank fields are ignored, path plus number must reproduce the name, and local/remote new-session scripts write both `@hobgoblin_init_path` and `@hobgoblin_terminal_number`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
bun run test -- src/system/tmux-session.test.ts src/system/tmux-cleanup.test.ts src/system/local-terminal.test.ts src/system/remote-terminal.test.ts src/system/ssh/commands.test.ts
```

Expected: failures for missing metadata fields, resolver, and tmux option commands.

- [x] **Step 3: Implement metadata, parsing, and strict validation**

Add both session options to new-session command chains, list both options, skip incomplete records, and accept only records whose normalized path and number reproduce the listed name.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected files pass.

### Task 2: Add server-owned batch tmux recovery

**Files:**
- Modify: `src/shared/terminal.ts`
- Modify: `src/shared/terminal.test.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/terminal/terminal-session-manager.ts`
- Modify: `src/server/terminal/terminal-session-manager.test.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal.test.ts`

**Interfaces:**
- Produces: `TerminalOpenTmuxSessionsInput`, realtime action `open-tmux-sessions`, and `tmuxCloseSupported` on server summaries.
- Consumes: exact associated-session preview and Task 1 terminal-number recovery.

- [x] **Step 1: Write failing protocol, catalog, and close-safety tests**

Cover invalid inputs, one-list batch opening, exact-name reuse, preferred original slots, collision fallback, no-session tmux creation, and rejection with `terminal.close-tmux-session-exit-required` when closure is unsafe.

- [x] **Step 2: Run server-focused tests and verify RED**

```bash
bun run test -- src/shared/terminal.test.ts src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal.test.ts
```

- [x] **Step 3: Implement the batch operation and live capability flag**

Authorize the target once, list associated sessions once, assign/reuse internal terminal IDs, attach by exact name, retain one representative first frame plus the full catalog, and enforce the close capability in the server.

- [x] **Step 4: Run server-focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected files pass.

### Task 3: Route tmux menu actions through batch recovery

**Files:**
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/renderer-terminal-bridge.ts`
- Modify: `src/web/terminal.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`
- Modify: `src/web/components/terminal/TerminalTabs.tsx`
- Modify: `src/web/components/terminal/TerminalTabs.test.tsx`

**Interfaces:**
- Consumes: `open-tmux-sessions` and `tmuxCloseSupported` from Task 2.
- Produces: existing `createTerminal(base, 'tmux-if-available')` callers transparently open all associated sessions.

- [x] **Step 1: Write failing renderer and close-dialog tests**

Assert that tmux mode uses `openTmuxSessions`, native mode still uses `create`, all server summaries reconcile, safe sessions retain the checkbox, and unsafe sessions show exit guidance without a checkbox.

- [x] **Step 2: Run renderer-focused tests and verify RED**

```bash
bun run test -- src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx src/web/components/terminal/TerminalTabs.test.tsx
```

- [x] **Step 3: Implement bridge routing, reconciliation, and close guidance**

Add the bridge method, route only tmux launch mode through it, project the capability into renderer descriptors/summaries, and render the non-destructive guidance.

- [x] **Step 4: Run renderer-focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected files pass.

### Task 4: Complete localization, documentation, and verification

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `CONTEXT.md`
- Verify: all files changed by Tasks 1–3.

**Interfaces:**
- Produces: consistent four-language exit guidance and documented recovery semantics.

- [x] **Step 1: Add four-language close guidance and update domain terminology**

Use `terminal.close-tmux-session-exit-required` in all locales and document that the tmux terminal number is session-owned recovery metadata.

- [x] **Step 2: Run strict and project checks**

```bash
bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.main.json --noUnusedLocals true --pretty false
bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json --noUnusedLocals true --pretty false
bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json --noUnusedLocals true --pretty false
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 3: Audit scope and concurrent changes**

Inspect `git status --short` and path-scoped diffs. Confirm the detached-session cleanup script, prior dead-code cleanup, and concurrent BranchList edits remain untouched except where an unavoidable shared test fixture requires additive compatibility.
