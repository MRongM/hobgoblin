# Theme Distinction And Classic Presets Design

## Summary

Differentiate the existing macOS and GitHub presets, then add three classic developer presets:

- Catppuccin
- Solarized
- Tokyo Night

The current macOS preset remains the low-change visual anchor. GitHub receives the larger repaint through a Primer Header direction: a deep charcoal topbar in both light and dark appearances, green primary actions, blue navigation and selection, stronger borders, and tighter radii.

The implementation extends the existing CSS token architecture. It does not introduce theme-specific React branches, a generated palette pipeline, a custom theme editor, new dependencies, typography changes, or layout changes.

## Confirmed Decisions

- Keep all nine existing presets.
- Add exactly three presets, bringing the total to twelve.
- Add `catppuccin`, `solarized`, and `tokyo-night`.
- Append the three IDs after the existing presets so current menu ordering stays stable.
- Keep `macos` as the default and as the low-change visual anchor.
- Do not repaint the approved macOS palette.
- Repaint GitHub using the Primer Header direction.
- Preserve official core colors and light/dark character for the three classic themes, while adapting them to Hobgoblin's existing component hierarchy.
- Catppuccin uses Latte for light appearance and Mocha for dark appearance.
- Solarized uses its canonical light and dark base relationships.
- Tokyo Night uses Day for light appearance and Night for dark appearance.
- Add a topbar-muted foreground semantic token so a dark topbar remains readable in a light document.
- Add topbar-specific control tokens so outline and ghost controls remain readable on a dark topbar.
- Keep all existing global and per-project theme persistence behavior.
- Keep the existing font stack and component layout.
- Do not add package dependencies.

## Goals

- Make macOS and GitHub immediately distinguishable at thumbnail scale.
- Preserve the familiar, low-risk macOS default experience.
- Give GitHub a recognizable Primer identity across both appearances.
- Add three classic developer palettes with complete app and terminal coverage.
- Support all twelve themes in global settings and per-project theme selection.
- Keep first paint, renderer CSS, terminal colors, and Electron window backgrounds synchronized.
- Preserve accessibility for primary text, topbar text, controls, and focus states.
- Add automated invariants that prevent macOS and GitHub from converging again.

## Non-Goals

- Do not remove, rename, or reorder existing themes.
- Do not add user-editable themes or a theme editor.
- Do not generate CSS from JSON or TypeScript palette tables.
- Do not change the settings storage schema.
- Do not change light/dark/auto appearance semantics.
- Do not change fonts, typography scale, layout, density, or navigation.
- Do not redesign file rows, branch rows, repo tabs, terminal tabs, dialogs, menus, or toasts.
- Do not add theme-specific React conditionals.
- Do not broadly refactor the theme system.
- Do not add motion or theme transition animation.

## Existing Context

The current shared theme registry contains:

1. `macos`
2. `mono`
3. `github`
4. `claude`
5. `cursor`
6. `airbnb`
7. `bmw`
8. `signal`
9. `forge`

macOS and GitHub currently appear too similar because their most visible light-mode region colors are nearly identical:

- macOS topbar: `#d8e7f8`
- GitHub topbar: `#d7e5f7`
- macOS toolbar: `#e4effc`
- GitHub toolbar: `#e3eefc`

Both also use white or light-gray canvases and blue accents. Their existing radius, border, status, and terminal differences are real, but the near-identical large chrome regions dominate first impression.

The current architecture already separates:

- `theme`: light, dark, or auto appearance
- `colorTheme`: the visual preset

That separation remains unchanged.

## Visual System

### macOS: Visual Anchor

macOS remains the default and is deliberately not repainted. Its role is:

- soft white and gray surfaces
- restrained cool-blue chrome
- Apple blue interaction color
- low border emphasis
- generous, rounded controls
- pure-black dark canvas
- Apple-style terminal colors

