# Create Worktree Dependency Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make single-repository worktree dependencies opt-in, with a default-off switch that lazily loads and reveals the existing dependency controls.

**Architecture:** Keep dependency enablement and asynchronous preflight ownership in `CreateWorktreeDialogConnected`; expose the state to `CreateWorktreeDialog` as a controlled UI contract. Gate rendering, busy state, derived selections, and submission by the same boolean so hidden stale state can never be submitted.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Radix-based shared `Switch`, Vitest, existing Hobgoblin i18n dictionaries.

## Global Constraints

- Only the single-repository “Create a new worktree” dialog changes; branch-workspace creation and extension remain unchanged.
- Keep the switch state component-local, ephemeral, default-off, and unpersisted.
- Do not add packages, server APIs, realtime paths, Zustand state, or re-export shims.
- Use repo-alias imports with explicit `.ts` or `.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Keep sentence-case UI copy and provide English, Simplified Chinese, Japanese, and Korean values.
- Do not create a Git commit; the user did not request one.

---

### Task 1: Add the controlled dependency switch UI contract

**Files:**

- Modify: `src/web/components/CreateWorktreeDialog.test.tsx`
- Modify: `src/web/components/CreateWorktreeDialog.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/web/components/CreateWorktreeDialog.test.tsx`
- Test: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: existing `WorktreeBootstrapPromptState`, `WorktreeBootstrapCandidateList`, `WorktreeBootstrapSourcePicker`, and shared `Switch`.
- Produces: optional controlled props `bootstrapEnabled?: boolean` and `onBootstrapEnabledChange?: (enabled: boolean) => void` on `CreateWorktreeDialog`.

- [x] **Step 1: Write the failing component tests**

Render a stale candidate snapshot with `bootstrapEnabled={false}`. Assert the switch is unchecked and candidates are hidden, click it and assert the callback receives `true`, then render with `bootstrapEnabled` and assert candidates appear. Add a submission assertion proving disabled dependencies produce no selections even when a stale snapshot exists.

```tsx
const onBootstrapEnabledChange = vi.fn()
render(
  <CreateWorktreeDialog
    open
    repo={createRepo()}
    bootstrapEnabled={false}
    worktreeBootstrap={{
      loading: false,
      preflight: { kind: 'candidates', candidates: [{ path: '.env', kind: 'file' }] },
      error: false,
    }}
    onBootstrapEnabledChange={onBootstrapEnabledChange}
    onClose={vi.fn()}
    onCreate={vi.fn(async () => {})}
  />,
)

expect(dependencySwitch().getAttribute('data-state')).toBe('unchecked')
expect(document.querySelector('[data-materialization-item=".env"]')).toBeNull()
click('[aria-label="action.create-worktree-bootstrap-toggle"]')
expect(onBootstrapEnabledChange).toHaveBeenCalledWith(true)
```

- [x] **Step 2: Run the component test and verify RED**

Run:

```bash
bun run test src/web/components/CreateWorktreeDialog.test.tsx
```

Expected: FAIL because the controlled dependency props and switch do not exist and stale candidates remain visible.

- [x] **Step 3: Implement the minimal controlled UI behavior**

Import the existing `Switch`, add the two optional props, and render the switch after the path field. Derive all dependency behavior from the controlled value:

```tsx
const bootstrapBusy = bootstrapEnabled && worktreeBootstrap?.loading === true
const bootstrapCandidates =
  bootstrapEnabled && worktreeBootstrap?.preflight?.kind === 'candidates' ? worktreeBootstrap.preflight.candidates : []
```

The switch clears local choices before notifying the connection layer when turned off:

```tsx
<Switch
  checked={bootstrapEnabled}
  disabled={branchActionBusy}
  aria-label={t('action.create-worktree-bootstrap-toggle')}
  onCheckedChange={(enabled) => {
    if (!enabled) setBootstrapChoices({})
    onBootstrapEnabledChange?.(enabled)
  }}
/>
```

Render the source picker, candidate list, and error only when `bootstrapEnabled` is true. Because `bootstrapSelections` derives from the gated candidate list, a disabled submission always contains `selections: []` and no `sourceWorktreePath`.

Add `action.create-worktree-bootstrap-toggle` to all four dictionaries with concise localized “Dependencies” copy.

- [x] **Step 4: Run focused component and dictionary tests and verify GREEN**

Run:

```bash
bun run test src/web/components/CreateWorktreeDialog.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS with no warnings or unhandled errors.

### Task 2: Make the connected preflight lifecycle opt-in

**Files:**

