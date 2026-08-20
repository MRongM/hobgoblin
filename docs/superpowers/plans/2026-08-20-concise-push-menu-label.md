# Concise Push Menu Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the upstream branch name from the visible push menu label while retaining upstream context in the tooltip.

**Architecture:** Keep the existing `useBranchActionItems` action model and change only the push item's presentation contract. The action label remains state-aware through `branchActionLabel`, while `pushUpstreamLabel` remains the single source for the `title` tooltip.

**Tech Stack:** TypeScript, React, Vitest, Bun, Prettier.

**Global Constraints:** Do not change push behavior, shortcuts, icons, capability checks, Git APIs, state, or translations. Preserve unrelated dirty-worktree changes. Do not create a Git commit without separate explicit authorization.

---

## Task 1: Lock the concise-label behavior with a failing test

**Files:**

- Modify: `src/web/hooks/useBranchActionItems.test.tsx`
- Test: `src/web/hooks/useBranchActionItems.test.tsx`

- [x] Rename the upstream-label test to describe a concise visible label and retained tooltip.
- [x] Replace the loose label assertion with:

  ```ts
  expect(push?.label).toBe('action.push')
  expect(push?.title).toBe('action.branch-upstream-current: origin/feature/remote')
  ```

- [x] Run `bun run test -- src/web/hooks/useBranchActionItems.test.tsx` and confirm it fails because the current label still includes `origin/feature/remote`.

## Task 2: Apply the minimal presentation change

**Files:**

- Modify: `src/web/hooks/useBranchActionItems.tsx`
- Test: `src/web/hooks/useBranchActionItems.test.tsx`

- [x] Change the push item label to:

  ```ts
  label: branchActionLabel('push', 'action.push', 'action.push-loading', 'action.push-queued'),
  ```

- [x] Keep the existing `title` based on `pushUpstreamLabel` unchanged.
- [x] Re-run `bun run test -- src/web/hooks/useBranchActionItems.test.tsx` and confirm it passes.

## Task 3: Verify the bounded change

**Files:**

- Verify: `src/web/hooks/useBranchActionItems.tsx`
- Verify: `src/web/hooks/useBranchActionItems.test.tsx`
- Verify: `docs/superpowers/specs/2026-08-20-concise-push-menu-label-design.md`
- Verify: `docs/superpowers/plans/2026-08-20-concise-push-menu-label.md`

- [x] Run Prettier check on the four scoped files.
- [x] Run `bun run typecheck`.
- [x] Run `bun run check:architecture`.
- [x] Run `bun run test`.
- [x] Review the scoped diff and leave all changes uncommitted.
