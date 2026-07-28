---
status: accepted
---

# Discover Android host tmux sessions from server sockets

Android discovers recoverable Hobgoblin tmux sessions by enumerating the selected SSH user's default socket and strictly named `hobgoblin-project-v1-*` sockets, then projecting the protocol metadata carried by each live session. This replaces workspace-registry-driven discovery because tmux runtime state is the authoritative source for terminal recovery and must include projects not saved on Android or registered as workspaces.

## Consequences

The Android list no longer reconstructs workspace or project-root relationships and therefore treats the actual server target as part of retained terminal identity. Existing v1 session metadata remains sufficient for listing and exact attachment, while arbitrary tmux sessions without a current Hobgoblin name, normalized initial path, and positive terminal number remain excluded.
