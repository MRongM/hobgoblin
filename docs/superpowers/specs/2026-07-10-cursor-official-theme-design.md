# Cursor Official Theme Design

## Goal

Repaint the existing `cursor` color preset so it follows the visual language of the current Cursor 3 Agents Window and is immediately distinguishable from the `claude` preset.

The change is limited to theme tokens. It does not alter component structure, theme persistence, typography, layout, or behavior.

## Visual Direction

Cursor is a compact, neutral task console. Its hierarchy comes from grayscale surface levels, one-pixel borders, and restrained contrast rather than a saturated brand accent.

Claude remains the warm conversational theme:

- warm paper canvases
- clay-orange accent
- brown-black dark surfaces

Cursor becomes the neutral agent workspace:

- cool-neutral white and gray light surfaces
- graphite dark surfaces
- black or white primary actions
- color reserved for semantic state and terminal ANSI output

This distinction must remain visible even when no primary action or selected row is present.

## Token Palette

### Light

- Canvas: `#f7f7f5`
- Base/rail: `#ececea`
- Raised/panel: `#ffffff`
- Topbar: `#f1f1ef`
- Primary text/action: `#1b1b1b`
- Secondary text: `#73736f`
- Default border: `#d8d8d4`
- Strong border: `#bdbdb8`

### Dark

- Canvas: `#181818`
- Base/rail: `#202020`
- Raised/panel: `#242424`
- Overlay/hover: `#292929`
- Primary text/action: `#ededed`
- Secondary text: `#949494`
- Default border: `#343434`
- Strong border: `#505050`

## Semantic Color

Cursor has no saturated global brand color. The semantic contract remains complete:

- Primary actions and selected states use neutral black in light mode and neutral white in dark mode.
- Focus rings use a visible neutral gray and must retain keyboard accessibility.
- Success uses green only for completed or healthy states.
- Warning uses amber only for waiting or attention states.
- Danger uses red only for destructive or failed states.
- Terminal activity uses a restrained cool blue so running output remains visible without becoming the app-wide accent.
- Terminal bell uses a distinct violet to avoid collision with activity, warning, and danger.
- Terminal ANSI colors remain chromatic and readable against each appearance's terminal background.

## Surfaces And Regions

The existing region hierarchy remains intact:

1. Topbar uses the topbar surface and a one-pixel separator.
2. Toolbar is slightly more raised than the topbar without introducing a hue tint.
3. Sidebar uses the base/rail surface.
4. Main panes use the canvas surface.
5. Cards, controls, and active tabs use the raised surface.
6. Hover and selected states rely on grayscale contrast before semantic color.

The theme keeps the existing component density. Radius contracts to `0.375rem` for the global radius and related control/brand radii, matching the compact six-pixel visual language of Cursor's current interface.

Shadows remain minimal. Borders and surface luminance carry the hierarchy; overlays may retain a functional medium shadow for separation.

## Terminal

Theme-synchronized terminals use the same canvas family as the app:

- Light terminal background uses the raised white surface with dark neutral foreground.
- Dark terminal background uses the dark canvas with light neutral foreground.
- Cursor and foreground match for clear caret visibility.
- Selection uses a neutral translucent fill rather than the previous orange fill.
- Search matches retain amber, while the active search match uses a high-contrast cool blue.
- Classic terminal mode remains unchanged.

## Architecture

Only `src/web/theme/themes/cursor.css` should change. The implementation must use the existing `--goblin-*` foundation tokens and terminal integration tokens.

Do not:

- add theme-ID conditionals in React
- change `claude.css`
- change the shared theme registry or persistence
- add dependencies
- add fonts or typography overrides
- modify layout or component markup

## Validation

Update or extend existing preset tests only where they assert Cursor token values. Verification must include:

- Cursor light and dark token blocks remain complete.
- Cursor no longer uses the Claude-adjacent orange accent or warm brown region surfaces.
- Cursor and Claude key foundation and region tokens differ in both appearances.
- Theme-synchronized terminal colors resolve for Cursor light and dark modes.
- `bun run typecheck` passes.
- Relevant theme tests pass.
- `bun run check:architecture` passes if the implementation touches any architecture-checked source.

## Success Criteria

- Cursor reads as a grayscale, agent-first workspace in both appearances.
- Claude remains recognizably warm and clay-accented.
- Cursor is distinguishable from Mono through softer neutral surfaces, tighter six-pixel radii, subtler contrast steps, and restrained cool activity color.
- Existing settings and per-project theme selection continue to work without migration.
