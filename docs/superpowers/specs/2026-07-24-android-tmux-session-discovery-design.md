# Android tmux Session Discovery and Recovery Design

**Date:** 2026-07-24

**Status:** Approved for autonomous inline implementation

## Summary

Android project terminals will discover live current-protocol Hobgoblin tmux sessions when the user opens a project's Terminals surface. A discoverable session carries session-level protocol metadata for its normalized initial path and positive terminal number. Android accepts it only when the path belongs to the loaded project, the terminal number is canonical, and recomputing the public tmux descriptor hash produces the exact live session name.

An accepted session missing from Android's retained terminal records is imported as a disconnected tmux-backed terminal. Discovery does not open an SSH PTY. Selecting the recovered record uses the existing reconnect path and attaches to the live tmux session.

## Goals

- Write `@hobgoblin_init_path` and `@hobgoblin_terminal_number` on every current-protocol tmux session created or attached by Hobgoblin.
- Discover current-protocol sessions for one Android project and its known worktrees when its Terminals surface opens.
- Verify metadata, project association, and deterministic session name before trusting a remote session.
- Preserve the tmux-provided terminal number as the Android `terminal-N` slot.
- Merge discovery idempotently without replacing active or conflicting Android terminal records.
- Reuse the existing retained-session persistence and reconnect paths.

## Non-goals

- Scanning every saved host or project from the global Android Terminals tab.
- Automatically opening SSH connections for discovered sessions.
- Recovering legacy `goblin-*` sessions or current-protocol sessions without the new metadata.
- Renaming, mutating, killing, or repairing malformed remote sessions during discovery.
- Treating tmux metadata or a deterministic session name as authentication.
- Adding a remote manifest or another persistent registry.

## Protocol Metadata

Each current-protocol tmux launch sets two session-scoped tmux user options:

```text
@hobgoblin_init_path=<normalized descriptor workingDirectory>
@hobgoblin_terminal_number=<canonical positive decimal terminalNumber>
```

The values are protocol metadata, not display labels or authentication claims. Hobgoblin writes the initial path as the fixed identity path even when a shell later changes directory. Tmux clients remain able to mutate user options; a later mismatch makes the session undiscoverable. The terminal number has no sign or leading zeroes.

The attach-or-create command continues to derive the session name from the public descriptor and enable mouse support. It additionally sets both options on the exact tmux target-pane `=<session-name>:`. The trailing colon is required for `set-option -t`; omitting it can create the session while failing both metadata writes. This is applied by the shared TypeScript local and SSH invocation builders and by the Android SSH startup command so desktop, Web/server, external terminal actions, and Android create compatible sessions.

Existing sessions that are attached through a known descriptor receive the metadata idempotently. Existing sessions that are never launched again and lack either option remain undiscoverable; they are not guessed or migrated.

## Discovery Validation

Android lists live sessions through the trusted SSH command boundary with a tab-delimited format containing:

```text
#{session_name}\t#{@hobgoblin_init_path}\t#{@hobgoblin_terminal_number}
```

Each row is evaluated independently. A row is accepted only when all conditions hold:

1. The session name matches `^hobgoblin-v1-[a-f0-9]{24}$`.
2. `@hobgoblin_init_path` is already the canonical lexical POSIX path produced by the protocol normalizer.
3. `@hobgoblin_terminal_number` is canonical base-10 ASCII for a positive Android `Int`.
4. The initial path exactly matches the repository root or one non-missing worktree path from the loaded repository snapshot after lexical normalization.
5. Recomputing the tmux session identity from the normalized repository root, initial path, and terminal number yields the exact listed session name.

Plain workspaces have only their root path in the allowed set. For Git projects, discovery waits until the repository snapshot has supplied the known worktree set. Unrelated user sessions and malformed rows are ignored without preventing recovery of other valid rows.

No tmux server and tmux not being installed both produce an empty discovery result. Host-key rejection, SSH failure, or structurally unusable command output produces an actionable discovery failure while leaving retained Android records unchanged.

## Recovery and Merge

The remote adapter returns validated discoveries as a small domain value containing the session identity, normalized initial path, and terminal number. It does not create Android records.

