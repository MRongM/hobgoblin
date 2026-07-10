# Theme-Specific Unread Bell Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every built-in Light/Dark color theme an explicit, accessible unread terminal bell color from the approved theme-secondary spectrum.

**Architecture:** Keep the existing CSS-token pipeline: each theme file owns its `--goblin-terminal-bell*` values, `contract.css` continues to expose semantic aliases, and `TerminalBellDot` remains theme-ID agnostic. Add test-only palette expectations and WCAG contrast helpers in `theme-presets.test.ts`; do not add a production TypeScript palette or React branches.

**Tech Stack:** Tailwind v4 token CSS, TypeScript strip-only mode, Vitest, Bun, React renderer.

---

## Project Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Keep production palette ownership in `src/web/theme/themes/*.css`.
- Do not modify `TerminalBellDot.tsx`, `contract.css`, settings, main, server, or shared theme IDs.
- Do not add package dependencies.
- Do not add or execute git commit steps. Project instructions prohibit planning or executing commits unless the user explicitly requests them.
- Preserve the existing bell state, notification, animation, size, layout, and accessibility behavior.

## Scope Check

The design affects one subsystem: renderer theme tokens consumed by the existing unread bell component. The nine CSS presets and their shared contract test must change together, so one implementation plan is appropriate.

## File Map

- Modify: `src/web/theme/theme-presets.test.ts`
  - Split activity and bell token requirements.
  - Lock the approved 18-color Light/Dark palette and RGB triplets.
  - Assert surface/border derivation rules.
  - Enforce 3:1 core-dot contrast against actual host surfaces.
- Modify: `src/web/theme/themes/macos.css`
  - Add macOS Light/Dark magenta bell tokens.
- Modify: `src/web/theme/themes/mono.css`
  - Add Mono Light/Dark cyan bell tokens.
- Modify: `src/web/theme/themes/github.css`
  - Add GitHub Light/Dark green bell tokens.
- Modify: `src/web/theme/themes/claude.css`
  - Add Claude Light/Dark blue bell tokens.
- Modify: `src/web/theme/themes/cursor.css`
  - Add Cursor Light/Dark violet bell tokens.
- Modify: `src/web/theme/themes/airbnb.css`
  - Add Airbnb Light/Dark teal bell tokens.
- Modify: `src/web/theme/themes/bmw.css`
  - Add BMW Light/Dark red bell tokens with RGB values derived from the approved Hex values.
- Modify: `src/web/theme/themes/signal.css`
  - Replace Signal Light bell tokens; retain the approved existing Dark gold.
- Modify: `src/web/theme/themes/forge.css`
  - Replace Forge Light/Dark bell tokens with emerald values.

---

### Task 1: Add Failing All-Theme Bell Contract Tests

**Files:**

- Modify: `src/web/theme/theme-presets.test.ts:3`
- Modify: `src/web/theme/theme-presets.test.ts:137-146`
- Modify: `src/web/theme/theme-presets.test.ts:303-334`
- Modify: `src/web/theme/theme-presets.test.ts:356-366`
- Modify: `src/web/theme/theme-presets.test.ts:483-500`

- [ ] **Step 1: Add focused token groups, palette expectations, and host-surface lists**

Change the shared theme import and add the following types and constants. Replace the current combined `TERMINAL_INDICATOR_TOKENS` constant with the two focused token arrays shown here.

