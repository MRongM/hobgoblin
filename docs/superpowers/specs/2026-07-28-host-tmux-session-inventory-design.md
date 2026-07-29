# Host tmux Session Inventory Design

## Goal

Add a project right-click action that scans the selected project's local or SSH host for every safely identifiable Hobgoblin tmux session, shows each session with its fixed directory, and lets the user select and close sessions explicitly.

The selected project locates a host; it does not scope results to that project. A scan may therefore show sessions belonging to other projects on the same host and operating-system user account.

## Domain and safety boundary

A **host-manageable Hobgoblin tmux session** must be found in the authenticated user's compatibility default server or an exact Hobgoblin project-server socket and provide the operational fields needed for manual management:

- a current-protocol Hobgoblin session name;
- fixed initial directory;
- positive terminal number; and
- non-negative attached-client count.

The scanner accepts a row only when the server origin, current session-name shape, normalized initial directory, terminal number, and attached-client count all pass their exact protocol checks. It does not require `@hobgoblin_project_root` and does not attempt to prove project ownership from a host-wide scan.

Ordinary user sessions, legacy `goblin-*` names, malformed operational metadata, and arbitrary tmux servers are excluded. The classification is an operational safety boundary for manual management, not authentication against another process running as the same operating-system user.

Desktop sessions may record `@hobgoblin_project_root`, but host inventory deliberately does not depend on it. This keeps Android-created, older, closed-project, and otherwise orphaned current-protocol sessions visible for manual cleanup.

## Considered approaches

### 1. Enumerate Hobgoblin servers and validate operational session metadata — selected

Enumerate only tmux sockets whose names match the project-server protocol, also inspect the current user's default tmux server for compatibility, and apply the same operational row checks as Android host discovery.

This finds sessions for closed or forgotten projects without requiring reversible project ownership. It keeps host truth in tmux and needs no new persistence.

### 2. Scan only open and recent projects

Derive server names from Hobgoblin's open and recent project records, then reuse project-scoped discovery.

This misses orphaned sessions after a project leaves application history, so it does not meet the host-wide requirement.

### 3. Scan every tmux server or accept name-only rows

Enumerate arbitrary sockets or show any name-shaped row without operational metadata.

This would include ordinary user servers or rows that cannot be presented and closed safely, so it remains excluded.

## Architecture

### System integration

The tmux system module adds host inventory operations alongside existing project-scoped list and kill operations.

Local inventory inspects the current user's tmux socket directory, selects socket names matching `^hobgoblin-project-v1-[a-f0-9]{24}$`, lists each server in stable name order, and lists the default server with an internal `legacy-default` origin. A missing socket directory, a disappeared socket, or no default server contributes no rows. Other command or parse failures fail the scan rather than return incomplete authoritative data.

SSH inventory extends the typed remote-command boundary with a fixed host-list command. Its script resolves tmux through the existing executable-resolution path, resolves the authenticated user's UID, enumerates only matching socket names under tmux's effective socket directory, connects through each exact derived socket, and emits the same origin-tagged rows. No renderer input is interpolated into a shell loop, socket path, or command target.

Host kill accepts only a validated v1 session name and either a validated Hobgoblin server name or the explicit default-server origin. It does not accept arbitrary socket paths.

### Shared contract

Host inventory uses the selected `projectRoot` locator only to resolve local versus SSH execution. Returned rows include:

- `initialPath`;
- `terminalNumber`;
- `attachedClients`;
- `sessionName`; and
- server origin.

Selection approval binds both session name and server origin. This distinguishes an exact preview row and prevents a same-named session created on another server after preview from inheriting approval. Project root is not part of the host inventory contract.

### Server orchestration

Preview resolves the selected project's host, performs one host inventory, validates every operational row and origin, deduplicates only identical name-and-origin rows, and returns stable ordering by directory, terminal number, server origin, then session name. Same-named sessions on different sockets remain independently manageable.

Close receives one or more approved `{sessionName, serverOrigin}` identities and:

1. re-runs the host inventory;
2. revalidates every live descriptor and origin;
3. intersects live rows with the exact approved identities;
4. closes the surviving selections sequentially; and
5. reports closed, already-missing, and failed rows without rollback.

New sessions appearing after preview are never selected implicitly. The request is bounded to 256 unique selections; larger inventories can be handled in explicit batches.

The HTTP route remains a thin JSON boundary. No terminal-worker protocol, background polling, persistence, or realtime invalidation is added. Existing PTY exit handling observes sessions ended by tmux.

### Renderer

Only project row context menus receive the new non-destructive `Scan host tmux sessions` action. Existing project More menus and directory-scoped `Delete associated tmux sessions` actions remain unchanged.

Selecting the action scans first. An empty result shows an informational toast; failures show an error toast. A non-empty result opens a standard dialog containing a scrollable list grouped by fixed directory. Every session row shows:

- an unchecked destructive checkbox;
- session name and terminal number;
- detached state or attached-client count.

No item is selected by default. The destructive `Close selected sessions` button is disabled until at least one row is selected and includes the selected count. The dialog warns that running processes end and attached clients disconnect. Cancel and Escape make no changes.

After execution, closed and already-missing rows leave the dialog, failed rows remain available, selection clears, and a complete or partial result toast is shown. The dialog closes when no rows remain.

## Error and race behavior

- Missing tmux, SSH failure, unsafe socket directory metadata, malformed output, and non-missing server command failures fail closed.
- A server socket disappearing during enumeration is treated as an empty server; a server appearing after enumeration waits for the next explicit scan.
- A selected row that disappears before close is reported as already missing.
- A selected row whose operational metadata or origin changes before close is treated as missing approval, not killed.
- One kill failure does not prevent later approved rows from being attempted.
- Attached and detached sessions are both eligible, but the dialog makes attached-client impact visible before selection.

## Testing

- Protocol tests cover project-root metadata writing and exact descriptor/server validation.
- Local system tests cover socket filtering, deterministic ordering, default-server compatibility, disappearing sockets, malformed output, and exact-origin kill validation.
- SSH command tests cover fixed host enumeration, UID and `TMUX_TMPDIR` handling, origin tagging, validation, quoting, cancellation, and timeout forwarding.
- Server tests cover local/SSH host resolution, cross-project results, exact-origin approval, revalidation, post-preview creation, disappearance, deduplication, and partial failure.
- Route and client tests cover preview and close contracts.
- Renderer tests cover project context-menu placement, empty/error results, unchecked defaults, grouped paths, attached counts, disabled zero-selection close, successful removal, and partial failure retention.
- Locale dictionaries remain key-consistent in English, Simplified Chinese, Japanese, and Korean.

Repository verification runs `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

## Documentation impact

`CONTEXT.md` records host-manageable sessions and host inventory. `docs/terminal-tmux-protocol.md` documents the Android-compatible operational boundary. No ADR is added: this manual-management policy is localized and reversible.
