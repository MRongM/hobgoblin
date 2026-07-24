# Toast Text Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shared Sonner toast's title and description selectable so users can copy exact notification content with native keyboard shortcuts.

**Architecture:** Extend only the shared renderer-side Toaster class contract. Reuse Sonner's existing title, description, and content class hooks; do not change toast producers, state ownership, clipboard APIs, or dismissal semantics.

**Tech Stack:** React 19, Sonner 2.0.7, Tailwind CSS 4, Vitest with jsdom.

## Global Constraints

- Keep imports repo-aliased with explicit `.ts`/`.tsx` extensions.
- Do not introduce TypeScript syntax unsupported by Node.js strip-only mode.
- Preserve current theme-aware status colors, close button, timing, stacking, and swipe behavior.
- Do not run Git commit, branch, or push operations.

---

## File Structure

- Modify `src/web/components/ui/sonner.test.tsx`: assert the wrapper's selectable-text class contract and caller-class composition.
- Modify `src/web/components/ui/sonner.tsx`: apply the selectable-text contract at the single global toast presentation boundary.

### Task 1: Selectable Toast Content

**Files:**

- Modify: `src/web/components/ui/sonner.test.tsx`
- Modify: `src/web/components/ui/sonner.tsx`

**Interfaces:**

- Consumes: Sonner `ToasterProps.toastOptions.classNames` hooks for `content`, `title`, and `description`.
- Produces: shared selectable toast text with caller-supplied class names preserved.

- [x] **Step 1: Write the failing contract test**

Add a test that renders `<Toaster>` with caller classes and expects each text-bearing class hook to contain both `select-text` and `cursor-text`, plus its caller class:

```tsx
test('makes toast text selectable and preserves caller text classes', () => {
  render(
    <Toaster
      toastOptions={{
        classNames: {
          content: 'caller-content',
          title: 'caller-title',
          description: 'caller-description',
        },
      }}
    />,
  )

  for (const [slot, callerClass] of [
    ['content', 'caller-content'],
    ['title', 'caller-title'],
    ['description', 'caller-description'],
  ] as const) {
    expect(sonnerState.props?.toastOptions?.classNames?.[slot]).toContain('select-text')
    expect(sonnerState.props?.toastOptions?.classNames?.[slot]).toContain('cursor-text')
    expect(sonnerState.props?.toastOptions?.classNames?.[slot]).toContain(callerClass)
  }
})
```

- [x] **Step 2: Verify the test fails for the missing behavior**

Run:

```bash
bun run test src/web/components/ui/sonner.test.tsx
```

Expected: the new test fails because `select-text` and `cursor-text` are absent.

- [x] **Step 3: Add the minimal wrapper classes**

Merge `select-text cursor-text` into the existing content, title, and description class hooks without changing any other Toaster prop:

```tsx
content: ['min-w-0 max-w-full overflow-hidden select-text cursor-text', classNames?.content]
  .filter(Boolean)
  .join(' '),
title: ['min-w-0 max-w-full select-text cursor-text', classNames?.title].filter(Boolean).join(' '),
description: ['min-w-0 max-w-full overflow-hidden select-text cursor-text', classNames?.description]
  .filter(Boolean)
  .join(' '),
```

- [x] **Step 4: Verify the focused test passes**

Run:

```bash
bun run test src/web/components/ui/sonner.test.tsx
```

Expected: all tests in `sonner.test.tsx` pass.

- [x] **Step 5: Verify project contracts**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Expected: every command exits successfully with no test failures.

No commit step is included because the project instructions prohibit Git commits unless explicitly requested.

## Self-Review

- Spec coverage: selection, native copy, caller class preservation, theme preservation, and unchanged dismissal behavior are covered by the single wrapper task.
- Placeholder scan: no deferred or ambiguous implementation steps remain.
- Type consistency: all class hook names exist in the installed Sonner 2.0.7 `ToastClassnames` contract and match the current wrapper.
