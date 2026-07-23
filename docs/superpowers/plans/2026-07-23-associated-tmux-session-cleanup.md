# Associated tmux Session Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, previewed, exact-path cleanup action for current-protocol Hobgoblin tmux sessions to ordinary worktree, branch workspace, and member worktree item menus.

**Architecture:** A shared tmux contract and system adapter enumerate and delete sessions locally or through typed SSH commands. A server-owned cleanup module revalidates preview IDs before deletion, while one renderer hook owns preview, confirmation, toasts, and reusable menu actions.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Bun 1.3, Hono, React 19, Vitest, execa, tmux, SSH, sonner.

## Global Constraints

- Match only names satisfying `^hobgoblin-v1-[a-f0-9]{24}$` and paths that are exactly equal after the v1 lexical POSIX normalization.
- Never match descendants, arbitrary user sessions, or legacy `goblin-*` sessions.
- Preview IDs are an approval boundary: re-list and revalidate before deletion; ignore sessions created after preview.
- Support local macOS/Linux and SSH targets; hide local Windows; do not gate cleanup on tmux preference values.
- Keep local and SSH operations cancellable and bounded; continue after individual deletion failures and report partial progress.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and Node strip-only TypeScript syntax.
- Add no packages.
- Preserve existing user changes and do not create Git commits unless separately requested.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

## File Structure

- Create `src/shared/tmux-cleanup.ts`: request/result types and strict session-ID validation.
- Modify `src/system/tmux-session.ts`: export protocol path normalization and current-name predicate.
- Create `src/system/tmux-cleanup.ts`: list output parser plus local list/kill adapter.
- Modify `src/system/ssh/commands.ts`: typed remote tmux list/kill commands.
- Create `src/server/modules/tmux-cleanup.ts`: local/SSH resolution, preview filtering, execution-time revalidation, partial-result orchestration.
- Create `src/server/routes/tmux-cleanup.ts`: thin preview and cleanup HTTP routes.
- Modify `src/server/app-factory.ts`: register `/api/tmux-cleanup`.
- Modify bootstrap files to expose the server host platform so renderer code can hide unsupported local-Windows actions.
- Create `src/web/tmux-cleanup-client.ts`: typed HTTP client.
- Create `src/web/hooks/useAssociatedTmuxCleanup.tsx`: shared action state, confirmation dialog, and toasts.
- Modify ordinary worktree, branch workspace, member worktree, and shared context-menu files to inject the action.
- Modify all four locale dictionaries with action, confirmation, result, and error copy.
- Add focused tests beside every new or modified feature boundary.

---

### Task 1: tmux protocol helpers and local system adapter

**Files:**

- Create: `src/shared/tmux-cleanup.ts`
- Modify: `src/system/tmux-session.ts`
- Create: `src/system/tmux-cleanup.ts`
- Test: `src/system/tmux-session.test.ts`
- Test: `src/system/tmux-cleanup.test.ts`

**Interfaces:**

- Produces: `TmuxSessionRecord`, `TmuxCleanupPreviewResult`, `TmuxCleanupResult`, `isValidTmuxSessionId()`.
- Produces: `normalizeTmuxSessionPath()`, `isHobgoblinTmuxSessionName()`.
- Produces: `parseTmuxSessionList()`, `listLocalTmuxSessions()`, `killLocalTmuxSession()`.

- [x] **Step 1: Add failing protocol and parser tests**

Cover current names, legacy rejection, POSIX lexical normalization, tab-delimited parsing, commas in paths, malformed lines, no-server output, missing executable, and literal `$N` kill targets. Use dependency-injected runners so tests do not require tmux:

```ts
expect(isHobgoblinTmuxSessionName('hobgoblin-v1-aebf050981ac829e36100020')).toBe(true)
expect(isHobgoblinTmuxSessionName('goblin-aebf050981ac829e36100020')).toBe(false)
expect(normalizeTmuxSessionPath('/srv//repo/./feature/')).toBe('/srv/repo/feature')
expect(parseTmuxSessionList('hobgoblin-v1-aebf050981ac829e36100020\t$3\t/srv/repo,feature')).toEqual([
  {
    sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
    sessionId: '$3',
    sessionPath: '/srv/repo,feature',
  },
])
```

- [x] **Step 2: Run the focused tests and observe the expected failure**

Run:

```sh
bun run test -- src/system/tmux-session.test.ts src/system/tmux-cleanup.test.ts
```

Expected: FAIL because the exported helpers and cleanup module do not exist.

- [x] **Step 3: Add the shared contract and minimal system implementation**

Define the contract without runtime enums:

```ts
export interface TmuxSessionRecord {
  sessionId: string
  sessionName: string
  sessionPath: string
}

export type TmuxCleanupPreviewResult =
  | { ok: true; targetPath: string; sessions: TmuxSessionRecord[] }
  | { ok: false; message: string }

export interface TmuxCleanupFailure {
  sessionId: string
  sessionName: string
  message: string
}

export type TmuxCleanupResult =
  | {
      ok: true
      targetPath: string
      deleted: TmuxSessionRecord[]
      missingSessionIds: string[]
      failed: TmuxCleanupFailure[]
    }
  | { ok: false; message: string }

export function isValidTmuxSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^\$[0-9]+$/u.test(value)
}
```

Export the existing path normalizer from `tmux-session.ts` and add:

```ts
const HOBGOBLIN_TMUX_SESSION_NAME_RE = /^hobgoblin-v1-[a-f0-9]{24}$/u

export function isHobgoblinTmuxSessionName(value: unknown): value is string {
  return typeof value === 'string' && HOBGOBLIN_TMUX_SESSION_NAME_RE.test(value)
}
```

Implement local commands with argument arrays:

```ts
export const TMUX_SESSION_LIST_FORMAT = '#{session_name}\t#{session_id}\t#{session_path}'

export async function listLocalTmuxSessions(options: LocalTmuxCommandOptions = {}): Promise<TmuxListResult> {
  return await runTmuxList(options.run ?? runLocalTmuxCommand, options.signal)
}

export async function killLocalTmuxSession(
  sessionId: string,
  options: LocalTmuxCommandOptions = {},
): Promise<TmuxCommandResult> {
  if (!isValidTmuxSessionId(sessionId)) return { ok: false, message: 'error.invalid-arguments' }
  return await (options.run ?? runLocalTmuxCommand)(['kill-session', '-t', sessionId], options.signal)
}
```

Classify an installed tmux with no server as `{ ok: true, sessions: [] }`; classify `ENOENT`, malformed output, timeout, cancellation, and other failures distinctly.

- [x] **Step 4: Run focused tests**

Run the Task 1 test command again.

Expected: PASS.

---

### Task 2: typed SSH tmux commands

**Files:**

- Modify: `src/system/ssh/commands.ts`
- Test: `src/system/ssh/commands.test.ts`

**Interfaces:**

- Consumes: `TMUX_SESSION_LIST_FORMAT`, `isValidTmuxSessionId()`.
- Produces remote command variants `{ type: 'tmuxListSessions' }` and `{ type: 'tmuxKillSession'; sessionId: string }` handled by `runRemoteCommand()`.

- [x] **Step 1: Add failing SSH invocation tests**

Assert that list uses the exact format, kill preserves `$3` literally, invalid IDs are rejected before execution, and neither command interpolates an item path:

```ts
expect(buildRemoteCommandInvocation(TARGET, { type: 'tmuxListSessions' }).script).toContain(
  "tmux list-sessions -F '#{session_name}\\t#{session_id}\\t#{session_path}'",
)
expect(buildRemoteCommandInvocation(TARGET, { type: 'tmuxKillSession', sessionId: '$3' }).script).toContain(
  "tmux kill-session -t '$3'",
)
```

