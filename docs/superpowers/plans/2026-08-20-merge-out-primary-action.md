# Merge-out Primary Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pull-merge-push the visually primary and rightmost action in the merge-out dialog.

**Architecture:** Keep the change inside `MergeOutDialog` and reuse the shared Button variants. Verify rendered semantics through the existing component test without changing Git execution behavior.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Vitest, Bun

## Global Constraints

- Execute inline in the current worktree; do not dispatch subagents.
- Do not commit, stage, push, create branches, or modify worktrees.
- Do not add dependencies or one-off color classes.
- Preserve merge-out planning, readiness, execution modes, and form submission behavior.

---

### Task 1: Change the merge-out action hierarchy

**Files:**

- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Test: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`

**Interfaces:**

- Consumes: the existing `Button` variants `default` and `outline`
- Produces: footer order Cancel → merge-only → pull-merge-push

- [x] Add a failing `MergeOutDialog` test that reads footer buttons in DOM order and asserts `data-variant` for both merge actions.
- [x] Run `bun run test -- src/web/components/branch-list/BranchWriteDialogs.test.tsx` and confirm the test fails on the current reversed hierarchy.
- [x] Move the merge-only button before pull-merge-push, set merge-only to `variant="outline"`, and let pull-merge-push use the default primary variant.
- [x] Re-run the focused test and confirm it passes without changing execution assertions.

### Task 2: Verify the complete change

**Files:**

- Review the component, test, design document, and implementation plan.

- [x] Run `bun run typecheck`.
- [x] Run `bun run test`.
- [x] Run `bun run check:architecture`.
- [x] Run `git diff --check`.
- [x] Review the focused diff to confirm only merge-out presentation hierarchy changed.
