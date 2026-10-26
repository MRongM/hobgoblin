# Flexible Subworkspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver folder-named subworkspaces containing independently branched complete repositories and linked worktrees, with member branch switching and independent local copies of remote subworkspaces.

**Architecture:** Extend the existing BranchWorkspace vertical slice with explicit member kinds and authoritative member repository identities. Keep the current lifecycle planner/executor, add dedicated repository-clone and workspace-snapshot sources, and project their server-owned results into the existing renderer navigation and terminal model.

**Tech Stack:** TypeScript strip-only, React, Hono, Git, SSH, WSL adapters, Vitest, Bun.

## Global Constraints

- Follow `docs/superpowers/specs/2026-10-26-flexible-subworkspaces-design.md` in full.
- Same subworkspace may mix complete repositories and linked worktrees; member branches and folder names are independent.
- Preserve existing IDs, paths, ordering, and terminals when reading old records.
- Server owns Git, filesystem, persistence, cancellation, and invalidation; routes remain thin.
- Use repo aliases and explicit `.ts`/`.tsx` imports; no enums, runtime namespaces, parameter properties, or import aliases.
- Keep examples and fixtures generic. Add no dependencies unless necessary; any new version must be exact.
- Network Git operations remain cancellable and coordinated by repository.
- Run `bun run typecheck`, `bun run check:architecture`, and `bun run test` before completion.
- Work in the current linked worktree on its existing feature branch. No pushes or merges are requested.

## File responsibilities and interface contract

`src/shared/branch-workspaces.ts` remains the canonical lifecycle protocol. Introduce additive fields so old fixtures and older requests can still be read:

```ts
export type BranchWorkspaceMemberKind = 'worktree' | 'repository'
export type BranchWorkspaceMemberSource = { kind: 'repository'; repositoryId: string } | { kind: 'url'; url: string }
```

Selections, durable members, and repository plans gain optional `kind`, `source`, and `memberId`. Selections gain optional `targetBranch` and `mode?: CreateWorktreeMode`; repository plans keep their existing `mode: CreateWorktreeMode`. Snapshots may expose `currentBranch?: string | null` and `head?: string`; a null current branch denotes detached HEAD. Existing members without `kind` mean `worktree`. `repositoryName` denotes the destination member directory; the explicit source identifies the origin when different. Persist an authoritative `repositoryId` for new records and keep legacy fallback resolution for old ones.

Create requests gain optional `directoryName` and `branchWorkspaceId`. The normalized request still supplies a string `branch` for old consumers; new folder requests normalize that legacy field to an empty string, use `directoryName` for identity, and use their members' own `targetBranch` or explicit creation `mode` for Git. An omitted old-style `directoryName` retains the old branch request adapter; new UI always sends `directoryName`. Extending a folder workspace sends its explicit existing `branchWorkspaceId`.

Canonical helpers should live with their domain: a safe folder-name validator in shared, member identity resolution in server workspace paths, clone materialization in its own source, and workspace-copy transport in its own feature files. Avoid a broad rename of existing BranchWorkspace modules.

### Task 1: Folder and mixed-member lifecycle on the server

**Files:**

