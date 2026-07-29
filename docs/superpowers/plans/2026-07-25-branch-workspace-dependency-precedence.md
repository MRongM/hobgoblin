# Branch Workspace Dependency Precedence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an explicitly selected branch-workspace dependency to replace a fingerprinted same-named target, allow dangling symbolic-link materialization, and make branch-workspace repair release dependency intent without dependency checks or reconstruction.

**Architecture:** Keep dependency maintenance in its existing stateless feature slice. Extend add plans with previewed target state, perform no-follow replacement in the write orchestrator, and remove auxiliary reconciliation from repair planning while preserving repository-member repair. Keep source and target authority server-derived.

**Tech Stack:** TypeScript in Node.js strip-only mode, Vitest, React, Bun, local filesystem and generated SSH Python commands.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-25-branch-workspace-dependency-precedence-design.md`.
- Do not add packages or change package versions.
- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` or `.tsx` extensions.
- Replacement is limited to server-derived direct-child targets and never follows symbolic links.
- Copy mode alone requires `outside-root-source`; symbolic-link mode does not read or dereference the source.
- Repair does not inspect, delete, or recreate dependency content.
- Do not create a branch, commit, or push; the user requested inline execution without Git writes.

---

### Task 1: Represent fingerprint-bound dependency replacement in the shared plan

**Files:**
- Modify: `src/shared/branch-workspace-dependencies.ts`
- Modify: `src/server/modules/branch-workspace-dependency-plan.ts`
- Test: `src/server/modules/branch-workspace-dependency-plan.test.ts`

**Interfaces:**
- Consumes: `BranchWorkspaceDependencyCandidate.targetKind`, `fingerprintBranchWorkspaceEntry`.
- Produces: `BranchWorkspaceDependencyAddPlanEntry.targetKind: BranchWorkspacePathKind`, `targetFingerprint?: string`, and an optional pending-plan revalidation input for the write service.

- [ ] **Step 1: Write failing planner tests**

Replace the occupied-target rejection test with assertions that a selected occupied target creates this entry and no outside-root approval is required for symbolic-link mode:

```ts
expect(result).toMatchObject({
  ok: true,
  plan: {
    operation: 'add',
    requiredApprovals: [],
    entries: [{
      name: 'config',
      mode: 'symlink',
      targetKind: 'directory',
      targetFingerprint: 'fingerprint:config',
    }],
  },
})
```

Extend the missing-target copy assertion with `targetKind: 'missing'`, and add an outside-root symbolic-link assertion with `requiredApprovals: []`.

Add a revalidation test: build a symbolic-link plan, remove its source from `auxiliaryCandidates`, then rebuild with the original pending plan and expect the same source path and token when the target is unchanged. Add the equivalent copy case and expect `workspace.branch-workspace.dependency.unavailable`.

- [ ] **Step 2: Run the planner test and verify RED**

Run: `bun run test -- src/server/modules/branch-workspace-dependency-plan.test.ts`

Expected: FAIL because occupied targets still return `dependency.target-exists` and add entries lack target state.

- [ ] **Step 3: Extend the add-plan contract**

Add the previewed state to `BranchWorkspaceDependencyAddPlanEntry`:

```ts
targetKind: BranchWorkspacePathKind
targetFingerprint?: string
```

No new request fields or approval values are introduced.

- [ ] **Step 4: Build replacement entries and mode-specific approvals**

Add an optional final `pendingPlan?: BranchWorkspaceDependencyPlan` argument to `buildBranchWorkspaceDependencyPlan`. In the add branch, fingerprint only occupied selected targets, include the resulting state in each entry, and compute approval with:

```ts
entries.some((entry) => entry.mode === 'copy' && entry.outsideRoot)
```

When the current candidate is absent, reuse source metadata only when the selection and matching entry in `pendingPlan` are both `symlink`. Reinspect its target and build the candidate from that server-owned entry. Return `dependency.unavailable` for a missing copy candidate. Return `workspace.branch-workspace.dependency.read-failed` if target inspection or fingerprinting fails, matching remove-plan behavior.

- [ ] **Step 5: Run the planner test and verify GREEN**

Run: `bun run test -- src/server/modules/branch-workspace-dependency-plan.test.ts`

Expected: PASS.

### Task 2: Revalidate and replace previewed targets safely during dependency execution

**Files:**
- Modify: `src/server/modules/branch-workspace-dependency-write-paths.ts`
- Test: `src/server/modules/branch-workspace-dependency-write-paths.test.ts`

**Interfaces:**
- Consumes: `BranchWorkspaceDependencyAddPlanEntry.targetKind`, the pending server-owned plan, and existing `removeBranchWorkspaceEntry`.
- Produces: sequential exact-target replacement with invalidation even when removal succeeds and materialization fails.

