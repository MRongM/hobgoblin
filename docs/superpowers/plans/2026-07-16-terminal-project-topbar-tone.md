# Terminal and Project Topbar Tone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every desktop terminal-area topbar use the same complete theme tone as the project-area topbar in every theme.

**Architecture:** Keep `Toolbar` layout variants independent from color semantics by adding a `tone` prop with a backward-compatible `toolbar` default. A reusable `topbar-tone` scope applies the topbar surface and control token family without adding the structural `.topbar` drag-region padding; both desktop terminal toolbar paths opt in while compact UI retains its existing tone.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Tailwind CSS 4, Vitest.

## Global Constraints

- Preserve all existing toolbar height, spacing, terminal-tab, responsive, and native drag-region behavior.
- Do not change theme preset values, compact UI, or unrelated toolbar consumers.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not execute `git commit`; the project requires explicit user authorization.

---

### Task 1: Add the reusable topbar tone contract

**Files:**
- Modify: `src/web/components/Layout.test.tsx`
- Modify: `src/web/components/Layout.tsx`
- Modify: `src/web/theme/theme-contract.test.ts`
- Modify: `src/web/theme/contract.css`

**Interfaces:**
- Consumes: existing topbar semantic tokens from `contract.css`.
- Produces: `Toolbar` prop `tone?: 'toolbar' | 'topbar'`; CSS scope `.topbar-tone`.

- [x] **Step 1: Write failing component and CSS contract tests**

Add this test to `Layout.test.tsx`:

```tsx
test('can apply the topbar tone without changing toolbar sizing', () => {
  render(
    <Toolbar data-testid="toolbar" tone="topbar">
      <span>Terminal toolbar</span>
    </Toolbar>,
  )

  const toolbar = container!.querySelector<HTMLElement>('[data-testid="toolbar"]')
  expect(toolbar?.style.height).toBe('41px')
  expect(toolbar?.className).toContain('topbar-tone')
  expect(toolbar?.className).toContain('border-topbar-border')
  expect(toolbar?.className).toContain('bg-topbar')
  expect(toolbar?.className).toContain('text-topbar-foreground')
  expect(toolbar?.className).not.toContain('border-toolbar-border')
  expect(toolbar?.className).not.toContain('bg-toolbar')
})
```

Extend the topbar control semantics test in `theme-contract.test.ts` so both scopes are checked:

```ts
test('scopes topbar control semantics without replacing muted foreground', () => {
  const contract = readText(new URL('contract.css', THEME_ROOT))

  for (const selector of ['.topbar', '.topbar-tone']) {
    const topbar = cssRule(contract, selector)

    expect(topbar).toContain('--color-control: var(--color-topbar-control);')
    expect(topbar).toContain('--color-control-hover: var(--color-topbar-control-hover);')
    expect(topbar).toContain('--color-input: var(--color-topbar-control-border);')
    expect(topbar).toContain('--color-accent: var(--color-topbar-control-hover);')
    expect(topbar).toContain('--color-accent-foreground: var(--color-topbar-control-foreground);')
    expect(topbar).not.toContain('--color-muted-foreground:')
  }
})
```

- [x] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
bun run test src/web/components/Layout.test.tsx src/web/theme/theme-contract.test.ts
```

Expected: FAIL because `Toolbar` has no `tone` prop and `.topbar-tone` does not exist.

- [x] **Step 3: Add the topbar tone CSS scope**

Change the selector in `contract.css` without changing its declarations:

```css
.topbar,
.topbar-tone {
  --color-control: var(--color-topbar-control);
  --color-control-hover: var(--color-topbar-control-hover);
  --color-input: var(--color-topbar-control-border);
  --color-accent: var(--color-topbar-control-hover);
  --color-accent-foreground: var(--color-topbar-control-foreground);
}
```

- [x] **Step 4: Add a tone prop to `Toolbar`**

Update `ToolbarProps` and `Toolbar` in `Layout.tsx`:

```tsx
interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  variant?: 'plain' | 'repo' | 'detail'
  tone?: 'toolbar' | 'topbar'
}

export function Toolbar({ children, className, variant = 'plain', tone = 'toolbar', style, ...props }: ToolbarProps) {
  const { toolbarHeightPx } = useRuntimeChromeSettings()

  return (
    <div
      className={cn(
        'flex shrink-0 items-center border-b',
        tone === 'topbar'
          ? 'topbar-tone border-topbar-border bg-topbar text-topbar-foreground'
          : 'border-toolbar-border bg-toolbar text-toolbar-foreground',
        variant === 'repo' && 'gap-3 px-4',
        variant === 'detail' && 'min-w-0 justify-between gap-2 px-2',
        className,
      )}
      style={{ ...style, height: toolbarHeightPx }}
      {...props}
    >
      {children}
    </div>
  )
}
```

- [x] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
bun run test src/web/components/Layout.test.tsx src/web/theme/theme-contract.test.ts
```

Expected: PASS. The default remains the generic toolbar tone; the optional topbar tone maps the complete surface and control semantics.

### Task 2: Apply the tone to the Git terminal-area topbar