- [x] **Step 2: Run the focused SSH tests and observe failure**

Run:

```sh
bun run test -- src/system/ssh/commands.test.ts
```

Expected: FAIL because the remote command variants are not defined.

- [x] **Step 3: Add minimal typed commands**

Extend `RemoteCommandKind` and `scriptForCommand()`:

```ts
| { type: 'tmuxListSessions' }
| { type: 'tmuxKillSession'; sessionId: string }
```

List must first verify `command -v tmux`; kill must validate with `isValidTmuxSessionId()` and quote the ID. Preserve existing cancellation and timeout handling in `runRemoteCommand()`.

- [x] **Step 4: Run focused SSH tests**

Run the Task 2 test command again.

Expected: PASS.

---

### Task 3: server orchestration, routes, client, and host-platform projection

**Files:**

- Create: `src/server/modules/tmux-cleanup.ts`
- Create: `src/server/modules/tmux-cleanup.test.ts`
- Create: `src/server/routes/tmux-cleanup.ts`
- Create: `src/server/routes/tmux-cleanup.test.ts`
- Modify: `src/server/app-factory.ts`
- Create: `src/web/tmux-cleanup-client.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/bootstrap-builders.ts`
- Modify: `src/main/window-shell.ts`
- Modify: `src/server/app-factory.ts`
- Modify: `src/preload/preload.cjs`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/web/renderer-bootstrap-bridge.ts`
- Modify: `src/web/renderer-bridge.ts`
- Test: `src/main/preload.test.ts`
- Test: `src/server/bootstrap.test.ts`
- Test: `src/server/app-factory.test.ts`
- Test: `src/web/bootstrap.test.ts`
- Test: `src/web/renderer-ingress.test.ts`

**Interfaces:**

- Consumes local and remote list/kill adapters from Tasks 1–2.
- Produces `previewAssociatedTmuxSessions(input, signal?, dependencies?)`.
- Produces `cleanupAssociatedTmuxSessions(input, signal?, dependencies?)`.
- Produces POST `/api/tmux-cleanup/preview` and `/api/tmux-cleanup/execute`.
- Produces `previewAssociatedTmuxSessions()` and `cleanupAssociatedTmuxSessions()` web-client functions.
- Produces optional bootstrap field `hostPlatform?: NodeJS.Platform`, populated in real Electron and Web bootstraps.

- [x] **Step 1: Add failing server behavior tests**

Test local and SSH resolution, exact normalized matching, current-name filtering, invalid input, preview-ID intersection, new-session exclusion, disappeared sessions, sequential continuation after failure, and cancellation:

```ts
const preview = await previewAssociatedTmuxSessions(
  { projectRoot: '/repo', itemPath: '/repo-feature/' },
  undefined,
  dependenciesWithSessions([
    session('$1', 'hobgoblin-v1-aebf050981ac829e36100020', '/repo-feature'),
    session('$2', 'user-session', '/repo-feature'),
    session('$3', 'hobgoblin-v1-bebf050981ac829e36100020', '/repo-feature/src'),
  ]),
)
expect(preview).toEqual({
  ok: true,
  targetPath: '/repo-feature',
  sessions: [session('$1', 'hobgoblin-v1-aebf050981ac829e36100020', '/repo-feature')],
})
```

- [x] **Step 2: Run server tests and observe failure**

Run:

```sh
bun run test -- src/server/modules/tmux-cleanup.test.ts src/server/routes/tmux-cleanup.test.ts
```

Expected: FAIL because the module and routes do not exist.

- [x] **Step 3: Implement host-aware preview and cleanup**

Use this public input shape:

```ts
export interface AssociatedTmuxTargetInput {
  projectRoot: string
  itemPath: string
}

