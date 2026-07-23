# Unified Tmux Session Identity Design

**Date:** 2026-07-23

**Status:** Approved design; implementation not started

## Summary

Hobgoblin will use one public, deterministic tmux session identity protocol for every tmux-backed internal terminal and for built-in or third-party external terminal applications. Local and SSH terminals will derive the same session name from canonical project information, so either Hobgoblin or an external application may create the session first and every later caller can reconnect to it.

The new protocol is intentionally incompatible with the existing remote-only `goblin-<digest>` names. It uses the `hobgoblin-` prefix and does not discover, migrate, rename, attach to, or remove legacy sessions.

## Goals

- Support tmux for all eligible internal-terminal contexts:
  - local Git primary worktrees and linked worktrees;
  - SSH Git primary worktrees and linked worktrees;
  - local and SSH plain workspaces;
  - local and SSH branch workspace roots;
  - local and SSH branch workspace member worktrees.
- Give local and remote tmux sessions one identity algorithm.
- Allow an external application to compute the matching session name from normalized project information without a running Hobgoblin process.
- Let Hobgoblin and external applications independently create or attach to the same session.
- Preserve logical path identity, including the project-defined identity of symbolic-link workspace members.
- Keep raw paths, SSH aliases, hostnames, and usernames out of the tmux session name.

## Non-goals

- Migrating or recovering existing `goblin-*` tmux sessions.
- Automatically killing or garbage-collecting tmux sessions.
- Adding tmux session management UI.
- Adding an HTTP identity endpoint, CLI identity command, or project metadata file.
- Extending Hobgoblin controller/viewer authority to external tmux clients.
- Making tmux session names an authentication or authorization mechanism.

## Domain Model

### Tmux session descriptor

A **tmux session descriptor** is the public, normalized project information that identifies one tmux-backed terminal slot:

```ts
interface TmuxSessionDescriptor {
  projectRoot: string
  workingDirectory: string
  terminalNumber: number
}
```

- `projectRoot` is the absolute logical root of the project or repository that owns the terminal context.
- `workingDirectory` is the absolute logical directory in which the terminal runs.
- `terminalNumber` is the positive, one-based numeric part of a Hobgoblin terminal ID such as `terminal-1`.

The descriptor does not contain transport information. SSH alias, user, host, and port are excluded because tmux namespaces are already isolated by operating-system host and user. Branch names and display names are excluded because paths identify the materialized terminal context and remain usable by external callers.

### Tmux session name

A **tmux session name** is the deterministic, tmux-safe name derived from a tmux session descriptor:

```text
hobgoblin-v1-<24 lowercase hexadecimal characters>
```

It is distinct from all existing terminal identifiers:

- `terminalId`, such as `terminal-1`, identifies a slot within one terminal context.
- the server terminal key identifies `repoRoot + workingDirectory + terminalId` during Hobgoblin reconciliation;
- `term_<UUID>` identifies one ephemeral Hobgoblin server PTY instance;
- the tmux session name identifies the persistent shell shared through tmux.

## Descriptor Mapping

Every internal terminal must be resolved to one canonical descriptor before an invocation is constructed.

| Terminal context                 | `projectRoot`                         | `workingDirectory`                   |
| -------------------------------- | ------------------------------------- | ------------------------------------ |
| Git primary worktree             | repository primary path               | repository primary path              |
| Git linked worktree              | repository primary path               | selected linked worktree path        |
| Plain workspace                  | workspace root path                   | workspace root path                  |
| Branch workspace root            | parent configured-workspace root path | persisted branch workspace root path |
| Branch workspace member worktree | member repository primary path        | persisted member worktree path       |

For SSH contexts, both fields are remote absolute paths. The `ssh-config://` repository locator is never used as a descriptor field.

For a branch workspace, authorization must finish before the descriptor is built. The descriptor must use the path persisted in the authorized manifest, not the raw client-supplied spelling that happened to compare equal after normalization. This closes the current case in which equivalent spellings such as `/srv/workspace/./feature` and `/srv/workspace/feature` can authorize as the same target but generate different identities.

## Canonicalization

Version 1 defines tmux identity for POSIX tmux environments. Native Windows terminals retain the existing shell behavior when tmux is unavailable; no WSL, MSYS, or Cygwin path translation is introduced.

Before serialization:

1. Both paths must be non-empty absolute POSIX paths.
2. Reject NUL bytes and ASCII control characters.
3. Apply POSIX lexical normalization:
   - collapse repeated `/` separators;
   - remove `.` segments;
   - resolve `..` segments lexically without escaping the root;
   - remove a trailing `/` except for `/` itself.
