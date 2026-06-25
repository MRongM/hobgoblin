# Branch Menu Disabled Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shared branch action menus show the complete branch action surface while disabling unavailable actions instead of hiding them.

**Architecture:** Keep the policy in `useBranchActionItems` and `useBranchWriteActions`, where branch action items are constructed. Leave `BranchActionsDropdown`, toolbar consumers, and shortcut registration as consumers of the existing `BranchActionItem` model.

**Tech Stack:** React, TypeScript, Zustand store hooks, Vitest with jsdom, Bun test runner.

**Project Safety Note:** This repository's instructions say not to plan or execute git commits unless the user explicitly asks. This plan uses verification checkpoints instead of commit steps.

---

## File Structure

- Modify: `src/web/hooks/useBranchActionItems.ts`
  - Owns base branch action item construction: patch, checkout, pull, push, refresh, external app, remote, remove worktree, and delete branch.
  - Change capability-missing cases from hidden/omitted to `disabled: true` and `visible: true`.
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
  - Owns write action item construction: create branch, pull remote branch, checkout to, merge, commit, and reset.
  - Change no-remotes/no-worktree cases from hidden to disabled.
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`
  - Add regression tests for complete visible menus.
  - Update existing expectations that currently assume hidden items.
- No planned modification: `src/web/hooks/useBranchActionShortcutRegistry.test.tsx`
  - Run the existing test file to verify the disabled shortcut guard still works.
- Read-only reference: `docs/superpowers/specs/2026-06-25-branch-menu-disabled-actions-design.md`

## Task 1: Add Failing Coverage For Stable Disabled Menu Items

**Files:**
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`

- [ ] **Step 1: Add a test for no-worktree/no-remote disabled visibility**

Insert this test in `describe('useBranchActionItems', () => { ... })` after the existing `keeps terminal editor and remote in a separate external group` test.

```tsx
  test('shows unavailable repository and worktree actions disabled instead of hidden', async () => {
    mocks.useRuntimeExternalAppSettings.mockReturnValue({
      terminalApp: 'auto',
      resolvedTerminalApp: null,
      terminalAvailable: false,
      editorApp: 'vscode',
      resolvedEditorApp: null,
      editorAvailable: false,
    })
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: false,
        checkedOutInAnotherWorktree: false,
        canRemoveWorktree: false,
        isRegularBranch: true,
        canCopyPatch: false,
        canPull: false,
        canPush: false,
        canOpenRemote: false,
        canOpenTerminal: false,
        canOpenEditor: false,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('feature/menu')
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      remote: { hasRemotes: false, hasBrowserRemote: false, hasGitHubRemote: false },
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const allItems = [...groups.patchItems, ...groups.mainItems, ...groups.externalItems, ...groups.destructiveItems]
    const disabledById = new Map(allItems.map((item) => [item.id, item.disabled]))

    expect(groups.patchItems.filter((item) => item.visible).map((item) => item.id)).toEqual(['copyPatch'])
    expect(groups.mainItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'checkout',
      'pull',
      'push',
      'createWorktree',
      'sync',
      'createBranch',
      'pullRemoteBranch',
      'checkoutTo',
      'merge',
      'commit',
    ])
    expect(groups.externalItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'terminal',
      'editor',
      'remote',
    ])
    expect(groups.destructiveItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'removeWorktree',
      'deleteBranch',
      'resetHard',
    ])

    expect(disabledById.get('copyPatch')).toBe(true)
    expect(disabledById.get('checkout')).toBe(false)
    expect(disabledById.get('pull')).toBe(true)
    expect(disabledById.get('push')).toBe(true)
    expect(disabledById.get('createWorktree')).toBe(false)
    expect(disabledById.get('sync')).toBe(false)
    expect(disabledById.get('createBranch')).toBe(false)
    expect(disabledById.get('pullRemoteBranch')).toBe(true)
    expect(disabledById.get('checkoutTo')).toBe(true)
    expect(disabledById.get('merge')).toBe(true)
    expect(disabledById.get('commit')).toBe(true)
    expect(disabledById.get('terminal')).toBe(true)
    expect(disabledById.get('editor')).toBe(true)
    expect(disabledById.get('remote')).toBe(true)
    expect(disabledById.get('removeWorktree')).toBe(true)
    expect(disabledById.get('deleteBranch')).toBe(false)
    expect(disabledById.get('resetHard')).toBe(true)
  })
```

