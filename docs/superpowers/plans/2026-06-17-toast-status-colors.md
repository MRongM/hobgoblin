# Toast Status Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make global right-bottom Sonner toasts use soft semantic color blocks for success, error, info, warning, and loading states.

**Architecture:** Keep `src/web/components/ui/sonner.tsx` as the single presentation boundary for toast styling. Enable Sonner rich colors by default for supported statuses, map supported status CSS variables to existing theme tokens, and use Sonner's `classNames.loading` hook for loading because Sonner 2.0.7 has no loading-specific rich-color CSS variables.

**Tech Stack:** React 19, Sonner 2.0.7, Tailwind v4 theme tokens, Vitest with jsdom and `react-dom/client`.

---

## File Structure

- Create `src/web/components/ui/sonner.test.tsx`
  - Responsibility: verify the wrapper passes the intended status color contract to Sonner without rendering real toast runtime behavior.
- Modify `src/web/components/ui/sonner.tsx`
  - Responsibility: keep all global toast presentation settings in one wrapper.

No version-control command steps are included. The project instructions explicitly say not to plan or execute commits or branches unless the user asks.

## Task 1: Add Toast Status Color Contract Test

**Files:**
- Create: `src/web/components/ui/sonner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/web/components/ui/sonner.test.tsx` with this complete content:

```tsx
// @vitest-environment jsdom

import { act, type CSSProperties, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Toaster } from '#/web/components/ui/sonner.tsx'

interface CapturedSonnerProps {
  className?: string
  icons?: Record<string, ReactNode>
  richColors?: boolean
  style?: CSSProperties
  toastOptions?: {
    classNames?: Record<string, string>
  }
}

const sonnerState = vi.hoisted(() => ({
  props: null as CapturedSonnerProps | null,
}))

vi.mock('sonner', () => ({
  Toaster: (props: CapturedSonnerProps) => {
    sonnerState.props = props
    return <div data-testid="sonner-toaster" className={props.className} />
  },
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  sonnerState.props = null
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('Toaster status colors', () => {
  test('maps supported Sonner rich-color statuses to soft semantic theme tokens', () => {
    render(<Toaster position="bottom-right" closeButton />)

    expect(sonnerState.props?.richColors).toBe(true)
    expect(sonnerState.props?.style).toMatchObject({
      '--normal-bg': 'var(--color-popover)',
      '--normal-text': 'var(--color-popover-foreground)',
      '--normal-border': 'var(--color-border)',
      '--success-bg': 'var(--color-success-surface)',
      '--success-text': 'var(--color-success)',
      '--success-border': 'var(--color-success-border)',
      '--error-bg': 'var(--color-danger-surface)',
      '--error-text': 'var(--color-danger)',
      '--error-border': 'var(--color-danger-border)',
      '--warning-bg': 'var(--color-warning-surface)',
      '--warning-text': 'var(--color-warning)',
      '--warning-border': 'var(--color-warning-border)',
      '--info-bg': 'var(--color-success-surface)',
      '--info-text': 'var(--color-success)',
      '--info-border': 'var(--color-success-border)',
    })
  })

  test('uses the warning color family for loading toasts and preserves caller classes', () => {
    render(
      <Toaster
        toastOptions={{
          classNames: {
            loading: 'caller-loading',
            toast: 'caller-toast',
          },
        }}
      />,
    )

    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('!bg-warning-surface')
    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('!text-warning')
    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('!border-warning-border')
    expect(sonnerState.props?.toastOptions?.classNames?.loading).toContain('caller-loading')
    expect(sonnerState.props?.toastOptions?.classNames?.toast).toContain('max-w-[calc(100vw-2rem)]')
    expect(sonnerState.props?.toastOptions?.classNames?.toast).toContain('caller-toast')
  })
})

function render(element: ReactNode) {
  act(() => {
    root!.render(element)
  })
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun run test src/web/components/ui/sonner.test.tsx
```

Expected result:

```text
FAIL src/web/components/ui/sonner.test.tsx
```

The first test fails because `richColors` is not set to `true`, and current success/error/info/warning CSS variables still point at popover or non-soft mappings. The second test fails because there is no loading-specific color class yet.

## Task 2: Implement Soft Toast Status Colors

**Files:**
- Modify: `src/web/components/ui/sonner.tsx`
- Test: `src/web/components/ui/sonner.test.tsx`

- [ ] **Step 1: Update `src/web/components/ui/sonner.tsx`**

Replace the full content of `src/web/components/ui/sonner.tsx` with:

```tsx
// shadcn/ui Sonner Toaster. Adjusted from the upstream template:
// upstream pulls theme from `next-themes`, which doesn't fit because
// this project owns its own theme store (useThemeStore). We read from
// there instead so the toast theme tracks html[data-theme].

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useThemeStore } from '#/web/stores/theme.ts'

const LOADING_TOAST_CLASS =
  '!bg-warning-surface !text-warning !border-warning-border [&_[data-close-button]]:!bg-warning-surface [&_[data-close-button]]:!text-warning [&_[data-close-button]]:!border-warning-border'

const Toaster = ({ toastOptions, className, style, richColors = true, ...props }: ToasterProps) => {
  const theme = useThemeStore((s) => s.resolved)
  const classNames = toastOptions?.classNames

  return (
    <Sonner
      {...props}
      richColors={richColors}
      theme={theme}
      className={['toaster group', className].filter(Boolean).join(' ')}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      // Drive Sonner's rich-colour states through the app's theme
      // contract. Loading is handled below with classNames.loading
      // because Sonner 2.0.7 has no loading-specific rich-colour CSS
      // variables.
      //
      // NOTE: token names are `--color-popover` / `--color-border`
      // (Tailwind v4 `@theme` prefixes them with `--color-`). The
      // upstream shadcn template references `--popover` / `--border`
      // because it targets Tailwind v3 — copying that as-is would
      // resolve to `unset` and the toast renders translucent over
      // the page (the symptom of "semi-transparent toasts").
      style={
        {
          '--normal-bg': 'var(--color-popover)',
          '--normal-text': 'var(--color-popover-foreground)',
          '--normal-border': 'var(--color-border)',
          '--success-bg': 'var(--color-success-surface)',
          '--success-text': 'var(--color-success)',
          '--success-border': 'var(--color-success-border)',
          '--error-bg': 'var(--color-danger-surface)',
          '--error-text': 'var(--color-danger)',
          '--error-border': 'var(--color-danger-border)',
          '--warning-bg': 'var(--color-warning-surface)',
          '--warning-text': 'var(--color-warning)',
          '--warning-border': 'var(--color-warning-border)',
          '--info-bg': 'var(--color-success-surface)',
          '--info-text': 'var(--color-success)',
          '--info-border': 'var(--color-success-border)',
          '--border-radius': 'var(--radius)',
          '--width': 'min(520px, calc(100vw - 2rem))',
          ...style,
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...classNames,
          loading: [LOADING_TOAST_CLASS, classNames?.loading].filter(Boolean).join(' '),
          toast: ['max-w-[calc(100vw-2rem)]', classNames?.toast].filter(Boolean).join(' '),
          content: ['min-w-0 max-w-full overflow-hidden', classNames?.content].filter(Boolean).join(' '),
          title: ['min-w-0 max-w-full', classNames?.title].filter(Boolean).join(' '),
          description: ['min-w-0 max-w-full overflow-hidden', classNames?.description].filter(Boolean).join(' '),
        },
      }}
    />
  )
}

export { Toaster }
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```bash
bun run test src/web/components/ui/sonner.test.tsx
```

Expected result:

```text
PASS src/web/components/ui/sonner.test.tsx
```

If the test fails because Tailwind class strings changed during implementation, keep the assertions aligned with the actual static loading class. Do not loosen the assertions to only check that a loading class exists.

## Task 3: Run Verification

**Files:**
- Verify: `src/web/components/ui/sonner.tsx`
- Verify: `src/web/components/ui/sonner.test.tsx`

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected result:

```text
Exited with code 0
```

If this fails because of the pre-existing unresolved conflict in `src/system/ssh/git.test.ts`, report that blocker with the exact failing file. Do not edit the conflicted SSH files for this toast change.

- [ ] **Step 2: Run focused toast test**

Run:

```bash
bun run test src/web/components/ui/sonner.test.tsx
```

Expected result:

```text
PASS src/web/components/ui/sonner.test.tsx
```

- [ ] **Step 3: Run full test suite if the worktree is not blocked by unrelated conflicts**

Run:

```bash
bun run test
```

Expected result when the unrelated conflict is resolved:

```text
Exited with code 0
```

If the full suite is blocked by `src/system/ssh/git.test.ts` merge conflict markers or other unrelated in-progress changes, stop after the focused toast test and record the full-suite blocker in the final implementation summary.

## Self-Review

- Spec coverage: Task 2 maps success, error, info, warning, and loading to the selected soft semantic color direction without changing toast behavior.
- Placeholder scan: no placeholders or unresolved implementation notes.
- Type consistency: the plan uses `ToasterProps`, `React.CSSProperties`, and Sonner `toastOptions.classNames` fields that exist in Sonner 2.0.7.
