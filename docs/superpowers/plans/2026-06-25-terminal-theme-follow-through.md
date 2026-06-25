# Terminal Theme Follow-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the embedded xterm content area reliably follow the selected app theme when terminal theme sync is enabled.

**Architecture:** Keep the existing settings and CSS token architecture. Strengthen the CSS-token-to-xterm adapter, then ensure terminal views apply and refresh the resolved xterm theme after terminal creation, document theme changes, and terminal theme sync mode changes.

**Tech Stack:** TypeScript, React, Zustand, xterm.js, Vitest jsdom tests, Tailwind v4 CSS tokens, Bun.

---

## File Structure

- Modify: `src/web/components/terminal/terminal-theme.ts`
  - Responsibility: resolve terminal CSS custom properties into a complete xterm `ITheme` object for themed and classic modes.
- Modify: `src/web/components/terminal/terminal-theme-test-utils.ts`
  - Responsibility: install synthetic terminal theme CSS and real preset CSS into jsdom tests.
- Modify: `src/web/components/terminal/terminal-theme.test.ts`
  - Responsibility: verify real preset token resolution, classic fallback behavior, and non-empty xterm theme fields.
- Modify: `src/web/theme/theme-presets.test.ts`
  - Responsibility: verify every preset defines complete themed and classic terminal token coverage.
- Modify: `src/web/components/terminal/terminal-session-view.ts`
  - Responsibility: apply resolved xterm themes before first paint and refresh visible xterm content after theme changes.
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Responsibility: verify new and existing xterm instances receive themed mode and repaint when theme attributes or sync mode change.

No git commit steps are included because the project instruction says not to plan or execute git commits unless the user explicitly asks.

## Task 1: Strengthen Terminal Theme Token Tests

**Files:**
- Modify: `src/web/components/terminal/terminal-theme-test-utils.ts`
- Modify: `src/web/components/terminal/terminal-theme.test.ts`

- [ ] **Step 1: Add a real preset CSS installer for jsdom tests**

In `src/web/components/terminal/terminal-theme-test-utils.ts`, add imports at the top:

```ts
import { readFileSync } from 'node:fs'
import type { ColorTheme } from '#/shared/color-theme.ts'
```

Then append this helper after `installTerminalThemeStyles()`:

```ts
export function installRealTerminalPresetStyles(colorTheme: ColorTheme) {
  document.getElementById('terminal-theme-test-styles')?.remove()
  const style = document.createElement('style')
  style.id = 'terminal-theme-test-styles'
  style.textContent = readFileSync(new URL(`../../theme/themes/${colorTheme}.css`, import.meta.url), 'utf8')
  document.head.appendChild(style)
}
```

- [ ] **Step 2: Extend terminal theme tests before implementation changes**

In `src/web/components/terminal/terminal-theme.test.ts`, update the import:

```ts
import {
  installRealTerminalPresetStyles,
  installTerminalThemeStyles,
} from '#/web/components/terminal/terminal-theme-test-utils.ts'
```

Add this constant near the imports:

```ts
const REQUIRED_XTERM_THEME_KEYS = [
  'background',
  'foreground',
  'cursor',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const
```

Add these tests inside `describe('terminal theme tokens', () => { ... })`:

```ts
test('reads real preset terminal tokens from selected color theme css', () => {
  installRealTerminalPresetStyles('claude')
  document.documentElement.setAttribute('data-theme', 'light')
  document.documentElement.setAttribute('data-color-theme', 'claude')

  expect(terminalThemeForCurrentDocument()).toMatchObject({
    background: '#181715',
    foreground: '#faf9f5',
    cursor: '#faf9f5',
    blue: '#6f9fd8',
  })
})

test('reads a contrasting real preset without falling back to classic black', () => {
  installRealTerminalPresetStyles('github')
  document.documentElement.setAttribute('data-theme', 'light')
  document.documentElement.setAttribute('data-color-theme', 'github')

  expect(terminalThemeForCurrentDocument()).toMatchObject({
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#1f2328',
    blue: '#0969da',
  })
})

test('returns non-empty values for all required xterm theme fields', () => {
  installRealTerminalPresetStyles('github')
  document.documentElement.setAttribute('data-theme', 'light')
  document.documentElement.setAttribute('data-color-theme', 'github')

  const theme = terminalThemeForCurrentDocument()
  for (const key of REQUIRED_XTERM_THEME_KEYS) {
    expect(theme[key], key).toEqual(expect.any(String))
    expect(theme[key], key).not.toBe('')
  }
})

test('falls back to safe non-empty values when themed tokens are missing', () => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-color-theme')
  document.getElementById('terminal-theme-test-styles')?.remove()

  const theme = terminalThemeForCurrentDocument()
  for (const key of REQUIRED_XTERM_THEME_KEYS) {
    expect(theme[key], key).toEqual(expect.any(String))
    expect(theme[key], key).not.toBe('')
  }
  expect(theme.background).toBe('#050505')
})
```

- [ ] **Step 3: Run the terminal theme tests and verify they expose the gap**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-theme.test.ts
```

Expected before implementation:

- The real CSS tests may pass if token resolution already works for static CSS.
- The missing-token safe fallback test should fail because current theme resolution can return empty strings.

If all tests pass before implementation, keep them; they still lock in real CSS coverage needed for this bug.

## Task 2: Strengthen Theme Preset CSS Contract Tests

**Files:**
- Modify: `src/web/theme/theme-presets.test.ts`

- [ ] **Step 1: Add classic terminal token contract list**

In `src/web/theme/theme-presets.test.ts`, after `TERMINAL_TOKENS`, add:

```ts
const CLASSIC_TERMINAL_TOKENS = [
  '--color-terminal-classic-background',
  '--color-terminal-classic-foreground',
  '--color-terminal-classic-cursor',
  '--color-terminal-classic-selection-background',
  '--color-terminal-classic-ansi-black',
  '--color-terminal-classic-ansi-red',
  '--color-terminal-classic-ansi-green',
  '--color-terminal-classic-ansi-yellow',
  '--color-terminal-classic-ansi-blue',
  '--color-terminal-classic-ansi-magenta',
  '--color-terminal-classic-ansi-cyan',
  '--color-terminal-classic-ansi-white',
  '--color-terminal-classic-ansi-bright-black',
  '--color-terminal-classic-ansi-bright-red',
  '--color-terminal-classic-ansi-bright-green',
  '--color-terminal-classic-ansi-bright-yellow',
  '--color-terminal-classic-ansi-bright-blue',
  '--color-terminal-classic-ansi-bright-magenta',
  '--color-terminal-classic-ansi-bright-cyan',
  '--color-terminal-classic-ansi-bright-white',
  '--color-terminal-classic-search-match',
  '--color-terminal-classic-search-active-match',
  '--color-terminal-classic-search-active-border',
] as const
```

- [ ] **Step 2: Add a classic token coverage test**

Add this test inside `describe('theme preset css contracts', () => { ... })`, after the complete light/dark token block test:

```ts
test('defines complete classic terminal token coverage for every color theme', () => {
  for (const colorTheme of COLOR_THEMES) {
    const css = readThemeCss(colorTheme)
    for (const token of CLASSIC_TERMINAL_TOKENS) {
      expect(css, `${colorTheme} defines ${token}`).toContain(`${token}:`)
    }
  }
})
```

- [ ] **Step 3: Run theme preset contract tests**

Run:

```bash
bun run test -- src/web/theme/theme-presets.test.ts
```

Expected:

- PASS if every preset already includes classic terminal tokens.
- FAIL with the missing token name if any preset is incomplete. If it fails, add the missing declaration to the top-level `html[data-color-theme='<theme>']` block in the relevant `src/web/theme/themes/<theme>.css` file. Use the existing classic palette values from `src/web/theme/themes/macos.css`; for example:

```css
html[data-color-theme='<theme>'] {
  --color-terminal-classic-background: #050505;
  --color-terminal-classic-foreground: #f5f5f5;
  --color-terminal-classic-cursor: #f5f5f5;
  --color-terminal-classic-selection-background: rgba(255, 255, 255, 0.24);
  --color-terminal-classic-ansi-black: #000000;
  --color-terminal-classic-ansi-red: #ff5f56;
  --color-terminal-classic-ansi-green: #27c93f;
  --color-terminal-classic-ansi-yellow: #ffbd2e;
  --color-terminal-classic-ansi-blue: #5ac8fa;
  --color-terminal-classic-ansi-magenta: #bf5af2;
  --color-terminal-classic-ansi-cyan: #64d2ff;
  --color-terminal-classic-ansi-white: #d1d1d1;
  --color-terminal-classic-ansi-bright-black: #808080;
  --color-terminal-classic-ansi-bright-red: #ff6b65;
  --color-terminal-classic-ansi-bright-green: #32d74b;
  --color-terminal-classic-ansi-bright-yellow: #ffd60a;
  --color-terminal-classic-ansi-bright-blue: #70d7ff;
  --color-terminal-classic-ansi-bright-magenta: #da8fff;
  --color-terminal-classic-ansi-bright-cyan: #70d7ff;
  --color-terminal-classic-ansi-bright-white: #ffffff;
  --color-terminal-classic-search-match: #ffd60a;
  --color-terminal-classic-search-active-match: #ff9f0a;
  --color-terminal-classic-search-active-border: #ffffff;
}
```

## Task 3: Add Safe Terminal Theme Resolution

**Files:**
- Modify: `src/web/components/terminal/terminal-theme.ts`

- [ ] **Step 1: Add safe default values next to the token map**

In `src/web/components/terminal/terminal-theme.ts`, after `TERMINAL_THEME_TOKEN_MAP`, add:

```ts
const TERMINAL_THEME_SAFE_DEFAULTS: Record<keyof typeof TERMINAL_THEME_TOKEN_MAP, string> = {
  background: '#050505',
  foreground: '#f5f5f5',
  cursor: '#f5f5f5',
  selectionBackground: 'rgba(255, 255, 255, 0.24)',
  black: '#000000',
  red: '#ff5f56',
  green: '#27c93f',
  yellow: '#ffbd2e',
  blue: '#5ac8fa',
  magenta: '#bf5af2',
  cyan: '#64d2ff',
  white: '#d1d1d1',
  brightBlack: '#808080',
  brightRed: '#ff6b65',
  brightGreen: '#32d74b',
  brightYellow: '#ffd60a',
  brightBlue: '#70d7ff',
  brightMagenta: '#da8fff',
  brightCyan: '#70d7ff',
  brightWhite: '#ffffff',
}

