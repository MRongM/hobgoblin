# Topbar Brand Tint Colors Design

## Summary

Redo the top bar color pairing so it reads as a lightly branded application shell. The selected direction is **subtle theme-native brand tint**: each shipped color preset gives the top bar a restrained tint from its own palette, while active repo and terminal tabs remain brighter working objects placed on top of that shell.

This is a token-only visual refinement. Component structure, settings state, layout, tab behavior, and terminal palettes remain unchanged.

## Confirmed Decisions

- Visual direction: subtle brand-color shell, not neutral-only and not a high-contrast dark strip for light themes.
- Brand source: each theme preset uses its own brand palette; there is no fixed Hobgoblin-blue top bar across all themes.
- Scope: all shipped color presets in both light and dark appearance.
- Implementation shape: adjust theme CSS token values only.
- Component boundary: do not change `Topbar`, repo tab, terminal tab, or settings component behavior unless implementation finds a direct token consumption bug.
- Git behavior: write this design spec but do not commit it unless explicitly requested by the user.

## Goals

- Make theme switching visibly affect the top application chrome.
- Keep the top bar restrained enough for long-running developer workflows.
- Preserve each preset's personality: macOS blue restraint, GitHub developer chrome, Claude warmth, Cursor editor warmth, Airbnb red warmth, BMW engineered contrast, and Mono neutrality.
- Keep active tabs visually above the top bar.
- Keep the existing theme token architecture simple and centralized.

## Non-Goals

- Do not redesign top bar layout, height, drag behavior, overflow, or action placement.
- Do not introduce component-level `colorTheme` branches.
- Do not add user-editable custom themes or derived color generation.
- Do not change terminal palettes.
- Do not change settings storage or theme selection behavior.
- Do not change Electron native titlebar overlay unless manual verification shows an obvious platform chrome mismatch.

## Current Context

The renderer already routes top bar styling through semantic tokens:

- `Topbar` uses `bg-topbar`, `border-topbar-border`, and `text-topbar-foreground`.
- `contract.css` maps those utilities from `--goblin-topbar-bg`, `--goblin-topbar-border`, and optional `--goblin-topbar-fg`.
- Repo and terminal tabs use `--goblin-tab-hover-bg` and `--goblin-tab-active-bg`.
- Theme preset values live in `src/web/theme/themes/*.css`.
- `src/web/theme/theme-presets.test.ts` already validates token coverage and topbar/tab depth relationships.

The existing component boundary is already correct. This work should improve preset values rather than adding new styling paths.

## Explored Approaches

### A. Theme-Native Subtle Brand Tint

Each preset uses a low-saturation tint from its own palette for `--goblin-topbar-bg`, with borders tuned from the same palette. Active tabs stay brighter than the top bar.

This is the selected approach. It fits the existing token model, keeps themes distinct, and avoids mixing a fixed Hobgoblin brand color into unrelated theme palettes.

### B. Fixed Hobgoblin Top Bar Color

Every preset uses the same Hobgoblin-blue top bar. This creates consistent product recognition, but it weakens preset identity and conflicts with warm themes such as Claude and Airbnb.

This approach is rejected.

### C. Neutral Top Bar With Brand Accent Line

The top bar remains mostly neutral while borders or activity states carry brand color. This is stable and conservative, but it is weaker than the requested redo because theme changes still feel muted in the top chrome.

This approach is rejected for this pass.

## Visual Rules

For light appearance:

- `--goblin-topbar-bg` should be a lightly branded tint, deeper than active tabs but not a saturated color band.
- `--goblin-topbar-border` should separate the top bar from content without looking heavy.
- `--goblin-tab-active-bg` should remain brighter than the top bar.
- `--goblin-tab-hover-bg` should sit between topbar and active tab when practical.

For dark appearance:

- `--goblin-topbar-bg` should be a deep theme-native tint.
- `--goblin-tab-hover-bg` should remain slightly lighter than the top bar.
- `--goblin-tab-active-bg` should remain lighter than hover so active tabs are clear.
- Topbar foreground text and icon contrast must remain readable.

Brand interpretation:

- `macos`: cool, restrained blue-gray tint.
- `mono`: neutral depth with minimal color personality.
- `github`: blue-gray developer chrome.
- `claude`: warm parchment tint in light mode and warm near-black in dark mode.
- `cursor`: editor-like warm shell with orange influence kept subtle.
- `airbnb`: soft red-pink tint without turning the top bar into a strong banner.
- `bmw`: crisp cool tint in light mode and engineered blue-black depth in dark mode.

## Architecture

Keep the existing three-layer theme architecture:

1. Theme preset files define `--goblin-*` tokens.
2. `contract.css` maps `--goblin-*` values to Tailwind and shadcn semantic aliases.
3. Components consume semantic utilities and remain unaware of the selected color preset.

Primary implementation targets:

- `src/web/theme/themes/macos.css`
- `src/web/theme/themes/mono.css`
- `src/web/theme/themes/github.css`
- `src/web/theme/themes/claude.css`
- `src/web/theme/themes/cursor.css`
- `src/web/theme/themes/airbnb.css`
- `src/web/theme/themes/bmw.css`

Possible test target:

- `src/web/theme/theme-presets.test.ts`

## Component Boundary

`Topbar.tsx` should remain unchanged unless a real token consumption bug is found. It already consumes the correct semantic classes:

- `bg-topbar`
- `border-topbar-border`
- `text-topbar-foreground`

Tab components should remain unchanged. Their surface hierarchy should be controlled through token values, not component variants.

## Data Flow

No new data flow is introduced:

1. User settings resolve `theme` and `colorTheme`.
2. Renderer applies `data-theme` and `data-color-theme` to `html`.
3. Matching preset selector in `src/web/theme/themes/*.css` provides token values.
4. `contract.css` maps topbar and tab tokens to semantic utilities.
5. Existing React components update through CSS.

## Error Handling

No runtime error path changes are needed.

Missing tokens and invalid token coverage are handled by preset contract tests. If brightness ordering assertions depend on hex parsing, the relevant tokens should stay as six-digit hex values. RGB or `color-mix()` values should be avoided for the compared topbar/tab/toolbar tokens unless tests are extended to parse them.

Electron native titlebar overlay currently follows the window canvas token. This design does not change that behavior by default. If manual verification on Windows or Linux shows a visible mismatch between system caption controls and the top bar, handle it as a focused follow-up with an explicit platform-chrome design.

## Testing

Required verification after implementation:

```bash
bun run typecheck
bun run test
```

Focused verification:

- `src/web/theme/theme-presets.test.ts` passes for every shipped preset.
- Topbar remains visually deeper than tab hover and active tab in every preset and appearance.
- Topbar remains visually deeper than toolbar in every preset and appearance, unless the existing assertion is intentionally revised with a stronger visual reason.
- Manual visual check covers all seven presets in light and dark mode with repo tabs and terminal tabs visible.

## Acceptance Criteria

- Every shipped color preset has a theme-native lightly branded top bar.
- No shipped preset uses the same fixed Hobgoblin-blue top bar unless that color naturally belongs to the preset.
- Light themes do not turn the top bar into a heavy saturated banner.
- Dark themes keep the top bar deep, readable, and visually distinct from active tabs.
- Active repo tabs and terminal tabs remain visually elevated from the top bar.
- No React component branches by `colorTheme` are introduced.
- Topbar layout, drag behavior, action placement, and tab behavior are unchanged.
- Typecheck and tests pass.

## Engineering Principles

- KISS: update the existing token values rather than adding a new styling mechanism.
- YAGNI: do not add custom theme editing or color generation.
- DRY: keep the color relationship centralized in theme preset tokens.
- SOLID: keep visual theme definitions separate from component behavior.
