# Single Icon Workspace Layout Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the workspace layout two-button segmented control with one icon button that shows the current layout and toggles to the other layout on click.

**Architecture:** Keep `WorkspaceLayoutControl` as the shared presentational component used by repo toolbar and topbar wrappers. Convert its internals from a two-item `ToggleGroup` to a single `Button` that derives `nextLayout` from `value`, keeps layout state ownership in existing stores, and calls the existing `onChange` callback.

**Tech Stack:** TypeScript in Node strip-only mode, React, lucide-react, shared shadcn-style `Button`, project `Tip`, Vitest/jsdom, Bun test runner.

---

## Repository Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not create re-export shims.
- Do not run or plan version-control commits because project instructions explicitly forbid planning or executing commits unless the user asks.
- Keep the change scoped to `WorkspaceLayoutControl` and its tests. Do not change workspace layout persistence, menu commands, shortcuts, or toolbar placement.

## File Structure

- Create `src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx`: focused jsdom tests for the single-icon layout toggle.
- Modify `src/web/components/repo-toolbar/WorkspaceLayoutControl.tsx`: replace `ToggleGroup` rendering with a single `Button` wrapped in `Tip`; keep the existing props.
- Modify `src/web/components/repo-toolbar/RepoToolbar.test.tsx`: update integration assertions for Git and non-Git toolbar call sites from two layout buttons to one toggle button.

## Task 1: Add Focused Workspace Layout Toggle Tests

