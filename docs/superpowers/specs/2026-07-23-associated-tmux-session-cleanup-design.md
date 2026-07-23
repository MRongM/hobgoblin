# Associated tmux Session Cleanup Design

## Goal

Add an explicit destructive action to worktree, branch workspace, and member worktree items that discovers and deletes Hobgoblin tmux sessions whose initial session path exactly matches that item's directory.

The action is available from both the item's More menu and its context menu. It supports local macOS/Linux projects and SSH projects, remains independent of worktree or branch workspace deletion, and does not depend on whether tmux is currently enabled for new terminals.

## Domain Model

An **associated Hobgoblin tmux session** satisfies both conditions:

1. Its name matches the current tmux identity protocol: `^hobgoblin-v1-[a-f0-9]{24}$`.
2. Its `session_path` exactly equals the target item's path after applying the tmux protocol's lexical POSIX path normalization.

Association is exact rather than recursive. A branch workspace root does not own sessions whose paths point at member worktrees beneath it, and a worktree does not own sessions started in descendant directories.

An **associated tmux session cleanup** is a standalone preview-and-confirm action. It does not delete a worktree, change branch workspace membership, alter tmux preferences, or delete legacy `goblin-*` sessions.

## Scope

### Included items

- Ordinary repository worktree items, including the primary worktree.
- Branch workspace items, targeting only the branch workspace root path.
- Branch workspace member worktree items, targeting only that member's worktree path.

Each eligible item exposes the action in:

- its More menu; and
- its right-click context menu.

### Availability

- Local macOS and Linux items support cleanup.
- SSH items support cleanup regardless of the renderer host operating system.
- Local Windows items hide the action because local tmux is unsupported there.
- The action remains available when the target directory is unavailable or a branch workspace has drifted, because a tmux session may outlive its directory.
- The action is disabled while the item owns an active create, repair, extend, reduce, or remove operation.
- The action is not gated by `localTerminalTmuxEnabled` or `remoteTerminalTmuxEnabled`; disabled preferences must not prevent cleanup of previously created sessions.

### Exclusions

- No automatic cleanup during worktree or branch workspace deletion.
- No recursive descendant matching.
- No legacy `goblin-*` discovery, migration, rename, or deletion.
- No arbitrary user-created tmux session deletion, even when its path matches.
- No new background pruning or scheduled cleanup.
- No Windows-local tmux integration.

## Considered Approaches

### 1. Server-owned host-aware cleanup capability

The server owns discovery, revalidation, and deletion. A system adapter runs tmux locally or through the existing SSH command boundary. Renderer items consume one shared UI action.

This is the selected approach because it preserves renderer/server boundaries, centralizes destructive policy, supports local and SSH targets uniformly, and makes preview-to-execution race handling testable.

### 2. Compute deterministic names and kill them directly

The client or server could calculate session names for known terminal numbers and issue `kill-session` without enumeration.

This was rejected because the action must discover all matching sessions, including terminal numbers not currently represented by renderer state, and must preview exact live matches before deletion.

### 3. Implement commands independently in each item component

Each item could construct and run its own local or SSH cleanup flow.

This was rejected because it duplicates policy and UI state, leaks system integration into the renderer, and creates inconsistent safety behavior across ordinary worktrees, branch workspace roots, and member worktrees.

## Architecture

The feature is a small tmux cleanup slice spanning shared types, system integration, server orchestration, a thin HTTP boundary, a web client, and one shared renderer hook.

### Shared contract

Shared types describe:

- a discovered session with `sessionId`, `sessionName`, and normalized `sessionPath`;
- a preview result containing the normalized target path and ordered matches; and
- a cleanup result containing deleted, already-missing, and failed preview session IDs.

The shared contract never accepts an arbitrary command or unvalidated tmux target.

### System integration

A focused tmux system module owns:

- the current Hobgoblin session-name predicate;
- parsing tmux list output;
- local list and kill execution; and
- the common result classification for no server, missing executable, and command failure.

The current path normalization in `src/system/tmux-session.ts` becomes the single reusable definition for session identity and cleanup matching.

SSH support extends the existing typed remote command model with list and kill operations. Remote input is validated before command construction and uses the existing quoting and timeout boundary.

### Server orchestration

A focused server module receives a project root locator and item path, resolves whether execution is local or SSH-backed, and delegates to the matching system adapter.

Preview performs these steps:

1. Validate the project root locator and item path.
2. Resolve the local host or SSH target.
3. List live tmux sessions.
4. Normalize each `session_path` with the tmux protocol rule.
5. Retain only current-protocol names whose normalized path exactly equals the normalized item path.
6. Return matches in stable session order.

Cleanup receives the session IDs from one preview and performs these steps:

1. Re-list live sessions on the same host.
2. Reapply the current-protocol name and exact-path checks.
3. Intersect those live matches with the preview IDs supplied by the client.
4. Delete the surviving intersection sequentially.
5. Continue after individual failures and return a complete deleted/missing/failed summary.