Approved identity colors remain:

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#ffffff` | `#000000` |
| Base surface | `#f5f5f7` | `#1d1d1f` |
| Topbar | `#d8e7f8` | `#0d1622` |
| Toolbar | `#e4effc` | `#1f3044` |
| Primary action | `#0066cc` | `#2997ff` |

The macOS preset is adjusted only in the system-level sense that its visual role is explicitly frozen and protected by regression tests. No runtime macOS token value changes are required.

### GitHub: Primer Header

GitHub becomes the main differentiation target.

Its signature is:

- deep charcoal topbar in light and dark appearances
- GitHub green for primary actions
- Primer blue for links, navigation, focus, and selection
- stronger dividers and borders than macOS
- tighter radii than macOS
- white and Primer-gray light surfaces
- near-black and charcoal dark surfaces
- GitHub terminal/status colors

#### GitHub Light Core

| Role | Value |
| --- | --- |
| Canvas | `#ffffff` |
| Base/sidebar surface | `#f6f8fa` |
| Toolbar | `#eaeef2` |
| Topbar | `#24292f` |
| Topbar foreground | `#f0f6fc` |
| Topbar muted foreground | `#b1bac4` |
| Topbar control | `#30363d` |
| Topbar control hover | `#3d444d` |
| Topbar control border | `#57606a` |
| Topbar control foreground | `#f0f6fc` |
| Default border | `#d0d7de` |
| Strong border | `#afb8c1` |
| Primary action | `#1f883d` |
| Primary action foreground | `#ffffff` |
| Navigation/accent | `#0969da` |

#### GitHub Dark Core

| Role | Value |
| --- | --- |
| Canvas | `#0d1117` |
| Base/sidebar surface | `#161b22` |
| Toolbar | `#161b22` |
| Topbar | `#010409` |
| Topbar foreground | `#f0f6fc` |
| Topbar muted foreground | `#8b949e` |
| Topbar control | `#161b22` |
| Topbar control hover | `#21262d` |
| Topbar control border | `#30363d` |
| Topbar control foreground | `#f0f6fc` |
| Default border | `#30363d` |
| Strong border | `#484f58` |
| Primary action | `#238636` |
| Primary action foreground | `#ffffff` |
| Navigation/accent | `#58a6ff` |

The light-mode charcoal topbar is the design's single deliberate visual risk. It is justified because it creates immediate separation from macOS and reflects GitHub's own header language.

### Catppuccin: Latte / Mocha

Catppuccin fills the soft pastel-purple gap in the existing theme set.

#### Catppuccin Light Core

| Role | Value |
| --- | --- |
| Canvas/base | `#eff1f5` |
| Mantle/toolbar | `#e6e9ef` |
| Crust/topbar | `#dce0e8` |
| Primary text | `#4c4f69` |
| Muted text | `#5c5f77` |
| Primary accent | `#8839ef` |
| Primary action foreground | `#ffffff` |
| Secondary blue | `#1e66f5` |
| Success | `#40a02b` |

#### Catppuccin Dark Core

| Role | Value |
| --- | --- |
| Canvas/base | `#1e1e2e` |
| Mantle/toolbar | `#181825` |
| Crust/topbar | `#11111b` |
| Raised surface | `#313244` |
| Primary text | `#cdd6f4` |
| Primary accent | `#cba6f7` |
| Primary action foreground | `#11111b` |
| Secondary blue | `#89b4fa` |
| Success | `#a6e3a1` |

Controls use a `0.625rem` main radius.

### Solarized: Symmetric Low Contrast

Solarized fills the parchment/deep-cyan, long-session theme role.

#### Solarized Light Core

| Role | Value |
| --- | --- |
| Canvas | `#fdf6e3` |
| Base/toolbar surface | `#eee8d5` |
| Deeper topbar adaptation | `#ded7c3` |
| Primary text | `#475b62` |
| Secondary text | `#566c73` |
| Topbar foreground | `#475b62` |
| Topbar muted foreground | `#4b6168` |
| Navigation/accent blue | `#268bd2` |
| Secondary cyan | `#2aa198` |
| Warning yellow | `#b58900` |
| Primary action | `#1f6f9f` |
| Primary action foreground | `#ffffff` |