- Modify: `src/web/hooks/useBranchActionItems.test.tsx`
- Modify: `src/web/hooks/useRepositoryCreationActions.tsx`
- Test: `src/web/hooks/useBranchActionItems.test.tsx`

**Interfaces:**

- Consumes: Task 1 controlled props on `CreateWorktreeDialog`.
- Produces: a connection-layer `bootstrapEnabled` state that gates the existing preflight effect and resets on close.

- [x] **Step 1: Write the failing integration tests**

Update existing dependency-source tests to explicitly click the new switch before waiting for candidates. Add a focused test proving opening the dialog performs no preflight and clicking the switch performs the first read:

```tsx
await act(async () => createWorktree.onSelect())
expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight).not.toHaveBeenCalled()

clickButton('[aria-label="action.create-worktree-bootstrap-toggle"]')
await waitForAssertion(() => {
  expect(repoClientMocks.getRepositoryWorktreeBootstrapPreflight).toHaveBeenCalledTimes(1)
})
```

Add coverage that toggling off hides candidates and causes submission to send `{ kind: 'skip' }`; reopening remains off and does not issue another preflight until enabled again.

- [x] **Step 2: Run the integration test and verify RED**

Run:

```bash
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected: FAIL because opening currently triggers preflight and the connected layer does not control the new switch.

- [x] **Step 3: Implement the minimal connected state and effect guard**

Add local state:

```tsx
const [bootstrapEnabled, setBootstrapEnabled] = useState(false)
```

Split the preflight effect’s inactive paths so closing resets the whole dialog lifecycle while disabling dependencies clears only dependency read state and preserves the selected source-context branch:

```tsx
if (!open) {
  setBootstrapEnabled(false)
  setBootstrapPreflight(null)
  setBootstrapPreflightError(false)
  setBootstrapPreflightLoading(false)
  setSourceContextBranch(undefined)
  setRequestedSource(undefined)
  setActiveSource(undefined)
  return
}
if (!bootstrapEnabled) {
  setBootstrapPreflight(null)
  setBootstrapPreflightError(false)
  setBootstrapPreflightLoading(false)
  setRequestedSource(undefined)
  setActiveSource(undefined)
  return
}
```

Include `bootstrapEnabled` in the effect dependencies and pass both controlled props to `CreateWorktreeDialog`:

```tsx
<CreateWorktreeDialog bootstrapEnabled={bootstrapEnabled} onBootstrapEnabledChange={setBootstrapEnabled} />
```

The existing effect cleanup aborts in-flight reads when the switch turns off or its source changes.

- [x] **Step 4: Run the integration test and verify GREEN**

Run:

```bash
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected: PASS; dependency preflight calls occur only after explicit enablement.

- [x] **Step 5: Run feature regression tests**

Run:

```bash
bun run test src/web/components/CreateWorktreeDialog.test.tsx src/web/hooks/useBranchActionItems.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS with all create-worktree modes, source fallback, source switching, and localized copy preserved.

### Task 3: Verify repository-wide quality gates

**Files:**

- Verify only: all modified source, test, spec, and plan files.
- Modify: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx`

**Interfaces:**

- Consumes: completed Tasks 1 and 2.
- Produces: evidence that the feature respects type, architecture, formatting, and regression constraints.

- [x] **Step 1: Run formatting checks for modified files**

Run:

```bash
bunx prettier --check docs/superpowers/specs/2026-08-03-create-worktree-dependency-toggle-design.md docs/superpowers/plans/2026-08-03-create-worktree-dependency-toggle.md src/web/components/CreateWorktreeDialog.tsx src/web/components/CreateWorktreeDialog.test.tsx src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx src/web/hooks/useRepositoryCreationActions.tsx src/web/hooks/useBranchActionItems.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
```

Expected: every listed file uses Prettier formatting.

- [x] **Step 2: Run type and architecture checks**

Run:

```bash
bun run typecheck
bun run check:architecture
```

Expected: both commands exit successfully with no violations.

- [x] **Step 3: Run the complete test suite**

Run:

```bash
bun run test
```

Expected: the full Vitest suite passes without unhandled errors.

- [x] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- docs/superpowers/specs/2026-08-03-create-worktree-dependency-toggle-design.md docs/superpowers/plans/2026-08-03-create-worktree-dependency-toggle.md src/web/components/CreateWorktreeDialog.tsx src/web/components/CreateWorktreeDialog.test.tsx src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx src/web/hooks/useRepositoryCreationActions.tsx src/web/hooks/useBranchActionItems.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
```

Expected: only the intended design, plan, UI, connection-layer, test, and localization changes are present; no whitespace errors exist.
