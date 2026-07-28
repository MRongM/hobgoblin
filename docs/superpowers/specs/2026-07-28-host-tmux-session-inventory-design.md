# Host tmux Session Inventory Design

## Goal

Add a project right-click action that scans the selected project's local or SSH host for every safely identifiable Hobgoblin tmux session, shows each session with its fixed directory, and lets the user select and close sessions explicitly.

The selected project locates a host; it does not scope results to that project. A scan may therefore show sessions belonging to other projects on the same host and operating-system user account.

## Domain and safety boundary

A **host-discoverable Hobgoblin tmux session** must provide all three normalized descriptor fields as session-owned tmux options:

- project root;
- fixed initial directory; and
- positive terminal number.

The scanner accepts a row only when:

1. the project root and initial directory are valid normalized absolute POSIX paths;
2. the terminal number is canonical and positive;
3. the session name is exactly the deterministic v1 name recomputed from those fields; and
4. a project-scoped origin is exactly the deterministic server name recomputed from the project root, or the origin is the explicit compatibility default server.

Name-only `hobgoblin-*` or `goblin-*` sessions, malformed metadata, arbitrary tmux servers, and mismatched server origins are excluded. The metadata is a safety classification, not authentication against another process running as the same operating-system user.

Current v1 sessions do not yet record their project root, and the hashed project-server name cannot be reversed. Every current attach-or-create command will therefore write `@hobgoblin_project_root` in addition to the existing initial-path and terminal-number options. Existing sessions become host-discoverable after a current Hobgoblin client reattaches and repairs their metadata. Existing directory recovery and associated cleanup continue to accept their established two-field metadata when a project root is already known.

## Considered approaches

### 1. Enumerate Hobgoblin servers and validate self-describing sessions — selected

Enumerate only tmux sockets whose names match the project-server protocol, also inspect the current user's default tmux server for compatibility, and require project-root metadata before showing a row.

This is the only approach that finds sessions for closed or forgotten projects while preserving full descriptor validation. It keeps host truth in tmux and needs no new persistence.

### 2. Scan only open and recent projects

Derive server names from Hobgoblin's open and recent project records, then reuse project-scoped discovery.

This misses orphaned sessions after a project leaves application history, so it does not meet the host-wide requirement.

### 3. Trust the session-name prefix and fixed directory

Enumerate sockets and show any `hobgoblin-v1-*` row with an initial directory.

This cannot reproduce the deterministic identity and could close a user-created or corrupted session. It violates the confirmed safety boundary.

## Architecture

### System integration

The tmux system module adds host inventory operations alongside existing project-scoped list and kill operations.

Local inventory inspects the current user's tmux socket directory, selects socket names matching `^hobgoblin-project-v1-[a-f0-9]{24}$`, lists each server in stable name order, and lists the default server with an internal `legacy-default` origin. A missing socket directory, a disappeared socket, or no default server contributes no rows. Other command or parse failures fail the scan rather than return incomplete authoritative data.

SSH inventory extends the typed remote-command boundary with a fixed host-list command. Its script resolves tmux through the existing executable-resolution path, resolves the authenticated user's UID, enumerates only matching socket names under tmux's effective socket directory, and emits the same origin-tagged rows. No renderer input is interpolated into a shell loop or command target.

Host kill accepts only a validated v1 session name and either a validated Hobgoblin server name or the explicit default-server origin. It does not accept arbitrary socket paths.

### Shared contract

Host inventory uses the selected `projectRoot` locator only to resolve local versus SSH execution. Returned rows include:

- `projectRoot` from verified session metadata;
- `initialPath`;
- `terminalNumber`;
- `attachedClients`;
- `sessionName`; and
- server origin.

Selection approval binds both session name and server origin. This distinguishes an exact preview row and prevents a same-named session created on another server after preview from inheriting approval.

### Server orchestration

Preview resolves the selected project's host, performs one host inventory, validates every descriptor and origin, deduplicates exact name duplicates by preferring the matching project-scoped server over the default server, and returns stable ordering by directory, terminal number, then session name.

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
- detached state or attached-client count; and
- project root when it differs from the directory.

No item is selected by default. The destructive `Close selected sessions` button is disabled until at least one row is selected and includes the selected count. The dialog warns that running processes end and attached clients disconnect. Cancel and Escape make no changes.

After execution, closed and already-missing rows leave the dialog, failed rows remain available, selection clears, and a complete or partial result toast is shown. The dialog closes when no rows remain.

## Error and race behavior

- Missing tmux, SSH failure, unsafe socket directory metadata, malformed output, and non-missing server command failures fail closed.
- A server socket disappearing during enumeration is treated as an empty server; a server appearing after enumeration waits for the next explicit scan.
- A selected row that disappears before close is reported as already missing.
- A selected row whose metadata or origin changes before close is treated as missing approval, not killed.
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

`CONTEXT.md` records host-discoverable sessions and host inventory. `docs/terminal-tmux-protocol.md` documents project-root metadata and host inventory compatibility. No ADR is added: socket enumeration is a reversible read adapter required by an explicit feature and does not change project-scoped server ownership.