The body-text values are deliberate application adaptations: `#475b62` provides a strong primary level, while `#566c73` is a minimally darkened secondary derived from canonical base01. The topbar uses an explicit `#4b6168` muted foreground because canonical muted tones do not remain readable on the deeper adapted topbar. Keep canonical `#268bd2` for navigation and links; use the darker `#1f6f9f` only for filled primary actions so white button text remains readable.

#### Solarized Dark Core

| Role | Value |
| --- | --- |
| Canvas | `#002b36` |
| Base/toolbar surface | `#073642` |
| Deeper topbar adaptation | `#001f27` |
| Primary text | `#aab6b6` |
| Secondary text | `#93a1a1` |
| Topbar foreground | `#aab6b6` |
| Topbar muted foreground | `#93a1a1` |
| Navigation/accent blue | `#268bd2` |
| Secondary cyan | `#2aa198` |
| Warning yellow | `#b58900` |
| Primary action | `#2aa198` |
| Primary action foreground | `#002b36` |

Solarized uses a `0.25rem` main radius. Its identity comes from controlled luminance relationships, not decorative effects.

### Tokyo Night: Day / Night

Tokyo Night fills the indigo and restrained-neon role.

#### Tokyo Night Light Core

| Role | Value |
| --- | --- |
| Canvas | `#e6e7ed` |
| Base/sidebar surface | `#d8dae4` |
| Topbar adaptation | `#c7cbda` |
| Primary text | `#343b58` |
| Secondary text | `#40434f` |
| Primary blue | `#2959aa` |
| Primary action foreground | `#ffffff` |
| Secondary violet | `#5a3e8e` |
| Success green | `#385f0d` |

#### Tokyo Night Dark Core

| Role | Value |
| --- | --- |
| Canvas | `#1a1b26` |
| Base/toolbar surface | `#24283b` |
| Topbar | `#16161e` |
| Primary text | `#c0caf5` |
| Secondary text | `#9aa5ce` |
| Primary blue | `#7aa2f7` |
| Primary action foreground | `#1a1b26` |
| Secondary violet | `#bb9af7` |
| Success green | `#9ece6a` |

Use a `0.375rem` main radius. Dark appearance is the signature, while Day preserves the same hue relationships without simulating a dark editor inside a light app.

### App Chrome Contract

The changed and new themes use these exact app-region values:

| Theme | Appearance | Topbar | Topbar border | Toolbar | Toolbar border | Tab hover | Tab active |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub | Light | `#24292f` | `#30363d` | `#eaeef2` | `#d0d7de` | `#f6f8fa` | `#ffffff` |
| GitHub | Dark | `#010409` | `#30363d` | `#161b22` | `#30363d` | `#161b22` | `#21262d` |
| Catppuccin | Light | `#dce0e8` | `#bcc0cc` | `#e6e9ef` | `#bcc0cc` | `#eff1f5` | `#ffffff` |
| Catppuccin | Dark | `#11111b` | `#45475a` | `#181825` | `#45475a` | `#313244` | `#45475a` |
| Solarized | Light | `#ded7c3` | `#c7bea8` | `#eee8d5` | `#d8cfb9` | `#f5efdd` | `#fdf6e3` |
| Solarized | Dark | `#001f27` | `#31515a` | `#073642` | `#31515a` | `#0b414d` | `#12505d` |
| Tokyo Night | Light | `#c7cbda` | `#adb2c4` | `#d8dae4` | `#b4b8c9` | `#dfe1e8` | `#e6e7ed` |
| Tokyo Night | Dark | `#16161e` | `#414868` | `#24283b` | `#414868` | `#2d324a` | `#343b58` |

For each new theme:

- app and pane canvases use the theme canvas
- sidebar and pane-header surfaces use the base surface
- raised cards and active controls use the theme's raised surface
- list hover uses the tab-hover family
- list selection uses the accent-selection formula defined below
- control height remains `2rem`
- control density remains `1`