- [ ] **Step 1: Write failing replacement-order and partial-mutation tests**

Update `addPlan()` fixtures with `targetKind`. Mark `config` as `directory`, then assert event order:

```ts
expect(events).toEqual(['copy:.env', 'remove:config', 'symlink:config'])
```

Add a failure test where `removeEntry` succeeds and `materializeSymlink` throws. Assert `completedNames` remains empty for that entry and `publishInvalidation` is still called because the target was deleted.

- [ ] **Step 2: Run the write-service test and verify RED**

Run: `bun run test -- src/server/modules/branch-workspace-dependency-write-paths.test.ts`

Expected: FAIL because add execution does not remove occupied targets or invalidate a removal-only partial mutation.

- [ ] **Step 3: Implement exact replacement**

Track whether any filesystem mutation completed. For every add entry:

```ts
if (entry.targetKind !== 'missing') {
  await removeEntry(rootId, entry.targetPath, controller.signal)
  changed = true
}
```

Then invoke copy or symbolic-link materialization, set `changed = true`, and append the name only after materialization succeeds. Publish invalidation on success or failure whenever `changed` is true.

- [ ] **Step 4: Preserve stale-preview protection**

Pass the pending server-owned plan as the optional final argument when rebuilding before execution. Because target kind and fingerprint are part of the plan token, a changed target must return `dependency.plan-stale` before `removeEntry` is called. Only a disappeared symbolic-link source may reuse pending source metadata; all target state is live.

- [ ] **Step 5: Run the write-service test and verify GREEN**

Run: `bun run test -- src/server/modules/branch-workspace-dependency-write-paths.test.ts`

Expected: PASS.

### Task 3: Remove dependency reconciliation from branch-workspace repair

**Files:**
- Modify: `src/server/modules/branch-workspace-plan.ts`
- Test: `src/server/modules/branch-workspace-plan.test.ts`

**Interfaces:**
- Consumes: existing manifest `auxiliaryEntries` only as metadata to release.
- Produces: repair plans with `auxiliaryEntries: []`, `manifest.auxiliaryEntries: []`, no dependency approvals, and no dependency steps.

- [ ] **Step 1: Write failing repair tests**

Create a manifest containing pending and failed auxiliary entries whose source and target paths would throw if inspected. Assert repair still succeeds and returns:

```ts
expect(result).toMatchObject({
  ok: true,
  plan: {
    operation: 'repair',
    auxiliaryEntries: [],
    manifest: { auxiliaryEntries: [] },
    requiredApprovals: [],
    steps: [],
  },
})
```

Assert `inspectPath` is called for the branch-workspace root and repository member paths only, never for auxiliary source or target paths. Cover a manifest without an active operation so metadata release is itself repairable.

Update the old tests that expect `symlink-entry` or `copy-entry` repair steps; they must now expect only root and repository-member steps. Retain the independent worktree-elsewhere safety assertion.

- [ ] **Step 2: Run the repair planner test and verify RED**

Run: `bun run test -- src/server/modules/branch-workspace-plan.test.ts`

Expected: FAIL because repair currently invokes `planRepairAuxiliary` and emits auxiliary steps.

- [ ] **Step 3: Simplify `buildRepairPlan`**

Remove auxiliary concurrent checks and the `planRepairAuxiliary`/`repairAuxiliaryPlan` helpers. Build approvals and steps from repository repairs only. Set:

```ts
const auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[] = []
// repaired manifest
auxiliaryEntries: []
```

Allow a repair plan with no filesystem steps when `manifest.auxiliaryEntries.length > 0`, because clearing retained intent is a real metadata repair even without `manifest.operation`.

- [ ] **Step 4: Run the repair planner test and verify GREEN**

Run: `bun run test -- src/server/modules/branch-workspace-plan.test.ts`

Expected: PASS.

### Task 4: Permit dangling symbolic links locally and over SSH

**Files:**
- Modify: `src/system/ssh/commands.ts`
- Test: `src/server/modules/branch-workspace-materialization-source.test.ts`
- Test: `src/system/ssh/commands.test.ts`

**Interfaces:**
- Consumes: the existing server-derived absolute `sourcePath` and exact `targetPath`.
- Produces: local and SSH symbolic links whose source may not currently exist.

- [ ] **Step 1: Add dangling-link tests**

In the local materialization test, create the branch-workspace directory but not the source, call `materializeBranchWorkspaceSymlink`, and assert:

```ts
await expect(readlink(target)).resolves.toBe(source)
await expect(lstat(target)).resolves.toMatchObject({})
```

