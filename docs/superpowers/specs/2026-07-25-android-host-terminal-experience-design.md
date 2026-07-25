# Android Host and Terminal Experience Design

## Goal

Make host navigation project-oriented, place connectivity diagnostics inside host editing, and turn the Android terminal into a deliberate light/dark command workspace with a true focus mode.

## Product behavior

### Host navigation and diagnostics

- Tapping a saved Host opens the Projects tab filtered to Projects whose `hostProfileId` matches that Host.
- The filtered Projects view identifies the Host, offers a clear action, and has a host-specific empty state.
- Explicit Host actions remain separate: Terminal, Edit, Ports, and Delete.
- The Edit Host screen always exposes the saved Host's connectivity diagnostic. It runs against the current draft fields and retains the result in the draft until the user saves changes.
- Terminal navigation that previously returned to the standalone diagnostic screen returns to Edit Host.

The project filter is local presentation/navigation state. It is not persisted and does not change Project ordering or storage.

### Terminal appearance

The terminal has a device-local, restorable `Light` or `Dark` appearance preference. Switching appearance recolors the viewport, ANSI base palette, selection, notices, command input, and terminal controls without changing the application-wide theme or the remote session.

Palette:

- Dark canvas `#0A0E12`, dark surface `#121820`, dark ink `#E7EDF3`, dark divider `#293544`, signal `#65B9FF`.
- Light canvas `#F3F6F8`, light surface `#E7EDF2`, light ink `#17212B`, light divider `#C4CFD8`, signal `#246EA8`.

The existing bundled terminal typeface remains the terminal/data face. Material typography remains the UI/control face; no new font dependency is introduced.

### Terminal interaction

The standard terminal presentation consists of:

```text
┌ back ─ terminal/path + status ─ menu ┐
│                                      │
│             terminal                 │
│                                      │
├ Esc Tab Ctrl C/L Enter Backspace ... ┤
├ Command · Fit · Light/Dark · Focus   ┤
└ optional command composer ───── Send ┘
```

The bottom command deck is the signature element: terminal-specific input and presentation controls are grouped into a compact instrument rail, while destructive session actions stay in the overflow menu.

### Android terminal focus mode

Focus mode is temporary, local presentation state. It is off by default, is never persisted, and resets when the terminal destination changes. While focused:

- the top app bar, command deck, and command composer are hidden;
- the terminal viewport consumes the available screen;
- a small `Exit focus` handle remains available;
- system Back exits focus before navigating away.

## Architecture and state

- `HobgoblinAndroidApp` owns the temporary selected Host filter because it coordinates Hosts and Projects destinations.
- `ProjectsScreen` receives the filter and exposes pure filtering/empty-copy helpers for unit tests.
- `AddHostScreen` owns diagnostic interaction state because it already owns the Host draft.
- `TerminalSettingsStore` owns the restorable terminal appearance preference, alongside fit-to-screen.
- `TerminalScreen` owns focus, command-deck, and appearance interaction; the terminal emulator palette is updated through the Android terminal view boundary.
- No server, SSH protocol, session ownership, or realtime changes are required.

## Error handling

- Diagnostic failures stay inline in Edit Host and do not mutate saved fields.
- A deleted or missing Host clears the Projects filter through normal Host reload/navigation behavior.
- Unknown persisted terminal appearance values fall back to Dark.
- Theme changes invalidate the terminal view but do not reconnect or recreate a terminal session.

## Verification

- Unit tests cover Host project filtering, terminal return routing, terminal appearance parsing/palette values, and focus visibility rules.
- Contract tests cover the Edit Host diagnostic placement and terminal view theme application.
- Run `./gradlew test`, `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

