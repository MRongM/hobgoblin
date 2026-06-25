# Terminal Theme Follow-Through Design

## Summary

Fix the embedded xterm canvas so it reliably follows the selected app color theme when `terminalThemeSyncEnabled` is enabled. The current user-visible failure is that surrounding app chrome changes, but newly created and existing terminals remain on a classic black terminal palette.

The selected direction is to harden the existing token pipeline:

`Settings -> useThemeStore -> html[data-theme/data-color-theme] -> CSS tokens -> terminalThemeForCurrentDocument() -> xterm.options.theme`

Do not add a new theme subsystem, do not add React branches by theme name, and do not replace CSS tokens with a duplicated TypeScript palette table.

## Confirmed Decisions

- Symptom scope: app chrome changes, but the xterm content area remains classic black.
- Terminal theme sync setting is enabled.
- Newly created terminals also remain classic black, so the issue is not limited to stale existing terminal instances.
- Preferred approach: fix the existing CSS-token-to-xterm application path.
- Git behavior: write this spec only; do not commit unless explicitly requested.

## Goals

- Make the embedded terminal content area follow the selected app theme by default.
- Ensure both already open terminals and newly created terminals receive the themed palette.
- Preserve the existing `data-theme` and `data-color-theme` architecture.
- Keep terminal surrounding chrome, tabs, controls, and overlays on existing semantic app tokens.
- Preserve classic terminal palette behavior when `terminalThemeSyncEnabled` is disabled.
- Add tests that exercise real theme CSS, not only manually injected test styles.

## Non-Goals

- Do not change external Terminal.app or Ghostty behavior.
- Do not add user-editable custom terminal themes.
- Do not add per-theme React component conditionals.
- Do not redesign terminal layout, tabs, input behavior, scrollback, geometry, or font measurement.
- Do not introduce new package dependencies.

## Architecture

The fix stays at the terminal integration boundary.

`src/web/stores/theme.ts` remains responsible for applying `data-theme` and `data-color-theme` to `document.documentElement`.

`src/web/theme/themes/*.css` remains the source of theme-specific terminal values through `--color-terminal-*` tokens and classic fallback values through `--color-terminal-classic-*` tokens.

`src/web/components/terminal/terminal-theme.ts` remains the adapter from CSS custom properties to xterm `ITheme`. It should be strengthened so it returns a complete, non-empty theme object for both `theme` and `classic` modes.

`src/web/components/terminal/terminal-session-view.ts` remains responsible for applying the resolved `ITheme` to an xterm instance. It should apply the theme when a terminal is created, when document theme attributes change, and when `terminalThemeSyncEnabled` changes mode.

## Data Flow

When terminal theme sync is enabled:

1. The user selects a color theme in Settings.
2. `useThemeStore.setColorTheme()` persists the preference and updates `html[data-color-theme]`.
3. Open terminal views observe `data-theme` and `data-color-theme` mutations.
4. Each terminal reads themed `--color-terminal-*` computed values.
5. Each xterm instance receives the new `term.options.theme`.
6. The terminal frame background and xterm viewport reflect the same background token.
7. xterm is lightly refreshed if needed so the visible content updates immediately.

When terminal theme sync is disabled:

1. Runtime settings set terminal mode to `classic`.
2. Terminal views read `--color-terminal-classic-*` values.
3. The xterm content area uses the fixed classic palette.
4. Surrounding terminal chrome continues to follow app theme tokens.

## Terminal Behavior

The terminal must not remain classic black while sync is enabled unless the selected theme intentionally defines that exact terminal background.

Existing terminal sessions should update without requiring restart, tab switching, or app reload.

New terminal sessions should use the selected theme from first paint.

Search decorations should use the same mode as the terminal content area:

- themed mode: `--color-terminal-search-*`
- classic mode: `--color-terminal-classic-search-*`

## Fallbacks

Runtime fallback behavior should keep terminals usable:

- Missing classic tokens fall back to corresponding themed tokens.
- Missing themed tokens fall back to explicit safe defaults instead of returning empty strings.
- Missing or cyclic CSS variables must not throw during terminal theme calculation.

Tests should be stricter than runtime. They should fail if a theme file omits required terminal tokens, so runtime fallbacks do not hide incomplete theme definitions.

## Implementation Notes

Expected focus areas:

- Audit `terminalThemeForCurrentDocument()` against real theme CSS and real `data-color-theme` values.
- Ensure `TerminalSessionView.applyTerminalTheme()` updates `term.options.theme`, frame background, and any required xterm refresh path.
- Ensure `setTerminalThemeMode()` updates already-created terminal instances.
- Ensure `observeTerminalTheme()` covers the attributes and events that can change computed terminal tokens.
- Keep all theme values in CSS. TypeScript should only resolve tokens and provide fallback defaults.

Do not add component-level checks such as `if (colorTheme === 'github')`.

## Error Handling

- Setting write failures continue to use the existing settings controller warning behavior.
- Theme token resolution failures should degrade to safe defaults and avoid crashing terminal creation.
- If a terminal theme update happens before xterm is opened, the next `openTerminal()` call should read current document tokens.
- If a terminal is parked or detached, theme updates should still affect its xterm instance so it is correct when reattached.

## Testing

Add or update focused tests:

- `src/web/components/terminal/terminal-theme.test.ts`
  - Reads themed terminal tokens from real theme CSS for at least two contrasting themes.
  - Reads classic tokens when mode is `classic`.
  - Falls back safely for missing classic tokens.
  - Does not return empty strings for required xterm `ITheme` fields.

- `src/web/theme/theme-presets.test.ts`
  - Every `COLOR_THEMES` entry has light and dark terminal token coverage.
  - Every theme provides classic terminal token coverage or a shared validated fallback.

- `src/web/components/terminal/ManagedTerminalSession.test.ts` or `TerminalSessionProvider.test.tsx`
  - New terminal sessions receive themed mode when `terminalThemeSyncEnabled` is true.
  - Switching `terminalThemeSyncEnabled` updates existing sessions.
  - Theme attribute changes update an already-created terminal view.

Verification commands:

- `bun run typecheck`
- Targeted terminal/theme/settings tests touched by the change
- `bun run test` if the implementation changes shared settings or broader terminal session behavior

## Acceptance Criteria

- With `terminalThemeSyncEnabled=true`, switching app theme changes the xterm content background, foreground, cursor, selection, ANSI colors, and search decoration colors.
- The behavior applies to both existing terminal tabs and newly created terminal tabs.
- With `terminalThemeSyncEnabled=false`, the xterm content area stays on the classic palette while terminal chrome still follows app theme.
- No React component branches on specific theme IDs.
- No duplicated TypeScript theme palette table is introduced.
- Typecheck and focused tests pass.

## Engineering Principles

- KISS: keep the existing theme architecture and fix the narrow terminal integration path.
- YAGNI: do not build custom terminal theme editing or a second theme registry.
- DRY: keep color values in CSS tokens; TypeScript resolves tokens but does not duplicate palettes.
- SOLID: keep settings, theme token definition, and xterm application responsibilities separated.
