# Signal / Forge Theme And Terminal Indicator Design

## Summary

Add two original Hobgoblin color theme presets, `signal` and `forge`, and make terminal output activity and unread bell indicators follow theme-specific colors.

The implementation should extend the current CSS token architecture. It must not introduce a generated theme pipeline, TypeScript palette tables, or React branches keyed by theme ID.

## Confirmed Decisions

- Add `signal` and `forge` as the first original Hobgoblin theme presets.
- Keep existing brand-derived presets such as `github`, `cursor`, `airbnb`, and `bmw`.
- Defer `volt`; it is visually memorable but too close to common purple-blue AI tooling for this first pass.
- Use targeted existing-theme enhancement only for terminal indicator tokens.
- Do not repaint existing theme palettes as part of this feature.
- Terminal output activity uses a new theme-aware activity token family.
- Terminal unread bell uses a separate theme-aware bell token family.
- Activity defaults to the theme accent/brand color.
- Bell defaults to the warning/attention color, because unread bell is an attention state, not general brand decoration.
- Keep output activity state and unread bell state managed by the existing terminal session registry and bell controller.
- Do not add a terminal "completed" state.
- Do not commit this design document unless explicitly requested by the user, because project instructions prohibit unrequested git commits.

## Goals

- Expose `signal` and `forge` in global settings and per-project theme menus.
- Provide complete light and dark token coverage for both new themes.
- Keep Electron first-paint window background aligned with each new theme's canvas.
- Ensure pre-React boot allows both new theme IDs.
- Make terminal output activity glow, ping, icon color, and shadow follow theme activity tokens.
- Make terminal unread bell dot and ping follow theme bell tokens.
- Preserve existing terminal output activity and unread bell state semantics.
- Add focused tests that prevent token coverage and indicator color regressions.

## Non-Goals

- Do not add user-editable custom themes.
- Do not build a theme editor.
- Do not migrate CSS theme files into JSON, TypeScript, or generated CSS.
- Do not redesign terminal tabs, terminal layout, branch rows, repo tabs, or settings UI.
- Do not change terminal output activity timing.
- Do not change unread bell notification behavior.
- Do not rename existing themes.
- Do not add package dependencies.

## Architecture

The current theme architecture remains the boundary:

- `src/shared/color-theme.ts`
  - Add `signal` and `forge` to `COLOR_THEMES`.
  - Keep `macos` as `DEFAULT_COLOR_THEME`.
  - Keep unknown values normalized to the default.

- `src/web/public/boot.js`
  - Add `signal` and `forge` to the pre-React allowlist.
  - Keep the allowlist synchronized with `COLOR_THEMES`.

- `src/shared/theme-tokens.ts`
  - Add `WINDOW_BACKGROUND_BY_COLOR_THEME.signal`.
  - Add `WINDOW_BACKGROUND_BY_COLOR_THEME.forge`.
  - Values must match each new theme's `--goblin-surface-canvas` in light and dark mode.

- `src/web/theme/theme.css`
  - Import `./themes/signal.css`.
  - Import `./themes/forge.css`.

- `src/web/theme/themes/signal.css`
  - Define complete classic terminal tokens.
  - Define complete light and dark app, status, region, control, terminal, activity, and bell tokens.

- `src/web/theme/themes/forge.css`
  - Define complete classic terminal tokens.
  - Define complete light and dark app, status, region, control, terminal, activity, and bell tokens.

- `src/web/theme/contract.css`
  - Add semantic aliases for terminal activity and bell colors.
  - Provide defaults through existing goblin tokens so existing themes are covered without duplicating values in every file.

- `src/shared/i18n/en.ts`, `zh.ts`, `ja.ts`, `ko.ts`
  - Add labels for `settings.theme-preset.signal`.
  - Add labels for `settings.theme-preset.forge`.

No React component should import or compare `ColorTheme` to style these indicators. Theme selection must flow through `html[data-color-theme]` and CSS custom properties.

## Visual Direction

### Signal

`signal` is the stable long-work-session theme. It should feel like a calm communication console rather than a saturated neon terminal.

Light mode:

- Canvas: near white with a slight cyan-green cast.
- Topbar: visibly deeper teal-gray than tab hover and active tab states.
- Toolbar: lighter than topbar but still tinted.
- Accent/activity: clear teal green.
- Bell: warm amber or yellow-orange, distinct from activity.
- Terminal: light terminal background with readable teal selection and ANSI colors.