export interface AssociatedTmuxCleanupInput extends AssociatedTmuxTargetInput {
  approvedSessionIds: string[]
}
```

For SSH roots, parse and resolve the configured target and call `runRemoteCommand()`. For local roots, require absolute paths and reject `win32`. Normalize `itemPath` through `normalizeTmuxSessionPath()` without checking filesystem existence.

Before every kill, operate only on the intersection of approved IDs and a fresh exact-match list. Attempt each surviving session sequentially, record failures, and never rollback completed kills.

- [x] **Step 4: Add thin routes and typed web client**

Register:

```ts
app.route('/api/tmux-cleanup', createTmuxCleanupRoutes())
```

The client calls:

```ts
postServerJson('/api/tmux-cleanup/preview', input, { signal })
postServerJson('/api/tmux-cleanup/execute', input, { signal })
```

- [x] **Step 5: Project the server host platform**

Add `hostPlatform?: NodeJS.Platform` to renderer bootstrap payload/snapshot types, pass `process.platform` from Electron and Web bootstrap creation, validate it against supported Node platform strings, expose it through preload and renderer bridges, and preserve compatibility when legacy/test bootstraps omit it.

- [x] **Step 6: Run server, route, client, and bootstrap tests**

Run:

```sh
bun run test -- src/server/modules/tmux-cleanup.test.ts src/server/routes/tmux-cleanup.test.ts src/server/app-factory.test.ts src/main/preload.test.ts src/web/bootstrap.test.ts src/web/renderer-ingress.test.ts
```

Expected: PASS.

---

### Task 4: shared renderer cleanup action and confirmation flow

**Files:**

- Create: `src/web/hooks/useAssociatedTmuxCleanup.tsx`
- Create: `src/web/hooks/useAssociatedTmuxCleanup.test.tsx`

**Interfaces:**

- Consumes Task 3 web client and `getInitialBootstrap().hostPlatform`.
- Produces `useAssociatedTmuxCleanup({ projectRoot, itemPath, disabled })` returning translated list action, key-based context action, `visible`, `busy`, and `dialog`.

- [x] **Step 1: Add failing hook tests**

Render a small harness and cover:

- preview loading disables duplicate selection;
- no matches produces `toast.info` without a dialog;
- preview errors produce `toast.error`;
- matches open a destructive dialog listing normalized path, count, names, and disconnect warning;
- confirmation sends only preview IDs;
- complete success, already-missing, partial failure, and total failure produce the correct toast;
- local Windows returns `visible: false`, while an `ssh-config://` target remains visible;
- disabled state is independent from local/remote tmux preference values.

- [x] **Step 2: Run the hook test and observe failure**

Run:

```sh
bun run test -- src/web/hooks/useAssociatedTmuxCleanup.test.tsx
```

Expected: FAIL because the hook does not exist.

- [x] **Step 3: Implement the minimal shared hook**

Use retained preview state rather than re-previewing inside the dialog:

```ts
const [preview, setPreview] = useState<Extract<TmuxCleanupPreviewResult, { ok: true }> | null>(null)

async function requestCleanup() {
  const result = await previewAssociatedTmuxSessions({ projectRoot, itemPath })
  if (!result.ok) return toast.error(t(result.message))
  if (result.sessions.length === 0) return toast.info(t('tmux.cleanup.none'))
  setPreview(result)
}

async function confirmCleanup() {
  if (!preview) return
  const result = await cleanupAssociatedTmuxSessions({
    projectRoot,
    itemPath,
    approvedSessionIds: preview.sessions.map((session) => session.sessionId),
  })
  // Project complete, missing, partial, and failed outcomes to localized toasts.
}
```

Render the existing `ConfirmDialog` with rich content and destructive styling. Do not call the internal terminal close API.

- [x] **Step 4: Run the focused hook test**

Run the Task 4 test command again.

Expected: PASS.

---

### Task 5: item menus, context menus, and localization

**Files:**

- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/branch-list/worktree-list-item-actions.ts`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceItemContextMenu.tsx`
- Modify corresponding component and action-projection tests.
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify dictionary consistency tests if snapshots require it.

**Interfaces:**

- Consumes `useAssociatedTmuxCleanup()` from Task 4.
- Produces one identical action in More and context menus for ordinary worktrees, branch workspace roots, and member worktrees.

- [x] **Step 1: Add failing item integration tests**

Assert the localized cleanup action appears in both menu surfaces for:

- a primary worktree;
- a linked ordinary worktree;
- a ready branch workspace root;
- a drifted/unavailable branch workspace root;
- a navigable member worktree; and
- an unavailable member with retained repository ID and worktree path.

Assert active lifecycle operations disable the root action and local Windows hides local actions. Assert context-menu selection invokes the same preview client as More-menu selection.

- [x] **Step 2: Run focused component tests and observe failure**

Run:

```sh
bun run test -- src/web/components/branch-list/BranchRow.test.tsx src/web/components/branch-list/worktree-list-item-actions.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx
```

Expected: FAIL because no cleanup action is injected.

- [x] **Step 3: Inject the shared action without duplicating behavior**

For ordinary and member worktrees, append the hook's list action to `destructiveItems`, include its dialog beside existing action dialogs, and pass its context action through `WorkspaceItemContextMenu.additionalActions`.

For branch workspace roots, append the hook's key-based action to low-frequency actions and context actions. Derive `disabled` from the existing active-operation state, not folder availability. Render the hook dialog once outside both menu portals.

- [x] **Step 4: Add all locale strings**

Add consistent keys for:

```text
tmux.cleanup.action
tmux.cleanup.none
tmux.cleanup.preview-failed
tmux.cleanup.confirm-title
tmux.cleanup.confirm-summary
tmux.cleanup.confirm-warning
tmux.cleanup.confirm-confirm
tmux.cleanup.success
tmux.cleanup.success-with-missing
tmux.cleanup.partial
tmux.cleanup.failed
tmux.cleanup.unsupported
```

Chinese action copy is exactly `删除关联 tmux 会话`. Use sentence case in other locales and preserve `tmux` casing.

- [x] **Step 5: Run focused UI and localization tests**

Run:

```sh
bun run test -- src/web/components/branch-list/BranchRow.test.tsx src/web/components/branch-list/worktree-list-item-actions.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

---

### Task 6: documentation consistency and full verification

**Files:**

- Verify: `CONTEXT.md`
- Verify: `docs/terminal-tmux-protocol.md`
- Verify: `docs/superpowers/specs/2026-07-23-associated-tmux-session-cleanup-design.md`
- Modify only if implementation reveals a factual mismatch.

**Interfaces:**

- Consumes all previous tasks.
- Produces a verified, architecture-compliant feature with aligned documentation.

- [x] **Step 1: Run focused feature tests together**

Run:

```sh
bun run test -- src/system/tmux-session.test.ts src/system/tmux-cleanup.test.ts src/system/ssh/commands.test.ts src/server/modules/tmux-cleanup.test.ts src/server/routes/tmux-cleanup.test.ts src/web/hooks/useAssociatedTmuxCleanup.test.tsx src/web/components/branch-list/BranchRow.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx
```

Expected: PASS.

- [x] **Step 2: Run type checking**

Run:

```sh
bun run typecheck
```

Expected: exit code 0.

- [x] **Step 3: Run architecture checks**

Run:

```sh
bun run check:architecture
```

Expected: exit code 0 with no forbidden imports.

- [x] **Step 4: Run the complete test suite**

Run:

```sh
bun run test
```

Expected: all Vitest suites pass.

- [x] **Step 5: Review the final diff and documentation**

Run:

```sh
git diff --check
git status --short
```

Confirm there are no incomplete plan markers, generated files, unrelated edits, privacy-sensitive fixtures, TypeScript runtime enums, parameter properties, or re-export shims. Do not commit.