`TerminalSessionManager` owns the idempotent merge because it already owns terminal slot allocation, retained records, observers, and persistence. For each discovery it uses the tuple below as the recovered slot identity:

```text
host + repository root + initial path + terminal number
```

Merge rules:

- If an Android record already carries the same tmux session name and slot identity, keep it unchanged.
- If the slot is occupied by any other Android record, skip the discovery rather than overwrite or reclassify local state.
- Otherwise create one retained record with the tmux terminal number, `terminal-N` display name, current tmux identity, and `Disconnected` status.
- Use a deterministic record identifier derived from the host identity and tmux session name so repeated scans are idempotent even before persistence is observed.
- Persist and notify collection observers once for the merged batch.

Recovered records use the existing project/repository ownership fields and target-label convention. They do not claim foreground-service ownership and do not synthesize terminal output history. Selecting one flows through `TerminalSessionManager.reconnect`, which re-derives and verifies the identity before the Android SSH startup command attaches to tmux.

Deleting only the Android record does not kill the remote tmux session. A later project scan may recover it again. The existing checked option to close the exact tmux session remains the way to remove both identities.

## Android Trigger and UI Behavior

`RepositoryWorkspaceScreen` starts discovery when its Terminal tab becomes active:

- A plain workspace can scan immediately with its root path.
- A Git repository scans after a loaded or stale snapshot provides the root and known non-missing worktree paths.
- The discovery key includes the repository and normalized allowed-path set, preventing recomposition loops while allowing a refreshed worktree set to trigger another scan.

The screen delegates SSH work through a callback supplied by `HobgoblinAndroidApp`; Compose does not build commands or validate protocol identities. Discovery runs on `Dispatchers.IO`. Success needs no toast. Failure uses the existing inline action-error surface and never clears or rewrites existing terminals.

The global Terminals tab remains a read-only projection of retained records. Recovered sessions naturally appear there after the manager publishes the merged collection.

## Architecture

- `TmuxSessionProtocol` owns metadata names, strict parsing, canonical number parsing, identity recomputation, and command fragments.
- `RemoteTmuxSessionService` owns trusted SSH listing and result classification for live tmux sessions.
- `TerminalSessionManager` owns recovered-record merge, stable local identity, persistence, and observer publication.
- `HobgoblinAndroidApp` composes the remote read with the manager write.
- `RepositoryWorkspaceScreen` owns only the local trigger and error presentation.
- Shared TypeScript invocation builders write the same protocol metadata but do not participate in Android discovery.

No new realtime channel, polling loop, database, package, or generic service layer is introduced.

## Error and Safety Rules

- Discovery is read-only on the remote host.
- Shell values are quoted through existing quoting seams.
- Metadata is untrusted input until the deterministic name and allowed path both validate.
- One malformed or unrelated tmux row cannot suppress valid discoveries.
- Slot conflicts never overwrite, renumber, or mutate an existing Android record.
- Discovery failures preserve the previous restorable terminal projection.
- No discovery path kills a tmux session or mutates repository state.

## Testing

Use test-first red-green-refactor cycles for:

- Exact metadata command fragments in TypeScript local and remote invocation tests.
- Metadata persistence against an isolated real tmux server when tmux is available.
- Exact Android startup metadata commands, including shell quoting.
- Strict metadata parsing, canonical terminal numbers, path checks, and fixed hash verification.
- Remote discovery behavior for valid rows, unrelated rows, malformed rows, no server, missing tmux, untrusted hosts, and SSH failures.
- Manager merge behavior for recovery, repeated discovery, exact existing records, conflicting slots, deterministic IDs, persistence, and observer publication.
- Repository-screen trigger policy for plain workspaces, loaded Git snapshots, stale snapshots, loading/error states, and non-missing worktrees.
- App composition contract proving validated discoveries reach the manager with repository ownership and labels.

Final verification:

```sh
./gradlew test
bun run typecheck
bun run test
bun run check:architecture
```

## Documentation

Update `docs/terminal-tmux-protocol.md` with the two required user options, discovery validation rules, and the attach-or-create command sequence. Update the Android terminal lifecycle design only if an existing statement would otherwise contradict discovery behavior.