- [ ] **Step 2: Add a test for destructive actions that are unavailable**

Insert this test after the new no-worktree/no-remote test.

```tsx
  test('keeps unavailable destructive actions visible but disabled', async () => {
    mocks.useBranchActions.mockReturnValue({
      blocked: false,
      busyAction: null,
      capabilities: {
        isCurrent: true,
        checkedOutInAnotherWorktree: false,
        canRemoveWorktree: false,
        isRegularBranch: false,
        canCopyPatch: false,
        canPull: false,
        canPush: true,
        canOpenRemote: false,
        canOpenTerminal: true,
        canOpenEditor: true,
      },
      actions: {
        copyPatch: vi.fn(),
        checkout: vi.fn(),
        pull: vi.fn(),
        push: vi.fn(),
        openTerminal: vi.fn(),
        openEditor: vi.fn(),
        openRemote: vi.fn(),
        requestDeleteBranch: vi.fn(),
        requestRemoveWorktree: vi.fn(),
      },
      dialogs: null,
    })
    const branch = createRepoBranch('main', { isCurrent: true, worktree: { path: '/tmp/repo' } })
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [branch],
      currentBranch: 'main',
      remote: { hasRemotes: true },
    })

    const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
    const groups = await renderItemGroups(useItems, repo, branch)
    const destructiveItems = groups.destructiveItems.filter((item) => item.visible)

    expect(destructiveItems.map((item) => item.id)).toEqual(['removeWorktree', 'deleteBranch', 'resetHard'])
    expect(destructiveItems.find((item) => item.id === 'removeWorktree')?.disabled).toBe(true)
    expect(destructiveItems.find((item) => item.id === 'deleteBranch')?.disabled).toBe(true)
    expect(destructiveItems.find((item) => item.id === 'resetHard')?.disabled).toBe(false)
  })
```

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```bash
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected result before implementation: FAIL. At least one assertion should show missing IDs such as `copyPatch`, `terminal`, `editor`, `remote`, `removeWorktree`, `checkoutTo`, `merge`, `commit`, or `resetHard`.

## Task 2: Make Base Branch Actions Stable And Disabled

**Files:**
- Modify: `src/web/hooks/useBranchActionItems.ts`

- [ ] **Step 1: Replace capability-based omission in `patchItems`**

Replace the current `patchItems` declaration with this code:

```ts
  const patchItems: BranchActionItem[] = [
    {
      id: 'copyPatch',
      label: t('status.copy-patch'),
      title: t('status.copy-patch-title'),
      ariaLabel: t('status.copy-patch-title'),
      disabled: disabled || !capabilities.canCopyPatch,
      busy: busy('copyPatch'),
      visible: true,
      icon: createElement(ClipboardCopy),
      onSelect: actions.copyPatch,
    },
  ]
```

- [ ] **Step 2: Update the base `mainItems` disabled logic**

In the existing `mainItems` array, keep the current order and labels. Change only these fields:

```ts
    {
      id: 'checkout',
      label: branchActionLabel('checkout', 'action.checkout', 'action.checkout-loading', 'action.checkout-queued'),
      disabled: disabled || capabilities.isCurrent || capabilities.checkedOutInAnotherWorktree,
      busy: busy('checkout'),
      visible: true,
      shortcut: '↩',
      icon: createElement(GitBranch),
      onSelect: actions.checkout,
    },
    {
      id: 'pull',
      label: branchActionLabel('pull', 'action.pull-remote', 'action.pull-loading', 'action.pull-queued'),
      disabled: disabled || !capabilities.canPull,
      busy: busy('pull'),
      visible: true,
      shortcut: 'P',
      icon: createElement(ArrowDown),
      onSelect: actions.pull,
    },
    {
      id: 'push',
      label: branchActionLabel('push', 'action.push', 'action.push-loading', 'action.push-queued'),
      disabled: disabled || !capabilities.canPush,
      busy: busy('push'),
      visible: true,
      shortcut: '⇧P',
      icon: createElement(ArrowUp),
      onSelect: actions.push,
    },