In the SSH command test, execute a generated `materializeBranchWorkspaceSymlink` command with a missing direct-child source and assert `readlinkSync(target) === source`.

- [ ] **Step 2: Run both tests and verify RED**

Run: `bun run test -- src/server/modules/branch-workspace-materialization-source.test.ts src/system/ssh/commands.test.ts`

Expected: the local case already passes by contract; the SSH case FAILS with `workspace.branch-workspace.source-missing`, documenting the platform inconsistency before production modification.

- [ ] **Step 3: Remove only the SSH source-existence guard**

Delete these generated Python lines from the `materializeBranchWorkspaceSymlink` case:

```py
if not os.path.lexists(source_path):
    fail("workspace.branch-workspace.source-missing")
```

Keep direct-child source validation, safe target-parent validation, and target collision behavior. Do not change copy commands.

- [ ] **Step 4: Run both tests and verify GREEN**

Run: `bun run test -- src/server/modules/branch-workspace-materialization-source.test.ts src/system/ssh/commands.test.ts`

Expected: PASS.

### Task 5: Expose replacement choices and destructive preview in the renderer

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceDependencyDialog.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceDependencyDialog.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**
- Consumes: add-plan `targetKind` and candidate `targetKind`.
- Produces: all eligible candidates in add mode, a visible replacement marker, and destructive confirmation for replacement plans.

- [ ] **Step 1: Write failing dialog and dictionary tests**

Change the add-mode test to assert both `.env` and occupied `config` are selectable and selecting `config` emits an add/symlink request. Add a replacement preview test that asserts:

```ts
expect(confirm?.dataset.variant).toBe('destructive')
expect(document.body.textContent).toContain('workspace.branch-workspace.dependency.operation.replace')
```

Add these keys to the locale coverage test:

```ts
'workspace.branch-workspace.dependency.add.replaces-target'
'workspace.branch-workspace.dependency.add.replace-confirm'
'workspace.branch-workspace.dependency.operation.replace'
```

- [ ] **Step 2: Run dialog and dictionary tests and verify RED**

Run: `bun run test -- src/web/components/repo-workspace/BranchWorkspaceDependencyDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: FAIL because occupied candidates are filtered out and replacement copy is absent.

- [ ] **Step 3: Render all add candidates and mark replacements**

Use all candidates for add selection. For occupied candidates, render the `add.replaces-target` annotation; retain the outside-root annotation where applicable. In preview, use `operation.replace` when an add entry has `targetKind !== 'missing'`.

- [ ] **Step 4: Make replacement confirmation destructive**

Derive:

```ts
const replacesTargets = plan?.operation === 'add' && plan.entries.some((entry) => entry.targetKind !== 'missing')
```

Use destructive button styling and `add.replace-confirm` when true. Keep ordinary missing-target additions non-destructive and removal behavior unchanged.

- [ ] **Step 5: Update all four dictionaries**

The Chinese copy must be explicit:

```ts
'workspace.branch-workspace.dependency.add.description': '将工作区根目录中的条目复制或软链接到此子工作区；同名现有内容会在确认后被替换。'
'workspace.branch-workspace.dependency.add.replaces-target': '将替换现有内容'
'workspace.branch-workspace.dependency.add.replace-confirm': '替换并添加'
'workspace.branch-workspace.dependency.operation.replace': '替换'
```

Provide equivalent concise English, Japanese, and Korean copy, and change the empty/addable descriptions so they no longer say only missing targets are eligible.

- [ ] **Step 6: Run dialog and dictionary tests and verify GREEN**

Run: `bun run test -- src/web/components/repo-workspace/BranchWorkspaceDependencyDialog.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

### Task 6: Verify the integrated behavior and architecture

**Files:**
- Verify: all files changed in Tasks 1-5
- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-07-25-branch-workspace-dependency-precedence-design.md`

**Interfaces:**
- Consumes: completed implementation.
- Produces: evidence that contracts, server behavior, renderer behavior, and architecture boundaries remain consistent.

- [ ] **Step 1: Run the focused regression suite**

Run:

```bash
bun run test -- \
  src/server/modules/branch-workspace-dependency-plan.test.ts \
  src/server/modules/branch-workspace-dependency-write-paths.test.ts \
  src/server/modules/branch-workspace-plan.test.ts \
  src/server/modules/branch-workspace-read.test.ts \
  src/server/modules/branch-workspace-materialization-source.test.ts \
  src/system/ssh/commands.test.ts \
  src/web/components/repo-workspace/BranchWorkspaceDependencyDialog.test.tsx \
  src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run required project gates**

Run sequentially:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: every command exits 0.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only the scoped implementation, tests, context, spec, and plan are modified. Do not commit.
