# Topbar Tab Depth Theme Design

## Summary

Adjust theme preset tokens so each style gives the top application bar more visual depth than the tab strip. The selected direction is **subtle topbar deepening**: the topbar should read as the containing shell, while active tabs should read as working objects placed on top of that shell.

This is a token-only visual refinement. Component structure, tab behavior, and the existing `data-theme` plus `data-color-theme` architecture remain unchanged.

## Confirmed Decisions

- Visual direction: topbar slightly deeper than the tab strip.
- Scope: all shipped color presets, in both light and dark appearance.
- Implementation shape: update theme CSS token values only.
- Component rule: no React branches by `colorTheme`, no new theme-specific component classes.
- Git behavior: do not commit this spec unless explicitly requested.

## Goals

- Make the topbar read as the deepest chrome layer in the top navigation region.
- Keep active repo and terminal tabs visibly elevated from the topbar.
- Preserve each preset's existing brand personality.
- Avoid making light themes feel heavy or dark themes muddy.
- Keep token names and component consumption unchanged where possible.

## Non-Goals

- Do not redesign tab sizing, spacing, drag behavior, or overflow behavior.
- Do not change `Topbar`, `RepoTabStrip`, `TerminalTabs`, or shared tab-strip component logic unless implementation finds a direct token consumption bug.
- Do not add custom user theme editing.
- Do not add a new theme generation pipeline.
- Do not change terminal palettes as part of this refinement.

## Current Context

The relevant styling already flows through semantic tokens:

- `Topbar` uses `bg-topbar`, mapped from `--goblin-topbar-bg`.
- Shared toolbar tabs use `bg-tab-hover` and `bg-tab-active`, mapped from `--goblin-tab-hover-bg` and `--goblin-tab-active-bg`.
- Theme preset values live under `src/web/theme/themes/*.css`.
- Token completeness is covered by `src/web/theme/theme-presets.test.ts`.

Many dark presets already have the desired direction: topbar is the darkest layer, tab hover is slightly lighter, and active tabs are lighter still. Several light presets currently make the topbar equal to the canvas or lighter than active tabs, which weakens the top navigation hierarchy.

## Visual Rule

For each preset:

- Light appearance:
  - `--goblin-topbar-bg` should be one step deeper than `--goblin-tab-active-bg`.
  - `--goblin-tab-active-bg` should stay close to raised/card surfaces.
  - `--goblin-tab-hover-bg` should sit between topbar and active tab, or use a subtle hover tint that does not overpower active tabs.
- Dark appearance:
  - `--goblin-topbar-bg` should remain the deepest top chrome layer.
  - `--goblin-tab-hover-bg` should be slightly lighter than topbar.
  - `--goblin-tab-active-bg` should be lighter than hover so active tabs remain legible.

The target is relative depth, not identical contrast ratios across themes. Brand-specific palettes can vary as long as this hierarchy is preserved.

## Theme Interpretation

- `macos`: quiet gray depth; topbar can move from pure white toward the soft base surface in light mode.
- `mono`: neutral hierarchy; topbar should be plainly distinct without adding color personality.
- `github`: GitHub-like header rhythm; light mode should avoid white-on-white chrome.
- `claude`: warm parchment depth; topbar should use a warmer muted surface while active tabs remain lighter.
- `cursor`: editor-like off-white shell; topbar should sit behind white active tabs.
- `airbnb`: soft hospitality surfaces; deepen topbar subtly without creating a strong red band.
- `bmw`: high-contrast brand chrome; topbar may use firmer separators and sharper neutral depth.

## Error Handling

No runtime error path changes are needed. Missing tokens continue to be caught by existing token coverage tests. Unknown theme IDs continue to normalize through the existing settings and boot paths.

## Testing

Required verification after implementation:

```bash
bun run typecheck
bun run test
```

Focused verification:

- `src/web/theme/theme-presets.test.ts` still passes for all required tokens.
- Add or update a focused assertion if practical to validate topbar/tab relative depth for all preset light and dark selectors.
- Manual visual check of all themes in light and dark mode, with repo tabs and terminal tabs visible.

## Acceptance Criteria

- In every light theme, the topbar is visibly deeper than active tabs without becoming a heavy brand band.
- In every dark theme, topbar remains the deepest top chrome layer and active tabs remain clear.
- Existing tab behavior, layout, sizing, and accessibility semantics are unchanged.
- No component-level `colorTheme` branching is introduced.
- No terminal palette or settings behavior changes are introduced.
- Typecheck and tests pass.

## Engineering Principles

- KISS: adjust the existing token values rather than adding a new styling mechanism.
- YAGNI: do not introduce custom theme editing or derived color generation.
- DRY: keep the relationship centralized in preset tokens consumed by existing semantic aliases.
- SOLID: keep theme definitions separate from tab and topbar component behavior.