```ts
import { COLOR_THEMES, type ColorTheme } from '#/shared/color-theme.ts'

const THEME_MODES = ['light', 'dark'] as const
type ThemeMode = (typeof THEME_MODES)[number]
type Rgb = readonly [number, number, number]

const TERMINAL_ACTIVITY_TOKENS = [
  '--goblin-terminal-activity',
  '--goblin-terminal-activity-rgb',
  '--goblin-terminal-activity-surface',
  '--goblin-terminal-activity-border',
] as const

const TERMINAL_BELL_TOKENS = [
  '--goblin-terminal-bell',
  '--goblin-terminal-bell-rgb',
  '--goblin-terminal-bell-surface',
  '--goblin-terminal-bell-border',
] as const

const BELL_COLOR_EXPECTATIONS = {
  macos: {
    light: { hex: '#af52de', rgb: '175 82 222' },
    dark: { hex: '#da8fff', rgb: '218 143 255' },
  },
  mono: {
    light: { hex: '#0e7490', rgb: '14 116 144' },
    dark: { hex: '#22d3ee', rgb: '34 211 238' },
  },
  github: {
    light: { hex: '#1a7f37', rgb: '26 127 55' },
    dark: { hex: '#3fb950', rgb: '63 185 80' },
  },
  claude: {
    light: { hex: '#496f9f', rgb: '73 111 159' },
    dark: { hex: '#8bb8f0', rgb: '139 184 240' },
  },
  cursor: {
    light: { hex: '#7c4ab0', rgb: '124 74 176' },
    dark: { hex: '#c59be8', rgb: '197 155 232' },
  },
  airbnb: {
    light: { hex: '#007a87', rgb: '0 122 135' },
    dark: { hex: '#4bb7c5', rgb: '75 183 197' },
  },
  bmw: {
    light: { hex: '#c42116', rgb: '196 33 22' },
    dark: { hex: '#ff5a4d', rgb: '255 90 77' },
  },
  signal: {
    light: { hex: '#8a6400', rgb: '138 100 0' },
    dark: { hex: '#f0b84a', rgb: '240 184 74' },
  },
  forge: {
    light: { hex: '#1f7a55', rgb: '31 122 85' },
    dark: { hex: '#79c79a', rgb: '121 199 154' },
  },
} as const satisfies Record<ColorTheme, Record<ThemeMode, { hex: string; rgb: string }>>

const BELL_DIRECT_SURFACES = [
  { label: 'inactive repo tab', token: '--goblin-topbar-bg' },
  { label: 'inactive terminal tab and toolbar branch summary', token: '--goblin-toolbar-bg' },
  { label: 'hovered repo or terminal tab', token: '--goblin-tab-hover-bg' },
  { label: 'active or dragging repo or terminal tab', token: '--goblin-tab-active-bg' },
  { label: 'branch row', token: '--goblin-sidebar-bg' },
  { label: 'hovered branch row', token: '--goblin-list-row-hover-bg' },
  { label: 'dragging branch row', token: '--goblin-card-bg' },
  { label: 'terminal dropdown', token: '--goblin-surface-overlay' },
  { label: 'focused terminal dropdown item', token: '--goblin-surface-hover' },
  { label: 'pane fallback', token: '--goblin-pane-bg' },
  { label: 'pane header fallback', token: '--goblin-pane-header-bg' },
] as const

const BELL_COMPOSITE_SURFACES = [
  {
    label: 'selected branch row',
    foregroundToken: '--goblin-list-row-selected-bg',
    backgroundToken: '--goblin-sidebar-bg',
  },
  {
    label: 'selected terminal dropdown item',
    foregroundToken: '--goblin-accent-selection',
    backgroundToken: '--goblin-surface-overlay',
  },
] as const
```

- [ ] **Step 2: Add test-only RGB, alpha-compositing, and WCAG contrast helpers**

Insert these helpers after `cssTokenValue()` and before the existing `hexLuminance()` helper:

