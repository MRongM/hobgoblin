# Branch Workspace Header Actions and Repository Dependency Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep hidden-workspace actions in the branch-workspace titlebar, refresh member change counts after manual list reloads, and make each repository's dependency selection explicitly opt-in.

**Architecture:** Remove the presentation-only StatusBar portal connection and render hidden repository actions directly in `WorkspaceRepositoryRail`. Keep dependency enablement as resettable `BranchWorkspaceDialog` local state, lazily reuse the existing preflight reader, and exclude disabled dependencies when constructing preview requests.

**Tech Stack:** React 19, Radix/shadcn Switch, Zustand projection reads, Vitest/jsdom, TypeScript 6 strip-only mode.

## Global Constraints

- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not add packages, server APIs, persistence fields, polling, realtime events, or Git writes.
- Keep “配置工作区”和“重新扫描仓库” exclusive to the visible workspace repository header.
- Keep repository dependency enablement component-local and reset it whenever the dialog opens.
- Preserve the existing branch workspace dependency section and repository dependency materialization protocol.
- Use Chinese “子工作区”“成员工作树”和“依赖”; do not introduce “子仓库”.
- Do not commit: repository instructions prohibit Git writes unless explicitly requested.

---

### Task 1: Return hidden workspace actions to the branch-workspace titlebar

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/components/StatusBar.test.tsx`
- Modify: `src/web/components/StatusBar.tsx`

**Interfaces:**

- Removes: `WorkspaceRepositoryRail.statusBarActionHost?: HTMLDivElement | null`.
- Removes: `StatusBar.workspaceActionsHostRef?: RefCallback<HTMLDivElement>`.
- Produces: hidden-list titlebar actions `reload`, `create`, `pull-all`, and `repositories.show`.

- [x] **Step 1: Write the failing placement and composition tests**

Change the Rail regression to hide the repository section and require every hidden action in the branch-workspace section:

```tsx
for (const label of [
  'workspace.branch-workspace.reload',
  'workspace.branch-workspace.create',
  'workspace.pull-all',
  'workspace.repositories.show',
]) {
  expect(branchWorkspaceSection?.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
}
```

Add a Pane-level assertion that the ordinary and compact scope compositions contain no
`[data-testid="statusbar-workspace-actions"]` host.

- [x] **Step 2: Run RED**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
```

Expected: FAIL because the real Pane supplies a status-bar host and the Rail portals the three actions outside the titlebar.

- [x] **Step 3: Implement the minimal ownership fix**

In `WorkspaceRepositoryRail.tsx`, remove `createPortal`, remove `statusBarActionHost`, render the hidden actions directly:

```tsx
{
  branchListRefreshAction
}
{
  !repositoryListVisible ? hiddenRepositoryActions : null
}
```

Delete the portal block after the Rail root. In `BranchWorkspacePane.tsx`, remove `statusBarActionHost` state and both prop connections. In `StatusBar.tsx`, remove `RefCallback`, the prop, and the host element.

- [x] **Step 4: Update obsolete host-only tests and run GREEN**

Delete the StatusBar host exposure test and replace the Pane host wiring/rebinding expectations with absence assertions. Run:

```bash
bun run test src/web/components/StatusBar.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx src/web/styles/font-contract.test.ts
```

Expected: PASS with no React warnings.

---

### Task 2: Refresh member change counts after a manual branch-workspace reload

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

**Interfaces:**

- Consumes: `useReposStore.getState().workspaceProjects[rootId].repositoryIds`.
- Consumes: existing `refreshCoreData(repositoryId): Promise<void>`.
- Guarantees: one background core-data refresh per configured repository after each guarded manual list reload settles.

- [x] **Step 1: Extend the failing manual-reload test**

Keep the existing deferred `branchWorkspaceState.refresh`, click twice, and assert member status refresh does not start early. Resolve the list refresh, then require exactly one call per configured member while the list button is already enabled:

```tsx
expect(refreshCoreData).not.toHaveBeenCalled()
await act(async () => finishRefresh?.())
expect(refresh?.disabled).toBe(false)
expect(refreshCoreData).toHaveBeenCalledTimes(2)
expect(refreshCoreData).toHaveBeenNthCalledWith(1, API)
expect(refreshCoreData).toHaveBeenNthCalledWith(2, WEB)
```

- [x] **Step 2: Run RED**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx -t "manually reloads the branch workspace list"
```

Expected: FAIL because manual list reload currently never refreshes repository core data.

- [x] **Step 3: Implement one non-blocking post-reload refresh**

Add a focused callback that resolves configured members at execution time:

```tsx
const refreshWorkspaceMemberCoreData = useCallback(() => {
  const state = useReposStore.getState()
  const memberIds = state.workspaceProjects[workspaceRootId]?.repositoryIds ?? []
  return Promise.all(memberIds.map((memberId) => state.refreshCoreData(memberId)))
}, [workspaceRootId])
```

Reuse it in the existing batch-settle path. After `reloadBranchWorkspaces` leaves its `try/catch/finally`, invoke it without awaiting the result and consume rejection:

```tsx
void refreshWorkspaceMemberCoreData().catch(() => undefined)
```

Do not add this call to automatic drift refresh, dialog candidate refresh, or registry cleanup.

- [x] **Step 4: Run GREEN**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: PASS; duplicate clicks still produce one list reload and one refresh per configured member.

---

### Task 3: Add an opt-in repository dependency switch with lazy loading

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: existing `Switch` from `#/web/components/ui/switch.tsx`.
- Produces: local `repositoryDependenciesEnabled: Record<string, boolean>`.
- Produces: i18n keys `workspace.branch-workspace.repository-dependencies-toggle` and `workspace.branch-workspace.repository-dependencies-toggle-named`.

- [x] **Step 1: Write the failing lazy-load test**

Add a test that selects `api`, verifies no preflight call and an unchecked switch, then enables the switch and observes the candidate:

```tsx
click('workspace.branch-workspace.repository-named')
expect(mocks.getRepositoryWorktreeBootstrapPreflight).not.toHaveBeenCalled()
const dependencySwitch = document.querySelector<HTMLElement>(
  '[aria-label="workspace.branch-workspace.repository-dependencies-toggle-named"]',
)
expect(dependencySwitch?.getAttribute('aria-checked')).toBe('false')
act(() => dependencySwitch?.click())
await flushAsyncWork()
expect(mocks.getRepositoryWorktreeBootstrapPreflight).toHaveBeenCalledTimes(1)
expect(document.querySelector('[data-materialization-item="node_modules"]')).not.toBeNull()
```

Also assert the switch wrapper is the middle child between the repository label and base-branch select.

- [x] **Step 2: Run RED**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx -t "keeps repository dependencies disabled until explicitly enabled"
```

Expected: FAIL because selecting a repository immediately calls preflight and no Switch exists.

- [x] **Step 3: Implement the minimal lazy switch**

Import `Switch`, add/reset local enablement state, change the repository row to three columns, and render:

```tsx
<label className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
  <Switch
    checked={repositoryDependenciesEnabled[repository.name] === true}
    disabled={pending || fixed || !repository.available || !selectedRepositories[repository.name]}
    aria-label={t('workspace.branch-workspace.repository-dependencies-toggle-named', { name: repository.name })}
    title={t('workspace.branch-workspace.repository-dependencies-toggle-named', { name: repository.name })}
    onCheckedChange={(enabled) => {
      setRepositoryDependenciesEnabled((current) => ({ ...current, [repository.name]: enabled }))
      if (enabled) void loadRepositoryBootstrap(repository)
      else bootstrapControllers.current[repository.name]?.abort()
    }}
  />
  <span>{t('workspace.branch-workspace.repository-dependencies-toggle')}</span>
</label>
```

Selecting a repository must no longer call `loadRepositoryBootstrap`. A base-branch change calls it only when the corresponding enablement value is true. Render the dependency detail only when selected, enabled, and not fixed.

- [x] **Step 4: Add locale values and update existing dependency tests**

Add both keys to all four dictionaries with matching `{name}` placeholders. Update every existing repository-dependency test to explicitly click the dependency switch after selecting its repository. Update the read-failure copy to instruct users to turn the dependency switch off and on again.

- [x] **Step 5: Run GREEN**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS with no missing-key, placeholder, or React warnings.

---

### Task 4: Clear disabled dependency state and guard request construction

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`

**Interfaces:**

- Produces: one local `clearRepositoryBootstrap(repositoryName: string): void` helper.
- Guarantees: `repositorySelection()` emits `worktreeBootstrap` only while the repository dependency switch is enabled.

- [x] **Step 1: Write the failing disable-and-reenable test**

Enable dependencies, select one candidate, disable, and verify the first request signal is aborted. Re-enable and require a second preflight whose candidate starts at `skip`; preview must omit `worktreeBootstrap` until a new choice is made.

```tsx
expect(firstSignal.aborted).toBe(true)
expect(mocks.getRepositoryWorktreeBootstrapPreflight).toHaveBeenCalledTimes(2)
expect(choiceState('node_modules', 'skip')).toBe('on')
expect(onPreview).toHaveBeenCalledWith({
  operation: 'create',
  branch: 'feature/auth',
  repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
  auxiliaryEntries: [],
})
```

- [x] **Step 2: Run RED**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx -t "clears repository dependency choices when disabled"
```

Expected: FAIL because the first implementation only hides/aborts and retains bootstrap choices.

- [x] **Step 3: Implement clearing and request defense**

Add a helper that aborts and deletes the repository key from `repositoryBootstraps` and `repositoryBootstrapChoices`. Call it when the dependency switch turns off and when the repository is unchecked. Gate request state with:

```tsx
const state = repositoryDependenciesEnabled[repository.name] ? repositoryBootstraps[repository.name] : undefined
```

Reset the enablement map with the other dialog-local state whenever the dialog opens.

- [x] **Step 4: Run targeted GREEN**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: PASS with all dependency source, fallback, bulk-choice, request, and lifecycle cases green.

- [x] **Step 5: Run complete verification and inspect the diff**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
git diff --check
git diff --stat
```

Expected: every command exits 0; no whitespace errors, no architecture boundary violations, and no unrelated file changes.