**Files:**
- Create: `src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx`
- Test: `src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx` with:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceLayoutControl } from '#/web/components/repo-toolbar/WorkspaceLayoutControl.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorkspaceLayoutControl', () => {
  test('renders one button and switches left-right layout to top-bottom', () => {
    const onChange = vi.fn()
    render(<WorkspaceLayoutControl value="left-right" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="workspace.layout-tooltip.top-bottom"]',
    )
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('top-bottom')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('renders one button and switches top-bottom layout to left-right', () => {
    const onChange = vi.fn()
    render(<WorkspaceLayoutControl value="top-bottom" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="workspace.layout-tooltip.left-right"]',
    )
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('left-right')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

function render(element: React.ReactNode) {
  act(() => {
    root!.render(element)
  })
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun run test src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx
```

Expected: FAIL because the current implementation renders two `ToggleGroupItem` buttons instead of one button.

## Task 2: Convert WorkspaceLayoutControl to a Single Button

**Files:**
- Modify: `src/web/components/repo-toolbar/WorkspaceLayoutControl.tsx`
- Test: `src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx`

- [ ] **Step 1: Replace the control implementation**

Replace the contents of `src/web/components/repo-toolbar/WorkspaceLayoutControl.tsx` with:

```tsx
import { PanelLeft, PanelTop, type LucideIcon } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'

interface Props {
  value: RepoWorkspaceLayout
  onChange: (layout: RepoWorkspaceLayout) => void
}

const WORKSPACE_LAYOUT_TOOLTIP_KEYS = {
  'top-bottom': 'workspace.layout-tooltip.top-bottom',
  'left-right': 'workspace.layout-tooltip.left-right',
} satisfies Record<RepoWorkspaceLayout, string>

const WORKSPACE_LAYOUT_ICONS = {
  'top-bottom': PanelTop,
  'left-right': PanelLeft,
} satisfies Record<RepoWorkspaceLayout, LucideIcon>

function nextWorkspaceLayout(value: RepoWorkspaceLayout): RepoWorkspaceLayout {
  return value === 'left-right' ? 'top-bottom' : 'left-right'
}

export function WorkspaceLayoutControl({ value, onChange }: Props) {
  const t = useT()
  const nextLayout = nextWorkspaceLayout(value)
  const CurrentIcon = WORKSPACE_LAYOUT_ICONS[value]
  const label = t(WORKSPACE_LAYOUT_TOOLTIP_KEYS[nextLayout])

  return (
    <Tip label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="shrink-0"
        aria-label={label}
        onClick={() => onChange(nextLayout)}
      >
        <CurrentIcon />
      </Button>
    </Tip>
  )
}
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
bun run test src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx
```

Expected: PASS with both tests green.

## Task 3: Update Toolbar Integration Expectations

**Files:**
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
- Test: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`

- [ ] **Step 1: Add a local helper for layout toggle queries**

In `src/web/components/repo-toolbar/RepoToolbar.test.tsx`, add this helper near the existing `createMatchMedia` helper:

```tsx
function workspaceLayoutButtons(): NodeListOf<HTMLButtonElement> {
  return container!.querySelectorAll<HTMLButtonElement>(
    'button[aria-label="workspace.layout-tooltip.top-bottom"], button[aria-label="workspace.layout-tooltip.left-right"]',
  )
}
```

- [ ] **Step 2: Update the non-Git topbar control test**

In the `TopbarRepoControls` test named `keeps workspace layout and refresh controls for non-git local workspaces while hiding git actions`, replace:

```tsx
expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()

act(() => {
  container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.left-right"]')?.click()
})

expect(useReposStore.getState().workspaceLayout).toBe('left-right')
```

with:

```tsx
expect(workspaceLayoutButtons()).toHaveLength(1)

act(() => {
  container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.top-bottom"]')?.click()
})

expect(useReposStore.getState().workspaceLayout).toBe('top-bottom')
```

- [ ] **Step 3: Update the active repo topbar presence test**

In the `TopbarRepoControls` test named `keeps topbar repo controls focused on layout for an active repo`, replace:

```tsx
expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()
```

with:

```tsx
expect(workspaceLayoutButtons()).toHaveLength(1)
```

- [ ] **Step 4: Keep the compact-mode absence test semantic**

In the `TopbarRepoControls` test named `hides layout control in compact mode`, replace:

```tsx
expect(container?.querySelector('[aria-label="workspace.layout-label"]')).toBeNull()
```

with:

```tsx
expect(workspaceLayoutButtons()).toHaveLength(0)
```

- [ ] **Step 5: Update the non-Git body toolbar test**

In the `RepoToolbar` test named `keeps body layout controls for non-git local workspaces while hiding branch controls`, replace:

```tsx
expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()

act(() => {
  container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.left-right"]')?.click()
})

expect(useReposStore.getState().workspaceLayout).toBe('left-right')
```

with:

```tsx
expect(workspaceLayoutButtons()).toHaveLength(1)

act(() => {
  container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.top-bottom"]')?.click()
})

expect(useReposStore.getState().workspaceLayout).toBe('top-bottom')
```

- [ ] **Step 6: Update the Git body toolbar presence test**

In the `RepoToolbar` test named `keeps body toolbar branch filters and layout for git-capable repositories`, replace:

```tsx
expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()
```

with:

```tsx
expect(workspaceLayoutButtons()).toHaveLength(1)
```

- [ ] **Step 7: Run toolbar integration tests**

Run:

```bash
bun run test src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected: PASS. The tests confirm both topbar and repo toolbar wrappers still render the control when expected, compact mode still hides it, and the connected wrappers still update the store.

## Task 4: Run Final Verification

**Files:**
- Test: `src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx`
- Test: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
- Test: repository typecheck

- [ ] **Step 1: Run focused component and toolbar tests together**

Run:

```bash
bun run test src/web/components/repo-toolbar/WorkspaceLayoutControl.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run project typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

## Self-Review

- Spec coverage: The plan replaces the segmented workspace layout control with one icon button, shows the current layout icon, toggles to the other layout, preserves the existing props and call sites, and leaves compact-mode hiding in the connected wrappers.
- Placeholder scan: No placeholder markers, vague edge-case instructions, or omitted code steps are present.
- Type consistency: The plan consistently uses `RepoWorkspaceLayout`, `WorkspaceLayoutControl`, `nextWorkspaceLayout`, `PanelLeft`, and `PanelTop`.
- Scope check: The plan does not touch workspace state persistence, shortcuts, menu commands, or unrelated toolbar layout.
