# Tmux Session Recovery Design

## Goal

Make every `tmux terminal` menu action open all Hobgoblin tmux sessions whose normalized initial path exactly matches the selected terminal directory, without repeatedly creating internal terminals to discover their original slot numbers.

## Identity and recovery

New Hobgoblin tmux sessions keep the current `hobgoblin-v1-<digest>` name and store both identity inputs in tmux user options: normalized initial working directory in `@hobgoblin_init_path` and positive terminal slot number in `@hobgoblin_terminal_number`. These options live with tmux, so recovery works after application state is gone and for remote sessions without a second durable mapping.

Session listing returns name, `@hobgoblin_init_path`, and `@hobgoblin_terminal_number` in one command. A session is recognized only when the initial path normalizes to the selected directory, the number is a positive safe integer, and rebuilding the v1 name from the current project root plus those two values produces the listed name.

Missing, corrupt, mismatched, or legacy metadata is ignored. Discovery never mutates or attaches to such sessions and never treats a name-shaped user session as Hobgoblin-owned by name alone.

## Batch open behavior

`tmux terminal` uses one server-owned realtime operation:

1. Authorize and normalize the selected terminal target.
2. List associated current-protocol sessions once.
3. Sort validated sessions by original terminal number, then by name.
4. Reuse an internal terminal already attached to the same tmux name.
5. Otherwise use the validated slot when free; use the next free internal slot on conflict.
6. Attach every discovered session by exact tmux name.
7. If no associated session exists, preserve current behavior by creating one tmux-if-available terminal.

The server remains the authority for association and slot assignment. Renderer code receives the ordinary terminal catalog mutation result and reconciles the returned full session list, so menu callers do not own tmux discovery state.

## Close safety

A tmux-backed internal terminal is safely closable by Hobgoblin only when its exact session name equals the v1 hash derived from its assigned internal terminal number and normalized paths. The server stores and publishes this capability with the live terminal summary.

When a validated session is attached by name into a different internal slot, the close dialog does not offer the destructive “also close tmux” checkbox. It instead tells the user to run `exit` inside tmux. The server independently rejects a forged close-tmux request with the same localized error key.

Closing only the Hobgoblin internal terminal remains available and leaves the tmux session running.

## Compatibility and boundaries

- Existing v1 session names do not change.
- Existing sessions without both metadata options are ignored and are not mutated during discovery.
- Only exact-path sessions whose metadata reproduces their current-protocol name are opened; arbitrary user tmux sessions, forged names, and descendant paths are excluded.
- Local and SSH-backed targets use the same metadata and validation rules.
- Native terminal creation and ordinary terminal restoration remain unchanged.
- No dependencies, settings, background cleanup, or application-local tmux identity database are added.

## Testing

- Unit-test metadata command generation for local and remote tmux launches.
- Unit-test three-field parsing, corrupt metadata rejection, and strict path/number/name validation.
- Server-test batch ordering, exact-name reuse, preferred-slot recovery, conflict fallback, empty-list creation, and close rejection.
- Renderer-test that tmux launch mode calls the batch operation and reconciles all returned sessions.
- UI-test that mismatched sessions show the `exit` guidance and cannot request destructive tmux closure.
- Verify all four locales, TypeScript projects, architecture boundaries, focused tests, and the full suite.