### Geometry And Shadows

Use exact radius values:

| Theme | Main/control | Brand small | Brand medium | Brand large |
| --- | --- | --- | --- | --- |
| Catppuccin | `0.625rem` | `0.375rem` | `0.625rem` | `0.875rem` |
| Solarized | `0.25rem` | `0.125rem` | `0.25rem` | `0.375rem` |
| Tokyo Night | `0.375rem` | `0.25rem` | `0.375rem` | `0.5rem` |

Use these exact shadow families:

| Theme | Appearance | XS | SM | MD | LG |
| --- | --- | --- | --- | --- | --- |
| Catppuccin | Light | `0 1px 1px rgb(76 79 105 / 0.04)` | `0 1px 2px rgb(76 79 105 / 0.06)` | `0 8px 24px rgb(76 79 105 / 0.12)` | `0 18px 48px rgb(76 79 105 / 0.16)` |
| Catppuccin | Dark | `0 1px 1px rgb(17 17 27 / 0.28)` | `0 1px 2px rgb(17 17 27 / 0.34)` | `0 8px 24px rgb(17 17 27 / 0.44)` | `0 18px 48px rgb(17 17 27 / 0.52)` |
| Solarized | Light | `0 1px 1px rgb(0 43 54 / 0.03)` | `0 1px 2px rgb(0 43 54 / 0.05)` | `0 6px 18px rgb(0 43 54 / 0.08)` | `0 14px 36px rgb(0 43 54 / 0.12)` |
| Solarized | Dark | `0 1px 1px rgb(0 0 0 / 0.24)` | `0 1px 2px rgb(0 0 0 / 0.30)` | `0 6px 18px rgb(0 0 0 / 0.38)` | `0 14px 36px rgb(0 0 0 / 0.46)` |
| Tokyo Night | Light | `0 1px 1px rgb(52 59 88 / 0.04)` | `0 1px 2px rgb(52 59 88 / 0.06)` | `0 8px 24px rgb(52 59 88 / 0.12)` | `0 18px 48px rgb(52 59 88 / 0.16)` |
| Tokyo Night | Dark | `0 1px 1px rgb(0 0 0 / 0.28)` | `0 1px 2px rgb(0 0 0 / 0.34)` | `0 8px 24px rgb(0 0 0 / 0.44)` | `0 18px 48px rgb(0 0 0 / 0.52)` |

## Theme Token Contract

### Existing Contract

Continue using the existing layers:

1. `--goblin-*` theme foundation and app-region tokens
2. `--color-*` semantic aliases consumed by Tailwind and components
3. Electron and xterm integration tokens

Every new theme defines complete light and dark blocks for:

- surfaces
- text
- borders
- focus
- primary and destructive actions
- accent and selection
- warning, success, and danger states
- shadows and radii
- app regions
- list and control states
- terminal foreground, background, cursor, and selection
- terminal ANSI colors
- terminal search colors
- classic terminal colors

### Topbar Foreground Refinement

The contract already supports:

```css
--color-topbar-foreground: var(--goblin-topbar-fg, var(--goblin-text-primary));
```

Add the topbar foreground and control aliases:

```css
--color-topbar-muted-foreground: var(--goblin-topbar-muted-fg, var(--goblin-text-secondary));
--color-topbar-control: var(
  --goblin-topbar-control-bg,
  var(--goblin-control-bg, var(--goblin-surface-control))
);
--color-topbar-control-hover: var(
  --goblin-topbar-control-hover-bg,
  var(--goblin-control-hover-bg, var(--goblin-surface-control-hover))
);
--color-topbar-control-border: var(
  --goblin-topbar-control-border,
  var(--goblin-control-border, var(--goblin-border-strong))
);
--color-topbar-control-foreground: var(
  --goblin-topbar-control-fg,
  var(--goblin-topbar-fg, var(--goblin-text-primary))
);
```

