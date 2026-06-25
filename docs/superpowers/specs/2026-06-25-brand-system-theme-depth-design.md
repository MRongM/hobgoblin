# Brand System Theme Depth Design

## Summary

Deepen design-derived theme presets so switching a theme affects the whole application, not only the file, branch, and terminal areas.

The app keeps the existing `data-theme` plus `data-color-theme` architecture, but expands the token contract from a color preset system into a brand-system surface contract. Themes can change color, surfaces, state treatments, radius, shadows, control density, divider strength, terminal colors, native window background, and app-region chrome. Themes must not change the runtime font family.

Supported color theme presets after this change:

- `macos`
- `mono`
- `github`
- `claude`
- `cursor`
- `airbnb`
- `bmw`

`apple` is removed as a standalone preset. Apple-style behavior belongs in `macos`.

## Goals

- Make theme switching visible across the whole renderer: app shell, topbar, repo tabs, settings, file tree, branch list, detail panels, changes/history/ports panels, dialogs, menus, popovers, toasts/status rows, and terminal.
- Add `airbnb` and `bmw` as first-class color theme presets.
- Remove the standalone `apple` preset and normalize legacy `apple` values to `macos`.
- Preserve the current `light`, `dark`, and `auto` appearance model for every preset.
- Preserve the current app and terminal font contract. The runtime font remains `Maple Mono NF CN`.
- Express brand differences through semantic CSS variables and shared component primitives, not React theme branches.
- Add strict tests that prevent new hard-coded component colors from bypassing the theme system.

## Non-Goals

- Do not introduce user-editable custom themes.
- Do not add a theme generation pipeline.
- Do not add `if (colorTheme === ...)` branches in React components.
- Do not copy marketing-page layout systems, hero typography, photography, or page composition into the app.
- Do not change terminal font family, terminal font measurement, or terminal geometry behavior.
- Do not remove existing `mono` or `github` presets.
- Do not create a new settings model.

## Design Inputs

Brand source documents:

- `docs/design/DESIGN-airbnb.md`
- `docs/design/DESIGN-bmw.md`
- `docs/design/DESIGN-claude.md`
- `docs/design/DESIGN-cursor.md`
- `docs/design/DESIGN-apple.md`

Existing implementation references:

- `src/shared/color-theme.ts`
- `src/web/public/boot.js`
- `src/web/stores/theme.ts`
- `src/web/theme/contract.css`
- `src/web/theme/themes/*.css`
- `src/shared/theme-tokens.ts`
- `src/web/components/terminal/terminal-theme.ts`
- `src/web/components/settings/pages/GeneralSettings.tsx`

## Theme Model

The app keeps two independent axes:

1. `theme`: resolves appearance as `light` or `dark`, with `auto` following the system.
2. `colorTheme`: selects the brand preset.

Final preset list:

```ts
['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw']
```

`macos` becomes the Apple-style preset. It should absorb the strongest useful parts of the current `apple.css`: white or soft-gray canvas, blue action color, restrained chrome, Apple-like dark surfaces, and conservative shadow behavior.

`apple` is a legacy value only. It is not offered in Settings and is not accepted as a current `ColorTheme`.

## Brand Interpretations

`macos`
: Apple/macOS style: white and soft gray canvas, blue action color, restrained chrome, rounded but quiet controls, dark gray terminal/code surfaces.

`claude`
: Warm cream canvas, coral action color, warm near-black dark surfaces, gentle card and border rhythm, dark terminal surfaces.

`cursor`
: Warm off-white canvas, orange action color, editor-like surfaces, minimal shadows, restrained borders.

`airbnb`
: Clean white canvas, Airbnb Rausch red action color, friendly rounded controls, generous but still dense marketplace-like surfaces.

`bmw`
: Black and deep-gray canvas, BMW M blue/red accent treatment, square or near-square controls, strong dividers, engineered high-contrast dark surfaces.

`mono`
: Neutral monochrome utility preset. It must support all expanded tokens without adding brand-specific decoration.

`github`
: GitHub-style developer preset. It must support all expanded tokens while preserving GitHub-like surfaces and status colors.

## Token Architecture

The existing three-layer token model remains:

1. `--goblin-*` foundation and app-region tokens.
2. `--color-*` semantic aliases consumed by Tailwind/shadcn utilities.
3. Integration tokens for surfaces outside Tailwind utilities, currently xterm and Electron window chrome.

### Foundation Tokens

Every theme selector must define complete light and dark values for:

- `--goblin-surface-canvas`
- `--goblin-surface-base`
- `--goblin-surface-raised`
- `--goblin-surface-overlay`
- `--goblin-surface-muted`
- `--goblin-surface-hover`
- `--goblin-surface-control`
- `--goblin-surface-control-hover`
- `--goblin-text-primary`
- `--goblin-text-secondary-strong`
- `--goblin-text-secondary`
- `--goblin-text-selected-secondary`
- `--goblin-text-disabled`
- `--goblin-border-subtle`
- `--goblin-border-default`
- `--goblin-border-strong`
- `--goblin-focus-ring`
- `--goblin-action-primary`
- `--goblin-action-primary-foreground`
- `--goblin-action-danger`
- `--goblin-action-danger-foreground`
- `--goblin-accent`
- `--goblin-accent-text`
- `--goblin-accent-rgb`
- `--goblin-accent-selection`
- `--goblin-accent-surface`
- `--goblin-accent-border`
- `--goblin-status-warning-*`
- `--goblin-status-success-*`
- `--goblin-status-danger-*`
- `--color-overlay-scrim`
- `--goblin-shadow-xs`
- `--goblin-shadow-sm`
- `--goblin-shadow-md`
- `--goblin-shadow-lg`
- `--shadow-inset-highlight`
- `--shadow-control-inset-highlight`
- `--radius`

### App-Region Tokens

Add app-region tokens so brand styling reaches the application shell and repeated work areas without component-level theme branches:

- `--goblin-app-bg`
- `--goblin-topbar-bg`
- `--goblin-topbar-border`
- `--goblin-tab-bg`
- `--goblin-tab-hover-bg`
- `--goblin-tab-active-bg`
- `--goblin-sidebar-bg`
- `--goblin-pane-bg`
- `--goblin-pane-header-bg`
- `--goblin-detail-bg`
- `--goblin-card-bg`
- `--goblin-list-row-bg`
- `--goblin-list-row-hover-bg`
- `--goblin-list-row-selected-bg`
- `--goblin-list-row-selected-fg`
- `--goblin-control-bg`
- `--goblin-control-hover-bg`
- `--goblin-control-border`
- `--goblin-control-radius`
- `--goblin-control-height-sm`
- `--goblin-control-density`
- `--goblin-brand-radius-sm`
- `--goblin-brand-radius-md`
- `--goblin-brand-radius-lg`
- `--goblin-brand-divider-strength`

These tokens map to Tailwind-compatible semantic aliases in `contract.css` where useful. Components may also consume them directly with CSS variable utility classes when a standard semantic alias is too broad.

### Terminal Tokens

All presets keep complete xterm token coverage:

- `--color-terminal-background`
- `--color-terminal-foreground`
- `--color-terminal-cursor`
- `--color-terminal-selection-background`
- all ANSI normal and bright colors
- `--color-terminal-search-match`
- `--color-terminal-search-active-match`
- `--color-terminal-search-active-border`

Terminal font stays unchanged.

## Component Coverage

Coverage should start at shared primitives and app shell containers, then move into specific feature surfaces.

Primary targets:

- `Topbar`
- repo tab strip and repo tab popovers
- settings layout and settings primitives
- shared UI primitives: button, input, select, dialog, alert dialog, dropdown menu, context menu, popover, panel, badge, scroll area, skeleton
- file tree shell, toolbar, rows, empty states, context menus
- branch list, branch rows, branch action menus, branch write dialogs
- branch detail shell, toolbar, status, terminal tabs
- project workspace panels: changes, history, ports, explorer
- clone/open repository dialogs
- error boundary, unavailable repository view, drop overlay
- terminal host, terminal tabs, terminal search decoration, bell indicator

The implementation should prefer replacing hard-coded component colors with existing semantic classes first. Add new semantic aliases only when a repeated region cannot be represented cleanly by the current token set.

## Migration And Compatibility

`apple` removal has explicit compatibility behavior:

- `apple` is removed from `COLOR_THEMES`.
- `apple` is removed from Settings labels and the pre-React boot allowlist.
- Existing persisted `apple` values normalize to `macos`.
- Query parameter `?colorTheme=apple` normalizes to `macos`.
- Native shell projection payloads with current values reject `apple`, while server/settings migration handles stored legacy values.
- `WINDOW_BACKGROUND_BY_COLOR_THEME` no longer has an `apple` key.
- `src/web/theme/themes/apple.css` is removed after its useful values are folded into `macos.css`.

Unknown values continue to normalize to `DEFAULT_COLOR_THEME`, which remains `macos`.

Existing `macos`, `mono`, `github`, `claude`, and `cursor` persisted values remain valid.

## Data Flow

The theme flow remains unchanged:

1. User selects a preset in Settings.
2. `useThemeStore.setColorTheme()` calls the settings write path.
3. Server persists the normalized `colorTheme`.
4. Renderer applies `html[data-color-theme]`.
5. CSS variables update immediately.
6. Shared components and feature panels update through semantic classes and CSS variables.
7. Terminal sessions observe document attribute changes and refresh xterm theme tokens.
8. Electron main receives shell projection and updates native window background and titlebar overlay.

`auto` resolves only the appearance axis. It does not select a different brand preset.

## Error Handling

- `isColorTheme()` remains the current-value runtime guard.
- Server settings normalization handles persisted legacy and unknown values.
- Boot-time normalization prevents an unstyled first paint.
- Missing CSS theme files or missing token definitions fail tests.
- Empty terminal token reads are prevented by token contract tests.
- Native background coverage is required for every current preset.

## Testing

Required verification commands:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

### Theme ID And Migration Tests

Tests must verify:

- `COLOR_THEMES` is exactly `['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw']`.
- `DEFAULT_COLOR_THEME` remains `macos`.
- `isColorTheme('apple')` is false.
- `isColorTheme('airbnb')` and `isColorTheme('bmw')` are true.
- server settings accept `airbnb` and `bmw`.
- server settings normalize legacy `apple` to `macos`.
- boot allowlist stays synchronized with `COLOR_THEMES`.
- boot/query handling maps `apple` to `macos`.
- native shell projection accepts current theme IDs.
- native window background coverage exists for every current theme.

### CSS Contract Tests

Tests must verify every theme file:

- exists for every current `COLOR_THEMES` entry.
- defines both light and dark selectors.
- defines foundation tokens.
- defines app-region tokens.
- defines terminal tokens.
- has native window background values matching each selector's `--goblin-surface-canvas`.

### Hard-Coded Color Scan

Add a strict source scan for `src/web` that rejects:

- naked hex colors in component source.
- fixed Tailwind palette utilities such as `bg-zinc-*`, `text-slate-*`, `border-gray-*`, `bg-red-*`, `text-blue-*`, and similar component-level color scales.

Allowed paths include:

- theme CSS files under `src/web/theme/themes/`
- tests and fixtures that intentionally assert concrete colors
- static brand assets
- third-party/xterm test helpers where concrete colors are fixture data

Status colors in components must use semantic classes such as `text-success`, `text-danger`, `text-warning`, or their paired surface/border tokens.

### Focused Behavior Tests

Tests should cover:

- Settings selector labels for `macOS`, `Mono`, `GitHub`, `Claude`, `Cursor`, `Airbnb`, and `BMW`.
- Terminal refresh on theme attribute changes.
- Core shell components consume semantic/theme variables.
- Dialog, menu, popover, topbar, repo tabs, settings frame, file tree, and branch list do not regress to hard-coded colors.

## Manual Verification

Manual verification should switch every preset under light and dark appearance:

- `macos`
- `mono`
- `github`
- `claude`
- `cursor`
- `airbnb`
- `bmw`

Verify the following surfaces:

- main app background
- topbar
- repo tabs
- file tree
- branch list
- branch detail
- changes panel
- history panel
- ports panel
- settings
- dialogs
- menus and context menus
- popovers
- toasts/status rows
- terminal and terminal tabs
- native window background and titlebar overlay

Expected visual signals:

- BMW is clearly dark, square, high-contrast, and uses restrained M-color accents.
- Airbnb is clearly white, rounded, and Rausch-red accented.
- Claude remains warm cream and coral.
- Cursor remains warm off-white and orange.
- macOS carries the Apple-style white/soft-gray/blue behavior.
- mono and GitHub remain utilitarian and complete.
- Terminal font does not change.

## Acceptance Criteria

- Settings exposes exactly `macOS`, `Mono`, `GitHub`, `Claude`, `Cursor`, `Airbnb`, and `BMW`.
- `apple` is not selectable and legacy `apple` settings become `macos`.
- Every current preset supports light, dark, and auto.
- All current presets define complete foundation, app-region, native window, and terminal tokens.
- App shell and major feature areas visibly respond to theme switching.
- No React component contains brand-specific theme branches.
- Component source does not introduce hard-coded palette colors outside approved exceptions.
- Existing presets continue to work.
- Typecheck, tests, and architecture guard pass.

## Engineering Principles

- KISS: extend the current token architecture instead of creating a second theming system.
- YAGNI: avoid user-authored themes and generation pipelines.
- DRY: centralize theme IDs and use shared token contracts instead of repeated component styling.
- SOLID: keep theme definition, settings validation, native shell projection, and UI rendering responsibilities separate.