const TERMINAL_SEARCH_SAFE_DEFAULTS: Record<keyof typeof TERMINAL_SEARCH_TOKEN_MAP, string> = {
  match: '#ffd60a',
  activeMatch: '#ff9f0a',
  activeBorder: '#ffffff',
}
```

- [ ] **Step 2: Update theme resolution to pass explicit fallbacks**

Replace `terminalThemeForCurrentDocument()` with:

```ts
export function terminalThemeForCurrentDocument(mode: TerminalThemeMode = 'theme'): ITheme {
  const styles = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    Object.entries(TERMINAL_THEME_TOKEN_MAP).map(([key, token]) => [
      key,
      cssTokenForMode(
        styles,
        token,
        mode,
        TERMINAL_THEME_SAFE_DEFAULTS[key as keyof typeof TERMINAL_THEME_TOKEN_MAP],
      ),
    ]),
  ) as ITheme
}
```

Replace `terminalSearchDecorationsForCurrentDocument()` with:

```ts
export function terminalSearchDecorationsForCurrentDocument(
  mode: TerminalThemeMode = 'theme',
): TerminalSearchDecorations {
  const styles = getComputedStyle(document.documentElement)
  const match = cssTokenForMode(styles, TERMINAL_SEARCH_TOKEN_MAP.match, mode, TERMINAL_SEARCH_SAFE_DEFAULTS.match)
  const activeMatch = cssTokenForMode(
    styles,
    TERMINAL_SEARCH_TOKEN_MAP.activeMatch,
    mode,
    TERMINAL_SEARCH_SAFE_DEFAULTS.activeMatch,
  )
  return {
    matchBackground: match,
    matchOverviewRuler: match,
    activeMatchBackground: activeMatch,
    activeMatchBorder: cssTokenForMode(
      styles,
      TERMINAL_SEARCH_TOKEN_MAP.activeBorder,
      mode,
      TERMINAL_SEARCH_SAFE_DEFAULTS.activeBorder,
    ),
    activeMatchColorOverviewRuler: activeMatch,
  }
}
```

- [ ] **Step 3: Update helper functions to preserve fallback behavior**

Replace `cssTokenForMode()` and `cssToken()` with:

```ts
function cssTokenForMode(
  styles: CSSStyleDeclaration,
  token: string,
  mode: TerminalThemeMode,
  fallback: string,
): string {
  if (mode !== 'classic') return cssToken(styles, token, fallback)
  const classic = cssToken(styles, tokenNameForMode(token, mode), '')
  return classic || cssToken(styles, token, fallback)
}

function cssToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const resolved = resolveCssValue(styles, styles.getPropertyValue(name).trim(), new Set([name])).trim()
  return resolved || fallback
}
```

Keep `resolveCssValue()` unchanged in this task.

- [ ] **Step 4: Run terminal theme tests**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-theme.test.ts
```

Expected:

- PASS for synthetic CSS.
- PASS for real `claude` and `github` CSS.
- PASS for missing-token safe defaults.

## Task 4: Apply And Refresh xterm Themes After Open And Mode Changes

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Add failing expectations for xterm refresh on theme application**

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, update the test named `applies terminal theme and updates when the app theme changes`.

After the initial `expect(term.options.theme)...` block, add:

```ts
expect(term.refresh).toHaveBeenCalledWith(0, Math.max(0, term.rows - 1))
term.refresh.mockClear()
```

After the dark theme expectation block, add:

```ts
expect(term.refresh).toHaveBeenCalledWith(0, Math.max(0, term.rows - 1))
```

Then add this new test after `uses classic terminal theme when theme sync is disabled`:

```ts
test('refreshes the terminal when theme sync mode changes after open', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)
  session.attach(host)
  await flushTerminalStart()

  const term = xtermMocks.terminals[0]!
  term.refresh.mockClear()

  session.setTerminalThemeMode(() => 'classic')

  expect(term.options.theme).toMatchObject({
    background: '#050505',
    foreground: '#f5f5f5',
  })
  expect(term.refresh).toHaveBeenCalledWith(0, Math.max(0, term.rows - 1))
})
```

- [ ] **Step 2: Run the managed session test and verify the refresh expectations fail**

Run:

```bash
bun run test -- src/web/components/terminal/ManagedTerminalSession.test.ts -t "terminal theme|theme sync"
```

Expected before implementation:

- The new refresh expectations should fail because current `applyTerminalTheme()` updates options and CSS properties without explicitly refreshing xterm after theme changes.

- [ ] **Step 3: Update `applyTerminalTheme()` to support controlled refresh**

In `src/web/components/terminal/terminal-session-view.ts`, replace `setTerminalThemeMode()` with:

```ts
setTerminalThemeMode(terminalThemeMode: () => TerminalThemeMode): void {
  this.terminalThemeMode = terminalThemeMode
  const term = this.term
  if (!term) return
  this.applyTerminalTheme(term, terminalThemeForCurrentDocument(this.terminalThemeMode()), { refresh: true })
}
```

In `openTerminal()`, keep the constructor `theme` option, but replace the first call to `this.applyTerminalTheme(term, theme)` with:

```ts
this.applyTerminalTheme(term, theme)
```

Then replace the observer callback with:

```ts
this.disposeThemeObserver = observeTerminalTheme(this.terminalThemeMode, (nextTheme) => {
  this.applyTerminalTheme(term, nextTheme, { refresh: true })
})
```

After `term.open(this.xtermHost)`, add:

```ts
this.applyTerminalTheme(term, terminalThemeForCurrentDocument(this.terminalThemeMode()), { refresh: true })
```

Finally replace `applyTerminalTheme()` with:

```ts
private applyTerminalTheme(
  term: XTermTerminal,
  theme: ITheme,
  options: { refresh?: boolean } = {},
): void {
  term.options.theme = theme
  const background = typeof theme.background === 'string' && theme.background ? theme.background : '#050505'
  this.frame.style.background = background
  this.frame.style.setProperty('--goblin-terminal-background', background)
  if (options.refresh !== true || !term.element) return
  term.refresh(0, Math.max(0, term.rows - 1))
}
```

- [ ] **Step 4: Run the focused managed session tests**

Run:

```bash
bun run test -- src/web/components/terminal/ManagedTerminalSession.test.ts -t "terminal theme|theme sync"
```

Expected:

- PASS for theme application.
- PASS for classic mode.
- PASS for refresh after sync mode change.

## Task 5: Verify Provider Mode Wiring Stays Intact

**Files:**
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

- [ ] **Step 1: Inspect existing provider coverage**

Confirm this test still exists:

```ts
test('passes disabled terminal theme sync to managed sessions', async () => {
  runtimeTerminalSettingsMock.terminalThemeSyncEnabled = false
  // ...
  expect(session.currentThemeMode()).toBe('classic')
})
```

- [ ] **Step 2: Add enabled-mode coverage**

Add this test near the disabled-mode test:

```ts
test('passes enabled terminal theme sync to managed sessions', async () => {
  runtimeTerminalSettingsMock.terminalThemeSyncEnabled = true
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/worktree',
    detailTab: 'terminal',
  })
  const { getContext, unmount } = await renderProvider()

  try {
    await act(async () => {
      await getContext().createTerminal({
        repoRoot: REPO_ID,
        branch: 'feature/worktree',
        worktreePath: WORKTREE_PATH,
      })
    })

    const session = mockSessions.find((item) => item.descriptor.terminalId === 'terminal-1')
    if (!session) throw new Error('missing terminal-1 mock session')
    expect(session.currentThemeMode()).toBe('theme')
  } finally {
    await unmount()
  }
})
```

- [ ] **Step 3: Run provider theme sync tests**

Run:

```bash
bun run test -- src/web/components/terminal/TerminalSessionProvider.test.tsx -t "terminal theme sync"
```

Expected:

- PASS for enabled mode.
- PASS for disabled mode.

## Task 6: Final Verification

**Files:**
- No code changes unless a verification failure points to one of the files above.

- [ ] **Step 1: Run terminal/theme targeted tests**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-theme.test.ts src/web/theme/theme-presets.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected:

- All listed test files pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected:

- Typecheck exits successfully with no TypeScript errors.

- [ ] **Step 3: Run full test suite if broad shared files changed**

Run this if implementation touched files outside the planned set, or if targeted tests fail due shared settings/runtime behavior:

```bash
bun run test
```

Expected:

- Full test suite passes. If unrelated pre-existing failures appear, record the failing test names and rerun the targeted verification to isolate this change.

- [ ] **Step 4: Manual product verification**

Start the app using the repo's existing dev command, then verify:

```bash
bun run dev
```

Expected manual checks:

- With `终端跟随主题` enabled, switching from `macOS` to `Claude` changes an existing terminal content background away from classic black.
- Creating a new terminal after switching theme uses the selected theme on first paint.
- Switching to `GitHub` light mode can produce a light terminal content background.
- Disabling `终端跟随主题` returns the xterm content area to the classic black palette while terminal tabs and surrounding chrome still follow the app theme.
