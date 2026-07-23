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
tmux new-session -A -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature'
```

Do not add a forced-detach option. Hobgoblin and external tmux clients intentionally have concurrent shared control.

Version 1 does not discover, migrate, attach to, rename, or delete legacy `goblin-*` sessions.