```

Also update the existing `sync` item to disable itself while refresh/fetch is busy:

```ts
    {
      id: 'sync',
      label: t('action.refresh'),
      title: t('action.fetch-title'),
      disabled: disabled || syncBusy,
      busy: syncBusy,
      visible: true,
      icon: createElement(RefreshCw),
      onSelect: handleSync,
    },
```

- [ ] **Step 3: Replace spread-based `externalItems` construction**

Replace the entire `externalItems` declaration with this code:

```ts
  const externalItems: BranchActionItem[] = [
    {
      id: 'terminal',
      label: t('worktrees.open-in-terminal-label'),
      disabled: disabled || !showTerminalAction,
      busy: busy('terminal'),
      visible: true,
      shortcut: 'G',
      icon: createElement(TerminalAppIcon, { pref: terminalIconPref }),
      onSelect: actions.openTerminal,
    },
    {
      id: 'editor',
      label: t('worktrees.open-in-editor-label'),
      disabled: disabled || !capabilities.canOpenEditor || !editorAvailable,
      busy: busy('editor'),
      visible: true,
      shortcut: 'V',
      icon: createElement(EditorAppIcon, { pref: resolvedEditorApp ?? editorApp }),
      onSelect: actions.openEditor,
    },
    {
      id: 'remote',
      label: pullRequest ? t('action.remote-pr', { n: pullRequest.number }) : t('action.remote'),
      disabled: disabled || !capabilities.canOpenRemote,
      busy: busy('remote'),
      visible: true,
      shortcut: '⇧G',
      icon: createElement(remoteIcon),
      onSelect: actions.openRemote,
    },
  ]
```

- [ ] **Step 4: Replace spread-based `destructiveItems` construction**

Replace the entire `destructiveItems` declaration in `useBranchActionItems.ts` with this code:

```ts
  const destructiveItems: BranchActionItem[] = [
    {
      id: 'removeWorktree',
      label: branchActionLabel(
        'removeWorktree',
        'action.remove-worktree',
        'action.remove-worktree-removing-title',
        'action.remove-worktree-queued-title',
      ),
      disabled: disabled || !capabilities.canRemoveWorktree,
      busy: busy('removeWorktree'),
      visible: true,
      destructive: true,
      icon: createElement(Trash2),
      onSelect: actions.requestRemoveWorktree,
    },
    {
      id: 'deleteBranch',
      label: branchActionLabel(
        'deleteBranch',
        'action.delete-branch',
        'action.delete-branch-deleting-title',
        'action.delete-branch-queued-title',
      ),
      disabled: disabled || !capabilities.isRegularBranch,
      busy: busy('deleteBranch'),
      visible: true,
      destructive: true,
      icon: createElement(Trash2),
      onSelect: actions.requestDeleteBranch,
    },
  ]
```

- [ ] **Step 5: Run the focused test and observe remaining failures**

Run:

```bash
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected result at this point: tests may still fail because write actions from `useBranchWriteActions` still hide no-worktree/no-remote items. Failures should mention `pullRemoteBranch`, `checkoutTo`, `merge`, `commit`, or `resetHard`.

## Task 3: Make Branch Write Actions Stable And Disabled

**Files:**
- Modify: `src/web/hooks/useBranchWriteActions.tsx`

- [ ] **Step 1: Update `pullRemoteBranch` visibility**

In the `mainItems` array inside `useBranchWriteActions`, change the `pullRemoteBranch` item to:

```ts
    {
      id: 'pullRemoteBranch',
      label: t('action.pull-remote-branch'),
      title: t('action.pull-remote-branch-title'),
      disabled: repo.remote.hasRemotes === false || branchActionBusy,
      visible: true,
      icon: createElement(RadioTower),
      onSelect: () => pullRemoteBranchDialog.openWith(''),
    },
```

- [ ] **Step 2: Update worktree-dependent write actions**

In the same `mainItems` array, change `checkoutTo`, `merge`, and `commit` to use `disabled: !hasWorktree || branchActionBusy` and `visible: true`:

```ts
    {
      id: 'checkoutTo',
      label: t('action.checkout-to'),
      title: t('action.checkout-to-title'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(GitBranch),
      onSelect: () => checkoutToDialog.openWith(''),
    },
    {
      id: 'merge',
      label: t('action.merge'),
      title: t('action.merge-title'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(GitMerge),
      onSelect: () => mergeDialog.openWith(''),
    },
    {
      id: 'commit',
      label: t('action.commit'),
      title: t('action.commit-title'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(SendHorizontal),
      onSelect: () => {
        if (worktreePath) inlineCommitDraftActions.openDraft(repo.id, worktreePath)
      },
    },
```

- [ ] **Step 3: Update reset visibility**

In the `destructiveItems` array inside `useBranchWriteActions`, change `resetHard` to:

```ts
    {
      id: 'resetHard',
      label: t('action.reset-hard'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      destructive: true,
      icon: createElement(RotateCcw),
      onSelect: () => resetDialog.openWith(''),
    },
```

- [ ] **Step 4: Run the focused hook test**

Run:

```bash
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected result: some existing tests may now fail because their expected visible item ID lists still assume hidden items.

## Task 4: Update Existing Hook Test Expectations

**Files:**
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`

- [ ] **Step 1: Update the external group test expected main item order**

In the test named `keeps terminal editor and remote in a separate external group`, replace the main item expectation with:

```ts
    expect(groups.mainItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'checkout',
      'pull',
      'push',
      'createWorktree',
      'sync',
      'createBranch',
      'pullRemoteBranch',
      'checkoutTo',
      'merge',
      'commit',
    ])
```

Keep the external expectation as:

```ts
    expect(groups.externalItems.filter((item) => item.visible).map((item) => item.id)).toEqual(['terminal', 'editor', 'remote'])
```

- [ ] **Step 2: Update the destructive group ordering test**

Rename the test from:

```ts
  test('places discard changes below delete branch in the destructive group', async () => {
```

to:

```ts
  test('keeps disabled remove worktree above delete branch and reset in the destructive group', async () => {
```

Inside that test, replace the destructive ID expectation with:

```ts
    expect(groups.destructiveItems.filter((item) => item.visible).map((item) => item.id)).toEqual([
      'removeWorktree',
      'deleteBranch',
      'resetHard',
    ])
```

Add this assertion after the ID expectation:

```ts
    expect(groups.destructiveItems.find((item) => item.id === 'removeWorktree')?.disabled).toBe(true)
```

Keep the existing reset label assertion:

```ts
    expect(groups.destructiveItems.find((item) => item.id === 'resetHard')?.label).toBe('action.reset-hard')
```

- [ ] **Step 3: Re-run hook tests**

Run:

```bash
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected result: PASS.

## Task 5: Verify Shortcut Safety And Full Project Checks

**Files:**
- No planned modifications. Run the existing shortcut registry test file as a regression check.

- [ ] **Step 1: Run shortcut registry tests**

Run:

```bash
bun run test src/web/hooks/useBranchActionShortcutRegistry.test.tsx
```

Expected result: PASS. This confirms disabled visible actions are still ignored by shortcut dispatch.

- [ ] **Step 2: Run both focused test files together**

Run:

```bash
bun run test src/web/hooks/useBranchActionItems.test.tsx src/web/hooks/useBranchActionShortcutRegistry.test.tsx
```

Expected result: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected result: PASS with no TypeScript errors.

- [ ] **Step 4: Run full tests if the focused suite and typecheck pass**

Run:

```bash
bun run test
```

Expected result: PASS.

- [ ] **Step 5: Inspect changed files**

Run:

```bash
git diff -- src/web/hooks/useBranchActionItems.ts src/web/hooks/useBranchWriteActions.tsx src/web/hooks/useBranchActionItems.test.tsx src/web/hooks/useBranchActionShortcutRegistry.test.tsx
```

Expected result:

- `useBranchActionItems.ts` returns stable visible base/external/destructive action groups.
- `useBranchWriteActions.tsx` returns stable visible write action groups.
- Tests assert unavailable items are visible and disabled.
- No unrelated files are modified by implementation.

## Implementation Notes

- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not modify `BranchActionsDropdown`; its existing disabled rendering is the desired behavior.
- Do not add disabled-reason copy or tooltips. The approved design only requires visible disabled actions.
- Do not mount branch actions in non-Git workspace UI. This plan only changes shared branch action menus where they already exist.
- Do not run `git commit` unless the user explicitly asks after verification.
