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

After computing the name, an external application may create or attach idempotently:

```sh
tmux new-session -A \
  -s 'hobgoblin-v1-aebf050981ac829e36100020' \
  -c '/srv/projects/example/worktrees/feature' \
  \; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on \
  \; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020' \
       @hobgoblin_init_path '/srv/projects/example/worktrees/feature' \
  \; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020' \
       @hobgoblin_terminal_number '1'
```

Do not supply a tmux `session_id` or add a forced-detach option. Tmux allocates the session ID, while Hobgoblin and external tmux clients intentionally have concurrent shared control. The exact session-name target enables mouse support only on the selected session.

All current Hobgoblin launch adapters set the two options after creating or attaching. Reattaching through a known descriptor therefore adds or repairs missing metadata idempotently. A third-party creator that wants Android discovery must write the same options.

## Android discovery and recovery

When an Android project Terminals surface opens, it may list live sessions with:

```sh
tmux list-sessions -F '#{session_name}\t#{@hobgoblin_init_path}\t#{@hobgoblin_terminal_number}'
```

Android accepts one row only when:

- the initial path is already lexically normalized and exactly matches the project root or a known non-missing worktree path;
- the terminal number is canonical positive base-10 ASCII;
- the session name matches the v1 name pattern; and
- hashing the project root, initial path, and terminal number reproduces that exact session name.

Invalid rows, ordinary user sessions, legacy names, and v1 sessions without both options are ignored independently. An accepted session missing from Android's retained records becomes a disconnected `terminal-N` record. Discovery does not open an SSH shell; opening that record uses the ordinary reconnect path to attach to the verified session.

Removing only the Android record leaves tmux alive, so a later scan may recover it again. Closing the associated tmux session through the explicit checked close action prevents later recovery.

## Runtime association and exact close

When Hobgoblin launches an internal terminal through this protocol, it records the calculated session name and normalized working directory on the server-side terminal record. This association is fixed for that terminal's lifetime; changing the tmux preference later does not reclassify an existing terminal.

The renderer may receive a boolean indicating that an internal terminal is tmux-backed, but it does not receive the session name. If the user explicitly chooses to close the associated tmux session while closing one internal terminal, the server validates the stored name against the current `hobgoblin-v1-` protocol and requires the stored path to exactly match the terminal worktree path before issuing `kill-session` locally or over SSH.

Closing the associated tmux session is fail-closed: Hobgoblin keeps the internal terminal open when validation or the tmux command fails. A session that disappeared after confirmation is treated as already closed. Bulk terminal-close actions never close tmux sessions.

Version 1 does not discover, migrate, attach to, rename, or delete legacy `goblin-*` sessions.
