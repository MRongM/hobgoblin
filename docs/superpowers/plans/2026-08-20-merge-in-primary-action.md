# Merge-in Primary Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pull–merge-in–push workflow the primary, rightmost action in the branch merge-in dialog while preserving the plain merge action.

**Architecture:** Keep the change local to `MergeInDialog`. Reorder and restyle its existing footer buttons to match `MergeOutDialog`; do not change the merge pipeline, translations, shared dialog primitives, or server behavior.

**Tech Stack:** React 19, TypeScript, Tailwind CSS utility classes through existing button variants, Vitest, Testing Library.

## Global Constraints

- Preserve Node.js strip-only TypeScript compatibility.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions; this change requires no imports.
- Keep the existing Chinese and English action copy unchanged.
- Keep Git operation ownership unchanged: the merge-in target remains the only branch pulled or pushed by the optional target-owned pipeline.
- Do not commit, push, create branches, or modify package dependencies.

---

### Task 1: Promote the merge-in pipeline action

**Files:**
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx:386`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx:390`

**Interfaces:**
- Consumes: `MergeInDialog`, the existing `DialogFooter` DOM order, and `Button`'s `outline`/default variants.
- Produces: Desktop footer order `Cancel → Merge in → Pull, merge in, and push`, with the complete pipeline using the default primary variant; compact layout continues to derive from the shared `DialogFooter` reverse-column behavior.

- [x] **Step 1: Add a failing presentation regression test**

Add this test at the start of the existing `describe('MergeInDialog', ...)` block:

```tsx
test('presents pull-merge-push as the primary and rightmost action', async () => {
  render(
    <MergeInDialog
      open
      repoId="/repo"
      worktreePath="/repo"
      branch={repoBranch('feature/current')}
      allBranches={[repoBranch('feature/current'), repoBranch('main')]}
      onClose={vi.fn()}
      onPull={vi.fn(async () => ({ ok: true, message: 'pulled' }))}
      onMerge={vi.fn(async () => ({ ok: true, message: 'merged' }))}
      onPush={vi.fn(async () => undefined)}
    />,
  )
  await flush()
  await flush()

  const footer = document.body.querySelector('[data-slot="merge-dialog-form"] [data-slot="dialog-footer"]')
  const buttons = [...(footer?.querySelectorAll<HTMLButtonElement>('button') ?? [])]

  expect(buttons.map((button) => button.textContent)).toEqual([
    'dialog.cancel',
    'action.merge-in-confirm',
    'action.merge-in-and-push-confirm',
  ])
  expect(buttonByText('action.merge-in-confirm').dataset.variant).toBe('outline')
  expect(buttonByText('action.merge-in-and-push-confirm').dataset.variant).toBe('default')
})
```

- [x] **Step 2: Run the regression test and verify RED**

Run:

```bash
bun run test "src/web/components/branch-list/BranchWriteDialogs.test.tsx" -t "presents pull-merge-push as the primary and rightmost action"
```

Expected: FAIL because the current DOM order is `Cancel → Pull/Merge/Push → Merge` and the current variants make plain merge primary.

- [x] **Step 3: Apply the minimal footer change**

Replace the action portion of `MergeInDialog`'s footer with:

```tsx
<Button type="submit" variant="outline" size="sm" disabled={!selectedSource || isPending}>
  {pending === 'merge' && <Loader2 className="animate-spin" />}
  {t(remoteSelected ? 'action.merge-in-remote-confirm' : 'action.merge-in-confirm')}
</Button>
{onPull && onPush && (
  <Button
    type="button"
    size="sm"
    disabled={!selectedSource || isPending}
    onClick={() => void handleConfirm('pullMergePush')}
  >
    {pending === 'pullMergePush' && <Loader2 className="animate-spin" />}
    {t(remoteSelected ? 'action.merge-in-remote-and-push-confirm' : 'action.merge-in-and-push-confirm')}
  </Button>
)}
```

Keep the existing Cancel button before these actions.

- [x] **Step 4: Run the regression test and verify GREEN**

Run the Step 2 command again.

Expected: PASS with one matching test and no failures.

- [x] **Step 5: Run focused component tests**

Run:

```bash
bun run test "src/web/components/branch-list/BranchWriteDialogs.test.tsx"
```

Expected: every test in the file passes, including the existing click-flow coverage for both merge actions.

- [x] **Step 6: Run repository verification**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Expected: all commands exit with status 0.