Within the existing `.topbar` region, locally remap control utilities only:

```css
.topbar {
  --color-control: var(--color-topbar-control);
  --color-control-hover: var(--color-topbar-control-hover);
  --color-input: var(--color-topbar-control-border);
  --color-accent: var(--color-topbar-control-hover);
  --color-accent-foreground: var(--color-topbar-control-foreground);
}
```

This keeps outline and ghost controls readable without changing dropdown content rendered outside the topbar.

Do not globally remap `--color-muted-foreground` inside `.topbar`: active repo tabs have a light surface in GitHub light appearance and must retain the normal muted foreground for their close button.

Use region semantics explicitly in the tab strip and topbar controls:

- inactive repo-tab text and icons use `text-topbar-muted-foreground`
- active repo-tab text uses the normal `text-foreground`
- active repo-tab close controls use the normal selected/muted foreground
- inactive repo-tab close controls use the topbar-muted foreground
- topbar-only muted labels use `text-topbar-muted-foreground`
- repo-tab and action separators use `border-topbar-border` or `bg-topbar-border`

If `ToolbarClosableTab` cannot express different active and inactive close colors, add a narrow `closeButtonClassName` prop and set it from `RepoTab`. This is a region-state decision, not a theme-ID branch.

GitHub defines explicit `--goblin-topbar-fg`, `--goblin-topbar-muted-fg`, and topbar-control values in both appearances. Other themes inherit their current control behavior through fallbacks. This preserves macOS runtime values and separator appearance.

### Derived State Rules

For the three new themes, derive state tokens deterministically:

- accent selection: accent RGB at `0.14` alpha in light appearance and `0.22` in dark appearance
- accent surface: accent RGB at `0.09` alpha in light appearance and `0.14` in dark appearance
- accent border: accent RGB at `0.34` alpha in light appearance and `0.42` in dark appearance
- warning text/hue: the palette yellow
- success text/hue: the palette green
- danger text/hue: the palette red
- status surface: the status RGB at `0.12` alpha
- status border: the status RGB at `0.34` alpha
- terminal activity: inherit the theme accent through the existing contract fallback
- terminal bell: inherit the theme warning color through the existing contract fallback

GitHub keeps its existing Primer status colors and status-surface values. Its primary action changes to green, while selection and navigation remain blue.

### Terminal Mapping

Theme-synchronized terminal core values are exact:

| Theme | Appearance | Background | Foreground/cursor | Selection |
| --- | --- | --- | --- | --- |
| Catppuccin | Light | `#eff1f5` | `#4c4f69` | `rgb(136 57 239 / 0.24)` |
| Catppuccin | Dark | `#1e1e2e` | `#cdd6f4` | `rgb(203 166 247 / 0.28)` |
| Solarized | Light | `#fdf6e3` | `#475b62` | `rgb(38 139 210 / 0.22)` |
| Solarized | Dark | `#002b36` | `#93a1a1` | `rgb(38 139 210 / 0.28)` |
| Tokyo Night | Light | `#e6e7ed` | `#343b58` | `rgb(41 89 170 / 0.22)` |
| Tokyo Night | Dark | `#1a1b26` | `#c0caf5` | `rgb(122 162 247 / 0.28)` |

Search mapping is also deterministic:

- search match uses the palette warning yellow
- active search match uses the theme accent
- active search border uses the terminal foreground

ANSI arrays are ordered as black, red, green, yellow, blue, magenta, cyan, white:

| Theme | Appearance | Standard ANSI | Bright ANSI |
| --- | --- | --- | --- |
| Catppuccin | Light | `#4c4f69`, `#d20f39`, `#40a02b`, `#df8e1d`, `#1e66f5`, `#8839ef`, `#179299`, `#8c8fa1` | `#6c6f85`, `#e64553`, `#40a02b`, `#fe640b`, `#209fb5`, `#ea76cb`, `#04a5e5`, `#4c4f69` |
| Catppuccin | Dark | `#45475a`, `#f38ba8`, `#a6e3a1`, `#f9e2af`, `#89b4fa`, `#cba6f7`, `#94e2d5`, `#bac2de` | `#6c7086`, `#eba0ac`, `#a6e3a1`, `#fab387`, `#74c7ec`, `#f5c2e7`, `#89dceb`, `#cdd6f4` |
| Solarized | Light | `#073642`, `#dc322f`, `#859900`, `#b58900`, `#268bd2`, `#d33682`, `#2aa198`, `#eee8d5` | `#002b36`, `#cb4b16`, `#586e75`, `#657b83`, `#839496`, `#6c71c4`, `#93a1a1`, `#fdf6e3` |
| Solarized | Dark | `#073642`, `#dc322f`, `#859900`, `#b58900`, `#268bd2`, `#d33682`, `#2aa198`, `#eee8d5` | `#002b36`, `#cb4b16`, `#586e75`, `#657b83`, `#839496`, `#6c71c4`, `#93a1a1`, `#fdf6e3` |
| Tokyo Night | Light | `#343b58`, `#8c4351`, `#385f0d`, `#8f5e15`, `#2959aa`, `#5a3e8e`, `#0f4b6e`, `#6c6e75` | `#6c6e75`, `#8c4351`, `#33635c`, `#965027`, `#2959aa`, `#5a3e8e`, `#006c86`, `#343b58` |
| Tokyo Night | Dark | `#414868`, `#f7768e`, `#9ece6a`, `#e0af68`, `#7aa2f7`, `#bb9af7`, `#7dcfff`, `#a9b1d6` | `#565f89`, `#f7768e`, `#73daca`, `#ff9e64`, `#7dcfff`, `#bb9af7`, `#b4f9f8`, `#c0caf5` |

Each new theme copies the existing classic terminal token block unchanged. Classic mode intentionally remains independent from the selected color preset.

## Architecture And Files

### Shared Registry

Update `src/shared/color-theme.ts`:

```ts
export const COLOR_THEMES = [
  'macos',
  'mono',
  'github',
  'claude',
  'cursor',
  'airbnb',
  'bmw',
  'signal',
  'forge',
  'catppuccin',
  'solarized',
  'tokyo-night',
] as const
```

Keep:

- `DEFAULT_COLOR_THEME = 'macos'`
- unknown-value fallback to `macos`
- `apple` compatibility normalization to `macos`

### CSS Presets

- Repaint `src/web/theme/themes/github.css`.
- Keep `src/web/theme/themes/macos.css` palette values unchanged.
- Add `src/web/theme/themes/catppuccin.css`.
- Add `src/web/theme/themes/solarized.css`.
- Add `src/web/theme/themes/tokyo-night.css`.
- Import all three new files from `src/web/theme/theme.css`.
- Add the topbar foreground/control aliases and scoped control remapping in `src/web/theme/contract.css`.
- Apply topbar-region foreground and separator classes in the shared repo-tab/topbar components.

Do not put palette tables in TypeScript and do not branch on `ColorTheme` in React components.

### First Paint

Update the pre-React allowlist in `src/web/public/boot.js`.

The allowlist must contain the same IDs, in the same order, as `COLOR_THEMES`. Unknown values continue to fall back to `macos`.

### Native Window Background

Update `WINDOW_BACKGROUND_BY_COLOR_THEME` in `src/shared/theme-tokens.ts`:

- Catppuccin: light `#eff1f5`, dark `#1e1e2e`
- Solarized: light `#fdf6e3`, dark `#002b36`
- Tokyo Night: light `#e6e7ed`, dark `#1a1b26`

Each value must exactly match that preset's `--goblin-surface-canvas`.

The existing GitHub native background remains:

- light `#ffffff`
- dark `#0d1117`

The topbar repaint does not change the native window canvas.

Native window background and titlebar overlay continue to follow the global theme preference. A per-project override changes renderer CSS and terminal colors only. Extending native shell state with the active project's effective theme is outside this feature.

