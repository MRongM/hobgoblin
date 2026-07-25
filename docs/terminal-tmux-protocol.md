# Tmux Session Identity Protocol

Hobgoblin tmux session identity version 1 lets internal terminals and external terminal applications create or attach to the same session without contacting a running Hobgoblin process.

## Descriptor

A session descriptor contains:

```text
projectRoot       absolute logical POSIX project or repository root
workingDirectory absolute logical POSIX terminal working directory
terminalNumber   positive one-based integer
```

SSH aliases, users, hosts, ports, branch names, display names, and Hobgoblin `term_<UUID>` PTY IDs are not identity fields. Tmux already isolates its namespace by operating-system host and user.

## Path normalization

Normalize both paths lexically using POSIX rules:

- require a non-empty absolute path;
- reject NUL and ASCII control characters;
- collapse repeated `/` separators;
- remove `.` segments;
- resolve `..` segments without escaping `/`;
- remove the trailing `/` except for `/` itself;
- do not call `realpath` or resolve symbolic links;
- do not case-fold or normalize Unicode.

Serialize `terminalNumber` as base-10 ASCII without leading zeroes. Reject zero, negative, fractional, and unsafe integer values.

## Project-scoped server

Every descriptor selects one tmux server from its normalized `projectRoot`. UTF-8 encode and join these fields with one NUL byte:

```text
hobgoblin-tmux-server-v1
<normalized projectRoot>
```

The server name is `hobgoblin-project-v1-` followed by the first 24 lowercase hexadecimal characters of the SHA-256 digest. It matches:

```text
^hobgoblin-project-v1-[a-f0-9]{24}$
```

For `/srv/projects/example`, the server name is:

```text
hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0
```

All root and worktree terminals with the same descriptor project root share this server. Different project roots do not share a tmux server, and new Hobgoblin sessions do not use the user's default server. The server name is deterministic transport placement rather than another session-identity field, so it is recomputed instead of persisted.

For a Git repository with linked worktrees, `projectRoot` is the main worktree path (the first `worktree` entry from `git worktree list --porcelain`). A linked worktree path remains the terminal `workingDirectory`; it must not replace `projectRoot`, otherwise the same repository produces a different server and session hash. Android canonicalizes newly added linked-worktree projects to the main worktree and repairs older saved project records after loading their worktree snapshot.

## Name calculation

UTF-8 encode these four fields and join them with exactly one NUL byte (`0x00`):

```text
hobgoblin-terminal-session-v1
<normalized projectRoot>
<normalized workingDirectory>
<canonical terminalNumber>
```

Language-neutral pseudocode:

```text
fields = [
  "hobgoblin-terminal-session-v1",
  normalizePosixPath(projectRoot),
  normalizePosixPath(workingDirectory),
  decimal(terminalNumber),
]
serialized = joinUtf8(fields, byte(0x00))
digest = lowercaseHex(sha256(serialized))
name = "hobgoblin-v1-" + firstCharacters(digest, 24)
```

The result matches:

```text
^hobgoblin-v1-[a-f0-9]{24}$
```

The truncated digest prevents raw path disclosure and provides ample collision resistance for terminal-session naming. It is not an authentication secret.

## Session metadata

Every Hobgoblin v1 attach-or-create invocation writes two exact session-scoped tmux user options:

```text
@hobgoblin_init_path=<normalized workingDirectory>
@hobgoblin_terminal_number=<canonical terminalNumber>
```

The initial path records descriptor identity and does not change when a shell later changes directory. The terminal number is positive base-10 ASCII without a sign or leading zeroes. These values are discoverable protocol metadata, not authentication claims; another tmux client may change them, in which case the session no longer passes discovery validation.

## Reference vector

```text
projectRoot      = /srv/projects/example
workingDirectory = /srv/projects/example/worktrees/feature
terminalNumber   = 1

serialized fields:
hobgoblin-terminal-session-v1<NUL>/srv/projects/example<NUL>/srv/projects/example/worktrees/feature<NUL>1

SHA-256:
aebf050981ac829e36100020f43af96bc0c5c747314eda0ab2775128ea38b92a

session name:
hobgoblin-v1-aebf050981ac829e36100020
```

Each displayed `<NUL>` is one byte with value `0x00`, not source text or a string escape.

## Attach or create

After computing the session and server names, an external application may create or attach idempotently:

```sh
tmux -L 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0' new-session -A \
  -s 'hobgoblin-v1-aebf050981ac829e36100020' \
  -c '/srv/projects/example/worktrees/feature' \
  \; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on \
  \; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' \
       @hobgoblin_init_path '/srv/projects/example/worktrees/feature' \
  \; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' \
       @hobgoblin_terminal_number '1'
```

All three `set-option` commands run in the selected project server and use the exact target-pane form `=<session>:`. The trailing colon is required: using `=<session>` fails on tmux 3.6a and leaves the identity options unset even though the session itself was created.