4. Do not call `realpath` and do not resolve symbolic links.
5. Do not case-fold or apply Unicode normalization.
6. Require `terminalNumber` to be a safe positive integer and serialize it as base-10 ASCII without leading zeroes.

External implementations must apply exactly these rules. Callers should use project paths supplied by Hobgoblin or the same project configuration source rather than reconstructing display paths.

## Name Algorithm

Serialize the normalized descriptor by UTF-8 encoding these four fields and joining them with exactly one NUL byte (`0x00`):

```text
hobgoblin-terminal-session-v1
\0
<normalized projectRoot>
\0
<normalized workingDirectory>
\0
<canonical decimal terminalNumber>
```

Calculate SHA-256 over those bytes, encode the digest as lowercase hexadecimal, take the first 24 characters, and prepend `hobgoblin-v1-`:

```text
name = "hobgoblin-v1-" + hex(sha256(serializedDescriptor))[0:24]
```

Do not express the final separator and terminal number as an ambiguous language string escape such as `"\01"`; construct the NUL separator as its own byte or join operation.

Reference vector:

```text
projectRoot      = /srv/projects/example
workingDirectory = /srv/projects/example/worktrees/feature
terminalNumber   = 1

serialized UTF-8 fields joined by 0x00:
hobgoblin-terminal-session-v1<NUL>/srv/projects/example<NUL>/srv/projects/example/worktrees/feature<NUL>1

full SHA-256:
aebf050981ac829e36100020f43af96bc0c5c747314eda0ab2775128ea38b92a

tmux session name:
hobgoblin-v1-aebf050981ac829e36100020
```

In the displayed serialized value, each `<NUL>` denotes one `0x00` byte; it is notation, not source text.

The 96-bit truncated digest keeps names short and makes accidental collision negligible for the expected number of sessions. It is not a security boundary.

The implementation must expose a small pure interface:

```ts
normalizeTmuxSessionDescriptor(input): TmuxSessionDescriptor | null
buildTmuxSessionName(descriptor): string
```

All Hobgoblin invocation builders use this interface. They must not duplicate serialization or hashing.

## Configuration

Rename the remote-only preference to a global internal-terminal preference:

```text
internalTerminalTmuxEnabled
```

Resolution and migration order:

1. If `internalTerminalTmuxEnabled` is present and valid, use it.
2. Otherwise, if legacy `remoteTerminalTmuxEnabled` is present and valid, use that value.
3. Otherwise, default to `false`.

Once preferences are written, persist only the new field. Update settings snapshots, bootstrap projection, renderer projection, native projection, tests, and UI copy consistently. The setting remains server-owned runtime-coherent state; this feature adds no state store or realtime channel.

The user-facing setting becomes **Use tmux for internal terminals**. Enabling it applies to eligible local and SSH internal terminals. Disabling it preserves the current direct-shell behavior.

## Invocation Semantics

### Internal local terminal

When the global setting is enabled on a POSIX host, the local adapter detects `tmux` in the terminal launch environment. If it is present, it starts or attaches using the descriptor name and normalized working directory:

```sh
tmux new-session -A -s '<session-name>' -c '<working-directory>'
```

If tmux is absent, launch the existing native shell unchanged. If tmux is detected but session creation or attachment fails, surface the tmux error and exit; do not silently launch a shell.

### Internal SSH terminal

The remote SSH script uses the same session name:

```sh
cd '<working-directory>' || exit
if command -v tmux >/dev/null 2>&1; then
  exec tmux new-session -A -s '<session-name>' -c '<working-directory>'
fi
exec "${SHELL:-/bin/sh}" -l
```

SSH still connects through the configured alias, but endpoint information does not participate in identity. Paths and names must use the existing shell-quoting seam.

### Built-in external terminal actions

Project-, worktree-, and branch-workspace-level actions for Terminal and Ghostty map to `terminalNumber: 1` because those actions do not target a selected terminal tab.

When the global setting is enabled, the native adapter opens its application with a command that performs the same tmux availability check and attach-or-create operation. For an SSH target, it uses the same managed SSH script and descriptor as the internal terminal. When the setting is disabled or tmux is unavailable, it retains the current direct-shell behavior.

A future action originating from a specific internal terminal tab may use that tab's actual terminal number, but no new UI is part of this work.

### Third-party external applications

