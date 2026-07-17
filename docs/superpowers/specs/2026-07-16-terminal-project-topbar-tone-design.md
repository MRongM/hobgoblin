# Terminal and project topbar tone design

Date: 2026-07-16

## Goal

Make every desktop terminal-area topbar use the same complete theme tone as
the project-area topbar across every shipped theme: background, bottom
border, foreground, muted foreground, and interactive control colors.

## Current state

- `SidebarProjectHeader` uses the `topbar` color token family.
- `BranchDetailToolbar` and `PlainWorkspaceTerminalPanel` use the generic
  `toolbar` color token family.
- The two token families intentionally differ in most themes, so the adjacent
  top-edge surfaces do not currently match.
- The terminal toolbar also owns layout-specific window drag behavior. Color
  changes must not change its spacing, height, terminal tabs, or drag regions.

## Decision

Keep toolbar layout and topbar tone as independent concepts:

1. Add an optional tone to the shared `Toolbar`, defaulting to its existing
   toolbar tone so all current consumers remain unchanged.
2. Provide a reusable topbar-tone scope that maps surface, border, text, and
   control interaction colors to the existing topbar theme tokens without
   adding native-window padding or drag behavior.
3. Opt the desktop `BranchDetailToolbar` and
   `PlainWorkspaceTerminalPanel` into the topbar tone.
4. Keep the structural `.topbar` class for its existing focus-mode native
   window chrome behavior.
5. Keep compact UI on the generic toolbar tone because it has no adjacent
   project-area topbar and the shell specification says compact UI is
   unchanged.

This avoids local color duplication and avoids globally changing unrelated
toolbars.

## Verification

- Add component regression tests proving both desktop terminal toolbar paths
  opt into the topbar tone, compact UI retains the generic toolbar tone, and
  `BranchDetailToolbar` retains the existing left-right drag-region class.
- Add or extend the theme contract test proving the reusable tone scope maps
  controls to the same topbar tokens as `.topbar`.
- Run targeted tests, typecheck, the full test suite, and the architecture
  boundary check.

## Non-goals

- No theme preset values change.
- No toolbar height, spacing, tab behavior, responsive behavior, or native
  window padding changes.
- No compact or unrelated toolbar adopts the topbar tone.

## Grill findings

- “Terminal-area topbar” includes both Git branch terminals and plain
  workspace terminals; limiting the change to `BranchDetailToolbar` would
  leave inconsistent behavior for non-Git workspaces.
- “Match” means semantic token reuse, not copying preset hex values. This
  keeps all current and future themes coherent.
- Tone and native-window structure remain separate. The reusable tone scope
  must not acquire drag-region padding.
- The decision is small, local, and reversible, so it does not justify an ADR
  or a domain glossary change.