Sessions created after preview are not in the approved ID set and therefore cannot be deleted. Sessions that disappear before confirmation are reported as already missing. Completed deletions are never rolled back.

### Boundary and client

A dedicated tmux cleanup route exposes one preview endpoint and one cleanup endpoint. Route handlers only parse input, delegate to the server module, and serialize results.

A matching web client provides typed preview and cleanup calls. This feature does not use the terminal worker protocol because it administers host tmux state rather than Hobgoblin's in-memory PTY session registry.

### Renderer action

A shared renderer hook owns:

- preview loading state;
- no-match, success, and error toasts;
- the retained preview used by confirmation;
- the destructive confirmation dialog; and
- cleanup result presentation.

The hook exposes one menu-compatible action and one dialog node. Item components only provide the project root, item path, visibility, and disabled state.

Ordinary worktree and member worktree action projections add the shared action to their destructive More-menu group and pass the same action to `WorkspaceItemContextMenu`. Branch workspace items add it to their low-frequency destructive actions and to the same context-menu surface.

## Command Protocol

Discovery uses tmux format fields equivalent to:

```sh
tmux list-sessions -F '#{session_name}\t#{session_id}\t#{session_path}'
```

A tab delimiter is used instead of commas because valid paths may contain commas. Item paths already reject control characters, so a tab cannot collide with an eligible target path. The parser rejects malformed lines rather than guessing field boundaries.

Local execution uses argument arrays rather than a shell command string. Remote execution uses the typed SSH command builder and its existing escaping rules. Cleanup targets validated tmux session IDs rather than user-provided names.

## User Experience

The action label is “Delete associated tmux sessions” in English and “删除关联 tmux 会话” in Chinese. It uses destructive styling in both menus.

Selecting the action first runs preview:

- If no tmux server is running, preview succeeds with zero matches.
- If no associated sessions exist, show an informational toast and do not open a confirmation dialog.
- If tmux is unavailable, SSH fails, or output cannot be parsed safely, show an error toast and do not open a confirmation dialog.
- If matches exist, open a destructive confirmation dialog.

The confirmation dialog shows:

- the normalized target directory;
- the number of matched sessions;
- each matched session name; and
- a warning that running processes end and all other clients attached to those tmux sessions are disconnected.

The confirmation button remains disabled while cleanup runs. On completion:

- complete success shows the deleted count;
- already-missing sessions are reported without treating them as an unsafe deletion;
- partial failure shows deleted and failed counts and retains enough detail for retry; and
- total failure shows an error toast.

Killing a tmux session naturally exits any attached Hobgoblin PTY. Existing terminal exit handling remains responsible for removing the corresponding internal terminal session and updating renderer state. The cleanup feature does not call the internal terminal close API separately.

## Safety Properties

- Both the current Hobgoblin protocol name and exact normalized path must match.
- The server revalidates all client-provided preview IDs against live tmux state.
- Newly created sessions after preview are excluded.
- Arbitrary tmux names or IDs cannot bypass the server-side match policy.
- Descendant paths never match a parent item.
- User-created tmux sessions are excluded even if their path matches.
- Partial destructive progress is reported explicitly and never rolled back.
- Local and remote commands remain cancellable and bounded by existing timeout conventions.

## Testing

### System tests

- Current protocol name acceptance and legacy/arbitrary name rejection.
- Exact lexical path normalization, including repeated separators, dot segments, trailing slashes, and non-matching descendants.
- Valid tab-delimited output parsing and malformed-line rejection.
- Local list behavior for live sessions, no server, missing tmux, and command failure.
- Local kill behavior for success, already-missing targets, and failure.
- SSH list and kill invocation construction, validation, quoting, cancellation, and timeout forwarding.

### Server tests

- Local and SSH target resolution.
- Preview filters by both name and exact path.
- Cleanup revalidation and preview-ID intersection.
- Sessions created after preview remain untouched.
- Sessions removed after preview are reported missing.
- Sequential deletion continues through partial failures.
- Invalid locators, paths, and session IDs are rejected.

### Renderer tests

- No-match, query failure, confirmation, complete success, missing-session, and partial-failure flows.
- Confirmation content includes path, count, names, and external-client warning.
- More-menu and context-menu entry coverage for ordinary, primary, branch workspace, and member worktree items.
- Unavailable and drifted items remain eligible.
- Active lifecycle operations disable the action.
- Local Windows hides the action while SSH remains eligible.
- Local and remote tmux preference values do not hide or disable cleanup.
- All locale dictionaries remain key-consistent.

### Repository verification

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

## Documentation Impact

- Add the two domain terms to `CONTEXT.md`.
- Keep `docs/terminal-tmux-protocol.md` unchanged unless implementation exposes a protocol clarification; cleanup consumes the existing v1 identity and normalization rules without changing them.
- No ADR is required because this feature follows existing server ownership and system-integration boundaries and is reversible without a data migration.