For upgrade compatibility, attach-or-create checks the project server first. If it does not contain the exact deterministic name but the legacy default server does, Hobgoblin attaches there and repairs its metadata. If neither server contains the name, Hobgoblin creates it in the project server. This fallback never creates a new session in the default server.

Remote adapters resolve the tmux executable once before attach, list, or kill. They first inspect the non-login command `PATH`, then fall back to `${SHELL:-/bin/sh} -lc 'command -v tmux'`, validate an executable absolute path, and invoke that quoted path for every subsequent tmux command. This supports installations such as Homebrew tmux that are only added by login-shell startup files. Failure to resolve tmux is an explicit command failure, not an empty discovery result.

Inspect the live metadata with:

```sh
tmux -L 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0' -u list-sessions \
  -F 'name=#{session_name} init_path=#{@hobgoblin_init_path} terminal=#{@hobgoblin_terminal_number} attached=#{session_attached}'
```

Do not supply a tmux `session_id` or add a forced-detach option. Tmux allocates the session ID, while Hobgoblin and external tmux clients intentionally have concurrent shared control. The exact target enables mouse support and identity metadata only on the selected session.

All current Hobgoblin launch adapters set the two options after creating or attaching. Reattaching through a known descriptor therefore adds or repairs missing metadata idempotently. A third-party creator that wants discovery must write the same options with the same exact target-pane syntax.

## Desktop directory recovery

The worktree and branch-workspace item menus keep tmux creation and recovery as separate operations:

- **New tmux terminal** creates one internal terminal through the normal `tmux-if-available` launch path. It does not scan the directory.
- **Restore tmux terminals** scans the selected directory and batch-opens only existing detached Hobgoblin sessions. It never creates a replacement session when no match exists.

Local and SSH recovery list both the project server and the legacy default server. Each row retains its validated origin internally; conceptually the format is:

```sh
#{@hobgoblin_init_path}\t#{@hobgoblin_terminal_number}\t#{session_attached}\t#{session_name}\t<server-origin>
```

A row is eligible only when the server origin is the derived project server or the explicit `legacy-default` marker, and the path, terminal number, and recomputed v1 name pass the association rules described below. Recovery additionally requires `session_attached` to be the canonical integer `0`. Rows with attached clients, malformed attachment counts, unknown origins, legacy names, mismatched paths, or mismatched hashes are ignored. If the same valid session exists in both servers, the project-scoped copy wins. An empty eligible set is a successful no-op and leaves the terminal catalog unchanged.

A missing project or legacy server contributes an empty result. Any other list failure aborts recovery instead of being hidden by a missing-server response from the other origin.

## Android discovery and recovery

When an Android project Terminals surface opens, it lists the derived project server and the legacy default server with the same origin markers:

```sh
#{session_name}\t#{@hobgoblin_init_path}\t#{@hobgoblin_terminal_number}\t<server-origin>
```

Android accepts one row only when:

- the initial path is already lexically normalized and exactly matches the project root or a known non-missing worktree path;
- the terminal number is canonical positive base-10 ASCII;
- the session name matches the v1 name pattern; and
- hashing the project root, initial path, and terminal number reproduces that exact session name.

Invalid rows, unknown server origins, ordinary user sessions, legacy names, and v1 sessions without both options are ignored independently. Project-server rows are emitted first and win same-name deduplication. An accepted session missing from Android's retained records becomes a disconnected `terminal-N` record. Discovery does not open an SSH shell; opening that record uses the ordinary reconnect path, which checks the project server before the legacy default server. Android recomputes the server name from the canonical main-worktree project root retained by the terminal record, so its terminal-session persistence format does not gain a socket field.

Removing only the Android record leaves tmux alive, so a later scan may recover it again. Closing the associated tmux session through the explicit checked close action prevents later recovery.

## Runtime association and exact close

When Hobgoblin launches an internal terminal through this protocol, it records the calculated session name and normalized working directory on the server-side terminal record. This association is fixed for that terminal's lifetime; changing the tmux preference later does not reclassify an existing terminal.

The renderer may receive a boolean indicating that an internal terminal is tmux-backed, but it does not receive the session name or server origin. If the user explicitly chooses to close the associated tmux session while closing one internal terminal, the server re-lists both eligible servers, validates the stored name against the current `hobgoblin-v1-` protocol, requires the stored path to exactly match the terminal worktree path, and issues `kill-session` only against the validated origin locally or over SSH.

Closing the associated tmux session is fail-closed: Hobgoblin keeps the internal terminal open when validation or the tmux command fails. A session that disappeared after confirmation is treated as already closed. Bulk terminal-close actions never close tmux sessions.

Version 1 does not discover, migrate, attach to, rename, or delete legacy `goblin-*` sessions.
