# Design Theme Presets Design

## Summary

Add three color theme presets extracted from `docs/design`:

- `Claude`
- `Cursor`
- `Apple`

The presets must be selectable from Settings and must affect the file area, branch area, and terminal area. Existing presets (`macOS`, `Mono`, `GitHub`) remain available, and the default preset remains `macOS`.

The implementation should extend the existing `data-theme` plus `data-color-theme` token architecture. It should not add component-level theme branches or a new settings model.

## Goals

- Add `claude`, `cursor`, and `apple` to the app color theme preset list.
- Support `light`, `dark`, and `auto` appearance for every new preset.
- Apply the new presets before first React render through the existing boot path.
- Keep Electron window background and titlebar overlay aligned with renderer canvas colors.
- Ensure file tree, branch list, and terminal surfaces respond through semantic tokens.
- Preserve the existing bundled Maple Mono NF CN font contract.

## Non-Goals

- Do not change the default theme preset.
- Do not add custom user theme editing.
- Do not introduce a theme-generation pipeline.
- Do not add per-component theme conditionals.
- Do not copy marketing-page hero typography, section spacing, or layout systems from `docs/design`.
- Do not change terminal font measurement or terminal font family.

## Current Context

The app already has a server-backed theme preference model:

- `src/shared/color-theme.ts` defines allowed color theme IDs.
- `src/web/public/boot.js` applies `data-theme` and `data-color-theme` before React loads.
- `src/web/stores/theme.ts` hydrates and updates the renderer theme state.
- `src/web/theme/contract.css` maps `--goblin-*` foundation tokens to semantic Tailwind/shadcn tokens.
- `src/web/theme/themes/*.css` defines preset token values.
- `src/shared/theme-tokens.ts` provides native window background colors before renderer CSS loads.
- `src/web/components/settings/pages/GeneralSettings.tsx` renders the theme preset selector from `COLOR_THEMES`.

The target UI areas already consume semantic tokens:

- File area uses `bg-background`, `text-muted-foreground`, `border-separator`, status colors, and file tree font settings.
- Branch area uses selected, muted, foreground, attention, and badge semantics.
- Terminal area reads `--color-terminal-*` tokens through `terminal-theme.ts` and updates on `data-theme` / `data-color-theme` mutations.

## Theme Extraction Rules

Extract only the subset of each design document that fits a dense developer tool:

- Canvas, base surfaces, raised surfaces, overlays, hover surfaces.
- Primary, secondary, selected, muted, and disabled text colors.
- Border, separator, focus ring, selection, accent, and action colors.
- Success, warning, danger status colors and derived surfaces/borders.
- Shadow and radius values.
- Terminal background, foreground, cursor, selection, ANSI colors, and terminal search colors.

Do not extract:

- Marketing hero sizes.
- Editorial section rhythm.
- Product-tile layouts.
- Photography or illustration direction.
- Brand font stacks as runtime font changes.

The visual interpretation is:

- `Claude`: warm cream canvas, coral action color, warm near-black dark surfaces, dark terminal in dark mode.
- `Cursor`: warm off-white canvas, orange action color, restrained hairlines, high-contrast editor-like surfaces.
- `Apple`: white or soft gray canvas, blue action color, restrained chrome, dark gray code/terminal surfaces.

## Architecture

### Shared Theme IDs

Extend `COLOR_THEMES` in `src/shared/color-theme.ts`:

- `macos`
- `mono`
- `github`
- `claude`
- `cursor`
- `apple`

`isColorTheme()` remains the only runtime validation helper. Unknown persisted values continue to normalize to `DEFAULT_COLOR_THEME`.

### Renderer CSS

Add three preset CSS files:

- `src/web/theme/themes/claude.css`
- `src/web/theme/themes/cursor.css`
- `src/web/theme/themes/apple.css`

Each file defines complete token sets for:

- `html[data-color-theme='<id>'][data-theme='light']`
- `html[data-color-theme='<id>'][data-theme='dark']`

Each selector must define the same categories as the existing preset files:

- `--goblin-surface-*`
- `--goblin-text-*`
- `--goblin-border-*`
- `--goblin-focus-ring`
- `--goblin-action-*`
- `--goblin-accent*`
- `--goblin-status-*`
- overlay and shadow tokens
- `--radius`
- all `--color-terminal-*` tokens

Update `src/web/theme/theme.css` to import the new files.