```ts
function parseHexRgb(value: string): Rgb {
  const match = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) throw new Error(`Expected six-digit hex color, got ${value}`)
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ]
}

function parseRgbTriplet(value: string): Rgb {
  const match = value.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/)
  if (!match) throw new Error(`Expected space-separated RGB triplet, got ${value}`)
  const rgb = [Number(match[1]), Number(match[2]), Number(match[3])] as const
  if (rgb.some((channel) => channel < 0 || channel > 255)) {
    throw new Error(`RGB channel out of range in ${value}`)
  }
  return rgb
}

function parseAlphaTokenColor(block: string, token: string): { rgb: Rgb; alpha: number } {
  const value = cssTokenValue(block, token)
  const match = value.match(/^rgb\(var\((--[a-z0-9-]+)\)\s*\/\s*(0(?:\.\d+)?|1(?:\.0+)?)\)$/i)
  if (!match) throw new Error(`Expected rgb(var(--token) / alpha), got ${token}: ${value}`)

  return {
    rgb: parseRgbTriplet(cssTokenValue(block, match[1]!)),
    alpha: Number(match[2]),
  }
}

function linearRgbChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * linearRgbChannel(rgb[0]) +
    0.7152 * linearRgbChannel(rgb[1]) +
    0.0722 * linearRgbChannel(rgb[2])
  )
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function compositeRgb(foreground: { rgb: Rgb; alpha: number }, background: Rgb): Rgb {
  const inverseAlpha = 1 - foreground.alpha
  return [
    foreground.rgb[0] * foreground.alpha + background[0] * inverseAlpha,
    foreground.rgb[1] * foreground.alpha + background[1] * inverseAlpha,
    foreground.rgb[2] * foreground.alpha + background[2] * inverseAlpha,
  ]
}

function bellContrastSurfaces(block: string): ReadonlyArray<{ label: string; rgb: Rgb }> {
  const direct = BELL_DIRECT_SURFACES.map(({ label, token }) => ({
    label,
    rgb: parseHexRgb(cssTokenValue(block, token)),
  }))

  const composite = BELL_COMPOSITE_SURFACES.map(({ label, foregroundToken, backgroundToken }) => ({
    label,
    rgb: compositeRgb(parseAlphaTokenColor(block, foregroundToken), parseHexRgb(cssTokenValue(block, backgroundToken))),
  }))

  return [...direct, ...composite]
}
```

- [ ] **Step 3: Replace the original-theme indicator test and add the all-theme bell contract test**

Replace `defines explicit terminal indicator tokens for original Hobgoblin themes` with these tests:

```ts
test('defines explicit terminal activity tokens for original Hobgoblin themes', () => {
  for (const colorTheme of ['signal', 'forge'] as const) {
    const css = readThemeCss(colorTheme)
    for (const theme of THEME_MODES) {
      const block = selectorBlock(css, colorTheme, theme)
      for (const token of TERMINAL_ACTIVITY_TOKENS) {
        expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(`${token}:`)
      }
    }
  }
})

test('defines the approved unread bell token family for every color theme', () => {
  for (const colorTheme of COLOR_THEMES) {
    const css = readThemeCss(colorTheme)
    for (const theme of THEME_MODES) {
      const block = selectorBlock(css, colorTheme, theme)
      const expected = BELL_COLOR_EXPECTATIONS[colorTheme][theme]
      const expectedSurfaceAlpha = theme === 'light' ? '0.13' : '0.14'

      for (const token of TERMINAL_BELL_TOKENS) {
        expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(`${token}:`)
      }

      const bellHex = cssTokenValue(block, '--goblin-terminal-bell')
      const bellRgb = cssTokenValue(block, '--goblin-terminal-bell-rgb')
      expect(bellHex, `${colorTheme}/${theme} bell hex`).toBe(expected.hex)
      expect(bellRgb, `${colorTheme}/${theme} bell rgb`).toBe(expected.rgb)
      expect(parseRgbTriplet(bellRgb), `${colorTheme}/${theme} hex and rgb agree`).toEqual(parseHexRgb(bellHex))
      expect(cssTokenValue(block, '--goblin-terminal-bell-surface')).toBe(
        `rgb(var(--goblin-terminal-bell-rgb) / ${expectedSurfaceAlpha})`,
      )
      expect(cssTokenValue(block, '--goblin-terminal-bell-border')).toBe(
        'rgb(var(--goblin-terminal-bell-rgb) / 0.38)',
      )
    }
  }
})
```

- [ ] **Step 4: Add the core-dot contrast test**

Add this test immediately after the approved bell token-family test:

```ts
test('keeps the unread bell core at 3:1 contrast on every host surface', () => {
  for (const colorTheme of COLOR_THEMES) {
    const css = readThemeCss(colorTheme)
    for (const theme of THEME_MODES) {
      const block = selectorBlock(css, colorTheme, theme)
      const bell = parseHexRgb(cssTokenValue(block, '--goblin-terminal-bell'))
      const surfaces = bellContrastSurfaces(block)

      expect(surfaces, `${colorTheme}/${theme} resolves every host surface`).toHaveLength(
        BELL_DIRECT_SURFACES.length + BELL_COMPOSITE_SURFACES.length,
      )

      for (const surface of surfaces) {
        expect(
          contrastRatio(bell, surface.rgb),
          `${colorTheme}/${theme} bell contrasts with ${surface.label}`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  }
})
```