Third-party callers use the documented algorithm and fixed test vectors; they do not need Hobgoblin to be running. A caller with the project root, working directory, and terminal number may execute the same idempotent command:

```sh
tmux new-session -A -s '<computed-name>' -c '<working-directory>'
```

Either Hobgoblin or the external caller may create the session first.

## Lifecycle and Concurrent Control

- Closing an internal terminal tab, disconnecting SSH, or quitting Hobgoblin detaches the Hobgoblin PTY without killing the tmux session.
- Reopening the same terminal slot reconnects to the same tmux session.
- Restarting an internal terminal rebuilds its PTY and reconnects; it does not restart the shell inside tmux.
- Removing a project, worktree, or branch workspace does not automatically kill its tmux sessions. Orphaned sessions are an accepted consequence of the no-cleanup scope.
- Legacy `goblin-*` sessions are ignored and left untouched.
- Do not use tmux options that detach existing clients when a new client attaches.

External tmux clients have full shared control. They may type and resize while an internal terminal is connected. Hobgoblin controller/viewer authority applies only to Hobgoblin attachments; it cannot constrain direct tmux clients. Tmux owns multi-client geometry policy, so an external client may affect the effective terminal dimensions independently of Hobgoblin's canonical geometry model.

## Error Handling

- Invalid or non-canonicalizable descriptors fail before spawning a PTY or external application.
- Unauthorized branch workspace targets fail before descriptor construction.
- A missing project or working directory remains an actionable path error.
- Missing tmux is a supported fallback condition.
- A detected but failing tmux installation is an execution error and is shown to the terminal user.
- Shell quoting treats paths as data; raw paths are never interpolated without the common quoting helper.
- Hashing failure is an internal error and must not fall back to an unrelated session name.

No error path may kill a tmux session, mutate repository state, or fall back from a known tmux failure to a non-persistent shell.

## Architecture Placement

- Keep descriptor normalization and name derivation in one pure system-level terminal identity module usable by server terminal orchestration and native terminal adapters.
- Keep PTY ownership and session lifecycle in `src/server/terminal/`.
- Keep local, SSH, Terminal, and Ghostty command construction in their existing system integration modules, delegating identity generation to the pure module.
- Keep settings persistence and migration in the existing settings source/write/read paths.
- Keep Electron main focused on native dispatch; it must not derive identity or own preference truth.
- Do not add renderer-side hashing. The renderer supplies terminal intent and projects server-owned results.

This placement preserves the enforced import boundaries and gives identity one deep interface shared by every invocation adapter.

## Verification

### Identity unit tests

- Stable output for identical descriptors.
- Different sample output when project root, working directory, or terminal number changes.
- Identical output after lexical normalization of `.`, `..`, repeated separators, and trailing separators.
- Different output for a symbolic-link logical path and its physical target path.
- Paths containing Unicode, spaces, and single quotes.
- Rejection of relative paths, control characters, NUL, zero, negative, fractional, and unsafe integer terminal numbers.
- Exact name format: `^hobgoblin-v1-[a-f0-9]{24}$`.
- Fixed test vectors whose input serialization and expected digest are copied into the public protocol documentation.

### Invocation tests

- Eligible local internal terminals use tmux when enabled and present.
- Local terminals fall back only when tmux is absent.
- Internal SSH terminals use the same descriptor and name as local computation.
- Plain workspaces, Git worktrees, branch workspace roots, and member worktrees map to the expected descriptors.
- Authorized branch workspace descriptors use persisted manifest paths rather than equivalent raw client spellings.
- Terminal and Ghostty project-level actions target `terminal-1` locally and over SSH.
- Built-in external terminal actions remain plain shells when the global preference is disabled.
- Simultaneous internal and external attachment does not add forced-detach flags.
- No invocation probes, attaches to, renames, or removes `goblin-*` sessions.

### Settings tests

- New preference wins when both new and legacy fields exist.
- A valid legacy value migrates when the new field is absent.
- Missing or invalid values default to `false`.
- Writes and runtime projections use the new field only.
- UI copy describes all internal terminals rather than remote terminals.

### Repository checks

```sh
bun run typecheck
bun run test
bun run check:architecture
```

## Documentation Deliverables

- This application design specification.
- Glossary additions in `CONTEXT.md` for tmux session descriptor and tmux session name.
- A public protocol document containing language-neutral pseudocode, normalization rules, attach/create examples, and fixed test vectors.
- Updated user-facing settings documentation where the remote-only preference is currently described.