### First Paint

Update `src/web/public/boot.js` to include the new IDs in its allowlist. This keeps the first paint in sync with the persisted or query-provided preset before the React app hydrates.

### Native Window Background

Update `WINDOW_BACKGROUND_BY_COLOR_THEME` in `src/shared/theme-tokens.ts` with light/dark canvas colors for the new presets. These values must match each preset's `--goblin-surface-canvas` token.

This keeps:

- main window background
- auxiliary window background
- Windows/Linux titlebar overlay strip

aligned with renderer CSS.

### Settings UI

Keep `GeneralSettings` as-is structurally. Since it maps `COLOR_THEMES` into options, adding theme IDs and i18n labels is sufficient.

Add labels for all supported locales:

- `settings.theme-preset.claude`
- `settings.theme-preset.cursor`
- `settings.theme-preset.apple`

### Target Area Coverage

The coverage mechanism is token-based:

- File area should inherit new tokens through existing semantic classes and CSS variables.
- Branch area should inherit new tokens through existing semantic classes and status/badge variants.
- Terminal area should inherit new tokens through `--color-terminal-*` and `terminalThemeForCurrentDocument()`.

If implementation finds hard-coded colors inside the target areas, replace them with existing semantic tokens only when they materially prevent theme coverage. Do not introduce `if (colorTheme === ...)` branches in React components.

## Data Flow

The theme-switching flow remains unchanged:

1. User selects a theme preset in Settings.
2. `useThemeStore.setColorTheme()` calls `setThemeColorTheme()`.
3. The server persists `colorTheme`.
4. Renderer applies `html[data-color-theme]`.
5. CSS tokens update immediately.
6. Settings invalidation refetches update other subscribers.
7. Electron main receives shell projection and updates native window background where applicable.
8. Terminal sessions observe document attribute changes and refresh xterm theme tokens.

`theme=auto` continues to resolve only light/dark appearance. `colorTheme` controls only preset style.

## Compatibility

- Existing settings with no `colorTheme` continue to default to `macos`.
- Unknown persisted `colorTheme` values continue to normalize to `macos`.
- Unknown `colorTheme` query values in `boot.js` continue to fall back to `macos`.
- No persisted user settings migration is required.
- Existing `macos`, `mono`, and `github` CSS behavior must remain unchanged.

## Error Handling

- Runtime validation stays centralized in `isColorTheme()`.
- Server normalization stays responsible for bad persisted values.
- Boot-time fallback prevents a blank or unstyled first paint.
- Complete token definitions prevent terminal theme reads from resolving empty values.
- Native background token coverage prevents overlay/canvas mismatches.

## Testing

Required verification:

```bash
bun run typecheck
bun run test
```

Focused test updates should cover:

- `COLOR_THEMES` accepts `claude`, `cursor`, and `apple`.
- Settings source normalization persists valid new IDs and rejects unknown IDs.
- Native shell projection schemas accept the new IDs.
- Main/window theme tests handle new `WINDOW_BACKGROUND_BY_COLOR_THEME` keys.
- i18n labels exist for every supported locale.
- Terminal theme token tests still pass and continue to read CSS-derived colors.

Manual verification:

- Open Settings and confirm the theme selector lists `macOS`, `Mono`, `GitHub`, `Claude`, `Cursor`, and `Apple`.
- Switch each new preset in light mode and dark mode.
- Confirm file area, branch area, and terminal area visibly update.
- Confirm existing presets still work.
- Confirm app startup with a new `colorTheme` query parameter does not flash back to `macos`.

## Acceptance Criteria

- Settings supports selecting `Claude`, `Cursor`, and `Apple`.
- Each new preset has complete light and dark token sets.
- File area, branch area, and terminal area all respond to every new preset.
- Terminal ANSI colors and selection/search colors are theme-specific.
- Electron window background and titlebar overlay match the selected preset.
- Existing presets and default behavior remain unchanged.
- No component-level theme branching is added.
- Font family remains unchanged.
- Typecheck and test suites pass.

## Engineering Principles

- KISS: extend the existing theme preset mechanism instead of adding a new theme subsystem.
- YAGNI: avoid data-driven generation and custom theme editing until there is a concrete need.
- DRY: keep theme IDs centralized in `COLOR_THEMES`; consumers derive options and validation from that source.
- SOLID: keep theme token definition separate from file tree, branch list, and terminal behavior.