- Modify: `src/shared/branch-workspaces.ts`, `src/shared/branch-workspaces.test.ts`.
- Modify: `src/server/modules/workspace-paths.ts`, `src/server/modules/branch-workspace-source.ts`, `src/server/modules/branch-workspace-plan.ts`, `src/server/modules/branch-workspace-write-paths.ts`.
- Modify: `src/server/modules/branch-workspace-read.ts`, `src/server/modules/branch-workspace-catalog-read.ts`, `src/server/modules/branch-workspace-discovery-source.ts`, `src/server/modules/branch-workspace-materialization-source.ts`, `src/server/modules/branch-workspace-protected-paths.ts`.
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`, `src/server/modules/branch-workspace-git-action-write-paths.ts` and targeted server consumers of member repository identity.
- Modify: `src/system/ssh/branch-workspaces.ts`, `src/system/ssh/commands.ts` and any required WSL backend adapter.
- Create: `src/server/modules/branch-workspace-repository-source.ts` and its tests.
- Test: matching existing source/plan/write/read/discovery/Git-action tests plus real temporary-repository integration coverage.

**Interfaces:** Consume existing lifecycle service and backend adapters. Produce the shared additive protocol above, folder-safe creation, per-member Git targets, mode-aware clone/removal/repair, and authoritative member repository IDs usable by the renderer and workspace-copy feature.

- [x] **Step 1: Add failing contract and integration tests.** A folder name containing spaces must be accepted independently of branch syntax; two members with distinct `targetBranch` values must produce distinct branch plans. A mixed member test must verify a repository member has its own Git directory and does not change its source checkout.

```ts
const request = normalizeBranchWorkspacePlanRequest({
  operation: 'create',
  directoryName: 'feature set',
  repositories: [
    {
      repositoryName: 'service-a',
      kind: 'worktree',
      targetBranch: 'feat/auth',
      creationBase: { kind: 'localBranch', branch: 'main' },
      syncBeforeCreate: false,
    },
  ],
  auxiliaryEntries: [],
})
expect(request).toMatchObject({ ok: true, request: { directoryName: 'feature set' } })
```

- [x] **Step 2: Run focused tests and confirm they fail because the new behavior is absent.** Use `bun run test src/shared/branch-workspaces.test.ts src/server/modules/branch-workspace-plan.test.ts src/server/modules/branch-workspace-repository-source.test.ts`.
- [x] **Step 3: Implement protocol, compatibility, and execution dispatch.** Keep ordinary reads write-free. Save registry version 2 atomically after a recoverable version-1 backup on first write. Resolve each new member through its explicit source and destination; never infer a complete repository's target from its parent's configured repository name.

```ts
const kind = selection.kind ?? 'worktree'
const targetBranch = selection.targetBranch ?? legacyBranch
const memberRepositoryId = kind === 'repository' ? repositoryIdAtPath(rootId, destinationPath) : sourceRepositoryId
```

Use `git clone` with independent objects for complete repositories, retaining intentional long-term remotes. Existing local/SSH/WSL operations must route through their owning host. During removal, branch cleanup remains worktree-specific; deleting a complete member requires explicit target-directory approval and cannot call `git worktree remove` on its primary worktree. Preserve successful members on failure and revalidate ownership on retry.

- [x] **Step 4: Extend authoritative discovery and protection.** Probe every registered directory by exact path, distinguish primary repositories and linked worktrees, retain legacy prefix discovery, and keep arbitrary unregistered directories unclaimed. Root file mutation protection must recognize registered folders without a prefix. Current branch comes from the exact member directory, including detached state.
- [x] **Step 5: Verify focused suites and typecheck, self-review source isolation and lifecycle recovery, then commit the complete backend slice.** Add regression cases for version-1 IDs, unknown registry versions, mixed removal, source disappearance, branch switching, and actual member Git-action targeting.

### Task 2: Mixed-member creation and member branch switching in the renderer

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx` and tests.
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`, `BranchWorkspaceMemberRow.tsx`, `BranchWorkspacePane.tsx`, `BranchWorkspaceTerminalPanel.tsx`, `BranchWorkspaceFileArea.tsx` and matching tests where their labels or targets depend on the old common branch.
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`, `src/web/hooks/useBranchWorkspaceActions.ts`, `src/web/branch-workspace-repository-projection.ts`, `src/web/components/repo-workspace/branch-workspace-member-target.ts` and focused store/lifecycle consumers.
- Modify: ordinary worktree item action projection to allow a subworkspace member to switch its own branch.
- Modify: `src/shared/i18n/en.ts`, `zh.ts`, `ja.ts`, `ko.ts` and dictionary tests.

**Interfaces:** Consume Task 1's `directoryName`, explicit existing `branchWorkspaceId`, member `kind/source/targetBranch`, and resolved `repositoryId`. Produce create/extend requests using those fields and a folder-named UI whose selected member and terminal context survive branch switching.

- [ ] **Step 1: Add failing component tests.** Select one complete repository and one worktree with different branches, preview the request, and assert directory identity is independent of either branch.

```ts
expect(planRequest).toMatchObject({
  operation: 'create',
  directoryName: 'feature-set',
  repositories: [
    { repositoryName: 'service-a', kind: 'worktree', targetBranch: 'feat/auth' },
    { repositoryName: 'service-b', kind: 'repository', targetBranch: 'fix/session' },
  ],
})
```

- [ ] **Step 2: Run affected component tests and see the missing mode/target controls fail.** Use `bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx`.
- [ ] **Step 3: Implement folder and member controls.** Replace the common-branch input with a safe folder input; each row owns its mode, source, member directory, target branch, creation base, and applicable dependency choices. Add remote-URL complete-member creation and permit multiple destination aliases for a source. Keep incomplete form state local, and keep previous successful members fixed during extension/recovery.

```ts
const createRequest = {
  operation: 'create' as const,
  directoryName: folderName.trim(),
  branch: '',
  ...(workspace ? { branchWorkspaceId: workspace.id } : {}),
  repositories: selectedMembers,
  auxiliaryEntries: selectedAuxiliaryEntries,
}
```

- [ ] **Step 4: Render folder labels and member current branches.** Use `item.directoryName` for root labels, titles, breadcrumbs, and dialog summaries. Resolve/open every member using its own repository ID. Expose existing checkout/switch actions and refresh the member snapshot after success while preserving folder selection and terminal identities.
- [ ] **Step 5: Translate new controls into all four languages, run focused UI/dictionary tests and typecheck, self-review mode-specific validation, then commit.** Existing tests asserting a common-branch UI must be updated to assert the new behavior, retaining legacy input adapter tests on the server.

