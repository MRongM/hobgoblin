# Terminal Theme Light Dark Palettes Design

## Summary

Fix terminal color theme coverage so every app color theme has a distinct terminal palette for both `data-theme='light'` and `data-theme='dark'`.

The runtime synchronization path already exists:

`Settings -> useThemeStore -> html[data-theme/data-color-theme] -> CSS terminal tokens -> terminalThemeForCurrentDocument() -> xterm.options.theme`

The selected direction is to correct the CSS token definitions, not to add a second terminal theme system. `cursor` is the reference positive case because its light and dark terminal palettes already visibly follow the selected app mode. Other themes should receive the same level of light/dark terminal coverage.

## Confirmed Decisions

- Terminal colors must follow both the selected app color theme and the app light/dark mode when terminal theme sync is enabled.
- If a theme lacks a proper light or dark terminal palette, fill the missing side with matching brand colors.
- `cursor` currently works and should be treated as the behavioral reference.
- Theme values stay in CSS tokens.
- Do not add TypeScript theme palette tables.
- Do not change the `terminalThemeSyncEnabled` setting semantics.
- Do not commit this design document unless explicitly requested.

## Goals

- Ensure every `COLOR_THEMES` entry has complete `--color-terminal-*` token coverage in both its light and dark selector blocks.
- Make light app mode use a light terminal palette for each brand style.
- Make dark app mode use a dark terminal palette for each brand style.
- Preserve each theme's visual identity through terminal background, foreground, cursor, selection, ANSI colors, and search decoration colors.
- Keep classic terminal mode unchanged through `--color-terminal-classic-*`.
- Add tests that prevent future regressions where a theme's light and dark terminal palettes collapse to the same visible palette.

## Non-Goals

- Do not redesign terminal layout, tabs, search UI, input, scrollback, geometry, or font handling.
- Do not change external terminal app behavior.
- Do not add user-editable terminal themes.
- Do not add a new React provider or per-theme React branches.
- Do not introduce package dependencies.
- Do not alter non-terminal app-region tokens except where a terminal palette needs to reference existing brand colors conceptually.

## Architecture

The implementation stays inside the existing theme token boundary:

- `src/web/theme/themes/*.css` remains the source of truth for brand-specific terminal colors.
- `src/web/components/terminal/terminal-theme.ts` remains the adapter from CSS custom properties to xterm `ITheme`.
- `src/web/components/terminal/terminal-session-view.ts` continues applying the resolved xterm theme to open and newly created terminal instances.
- `src/web/theme/theme-presets.test.ts` and terminal theme tests enforce coverage.

No component should check `colorTheme` by name. Each theme changes terminal appearance only through its current selector:

```css
html[data-color-theme='<theme>'][data-theme='light'] { ... }
html[data-color-theme='<theme>'][data-theme='dark'] { ... }
```

## Palette Rules

Each light and dark theme block must define the full terminal token set:

- `--color-terminal-background`
- `--color-terminal-foreground`
- `--color-terminal-cursor`
- `--color-terminal-selection-background`
- `--color-terminal-ansi-*`
- `--color-terminal-search-*`

Light mode should be genuinely light for app-branded themes, using the theme's light surfaces and readable foreground colors. Dark mode should be genuinely dark, using the theme's dark surfaces and readable foreground colors.

ANSI colors should remain recognizable as terminal colors while being adapted to each brand:

- Red, green, yellow, blue, magenta, and cyan remain semantically recognizable.
- Brand accent should influence blue, red, search active match, selection, or cursor where appropriate.
- Bright variants should be visibly brighter or higher-emphasis than base variants.
- Background and foreground must preserve strong contrast.

Classic terminal tokens remain fixed per color theme selector and are only used when sync is disabled.

## Theme-Specific Direction

- `cursor`: keep as the reference style. It already has light and dark terminal palettes.
- `github`: keep its light and dark terminal palettes as a reference for developer-oriented light/dark behavior.
- `mono`: keep its neutral light/dark terminal palettes unless tests reveal coverage issues.
- `claude`: change the light terminal palette from the current dark warm palette to a warm light palette aligned with Claude light surfaces; keep a warm dark palette for dark mode.
- `airbnb`: change the light terminal palette from the current dark charcoal palette to a clean white or near-white palette with Airbnb red accents; keep a dark charcoal palette for dark mode.
- `bmw`: change the light terminal palette from black to a sharp high-contrast light palette using BMW blue/red accents; keep black or near-black for dark mode.
- `macos`: change the light terminal palette from dark gray to an Apple-style light palette; keep black or near-black for dark mode.

## Data Flow

When terminal theme sync is enabled:

1. User selects a color theme and light/dark mode.
2. The app applies `data-color-theme` and `data-theme` to `document.documentElement`.
3. The selected theme CSS block provides the matching light or dark `--color-terminal-*` tokens.
4. `terminalThemeForCurrentDocument('theme')` resolves those tokens.
5. Existing terminal sessions receive the new `term.options.theme`.
6. Newly created terminal sessions read the current tokens on first paint.

When terminal theme sync is disabled:

1. Runtime settings select `classic` mode.
2. `terminalThemeForCurrentDocument('classic')` reads `--color-terminal-classic-*`.
3. The xterm content area stays classic while surrounding terminal chrome continues to follow the app theme.

## Error Handling

- Missing terminal tokens continue to fall back safely at runtime so terminal creation does not crash.
- Tests should be stricter than runtime fallbacks and fail if a theme omits required terminal tokens.
- Invalid or missing persisted settings are outside this change; existing settings normalization remains responsible for them.

## Testing

Update focused tests:

- `src/web/theme/theme-presets.test.ts`
  - Every theme defines complete terminal tokens in light and dark blocks.
  - Every theme has non-empty light and dark terminal backgrounds.
  - Themes that should have distinct app modes have distinct light and dark terminal backgrounds.

- `src/web/components/terminal/terminal-theme.test.ts`
  - Real preset tests cover at least one corrected theme in light mode and one in dark mode.
  - `terminalThemeForCurrentDocument()` reads the selected `data-color-theme` and `data-theme` block correctly.
  - Classic mode continues reading `--color-terminal-classic-*`.

Verification commands after implementation:

- `bun run typecheck`
- Targeted theme and terminal tests
- `bun run test` if targeted changes expose broader regressions

## Acceptance Criteria

- With terminal sync enabled, every app color theme produces a terminal palette matching both the selected brand and selected light/dark app mode.
- `cursor`, `github`, and `mono` retain their current working light/dark behavior unless explicitly adjusted for consistency.
- `claude`, `airbnb`, `bmw`, and `macos` no longer use a dark terminal palette while the app is in light mode.
- Existing and newly created terminals both update through the existing token-to-xterm path.
- Turning off terminal theme sync still keeps xterm on the classic terminal palette.
- No React component branches on specific theme IDs.
- No TypeScript table duplicates theme palette values.

## Engineering Principles

- KISS: fix the existing CSS token definitions instead of adding a new theme path.
- YAGNI: avoid custom terminal theme editing and unrelated layout changes.
- DRY: keep palette values in CSS only.
- SOLID: keep settings, token definition, token resolution, and xterm application responsibilities separated.