- [ ] **Step 5: Update the Signal and Forge design-brief assertions**

In `keeps original Hobgoblin presets aligned with their design briefs`, replace the two old Light bell assertions:

```ts
expect(signalLight).toContain('--goblin-terminal-bell: #8a6400;')
expect(forgeLight).toContain('--goblin-terminal-bell: #1f7a55;')
```

Keep the surrounding surface, action, and terminal-background assertions unchanged.

- [ ] **Step 6: Run the focused test and verify the red state**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: FAIL. macOS is the first theme without `--goblin-terminal-bell`; Signal and Forge also still contain their old approved Light colors until Task 2 updates the CSS.

---

### Task 2: Apply the Approved Bell Token Family to Every Theme

**Files:**

- Modify: `src/web/theme/themes/macos.css:73,181`
- Modify: `src/web/theme/themes/mono.css:70,177`
- Modify: `src/web/theme/themes/github.css:70,177`
- Modify: `src/web/theme/themes/claude.css:70,177`
- Modify: `src/web/theme/themes/cursor.css:70,177`
- Modify: `src/web/theme/themes/airbnb.css:68,170`
- Modify: `src/web/theme/themes/bmw.css:68,170`
- Modify: `src/web/theme/themes/signal.css:76-79,192-195`
- Modify: `src/web/theme/themes/forge.css:76-79,192-195`

For themes without bell tokens, insert each block after `--goblin-status-danger-border` and before `--color-overlay-scrim`. For Signal and Forge, replace the existing bell block without changing their adjacent activity block.

- [ ] **Step 1: Add the macOS Light/Dark bell blocks**

Light block:

```css
  --goblin-terminal-bell: #af52de;
  --goblin-terminal-bell-rgb: 175 82 222;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark block:

```css
  --goblin-terminal-bell: #da8fff;
  --goblin-terminal-bell-rgb: 218 143 255;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 2: Add the Mono Light/Dark bell blocks**

Light block:

```css
  --goblin-terminal-bell: #0e7490;
  --goblin-terminal-bell-rgb: 14 116 144;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark block:

```css
  --goblin-terminal-bell: #22d3ee;
  --goblin-terminal-bell-rgb: 34 211 238;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 3: Add the GitHub Light/Dark bell blocks**

Light block:

```css
  --goblin-terminal-bell: #1a7f37;
  --goblin-terminal-bell-rgb: 26 127 55;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark block:

```css
  --goblin-terminal-bell: #3fb950;
  --goblin-terminal-bell-rgb: 63 185 80;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 4: Add the Claude Light/Dark bell blocks**

Light block:

```css
  --goblin-terminal-bell: #496f9f;
  --goblin-terminal-bell-rgb: 73 111 159;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark block:

```css
  --goblin-terminal-bell: #8bb8f0;
  --goblin-terminal-bell-rgb: 139 184 240;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 5: Add the Cursor Light/Dark bell blocks**

Light block:

```css
  --goblin-terminal-bell: #7c4ab0;
  --goblin-terminal-bell-rgb: 124 74 176;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark block:

```css
  --goblin-terminal-bell: #c59be8;
  --goblin-terminal-bell-rgb: 197 155 232;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 6: Add the Airbnb Light/Dark bell blocks**

Light block:

```css
  --goblin-terminal-bell: #007a87;
  --goblin-terminal-bell-rgb: 0 122 135;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark block:

```css
  --goblin-terminal-bell: #4bb7c5;
  --goblin-terminal-bell-rgb: 75 183 197;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 7: Add the BMW Light/Dark bell blocks**

Do not copy BMW's existing status-danger RGB values; they do not represent the approved bell Hex colors.

Light block:

```css
  --goblin-terminal-bell: #c42116;
  --goblin-terminal-bell-rgb: 196 33 22;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark block:

```css
  --goblin-terminal-bell: #ff5a4d;
  --goblin-terminal-bell-rgb: 255 90 77;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 8: Replace the Signal Light/Dark bell blocks**

Light replacement:

```css
  --goblin-terminal-bell: #8a6400;
  --goblin-terminal-bell-rgb: 138 100 0;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark replacement:

```css
  --goblin-terminal-bell: #f0b84a;
  --goblin-terminal-bell-rgb: 240 184 74;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 9: Replace the Forge Light/Dark bell blocks**

Light replacement:

```css
  --goblin-terminal-bell: #1f7a55;
  --goblin-terminal-bell-rgb: 31 122 85;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.13);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

Dark replacement:

```css
  --goblin-terminal-bell: #79c79a;
  --goblin-terminal-bell-rgb: 121 199 154;
  --goblin-terminal-bell-surface: rgb(var(--goblin-terminal-bell-rgb) / 0.14);
  --goblin-terminal-bell-border: rgb(var(--goblin-terminal-bell-rgb) / 0.38);
```

- [ ] **Step 10: Run the focused theme contract test and verify the green state**

Run:

```bash
bun run test src/web/theme/theme-presets.test.ts
```

Expected: PASS. All nine themes define the approved bell family, Hex/RGB values agree, derived alphas match the contract, and every tested core/background combination is at least 3:1.

- [ ] **Step 11: Verify the unchanged component contract**

Run:

```bash
bun run test src/web/components/terminal/TerminalBellDot.test.tsx
```

Expected: PASS. The component still renders `bg-terminal-bell` for ping/core and still supports `ping={false}`.

---

### Task 3: Run Full Verification and Visual Smoke Testing

**Files:**

- Verify: `src/web/theme/theme-presets.test.ts`
- Verify: `src/web/theme/themes/*.css`
- Verify unchanged: `src/web/components/terminal/TerminalBellDot.tsx`

- [ ] **Step 1: Run strip-only TypeScript validation**

Run:

```bash
bun run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
bun run test
```

Expected: all Vitest suites pass with no failed tests.

- [ ] **Step 3: Run architecture boundary validation**

Run:

```bash
bun run check:architecture
```

Expected: exit code 0; no forbidden main/web/server/shared imports are reported.

- [ ] **Step 4: Inspect formatting and scope**

Run:

```bash
git diff --check
git diff --stat -- src/web/theme/theme-presets.test.ts src/web/theme/themes
```

Expected: `git diff --check` prints nothing. The product-code diff is limited to `theme-presets.test.ts` and the nine approved theme CSS files.

- [ ] **Step 5: Perform an actual-app bell color smoke test**

Start the app:

```bash
bun run dev
```

Expected: the Electron main process and renderer start without theme or CSS errors.

For each color theme in both Light and Dark modes:

1. Open two terminal tabs.
2. In the selected terminal, run `sleep 2; printf '\a'` and switch to the other tab before the two-second delay completes.
3. Confirm the unread bell appears in the terminal tab and any visible repo/branch summary that reflects the same bell state.
4. Confirm the bell uses the approved theme-secondary hue and remains visually distinct from terminal output activity.
5. Activate the terminal containing the unread bell and confirm the existing clear behavior is unchanged.

Expected palette: macOS magenta, Mono cyan, GitHub green, Claude blue, Cursor violet, Airbnb teal, BMW red, Signal gold, and Forge emerald; each mode uses its approved Light/Dark shade.

Stop the development process after completing the matrix. Do not change component code in response to expected ping opacity; the constant core dot is the required accessible indicator.

---

## Completion Criteria

- The focused theme preset test passes from a documented red state to green.
- Every built-in Light/Dark theme owns the complete bell token family.
- Exact Hex/RGB values and derived alpha rules match the approved design.
- Every tested core-dot background pairing is at least 3:1.
- `TerminalBellDot` remains unchanged and its existing tests pass.
- Full typecheck, tests, and architecture validation pass.
- Actual-app smoke testing confirms correct per-theme hues and unchanged unread-state clearing.
- No production files outside the nine theme CSS files and `theme-presets.test.ts` are modified.