### Task 3: Independent local copies of remote subworkspaces

**Files:**

- Create: `src/shared/branch-workspace-clone.ts`, `src/server/modules/branch-workspace-clone-source.ts`, `branch-workspace-clone-plan.ts`, `branch-workspace-clone-write-paths.ts` and focused tests.
- Create: `src/system/git/workspace-snapshot.ts` and source/transport tests.
- Modify: `src/system/ssh/commands.ts` or a focused SSH snapshot transport adapter using existing target/auth handling.
- Modify: `src/server/routes/workspace.ts`, `src/web/workspace-client.ts` or the existing canonical workspace client.
- Create: `src/web/components/repo-workspace/BranchWorkspaceCloneDialog.tsx` and tests.
- Modify: `WorkspaceRepositoryRail.tsx` and `BranchWorkspaceList.tsx` to expose the menu action and controlled clone dialog.

**Interfaces:** Consume authoritative source `BranchWorkspaceSnapshot` and Task 1's folder/member materialization functions. Produce a source-fingerprint-bound plan, explicit execute/cancel endpoints, and destination subworkspace registration with new stable IDs. Defaults are independent complete repositories; worktree destinations require an explicit local repository mapping and non-overwriting branch import.

- [ ] **Step 1: Add real-Git failing snapshot tests.** Start with a committed source containing both staged and unstaged changes plus an untracked file. Copy into an independent destination and assert all three states, HEAD, and a source-only commit survive. Test a linked-worktree source whose Git common directory is elsewhere.

```ts
expect(await git(destination, ['rev-parse', 'HEAD'])).toBe(sourceHead)
expect(await git(destination, ['diff', '--cached', '--name-only'])).toContain('staged.txt')
expect(await git(destination, ['diff', '--name-only'])).toContain('working.txt')
expect(await readFile(path.join(destination, 'notes.txt'), 'utf8')).toBe('local notes')
expect(await git(destination, ['rev-parse', '--git-common-dir'])).not.toContain(sourcePath)
```

- [ ] **Step 2: Run snapshot/source/plan tests and confirm missing behavior fails.** Use `bun run test src/system/git/workspace-snapshot.test.ts src/server/modules/branch-workspace-clone-plan.test.ts`.
- [ ] **Step 3: Implement a bounded, cancellable snapshot transport.** Capture Git objects through bundles, staged and unstaged binary patches, and a validated relative-file manifest for untracked and ordinary root files. Transfer large data using bounded chunks or streaming through existing host authentication, with owned temporary resources and `finally` cleanup. Recheck source fingerprints before applying a reviewed plan. Reject conflicts/unsupported special Git states before copying and never copy hooks, credentials, sockets, or remote worktree pointers.
- [ ] **Step 4: Restore targets safely.** Build in owned temporary directories, restore HEAD, index/worktree patches, selected ignored files and validated symlinks, then publish without replacing an existing target. Worktree import uses fresh non-overwriting refs in the mapped local repository. Persist success per member; preserve successful results after cancellation and retry only unchanged owned work. Register the final folder with independent IDs and intentional remotes.
- [ ] **Step 5: Wire plan/execute/cancel routes and a translated clone dialog.** The dialog selects a destination folder, shows source contents and mode mappings, requires existing destructive/external-link approvals where relevant, and reports source changes as a demand for a new preview. Run focused route/renderer tests plus SSH/WSL transport-adapter tests, then commit.

### Task 4: Integrated validation, review fixes, and documentation

**Files:** All changed files and their focused tests; `CONTEXT.md`, the accepted design, this plan, and `docs/adr/0007-folder-subworkspaces-with-typed-repository-members.md`.

**Interfaces:** Consume completed feature slices. Produce verified Desktop/Web behavior, compatibility evidence, clean checks, and an accurate implementation record.

- [ ] **Step 1: Exercise the real mixed-member lifecycle.** Create a folder, change a complete member's branch without changing its source, change a worktree member within Git's constraints, close/reopen projection, then remove both member kinds through their respective reviewed plans.
- [ ] **Step 2: Run full project gates.** `bun run typecheck`, `bun run check:architecture`, `bun run test`. Record actual output and resolve failures in focused red/green cycles. Format only changed files.
- [ ] **Step 3: Request a whole-change code review.** Review against the full accepted specification, especially current-branch targeting, destructive ownership, registry migration, transfer cancellation and source consistency; fix all important findings and rerun the covering checks.
- [ ] **Step 4: Update current glossary entries and mark the specification and this plan implemented only after every required capability and check is complete.** Preserve the checkpoint tag, commit changes to the existing feature branch, and report test evidence and any remaining platform-specific validation limits.
