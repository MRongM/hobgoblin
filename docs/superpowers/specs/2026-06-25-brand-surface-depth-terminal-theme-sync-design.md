# Brand Surface Depth And Terminal Theme Sync Design

## Summary

Deepen the existing brand theme system so theme presets visibly affect the main workspace chrome, input surfaces, toolbars, and embedded terminal. The selected direction is **brand-system depth**: keep the current `data-theme` plus `data-color-theme` architecture, expand semantic CSS tokens, and make shared UI primitives consume those tokens.

The embedded terminal follows the application style by default. A new General setting lets users keep the terminal on the classic terminal palette while the surrounding terminal UI still follows the app theme.

## Confirmed Decisions

- Visual direction: brand-system depth.
- Terminal default: follows the application style.
- Region scope: all main workspace section bars, including branch area bars, explorer tabs, and detail headers.
- Input scope: all search and input-like controls, including shared `Input`, file tree search, terminal search, remote branch search, and settings path inputs.
- Implementation shape: token expansion plus small shared component changes; no React theme branches.
- Git behavior: do not commit this spec unless explicitly requested.

## Goals

- Make theme changes visible in `Topbar`, repo tab strip, main workspace section bars, toolbars, input fields, search fields, selected rows, and embedded terminal.
- Preserve the current theme architecture and server-owned settings model.
- Add a persistent user setting for terminal theme sync.
- Keep component code theme-agnostic by consuming semantic tokens instead of branching on `colorTheme`.
- Reuse shared primitives where possible, especially `Input`, `Button`, and `Toolbar`.
- Keep terminal font, terminal geometry, external terminal preferences, and terminal session behavior unchanged.

## Non-Goals

- Do not add user-editable custom themes.
- Do not add a new React theme provider or per-theme component branches.
- Do not change external Terminal.app or Ghostty settings.
- Do not restore branch search unless separately requested.
- Do not redesign layout structure, pane sizing, or tab behavior.
- Do not introduce package dependencies.

## Architecture

The app keeps the existing three-layer theme model:

1. `--goblin-*` foundation and app-region tokens.
2. `--color-*` semantic aliases used by Tailwind and shadcn-style primitives.
3. Integration tokens for surfaces outside normal Tailwind classes, especially xterm.

The implementation should extend the token contract first, then update shared surfaces to consume those tokens:

- `src/web/theme/contract.css` maps new or refined `--goblin-*` tokens to semantic `--color-*` aliases where useful.
- `src/web/theme/themes/*.css` provides complete light/dark token values per theme.
- Shared primitives in `src/web/components/ui/` consume semantic aliases.
- `Toolbar` and workspace section headers consume app-region tokens instead of generic card colors where needed.
- Terminal integration keeps using `src/web/components/terminal/terminal-theme.ts`, with an added mode for classic terminal colors.

## Component Coverage

Primary surfaces:

- `Topbar` and topbar repo controls.
- Repo tab strip and toolbar tab variants.
- `Toolbar` variants in `src/web/components/Layout.tsx`.
- Branch area toolbar in `RepoExplorerPane`.
- Explorer tabs for files, changes, status, history, and ports.
- Branch detail toolbar.
- Shared `Input` and input-like controls.
- Terminal search floating panel and search input.
- Terminal xterm canvas and search decorations.
- Selected/hover list rows where they currently rely on generic token values.

The component layer should remain simple. If several components need the same styling, add or refine a semantic token instead of duplicating class strings.

## Settings And Data Flow

Add a persisted setting:

```ts
terminalThemeSyncEnabled: boolean
```

Default value: `true`.

The setting follows the existing settings path:

1. Add the field to `SettingsPrefs`.
2. Add `DEFAULT_TERMINAL_THEME_SYNC_ENABLED = true`.
3. Normalize missing or invalid persisted values to `true` in `src/server/modules/settings-source.ts`.
4. Include the field in runtime settings snapshots.
5. Expose it through `readRuntimeGeneralSettings()` and `useRuntimeGeneralSettings()`.
6. Add a write path through `settings-client.ts`, `settings-write-paths.ts`, and `useGeneralSettingsController()`.
7. Add a General settings switch labeled as terminal theme sync.
8. Terminal theme resolution reads the runtime setting and chooses themed or classic terminal tokens.