### Labels

Add these keys in all supported locale files:

- `settings.theme-preset.catppuccin`
- `settings.theme-preset.solarized`
- `settings.theme-preset.tokyo-night`

Labels preserve official casing:

- Catppuccin
- Solarized
- Tokyo Night

### Settings UI

No settings component structure changes are required.

- `GeneralSettings` maps `COLOR_THEMES` into global options.
- `ProjectThemeMenu` maps `COLOR_THEMES` into per-project options.

Tests and translation mocks must cover all twelve entries so missing labels cannot silently render as keys.

## Data Flow

Global selection:

1. The user chooses a preset in Settings.
2. `useThemeStore.setColorTheme()` writes the preference through the existing settings client.
3. The server persists `colorTheme`.
4. The renderer applies `html[data-color-theme]`.
5. CSS variables update the app immediately.
6. Terminal sessions re-read CSS-derived terminal values.
7. Electron receives the global settings projection and keeps native background surfaces synchronized with the global preset.

Per-project selection:

1. The user chooses a project override in `ProjectThemeMenu`.
2. The existing repo-theme settings path persists `repoSettings[].colorTheme`.
3. `EffectiveProjectThemeBridge` resolves the project override against the global preference.
4. The root `data-color-theme` attribute changes.
5. Renderer CSS and terminal colors update.
6. Native window background and titlebar overlay remain on the global preset, matching existing project-theme behavior.

No new server state, renderer store, IPC channel, or persistence schema is introduced.

## Error Handling And Compatibility

- Unknown persisted global values normalize to `macos`.
- Unknown persisted project values normalize through the existing theme validation path.
- The legacy `apple` value continues to normalize to `macos`.
- Unknown boot query values fall back to `macos`.
- A complete CSS block for every preset prevents missing semantic values.
- Existing contract fallbacks keep optional topbar-muted values safe for older themes.
- Terminal activity continues to fall back to the theme accent.
- Terminal bell continues to fall back to the theme warning color.
- Native backgrounds are statically checked against the theme registry and canvas colors.
- Per-project overrides do not attempt to mutate native shell theme state.
- No network access is required at runtime.
- No settings migration is required.

## Testing

### Shared IDs And Normalization

Update `src/shared/color-theme.test.ts`:

- assert the exact twelve-theme order
- accept the three new IDs
- preserve `macos` as default
- preserve `apple → macos`
- reject unknown values

### Boot Allowlist

Update `src/web/public/boot.test.ts`:

- boot allowlist equals `COLOR_THEMES`
- all three new themes survive boot normalization
- invalid values fall back to `macos`

### Native Backgrounds

Update `src/shared/theme-tokens.test.ts`:

- mapping keys equal `COLOR_THEMES`
- new backgrounds are valid light/dark hex values
- new backgrounds match each CSS canvas token

### CSS Contract

Update `src/web/theme/theme-contract.test.ts`:

- expose `--color-topbar-muted-foreground`
- expose the four topbar-control aliases
- scope control, hover, input-border, and hover-foreground mappings inside `.topbar`
- do not globally scope normal muted foreground inside `.topbar`
- preserve existing semantic aliases
- keep classic terminal coverage for every preset

### Preset Contracts

Update `src/web/theme/theme-presets.test.ts`:

- every theme ID has a CSS file
- each new theme defines complete light and dark tokens
- update exact topbar expectations for GitHub and all new themes
- preserve macOS identity expectations
- assert GitHub light topbar `#24292f`
- assert GitHub light topbar foreground, muted foreground, and control tokens
- assert GitHub light primary action `#1f883d`
- assert GitHub light accent `#0969da`
- assert GitHub dark topbar `#010409`
- assert Catppuccin Latte/Mocha core colors
- assert Solarized light/dark core colors
- assert Tokyo Night Day/Night core colors
- keep topbar darker than toolbar and tab states
- keep light terminal backgrounds light and dark terminal backgrounds dark

For GitHub and the three new presets, add focused WCAG contrast helpers and assertions for:

- primary text against canvas
- secondary text against its default surface
- topbar foreground against topbar background
- topbar muted foreground against topbar background
- topbar control foreground against topbar control and hover backgrounds
- primary action foreground against primary action background
- terminal foreground against terminal background

Require at least `4.5:1` for these normal-size text pairs. Do not apply the new contrast gate retroactively to unrelated existing palettes in this feature.

Add a GitHub/macOS separation invariant:

- GitHub light topbar relative luminance must be at most `0.05`.
- macOS light topbar relative luminance must be at least `0.70`.
- their light topbar relative-luminance difference must be at least `0.65`.
- GitHub primary action remains green while macOS primary action remains blue.

This prevents the large chrome regions from converging again.

### Topbar Region Components

Update focused tests for the repo tab strip and topbar controls:

- inactive repo-tab labels and icons use topbar-muted foreground
- active repo-tab content keeps normal foreground on the active-tab surface
- active repo-tab close control keeps normal selected/muted foreground
- inactive repo-tab close control uses topbar-muted foreground
- topbar separators use the topbar-border semantic
- outline and ghost topbar controls resolve against topbar-control tokens
- no component compares a concrete `ColorTheme` ID

### Settings And Project Menus

Update relevant settings and `ProjectThemeMenu` tests:

- all twelve labels render
- Catppuccin, Solarized, and Tokyo Night are selectable
- project theme overrides accept all three
- translation mocks do not fall back to raw key names

### Manual Verification

Verify in both light and dark appearances:

- global settings list all twelve presets
- project theme menu lists all twelve presets
- GitHub is immediately distinguishable from macOS
- GitHub topbar text, inactive tabs, active tabs, hover states, controls, and separators remain readable
- Catppuccin, Solarized, and Tokyo Night have visibly different identities
- file tree, branch list, changes, history, detail, ports, dialogs, menus, popovers, toasts, and terminal surfaces respond
- terminal ANSI, selection, cursor, search, activity, and bell colors remain readable
- global and project switching update immediately
- global-theme app startup does not flash back to macOS
- Electron window background matches the selected global preset
- project overrides update renderer and terminal colors without changing native shell background

### Verification Commands

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## Acceptance Criteria

- The app exposes twelve color themes.
- Catppuccin, Solarized, and Tokyo Night appear in global and per-project selectors.
- macOS retains its approved visual identity and remains the default.
- GitHub uses the approved Primer Header identity in light and dark appearances.
- GitHub and macOS are distinguishable at thumbnail scale.
- The three new presets have complete light and dark app tokens.
- The three new presets have complete classic and theme-synchronized terminal tokens.
- All twelve presets have Electron window-background mappings for global selection.
- Topbar foreground, muted content, controls, primary actions, and terminal core text meet the documented `4.5:1` contrast gate.
- Existing persisted settings remain compatible.
- No React component branches on a theme ID.
- No generated theme pipeline or new dependency is added.
- Typecheck, tests, and architecture checks pass.

## Palette References

- GitHub Primer color roles and primitives: <https://primer.style/product/getting-started/foundations/color-usage/> and <https://primer.style/product/primitives/color/>
- Catppuccin palette and style guidance: <https://github.com/catppuccin/catppuccin>
- Solarized canonical values: <https://github.com/altercation/solarized>
- Tokyo Night Day/Night values: <https://github.com/tokyo-night/tokyo-night-vscode-theme>

Repository CSS remains the runtime source of truth. These references define palette identity; the documented Hobgoblin adaptations define application contrast and region mapping.

## Engineering Principles

- KISS: extend the existing CSS token system and current settings flow.
- YAGNI: add only the three requested presets and the smallest topbar foreground/control token family required by the approved dark header.
- DRY: keep theme IDs in `COLOR_THEMES`; derive selectors and validation from that source.
- SOLID: keep theme identity, CSS values, persistence, renderer projection, terminal integration, and native window projection in their existing responsibilities.