**Files:**
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.test.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.tsx`

**Interfaces:**
- Consumes: `Toolbar` prop `tone?: 'toolbar' | 'topbar'` from Task 1.
- Produces: desktop Git terminal-area topbar rendered with topbar tone tokens in all layouts and themes.

- [x] **Step 1: Strengthen the existing drag-region regression test**

Replace the existing left-right drag-region assertion block with:

```tsx
const toolbar = c.firstElementChild
expect(toolbar?.className).toContain('[-webkit-app-region:drag]')
expect(toolbar?.className).toContain('topbar-tone')
expect(toolbar?.className).toContain('border-topbar-border')
expect(toolbar?.className).toContain('bg-topbar')
expect(toolbar?.className).toContain('text-topbar-foreground')
```

Add a compact regression test:

```tsx
test('keeps the compact detail toolbar on the generic toolbar tone', () => {
  compactUi = true
  const { container: c } = renderToolbar({
    terminalCount: 1,
    detailTab: 'terminal',
    layout: 'left-right',
    navigation: navigationWith({}),
  })

  expect(c.firstElementChild?.className).toContain('bg-toolbar')
  expect(c.firstElementChild?.className).not.toContain('topbar-tone')
})
```

- [x] **Step 2: Run the component test and verify the new assertions fail**

Run:

```bash
bun run test src/web/components/branch-detail/BranchDetailToolbar.test.tsx
```

Expected: FAIL on `topbar-tone` because the terminal toolbar still uses the default tone; the pre-existing drag-region assertion still passes.

- [x] **Step 3: Opt `BranchDetailToolbar` into the topbar tone**

Update its `Toolbar` opening tag:

```tsx
<Toolbar
  variant="detail"
  tone={compact ? 'toolbar' : 'topbar'}
  className={cn(layout === 'left-right' && '[-webkit-app-region:drag]', isWindowChrome && 'topbar')}
>
```

- [x] **Step 4: Run the focused component test**

Run:

```bash
bun run test src/web/components/branch-detail/BranchDetailToolbar.test.tsx
```

Expected: PASS for both desktop topbar tone and compact generic tone while the existing drag-region assertion remains green.

### Task 3: Apply the tone to the plain-workspace terminal topbar

**Files:**
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`

**Interfaces:**
- Consumes: `Toolbar` prop `tone?: 'toolbar' | 'topbar'` from Task 1 and `useIsCompactUi()`.
- Produces: desktop plain-workspace terminal topbar rendered with topbar tone tokens while compact UI remains unchanged.

- [x] **Step 1: Add failing desktop and compact tone tests**

Add a mutable compact flag and hook mock near the existing test mocks:

```tsx
let compactUi = false

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useIsCompactUi: () => compactUi,
}))
```

Reset it in `beforeEach`:

```tsx
compactUi = false
```

Add these tests:

```tsx
test('uses the project topbar tone for the desktop terminal toolbar', () => {
  render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

  const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
  expect(toolbar?.className).toContain('topbar-tone')
  expect(toolbar?.className).toContain('border-topbar-border')
  expect(toolbar?.className).toContain('bg-topbar')
  expect(toolbar?.className).toContain('text-topbar-foreground')
})

test('keeps the compact terminal toolbar on the generic toolbar tone', () => {
  compactUi = true
  render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

  const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
  expect(toolbar?.className).toContain('bg-toolbar')
  expect(toolbar?.className).not.toContain('topbar-tone')
})
```

- [x] **Step 2: Run the component test and verify the new assertions fail**

Run:

```bash
bun run test src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: FAIL because the toolbar has neither the test id nor responsive topbar tone selection.

- [x] **Step 3: Apply the responsive topbar tone**

Import and read the compact state:

```tsx
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'

const compact = useIsCompactUi()
```

Update the toolbar opening tag:

```tsx
<Toolbar
  data-testid="plain-workspace-terminal-toolbar"
  variant="detail"
  tone={compact ? 'toolbar' : 'topbar'}
>
```

- [x] **Step 4: Run the focused component test**

Run:

```bash
bun run test src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: PASS for both desktop and compact tone contracts.

### Task 4: Run full verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: all implementations from Tasks 1–3.
- Produces: verification evidence for the complete change.

- [x] **Step 1: Run focused and full verification**

Run:

```bash
bun run test src/web/components/branch-detail/BranchDetailToolbar.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx src/web/components/Layout.test.tsx src/web/theme/theme-contract.test.ts
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands PASS. Both desktop terminal paths match the project topbar, compact and unrelated toolbars keep their prior tone, and the existing native drag region remains intact.

Execution results:

- Focused verification passed: 4 files, 28 tests.
- `bun run typecheck` passed for main, web, and test projects.
- `bun run check:architecture` passed.
- `bun run build:web` passed and retained all topbar tone utilities in the production CSS.
- The full suite retained four pre-existing failures in `terminal.test.ts`,
  `BranchList.test.tsx`, and `RepoToolbar.test.tsx`; 280 files and 2268 tests
  passed. One additional terminal timing failure from the concurrent full run
  disappeared when `terminal.test.ts` was rerun alone.