The setting belongs in General because it changes how the global theme applies, not how terminal sessions behave operationally.

## Terminal Behavior

When `terminalThemeSyncEnabled` is `true`:

- xterm uses the current theme's `--color-terminal-*` tokens.
- Terminal search decorations use the current theme's terminal search tokens.
- Existing document attribute observation continues to update open terminal sessions when the theme changes.

When `terminalThemeSyncEnabled` is `false`:

- xterm uses a fixed classic terminal palette.
- Terminal search decorations use the classic terminal search colors.
- Terminal surrounding chrome, tabs, buttons, overlays, and toolbars still follow the app theme.
- The setting does not affect external terminal applications.

Classic colors should be expressed as tokens, not hard-coded inside React components. A practical implementation can use `--color-terminal-classic-*` tokens or equivalent classic fallback variables resolved by `terminal-theme.ts`.

## Token Plan

Required or refined app-region tokens:

- `--goblin-topbar-bg`
- `--goblin-topbar-border`
- `--goblin-pane-header-bg`
- `--goblin-toolbar-bg`
- `--goblin-toolbar-border`
- `--goblin-control-bg`
- `--goblin-control-hover-bg`
- `--goblin-control-border`
- `--goblin-control-radius`
- `--goblin-input-bg`
- `--goblin-input-border`
- `--goblin-input-focus-border`
- `--goblin-list-row-selected-bg`
- `--goblin-list-row-selected-fg`

Required terminal tokens:

- Existing `--color-terminal-*` themed tokens remain complete.
- Add classic terminal token coverage for background, foreground, cursor, selection, ANSI colors, and search decoration colors.

If a token is redundant with an existing one, prefer mapping it in `contract.css` rather than adding component-specific variables. Add new tokens only where current tokens cannot express the visual difference cleanly.

## Theme Interpretation

Themes should differ through token values:

- `airbnb`: friendlier rounded controls, stronger red accent, softer white/near-white surfaces.
- `bmw`: harder edges, stronger borders, higher contrast, blue/red accents, square controls.
- `macos`: restrained surfaces, blue focus/action color, quiet chrome.
- `github`: developer-oriented surface rhythm and GitHub-like status colors.
- `claude`: warm surfaces and restrained coral emphasis.
- `cursor`: editor-like warm neutral surfaces and minimal chrome.
- `mono`: neutral monochrome with clear state contrast.

No component should check a specific theme name.

## Error Handling

- Old settings without `terminalThemeSyncEnabled` normalize to `true`.
- Invalid persisted values normalize to `true`.
- Terminal theme resolution must tolerate missing CSS values and avoid throwing during xterm updates.
- Failed setting writes follow the existing settings controller behavior and log a warning.
- If a classic terminal token is missing, terminal theme resolution should fall back to the themed terminal token for that value rather than returning an empty string.

## Testing

Add or update focused tests:

- `src/server/modules/settings-source.test.ts`: default value, persisted update, old-config normalization.
- `src/shared/settings-snapshot.test.ts`: runtime snapshot includes `terminalThemeSyncEnabled`.
- Settings UI tests: General page renders the switch and calls the controller.
- `src/web/components/terminal/terminal-theme` tests: themed mode and classic mode return different terminal palettes.
- `src/shared/theme-tokens.test.ts`: all themes define required new region and terminal tokens.
- `src/web/theme/hardcoded-colors.test.ts`: no new component hard-coded colors.

Verification before implementation completion:

- `bun run typecheck`
- Targeted vitest files touched by the change
- `bun run test` if touched areas are broad or targeted tests reveal cross-cutting risk

## Acceptance Criteria

- Switching color themes visibly changes topbar, toolbars, main workspace section bars, all search/input controls, selected rows, and terminal palette when sync is enabled.
- The terminal follows app style by default on fresh settings.
- Turning off terminal theme sync keeps the terminal on a classic palette while the surrounding terminal UI still follows the app theme.
- No React component branches on `colorTheme`.
- No new package dependencies are added.
- Existing app architecture boundaries stay green.
