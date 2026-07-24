# Isolate tmux servers by project root

Hobgoblin derives one deterministic tmux server name from each normalized tmux descriptor project root, so a server failure affects that project rather than every Hobgoblin and user session on the host. New sessions use the project-scoped server; discovery and exact cleanup also inspect the legacy default server for upgrade compatibility, prefer an equivalent project-scoped session, and never persist a machine-specific socket path.

## Considered options

A single Hobgoblin server would protect the user's default tmux server but retain an all-project failure domain. A server per terminal would maximize isolation but multiply processes and make unknown-session recovery depend on socket enumeration. Project-root scope matches the existing session descriptor, keeps server selection deterministic across desktop, SSH, external terminals, and Android, and preserves directory recovery without introducing another durable identity field.

## Consequences

Every create, attach, list, restore, and kill path must use the same server-name algorithm. During the compatibility period, a live project-scoped session takes precedence over a same-named legacy default-server session; cleanup revalidates the chosen server before killing it.
