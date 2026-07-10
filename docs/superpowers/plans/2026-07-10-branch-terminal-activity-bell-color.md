# Branch Terminal Activity Bell Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make only the terminal output activity indicator beside the branch `#short-hash` use the current theme's terminal bell color family.

**Architecture:** Extend the shared activity indicator with an explicit `tone` presentation prop that defaults to its current activity palette. The branch summary opts into the bell palette, while repo tabs and every existing caller retain the default without changes.

**Tech Stack:** React 19, TypeScript in Node.js strip-only mode, Tailwind CSS semantic classes, Vitest, Testing Library, Bun.

---

## File structure

- Modify `src/web/components/terminal/TerminalOutputActivityIndicator.tsx`: own the `activity`/`bell` palette selection while preserving animation, size, and accessibility behavior.
- Modify `src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx`: lock the default activity palette and the opt-in bell palette, including CSS-variable-based shadows.
- Modify `src/web/components/repo-workspace/BranchSummaryInline.tsx`: opt only the branch terminal-count activity indicator into the bell tone.
- Modify `src/web/components/branch-list/BranchRow.test.tsx`: verify the branch-row integration renders the bell tone.

No new files, dependencies, theme tokens, settings, or runtime state are required.

### Task 1: Add an explicit bell palette to the shared activity indicator

**Files:**
- Modify: `src/web/components/terminal/TerminalOutputActivityIndicator.tsx:4-104`
- Test: `src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx:27-61`

- [ ] **Step 1: Write the failing bell-tone component test**

Add this test after the existing active-indicator test:

```tsx
test('renders every active effect with the terminal bell palette when requested', () => {
  act(() => {
    root!.render(<TerminalOutputActivityIndicator label="Terminal output active" active tone="bell" />)
  })

  const indicator = document.body.querySelector('[data-terminal-output-activity-indicator="active"]')
  const ping = indicator?.querySelector<HTMLElement>('[data-terminal-output-activity-ping]')
  const glow = indicator?.querySelector<HTMLElement>('[data-terminal-output-activity-glow]')
  const icon = indicator?.querySelector<SVGElement>('svg')

  expect(ping?.classList.contains('border-terminal-bell-border')).toBe(true)
  expect(ping?.classList.contains('bg-terminal-bell')).toBe(true)
  expect(ping?.classList.contains('bg-terminal-activity')).toBe(false)
  expect(glow?.classList.contains('bg-terminal-bell-surface')).toBe(true)
  expect(glow?.style.boxShadow).toContain('var(--color-terminal-bell-rgb)')
  expect(icon?.classList.contains('text-terminal-bell')).toBe(true)
  expect(icon?.classList.contains('text-terminal-activity')).toBe(false)
  expect(icon?.style.filter).toContain('var(--color-terminal-bell-rgb)')
})
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
bun run test -- src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx
```

Expected: FAIL because `TerminalOutputActivityIndicatorProps` does not accept `tone`, or because bell palette assertions do not match.

- [ ] **Step 3: Implement the minimal tone contract**

Replace the four fixed activity style constants with palette and effect metadata:

```tsx
const toneStyles = {
  activity: {
    glowClassName: 'bg-terminal-activity-surface',
    pingClassName: 'border-terminal-activity-border bg-terminal-activity',
    iconClassName: 'text-terminal-activity',
    rgbToken: '--color-terminal-activity-rgb',
  },
  bell: {
    glowClassName: 'bg-terminal-bell-surface',
    pingClassName: 'border-terminal-bell-border bg-terminal-bell',
    iconClassName: 'text-terminal-bell',
    rgbToken: '--color-terminal-bell-rgb',
  },
} as const

type TerminalOutputActivityIndicatorTone = keyof typeof toneStyles
```

Replace `effectStyles` with metadata that preserves the current exact geometry and opacity:

```tsx
const effectStyles = {
  default: {
    rootClassName: 'size-4',
    glowClassName: 'h-[145%] w-[145%]',
    pingClassName: 'h-[175%] w-[175%]',
    glowBlurPx: 10,
    glowAlpha: 0.82,
    iconBlurPx: 4,
    iconAlpha: 0.9,
    iconSize: 12,
  },
  compact: {
    rootClassName: 'size-3',
    glowClassName: 'h-[120%] w-[120%]',
    pingClassName: 'h-[135%] w-[135%]',
    glowBlurPx: 5,
    glowAlpha: 0.72,
    iconBlurPx: 2,
    iconAlpha: 0.82,
    iconSize: 11,
  },
} as const
```

Extend the props and default destructuring:

```tsx
interface TerminalOutputActivityIndicatorProps {
  label: string
  active?: boolean
  className?: string
  iconClassName?: string
  size?: number
  effectSize?: keyof typeof effectStyles
  tone?: TerminalOutputActivityIndicatorTone
}

export function TerminalOutputActivityIndicator({
  label,
  active = true,
  className,
  iconClassName,
  size,
  effectSize = 'default',
  tone = 'activity',
}: TerminalOutputActivityIndicatorProps) {
  const effectStyle = effectStyles[effectSize]
  const toneStyle = toneStyles[tone]
  const iconSize = size ?? effectStyle.iconSize
  const glowStyle = {
    boxShadow: `0 0 ${effectStyle.glowBlurPx}px rgb(var(${toneStyle.rgbToken}) / ${effectStyle.glowAlpha})`,
  }
  const iconStyle = {
    filter: `drop-shadow(0 0 ${effectStyle.iconBlurPx}px rgb(var(${toneStyle.rgbToken}) / ${effectStyle.iconAlpha}))`,
  }
```

Update the three active visual layers, leaving all other JSX unchanged:

```tsx
<span
  data-terminal-output-activity-glow
  className={cn(
    'absolute inline-flex animate-pulse rounded-full opacity-100',
    toneStyle.glowClassName,
    effectStyle.glowClassName,
  )}
  style={glowStyle}
  aria-hidden="true"
/>
<span
  data-terminal-output-activity-ping
  className={cn(
    'absolute inline-flex animate-ping rounded-full border opacity-60',
    toneStyle.pingClassName,
    effectStyle.pingClassName,
  )}
  aria-hidden="true"
/>
```

```tsx
<Terminal
  size={iconSize}
  className={cn('relative shrink-0', active ? cn('animate-pulse', toneStyle.iconClassName) : 'text-current', iconClassName)}
  style={active ? iconStyle : undefined}
  aria-hidden="true"
/>
```

- [ ] **Step 4: Run the component test and verify the green state**

Run:

```bash
bun run test -- src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx
```

Expected: PASS; both the existing default-activity assertions and the new bell-tone assertions succeed.

- [ ] **Step 5: Request confirmation and commit the isolated component change**

Because project safety rules require explicit confirmation before every `git commit`, stop and request it before running:

```bash
git add -- "src/web/components/terminal/TerminalOutputActivityIndicator.tsx" "src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx"
git commit -m "feat: support bell-colored terminal activity"
```

Expected: one commit containing only the shared component and its focused test.

### Task 2: Opt the branch terminal badge into the bell palette

**Files:**
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx:131-133`
- Test: `src/web/components/branch-list/BranchRow.test.tsx:450-475`

- [ ] **Step 1: Strengthen the branch-row integration test to require the bell palette**

In `animates the terminal count icon when a linked worktree has active output`, replace the final assertion with:

```tsx
const indicator = badge?.querySelector('[data-terminal-output-activity-indicator="active"]')
expect(indicator).not.toBeNull()
expect(indicator?.querySelector('svg')?.classList.contains('text-terminal-bell')).toBe(true)
expect(indicator?.querySelector('svg')?.classList.contains('text-terminal-activity')).toBe(false)
expect(
  indicator?.querySelector('[data-terminal-output-activity-ping]')?.classList.contains('bg-terminal-bell'),
).toBe(true)
```

- [ ] **Step 2: Run the integration test and verify the red state**

Run:

```bash
bun run test -- src/web/components/branch-list/BranchRow.test.tsx
```

Expected: FAIL because `BranchSummaryInline` still renders the indicator with its default activity tone.

- [ ] **Step 3: Opt only the branch summary into the bell tone**

Replace the active indicator call in `BranchSummaryInline` with:

```tsx
<TerminalOutputActivityIndicator
  label={terminalOutputActiveLabel}
  className="size-2.5"
  size={10}
  tone="bell"
/>
```

Do not modify the `RepoTab.tsx` call; its omitted `tone` is the compatibility contract that keeps repo-tab activity indicators on the activity palette.

- [ ] **Step 4: Run both focused suites and verify the green state**

Run:

```bash
bun run test -- src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx src/web/components/branch-list/BranchRow.test.tsx
```

Expected: PASS; branch rows use bell colors and the shared component still defaults to activity colors.

- [ ] **Step 5: Request confirmation and commit the branch integration**

Because project safety rules require explicit confirmation before every `git commit`, stop and request it before running:

```bash
git add -- "src/web/components/repo-workspace/BranchSummaryInline.tsx" "src/web/components/branch-list/BranchRow.test.tsx"
git commit -m "feat: match branch activity to bell color"
```

Expected: one commit containing only the branch opt-in and its integration test.

### Task 3: Verify repository-wide compatibility

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run type checking**

Run:

```bash
bun run typecheck
```

Expected: PASS with exit code 0 and no TypeScript errors.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
bun run test
```

Expected: PASS with exit code 0 and no failing tests.

- [ ] **Step 3: Run architecture guards**

Run:

```bash
bun run check:architecture
```

Expected: PASS with exit code 0 and no layer-boundary violations.

- [ ] **Step 4: Inspect the final scoped diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Only pre-existing unrelated worktree changes may remain; the four implementation files from this plan should be clean after the two explicitly confirmed commits.