Dark mode:

- Canvas: deep blue-green black.
- Topbar/toolbar: dark teal layers with visible but restrained borders.
- Accent/activity: teal green, bright enough for ping visibility but not fluorescent.
- Bell: warm amber that remains readable on dark tabs.
- Terminal: dark teal-black with high-contrast foreground.

### Forge

`forge` is the more characterful original theme. It should evoke oxidized metal and a workbench, without becoming a broad warm beige theme.

Light mode:

- Canvas: low-saturation warm gray, not cream-dominant.
- Topbar: deeper brass/stone layer.
- Toolbar: lighter brass-tinted layer.
- Accent/activity: oxidized orange or copper.
- Bell: bright gold/amber, separate from activity.
- Terminal: restrained warm-light terminal background, with strong foreground contrast.

Dark mode:

- Canvas: deep brown-black.
- Topbar/toolbar: warm metal layers with clear border depth.
- Accent/activity: copper-orange.
- Bell: gold/amber with enough contrast on dark tab surfaces.
- Terminal: dark forge surface with warm foreground and recognizable ANSI colors.

## Token Contract

Add goblin foundation tokens:

```css
--goblin-terminal-activity
--goblin-terminal-activity-rgb
--goblin-terminal-activity-surface
--goblin-terminal-activity-border

--goblin-terminal-bell
--goblin-terminal-bell-rgb
--goblin-terminal-bell-surface
--goblin-terminal-bell-border
```

Add semantic aliases in `contract.css`:

```css
--color-terminal-activity: var(--goblin-terminal-activity, var(--goblin-accent));
--color-terminal-activity-rgb: var(--goblin-terminal-activity-rgb, var(--goblin-accent-rgb));
--color-terminal-activity-surface: var(--goblin-terminal-activity-surface, var(--goblin-accent-surface));
--color-terminal-activity-border: var(--goblin-terminal-activity-border, var(--goblin-accent-border));

--color-terminal-bell: var(--goblin-terminal-bell, var(--goblin-status-warning-text));
--color-terminal-bell-rgb: var(--goblin-terminal-bell-rgb, var(--goblin-status-warning-rgb));
--color-terminal-bell-surface: var(--goblin-terminal-bell-surface, var(--goblin-status-warning-surface));
--color-terminal-bell-border: var(--goblin-terminal-bell-border, var(--goblin-status-warning-border));
```

Existing themes may rely on the fallback aliases. `signal` and `forge` should define explicit goblin activity and bell tokens in both light and dark blocks.

## Component Design

### TerminalOutputActivityIndicator

Keep the component API unchanged.

Replace fixed success styling with terminal activity tokens:

- Glow background uses `bg-terminal-activity-surface` or `var(--color-terminal-activity-surface)`.
- Ping background uses `bg-terminal-activity` or `var(--color-terminal-activity)`.
- Ping border uses `border-terminal-activity-border` or `var(--color-terminal-activity-border)`.
- Active icon color uses `text-terminal-activity` or `var(--color-terminal-activity)`.
- Glow and icon shadows use `rgb(var(--color-terminal-activity-rgb) / opacity)`.

The indicator must continue to render no ping or glow in idle mode.

### TerminalBellDot

Keep the component API unchanged.

Replace fixed attention styling with terminal bell tokens:

- Ping background uses `bg-terminal-bell` or `var(--color-terminal-bell)`.
- Dot background uses `bg-terminal-bell` or `var(--color-terminal-bell)`.
- Optional ring or shadow uses `--color-terminal-bell-border` / `--color-terminal-bell-rgb` if needed for contrast.

Unread bell remains semantically separate from output activity.

## Data Flow

Output activity:

1. Terminal output arrives.
2. `TerminalSessionRegistry.markOutputActive()` adds the session key to `outputActiveKeys`.
3. Existing hooks expose `hasTerminalOutputActivity`.
4. Repo tab and branch summary render `TerminalOutputActivityIndicator`.
5. CSS tokens determine the indicator color.
6. Existing idle timer removes activity after `TERMINAL_OUTPUT_ACTIVE_IDLE_MS`.

Unread bell:

1. Terminal bell event arrives.
2. `createTerminalBellController()` records unread bell state.
3. Existing hooks expose `hasTerminalBell`.
4. Repo tab, terminal tab, and branch summary render `TerminalBellDot`.
5. CSS tokens determine the bell color.

Theme switching:

1. Settings or project theme selection updates effective color theme.
2. The renderer applies `html[data-color-theme]`.
3. CSS custom properties update.
4. Indicators update through CSS without business-state changes.

## Error Handling

- Unknown persisted theme values continue to normalize to `macos`.
- `boot.js` falls back to `macos` for invalid `colorTheme` query values.
- Missing activity tokens fall back to accent tokens.
- Missing bell tokens fall back to warning/attention tokens.
- Runtime components should not crash if CSS variables are absent; tests should be stricter than runtime fallbacks.

## Testing

### Shared Theme IDs

Update or add `src/shared/color-theme.test.ts`:

- `COLOR_THEMES` includes `signal` and `forge`.
- `DEFAULT_COLOR_THEME` remains `macos`.
- `isColorTheme()` accepts `signal` and `forge`.
- `normalizeColorTheme()` rejects unknown values and preserves the existing `apple` to `macos` compatibility behavior.

### Boot Allowlist

Update `src/web/public/boot.test.ts`:

- The `boot.js` color theme allowlist equals `COLOR_THEMES`.
- Invalid boot theme values fall back to the shared default.

### Native Window Backgrounds

Update `src/shared/theme-tokens.test.ts`:

- `WINDOW_BACKGROUND_BY_COLOR_THEME` has keys for every `COLOR_THEMES` entry.
- `signal` and `forge` define valid light and dark hex backgrounds.

### CSS Preset Contract

Update `src/web/theme/theme-contract.test.ts` and `src/web/theme/theme-presets.test.ts`:

- `contract.css` exposes terminal activity aliases.
- `contract.css` exposes terminal bell aliases.
- Every `COLOR_THEMES` entry has a matching CSS file.
- `signal.css` and `forge.css` define complete light and dark selector blocks.
- New themes define required foundation, app-region, terminal, activity, and bell tokens.
- Light terminal backgrounds remain light and dark terminal backgrounds remain dark unless a theme-specific test explicitly allows otherwise.
- Topbar remains visually deeper than toolbar and tab states.
- Topbar brand tint expectations include `signal` and `forge`.

### Terminal Indicators

Update `src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx`:

- Active indicator renders glow and ping.
- Active indicator no longer uses `border-success`, `bg-success`, or `text-success`.
- Active indicator uses terminal activity token classes or inline CSS variable styles.
- Idle indicator still renders no ping or glow.

Add or update `src/web/components/terminal/TerminalBellDot.test.tsx`:

- Bell dot renders with a ping by default.
- Bell dot can render without ping when `ping={false}`.
- Bell dot no longer uses `bg-attention`.
- Bell dot uses terminal bell token classes or inline CSS variable styles.

### Recommended Verification Commands

```bash
bun run typecheck
bun run test src/shared/color-theme.test.ts src/web/public/boot.test.ts src/shared/theme-tokens.test.ts src/web/theme/theme-contract.test.ts src/web/theme/theme-presets.test.ts src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx src/web/components/terminal/TerminalBellDot.test.tsx
bun run test
```

## Acceptance Criteria

- `Signal` and `Forge` appear in global theme settings.
- `Signal` and `Forge` appear in the per-project theme menu.
- `Signal` and `Forge` can be selected before React loads without falling back to `macos`.
- Both new themes have complete light and dark app token coverage.
- Both new themes have complete light and dark terminal token coverage.
- Both new themes have native window background mappings.
- Terminal output activity glow, ping, icon color, and shadow follow terminal activity tokens.
- Terminal unread bell dot and ping follow terminal bell tokens.
- Existing themes inherit activity and bell indicator colors from token defaults unless explicitly overridden.
- Existing theme palettes are not broadly repainted.
- No React component branches on a specific theme ID.
- No generated theme pipeline or TypeScript palette table is introduced.

## Engineering Principles

- KISS: extend the existing CSS token contract instead of adding another theme system.
- YAGNI: add only two original themes and two indicator token families.
- DRY: keep palette values in CSS tokens; do not duplicate palette tables in TypeScript.
- SOLID: keep theme identity, CSS token definition, terminal state, and indicator rendering responsibilities separate.
