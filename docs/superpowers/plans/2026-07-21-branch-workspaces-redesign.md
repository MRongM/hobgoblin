# Branch Workspaces Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace workspace-wide batch worktree creation/removal with durable branch workspace folders that contain selected repository worktrees and selected linked/copied root entries, expose folder-scoped file/editor/terminal actions, and remain safe and recoverable across partial operations.

**Architecture:** Add a server-owned `branch-workspaces.json` registry and a dedicated branch-workspace vertical slice for reconciliation and mutations. Git repositories remain independent operation boundaries; the renderer projects each branch workspace as an explicit folder context inside its parent workspace, with TanStack Query owning runtime-coherent snapshots and Zustand owning tagged restorable selection and per-parent repository-list expansion.

**Tech Stack:** Bun 1.3, Node.js 24 strip-only TypeScript 6, Hono, React 19, TanStack Query, Zustand, Tailwind CSS 4, Vitest, Git worktrees, local filesystem APIs, SSH fixed-command adapters.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-07-21-branch-workspaces-redesign-design.md`.
- Branch workspace manifests are authoritative server application data; Git and filesystem state are observed state.
- Use exact repository-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Do not add dependencies.
- Keep local and SSH behavior semantically aligned; unsupported remote operations fail explicitly without fallback.
- Use `lstat` / no-follow deletion at every symbolic-link boundary.
- Preserve worktree bootstrap preview, hash, and approval behavior.
- Keep repository Git writes in existing repository write paths.
- Do not migrate or claim legacy flat worktrees.
- Do not read, write, or remove historic `AGENTS.md` managed blocks.
- Do not create Git commits or branches unless the user explicitly requests them.
- Follow strict red-green-refactor: every production behavior starts with a focused failing test whose failure is observed.

---

### Task 1: Define Branch Workspace Contracts, Naming, and Atomic Registry

**Files:**

- Create: `src/shared/branch-workspaces.ts`
- Create: `src/shared/branch-workspaces.test.ts`
- Create: `src/server/modules/branch-workspace-source.ts`
- Create: `src/server/modules/branch-workspace-source.test.ts`
- Modify: `src/server/modules/workspace-paths.ts`
- Modify: `src/server/modules/workspace-paths.test.ts`

**Interfaces:**

- Produces: `BranchWorkspaceManifest`, `BranchWorkspaceRepositoryMember`, `BranchWorkspaceAuxiliaryEntry`, `BranchWorkspaceOperationSnapshot`, `BranchWorkspaceSnapshot`, request/plan/result unions, and `BranchWorkspaceApproval`.
- Produces: `readBranchWorkspaceManifests(rootId)`, `replaceBranchWorkspaceManifests(rootId, manifests)`, and serialized `updateBranchWorkspaceManifests(rootId, mutate)`.
- Produces: `branchWorkspaceDirectoryName(branch, occupiedNames)` and `branchWorkspacePath(rootId, directoryName)`.

- [x] **Step 1: Write contract and naming tests**

Add tests proving safe readable names, deterministic collision hashes, local/remote path joining, exact branch uniqueness, and string-union request normalization. The core assertions are:

```ts
test('uses a readable slug and deterministic collision hash', () => {
  expect(branchWorkspaceDirectoryName('feature/auth', new Set())).toBe('goblin-feature-auth')
  expect(branchWorkspaceDirectoryName('feature/auth', new Set(['goblin-feature-auth']))).toMatch(
    /^goblin-feature-auth-[a-f0-9]{8}$/,
  )
})

test('joins branch workspace paths on the parent host', () => {
  expect(branchWorkspacePath('/workspace', 'goblin-feature-auth')).toBe('/workspace/goblin-feature-auth')
  expect(branchWorkspacePath('ssh-config://dev/srv/workspace', 'goblin-feature-auth')).toBe(
    '/srv/workspace/goblin-feature-auth',
  )
})
```

- [x] **Step 2: Run the naming tests and observe failure**

Run:

```bash
bun run test -- src/shared/branch-workspaces.test.ts src/server/modules/workspace-paths.test.ts
```

Expected: FAIL because the contracts and naming/path helpers do not exist.

- [x] **Step 3: Implement the shared contracts and naming helpers**

Define the durable shapes with string literals:

```ts
export type BranchWorkspaceProgress = 'pending' | 'complete' | 'removed' | 'failed'
export type BranchWorkspaceLifecycle = 'ready' | 'create-incomplete' | 'needs-repair' | 'delete-incomplete' | 'active'

export interface BranchWorkspaceManifest {
  id: string
  rootId: string
  branch: string
  directoryName: string
  path: string
  repositories: BranchWorkspaceRepositoryMember[]
  auxiliaryEntries: BranchWorkspaceAuxiliaryEntry[]
  operation?: BranchWorkspaceOperationSnapshot
}
```

Use a safe lowercase slug, trim separators, limit the readable portion, and append the first eight SHA-256 hex characters only when occupied; extend the hash deterministically if the eight-character candidate is also occupied.

- [x] **Step 4: Write registry red tests**

Use a temporary data file and verify missing state, round-trip normalization, corruption preservation, duplicate root/branch rejection, array order, serialized concurrent updates, and atomic replacement:

```ts
test('serializes concurrent manifest updates without losing either item', async () => {
  const dataFile = join(temp, 'branch-workspaces.json')
  await Promise.all([
    updateBranchWorkspaceManifests('/workspace', (items) => [...items, manifest('feature/a')], { dataFile }),
    updateBranchWorkspaceManifests('/workspace', (items) => [...items, manifest('feature/b')], { dataFile }),
  ])

  await expect(readBranchWorkspaceManifests('/workspace', { dataFile })).resolves.toMatchObject({
    kind: 'ready',
    manifests: [{ branch: 'feature/a' }, { branch: 'feature/b' }],
  })
})
```

- [x] **Step 5: Run the registry test and observe failure**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-source.test.ts
```

Expected: FAIL because the registry source is absent.

- [x] **Step 6: Implement the atomic registry source**

Follow `workspace-config-source.ts`: version the file as `1`, normalize every nested field, queue writes by data file, write a sibling exclusive temporary file, and rename it atomically. An invalid file returns `{ kind: 'invalid' }`; no write replaces invalid data.

- [x] **Step 7: Run Task 1 tests**

Run the commands from Steps 2 and 5.

Expected: PASS.

---

### Task 2: Add Local and SSH Materialization Sources

**Files:**

- Create: `src/server/modules/branch-workspace-materialization-source.ts`
- Create: `src/server/modules/branch-workspace-materialization-source.test.ts`
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`
- Create: `src/system/ssh/branch-workspaces.ts`
- Create: `src/system/ssh/branch-workspaces.test.ts`

**Interfaces:**

- Produces: `listBranchWorkspaceAuxiliaryCandidates(rootId, excludedNames, signal)`.
- Produces: `inspectBranchWorkspacePath(rootId, path, signal)` returning no-follow type, resolved target, and direct-child metadata.
- Produces: `createBranchWorkspaceDirectory`, `materializeBranchWorkspaceSymlink`, `copyBranchWorkspaceEntry`, `fingerprintBranchWorkspaceEntry`, `removeBranchWorkspaceEntry`, and `listBranchWorkspaceChildren`.
- Consumes: `resolveRemoteTarget` and fixed `RemoteCommandKind` scripts; no arbitrary renderer-provided shell command.

- [x] **Step 1: Write local source red tests**

Use temporary directories to prove direct-child filtering, source-root symlink dereference for copy, nested-symlink preservation, outside-root resolution metadata, stable fingerprints, modified-copy detection, and no-follow removal:

```ts
test('copies a root symlink target while preserving nested symlinks', async () => {
  await symlink(sourceDirectory, join(root, 'shared'))
  await copyBranchWorkspaceEntry(root, join(root, 'shared'), join(branchRoot, 'shared'))

  expect(await readFile(join(branchRoot, 'shared', 'value.txt'), 'utf8')).toBe('value')
  expect((await lstat(join(branchRoot, 'shared', 'nested-link'))).isSymbolicLink()).toBe(true)
})

test('removing a managed link never removes its target', async () => {
  await materializeBranchWorkspaceSymlink(root, source, target)
  await removeBranchWorkspaceEntry(root, target)
  await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(source, 'utf8')).resolves.toBe('keep')
})
```

- [x] **Step 2: Run the local source test and observe failure**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-materialization-source.test.ts
```

Expected: FAIL because the materialization source is absent.

- [x] **Step 3: Implement local materialization**

Use `fs.lstat`, `fs.realpath`, `fs.cp` with explicit root-link dereference, `fs.readlink`, and recursive sorted hashing. Hash relative names, entry kind, mode bits, file bytes, and nested link target text; never traverse a nested symbolic link. Every mutation checks exact root containment before touching disk.

- [x] **Step 4: Write SSH command and wrapper red tests**

Add fixed commands for inspect/list, copy, fingerprint, and no-follow removal. Assert quoting and JSON parsing using generic paths:

```ts
test('builds a no-follow branch workspace removal command', () => {
  const invocation = buildRemoteCommandInvocation(TARGET, {
    type: 'removeBranchWorkspaceEntry',
    rootPath: '/srv/workspace/goblin-feature',
    targetPath: '/srv/workspace/goblin-feature/shared',
  })
  expect(invocation.script).toContain('os.lstat')
  expect(invocation.script).toContain('os.unlink')
  expect(invocation.script).not.toContain('os.path.realpath(target_path)')
})
```

- [x] **Step 5: Run SSH tests and observe failure**

Run:

```bash
bun run test -- src/system/ssh/commands.test.ts src/system/ssh/branch-workspaces.test.ts
```

Expected: FAIL because the command variants and wrappers do not exist.

- [x] **Step 6: Implement fixed SSH materialization commands**

Use quoted `python3` scripts that emit JSON or a SHA-256 line. Validate absolute normalized paths and containment inside the supplied root before every action. Map command failures to stable translation keys; propagate cancellation through `runRemoteCommand`.

- [x] **Step 7: Dispatch local versus SSH in the materialization source**

Resolve the remote target from the parent root id, use POSIX path semantics remotely, and return the same DTO shapes as local calls. Never substitute copy when symlink creation fails.

- [x] **Step 8: Run Task 2 tests**

Run the commands from Steps 2 and 5.

Expected: PASS.

---

### Task 3: Reconcile Snapshots, Guard Configuration, and Publish Invalidation

**Files:**

- Create: `src/server/modules/branch-workspace-read.ts`
- Create: `src/server/modules/branch-workspace-read.test.ts`
- Modify: `src/server/modules/workspace-write-paths.ts`
- Modify: `src/server/modules/workspace-write-paths.test.ts`
- Modify: `src/server/routes/workspace.ts`
- Modify: `src/server/routes/workspace.test.ts`
- Modify: `src/server/app-factory.ts`
- Modify: `src/server/app-factory.test.ts`
- Modify: `src/server/modules/invalidation-broker.ts`
- Modify: `src/shared/server-invalidation.ts`
- Modify: `src/web/server-invalidation-ingress.test.ts`
- Create: `src/web/branch-workspace-queries.ts`
- Create: `src/web/branch-workspace-invalidation.ts`
- Create: `src/web/branch-workspace-invalidation.test.ts`
- Modify: `src/web/workspace-client.ts`
- Modify: `src/web/workspace-client.test.ts`

**Interfaces:**

- Produces: `readBranchWorkspaceSnapshot(rootId, signal): Promise<BranchWorkspaceReadResult>`.
- Produces: `branchWorkspaceQueryKey(rootId)` and `branchWorkspaceQueryOptions(rootId)`.
- Produces: `WorkspaceInvalidationEvent { type: 'workspace-invalidated'; rootId: string }`.
- Consumes: registry manifests, workspace config, repository snapshots, and materialization inspection.

- [x] **Step 1: Write reconciliation red tests**

Cover ready, create-incomplete, needs-repair, delete-incomplete, stale-running normalization, unavailable repositories, exact worktree identity, auxiliary candidates, and preserved manual order:

```ts
test('keeps a missing materialized workspace as needs-repair', async () => {
  const result = await readBranchWorkspaceSnapshot(ROOT, deps({ manifests: [manifest()], rootExists: false }))
  expect(result).toMatchObject({
    ok: true,
    items: [{ id: 'branch-1', lifecycle: 'needs-repair', issues: [{ kind: 'root-missing' }] }],
  })
})
```

- [x] **Step 2: Run reconciliation tests and observe failure**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-read.test.ts
```

Expected: FAIL because the read layer does not exist.

- [x] **Step 3: Implement reconciliation without mutation**

Read the registry and configuration once, derive repository ids from configured names, inspect expected paths, and project lifecycle/issues. Do not fingerprint completed copies during ordinary reads; deletion preflight owns expensive modification checks.

- [x] **Step 4: Write configuration-reference guard tests**

Replace AGENTS synchronization expectations with manifest-reference behavior:

```ts
test('rejects removing repositories referenced by branch workspaces', async () => {
  const result = await saveWorkspaceConfig(
    ROOT,
    { repo: ['api'] },
    {
      discover: async () => discovery(['api', 'web']),
      readBranchWorkspaces: async () => ({ kind: 'ready', manifests: [manifestWithRepo('web')] }),
      writeConfig,
    },
  )
  expect(result).toEqual({
    ok: false,
    message: 'workspace.config.repository-referenced',
    affectedBranchWorkspaces: ['feature/auth'],
  })
  expect(writeConfig).not.toHaveBeenCalled()
})
```

- [x] **Step 5: Run the workspace write test and observe failure**

Run:

```bash
bun run test -- src/server/modules/workspace-write-paths.test.ts
```

Expected: FAIL because configuration still synchronizes `AGENTS.md` and lacks the reference guard.

- [x] **Step 6: Implement the guard and remove configuration AGENTS synchronization**

Read manifests before writing. Reject only names removed from the old configuration that are referenced by manifests; include sorted distinct branch names. Remove `syncWorkspaceAgents`, its dependency field, and `workspace.agents.write-failed` handling from this path.

- [x] **Step 7: Write route/client/query/invalidation red tests**

Prove `GET/POST /api/workspace/branch-workspaces/read`, targeted query invalidation, and strict event validation:

```ts
test('invalidates only the affected branch workspace query', async () => {
  const invalidateQueries = vi.fn()
  const dispose = subscribeBranchWorkspaceInvalidation({ invalidateQueries })
  emit({ type: 'workspace-invalidated', rootId: '/workspace' })
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: branchWorkspaceQueryKey('/workspace'), exact: true })
  dispose()
})
```

- [x] **Step 8: Run boundary tests and observe failure**

Run:

```bash
bun run test -- src/server/routes/workspace.test.ts src/server/app-factory.test.ts src/web/workspace-client.test.ts src/web/branch-workspace-invalidation.test.ts src/web/server-invalidation-ingress.test.ts
```

Expected: FAIL because routes, client calls, and invalidation events are absent.

- [x] **Step 9: Implement read boundary and targeted invalidation plumbing**

Wire `createWorkspaceRoutes` with injected terminal dependencies needed by later write tasks, add a read endpoint and client/query options, extend the shared invalidation union, and publish only after manifest or materialization state changes.

- [x] **Step 10: Run Task 3 tests**

Run the commands from Steps 2, 5, and 8.

Expected: PASS.

---

### Task 4: Plan and Execute Create/Extend Operations Persistently

**Files:**

- Create: `src/server/modules/branch-workspace-plan.ts`
- Create: `src/server/modules/branch-workspace-plan.test.ts`
- Create: `src/server/modules/branch-workspace-write-paths.ts`
- Create: `src/server/modules/branch-workspace-write-paths.test.ts`
- Modify: `src/server/routes/workspace.ts`
- Modify: `src/server/routes/workspace.test.ts`
- Modify: `src/web/workspace-client.ts`
- Modify: `src/web/workspace-client.test.ts`
- Create: `src/web/hooks/useBranchWorkspaceActions.ts`
- Create: `src/web/hooks/useBranchWorkspaceActions.test.tsx`

**Interfaces:**

- Produces: `buildBranchWorkspacePlan(rootId, request, dependencies, signal)`.
- Produces: `createBranchWorkspaceWriteService(dependencies)` with `plan`, `execute`, `abort`, and `reorder`.
- Consumes: `createRepositoryWorktree`, worktree bootstrap previews, manifest source, and materialization source.

- [x] **Step 1: Write create/extend plan red tests**

Cover non-empty repository subset, different bases, missing branch, pre-existing branch without a worktree, exact expected worktree, elsewhere worktree blocker, unavailable selected member, occupied path, additive extension, prohibited mode changes, outside-root auxiliary approval, and bootstrap approval:

```ts
test('plans different bases and branch provenance per repository', async () => {
  const result = await buildBranchWorkspacePlan(
    ROOT,
    {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        { repositoryName: 'api', baseBranch: 'main' },
        { repositoryName: 'web', baseBranch: 'develop' },
      ],
      auxiliaryEntries: [],
    },
    deps(),
  )

  expect(result).toMatchObject({
    ok: true,
    plan: {
      repositories: [
        { repositoryName: 'api', mode: { kind: 'newBranch', baseRef: 'main' }, branchOrigin: 'created' },
        { repositoryName: 'web', mode: { kind: 'newBranch', baseRef: 'develop' }, branchOrigin: 'created' },
      ],
    },
  })
})
```

- [x] **Step 2: Run plan tests and observe failure**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-plan.test.ts
```

Expected: FAIL because the planner is absent.

- [x] **Step 3: Implement deterministic, stale-checkable planning**

Hash the complete normalized plan as `sha256:<hex>`. Record exact paths, create mode, provenance, bootstrap decision/preview, auxiliary resolved target, and required approvals. Rebuilding immediately before first mutation must produce the same token.

- [x] **Step 4: Write persistent execution red tests**

Prove intent is persisted before mkdir/Git, configured-order sequencing, progress after each step, no rollback, cancellation, retry of only incomplete work, exact satisfied recognition, bootstrap reapproval, one active operation per root, and append-preserving reorder:

```ts
test('persists completed progress and retries only the failed member', async () => {
  createWorktree.mockResolvedValueOnce({ ok: true, message: '' }).mockResolvedValueOnce({ ok: false, message: 'busy' })
  const first = await service.execute(ROOT, approvedInput)
  expect(first.ok).toBe(false)
  expect(savedManifest().repositories.map((member) => member.progress)).toEqual(['complete', 'failed'])

  createWorktree.mockClear()
  createWorktree.mockResolvedValue({ ok: true, message: '' })
  await service.execute(ROOT, approvedInput)
  expect(createWorktree).toHaveBeenCalledTimes(1)
  expect(createWorktree).toHaveBeenCalledWith(
    expect.stringContaining('/web'),
    expect.anything(),
    expect.anything(),
    expect.anything(),
  )
})
```

- [x] **Step 5: Run execution tests and observe failure**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-write-paths.test.ts
```

Expected: FAIL because persistent execution does not exist.

- [x] **Step 6: Implement create/extend execution**

Persist pending manifest members first, then mkdir, repository worktrees in configured order, and auxiliaries in request order. Use `existingBranch` for pre-existing branches and `newBranch` for missing branches. Persist each success/failure and clear the operation snapshot only after reconciliation reports ready.

- [x] **Step 7: Add create/execute/abort/reorder routes and client actions test-first**

Add boundary tests for normalized requests and approvals, then implement:

```ts
planBranchWorkspace(rootPath, request)
executeBranchWorkspace(rootPath, { planToken, approvals })
abortBranchWorkspace(rootPath)
reorderBranchWorkspaces(rootPath, orderedIds)
```

The React hook keeps dialog-local plan/result state, refetches the affected query after settlement, and never projects business logic into the renderer.

- [x] **Step 8: Run Task 4 tests and typecheck**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-plan.test.ts src/server/modules/branch-workspace-write-paths.test.ts src/server/routes/workspace.test.ts src/web/workspace-client.test.ts src/web/hooks/useBranchWorkspaceActions.test.tsx
bun run typecheck
```

Expected: PASS.

---

### Task 5: Add Repair/Delete Safety and Administrative Terminal Closure

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/server/terminal/terminal-session-manager.ts`
- Modify: `src/server/terminal/terminal-session-manager.test.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal.test.ts`
- Modify: `src/server/terminal/terminal-facade.ts`
- Modify: `src/server/terminal/terminal-host.ts`
- Modify: `src/server/terminal/terminal-worker-protocol.ts`
- Modify: `src/server/terminal/terminal-worker-host.ts`
- Modify: `src/server/terminal/terminal-worker-host.test.ts`
- Modify: `src/server/modules/branch-workspace-plan.ts`
- Modify: `src/server/modules/branch-workspace-plan.test.ts`
- Modify: `src/server/modules/branch-workspace-write-paths.ts`
- Modify: `src/server/modules/branch-workspace-write-paths.test.ts`

**Interfaces:**

- Produces: `ServerTerminalHost.closeSessions(sessionIds)` administrative close operation across owners.
- Produces: repair and remove plan variants with explicit `close-terminals`, `modified-copies`, `unmanaged-content`, and `outside-root` approvals.
- Consumes: terminal session summaries from parent/configured repository scopes, repository worktree status, branch provenance, and copy fingerprints.

- [x] **Step 1: Write terminal administrative-close red tests**

Prove the manager can close specified sessions owned by different client ids, return missing ids, and broadcast every affected scope:

```ts
test('administratively closes sessions across owners', async () => {
  const first = createSession('client_a', '/workspace', '/workspace/goblin-feature')
  const second = createSession('client_b', '/workspace/api', '/workspace/goblin-feature/api')
  expect(closeServerTerminalSessions([first.sessionId, second.sessionId])).toEqual({
    closed: [first.sessionId, second.sessionId],
    missing: [],
  })
})
```

- [x] **Step 2: Run terminal tests and observe failure**

Run:

```bash
bun run test -- src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal.test.ts src/server/terminal/terminal-worker-host.test.ts
```

Expected: FAIL because administrative closure is absent.

- [x] **Step 3: Implement worker-backed administrative closure**

Add a typed worker action and host/facade methods. The manager returns affected scopes before disposal; the terminal layer broadcasts `sessions-changed` once per scope. A missing id remains in `missing`, allowing branch-workspace deletion to abort before filesystem mutation.

- [x] **Step 4: Write repair/delete plan red tests**

Cover missing root/link/copy, exact-path repair, refusal to overwrite, dirty/locked/primary blockers, elsewhere worktree, modified copy approval, unregistered children approval, descendant terminal approval, created/pre-existing branch cleanup, protected branches, and stale upstream:

```ts
test('requires terminal approval for root and member sessions', async () => {
  const result = await buildBranchWorkspacePlan(
    ROOT,
    { operation: 'remove', branchWorkspaceId: 'branch-1', alsoDeleteBranch: false, alsoDeleteUpstream: false },
    deps({
      terminalTargets: ['/workspace/goblin-feature', '/workspace/goblin-feature/api'],
    }),
  )
  expect(result).toMatchObject({
    ok: true,
    plan: { requiredApprovals: ['close-terminals'], terminalSessionIds: ['terminal-root', 'terminal-api'] },
  })
})
```

- [x] **Step 5: Run planner tests and observe failure**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-plan.test.ts
```

Expected: FAIL because repair/remove planning is absent.

- [x] **Step 6: Implement repair/remove planning**

List sessions for parent and every configured repository, parse their recorded target path from the session key, and apply same-host descendant checks. Fingerprint copies only during remove planning. Hard blockers never become approvals.

- [x] **Step 7: Write repair/delete execution red tests**

Verify terminals close before manifest/filesystem mutation, close failure makes zero mutations, worktrees remove sequentially, only created branches receive optional cleanup, symlinks unlink no-follow, folder removal is last, and failure leaves `delete-incomplete`:

```ts
test('aborts before filesystem mutation when an approved terminal cannot close', async () => {
  closeSessions.mockResolvedValue({ closed: [], missing: ['terminal-1'] })
  const result = await service.execute(ROOT, removeInput(['close-terminals']))
  expect(result).toMatchObject({ ok: false, message: 'branch-workspace.terminals-close-failed' })
  expect(removeWorktree).not.toHaveBeenCalled()
  expect(removeEntry).not.toHaveBeenCalled()
})
```

- [x] **Step 8: Implement repair/delete execution**

Repair only absent targets and exact expected paths. Delete closes approved terminals, persists remove progress, removes worktrees and eligible branches, removes approved auxiliary/unmanaged entries, removes the root last, and deletes the manifest only after every requested step succeeds.

- [x] **Step 9: Run Task 5 tests and typecheck**

Run:

```bash
bun run test -- src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal.test.ts src/server/terminal/terminal-worker-host.test.ts src/server/modules/branch-workspace-plan.test.ts src/server/modules/branch-workspace-write-paths.test.ts
bun run typecheck
```

Expected: PASS.

---

### Task 6: Adapt File Trees and External Open Actions to Protected Folder Contexts

**Files:**

- Create: `src/server/modules/branch-workspace-protected-paths.ts`
- Create: `src/server/modules/branch-workspace-protected-paths.test.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceFileTree.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceFileTree.test.tsx`
- Create: `src/web/hooks/useFolderExternalOpenActions.ts`
- Create: `src/web/hooks/useFolderExternalOpenActions.test.tsx`

**Interfaces:**

- Produces: `BranchWorkspaceFolderContext { rootId, id, branch, path, lifecycle, managedRootNames }`.
- Produces: `assertBranchWorkspaceFileMutationAllowed(input)` used by every rename/delete/move boundary.
- Produces: optional explicit `folderContext` input for `ProjectFileTree`; existing repository-derived behavior remains the default.

- [x] **Step 1: Write protected-path red tests**

Prove parent registered roots and active-context managed roots cannot be renamed/moved/deleted, while descendants and unmanaged roots remain operable:

```ts
test.each([
  { worktreePath: ROOT, paths: [`${ROOT}/goblin-feature`] },
  { worktreePath: `${ROOT}/goblin-feature`, paths: [`${ROOT}/goblin-feature/api`] },
])('blocks deleting managed roots %#', async (input) => {
  await expect(assertBranchWorkspaceFileMutationAllowed({ rootId: ROOT, kind: 'delete', ...input })).resolves.toEqual({
    ok: false,
    message: 'branch-workspace.managed-path-protected',
  })
})

test('allows editing descendants of a managed root', async () => {
  await expect(
    assertBranchWorkspaceFileMutationAllowed({
      rootId: ROOT,
      kind: 'rename',
      worktreePath: `${ROOT}/goblin-feature`,
      paths: [`${ROOT}/goblin-feature/api/src/app.ts`],
    }),
  ).resolves.toEqual({ ok: true })
})
```

- [x] **Step 2: Run protection tests and observe failure**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-protected-paths.test.ts src/server/modules/repo.test.ts
```

Expected: FAIL because generic file writes do not consult manifests.

- [x] **Step 3: Implement server-side mutation guards**

Call the guard before local/remote rename, move, and delete. Check source roots and move destinations lexically with platform-correct path semantics; do not resolve managed symlinks before comparing their protected top-level identity.

- [x] **Step 4: Write explicit folder-context file-tree red tests**

Render a branch folder without a synthetic `RepoState`, verify the root path is queried, bootstrap controls are absent, managed root context-menu mutation actions are disabled, descendants retain actions, and editor/external-terminal calls use the folder path.

- [x] **Step 5: Run renderer tests and observe failure**

Run:

```bash
bun run test -- src/web/components/file-tree/ProjectFileTree.test.tsx src/web/components/repo-workspace/BranchWorkspaceFileTree.test.tsx src/web/hooks/useFolderExternalOpenActions.test.tsx
```

Expected: FAIL because `ProjectFileTree` only derives context from `RepoState`.

- [x] **Step 6: Implement the file-tree adapter and external folder actions**

Add an optional context object:

```ts
export interface ProjectFileTreeContext {
  repoId: string
  worktreePath: string
  branch: string | null
  isGitRepo: boolean
  status: WorktreeStatus[]
  protectedRootNames?: string[]
}
```

Use existing read/write clients with parent root id plus branch folder path. Keep local/remote editor and external terminal dispatch in one `useFolderExternalOpenActions` hook.

- [x] **Step 7: Run Task 6 tests**

Run the commands from Steps 2 and 5.

Expected: PASS.

---

### Task 7: Support Branch Workspace Internal Terminals and Badges

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/terminal/terminal.test.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/terminal-repo-index.ts`
- Modify: `src/web/components/terminal/terminal-repo-index.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx`

**Interfaces:**

- Extends: `TerminalCreateInput` with optional `{ targetKind: 'branch-workspace'; branchWorkspaceId: string }`.
- Produces: terminal folder index entries mapping persisted branch paths to common branch names without adding `RepoState` records.
- Consumes: branch-workspace query snapshots and registry validation in the terminal worker.

- [x] **Step 1: Write server terminal red tests**

Prove local/remote branch folder terminals require an exact ready/incomplete manifest target, reject delete-incomplete or mismatched paths, and retain the existing parent-root/path session key:

```ts
test('creates an authorized local branch workspace terminal', async () => {
  readBranchWorkspace.mockResolvedValue(manifest({ path: '/workspace/goblin-feature' }))
  const result = await createServerTerminal('client_1', {
    repoRoot: '/workspace',
    branch: 'feature/auth',
    worktreePath: '/workspace/goblin-feature',
    targetKind: 'branch-workspace',
    branchWorkspaceId: 'branch-1',
    kind: 'primary',
    attachmentId: 'attachment_1',
  })
  expect(result).toMatchObject({ ok: true, key: '/workspace\0/workspace/goblin-feature\0terminal-1' })
})
```

- [x] **Step 2: Run server terminal tests and observe failure**

Run:

```bash
bun run test -- src/server/terminal/terminal.test.ts
```

Expected: FAIL because arbitrary local folder targets are rejected as unknown worktrees.

- [x] **Step 3: Implement manifest-authorized terminal creation**

Validate id/root/path and reject `delete-incomplete`; then use the existing local/remote session creation paths with the authorized folder as cwd. Existing Git and plain-workspace validation remains unchanged.

- [x] **Step 4: Write renderer terminal index and panel red tests**

Verify server-session reconciliation recognizes branch paths, item counts/bells/activity read only the root-scoped key, the terminal action restores the last session, and it creates one only when the root group is empty.

- [x] **Step 5: Run renderer terminal tests and observe failure**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-repo-index.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx
```

Expected: FAIL because folder paths are absent from the terminal index and no panel exists.

- [x] **Step 6: Implement folder terminal indexing and panel composition**

Merge query-owned folder contexts into `TerminalRepoIndex.branchByWorktreePath`, pass target metadata during create, and compose the existing `TerminalTabs`, `TerminalSlot`, terminal store hooks, and selection persistence around `worktreeTerminalKey(rootId, branchPath)`.

- [x] **Step 7: Run Task 7 tests and typecheck**

Run the commands from Steps 2 and 5, then:

```bash
bun run typecheck
```

Expected: PASS.

---

### Task 8: Migrate Restorable Navigation and Add Per-Parent Repository Collapse

**Files:**

- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-defaults.test.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/web/restorable-workspace-state.ts`
- Modify: `src/web/restorable-workspace-state.test.ts`
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/store.ts`
- Modify: `src/web/stores/repos/selection.ts`
- Modify: `src/web/stores/repos/selection.test.ts`
- Modify: `src/web/stores/repos/workspace-projects.ts`
- Modify: `src/web/stores/repos/workspace-projects.test.ts`
- Modify: `src/web/stores/repos/lifecycle.ts`
- Modify: `src/web/hooks/useAppBootstrap.ts`
- Modify: `src/web/hooks/useAppBootstrap.test.tsx`
- Modify: `src/web/hooks/useSessionPersistence.ts`
- Modify: `src/web/hooks/useSessionPersistence.test.tsx`

**Interfaces:**

- Produces: `WorkspaceActiveContext = overview | repository | branch-workspace`.
- Replaces: renderer use of `workspaceActiveRepoByRoot` with `workspaceActiveContextByRoot` while accepting the old persisted field for migration.
- Produces: `workspaceRepositoryListExpandedByRoot` with missing-entry default `true`.

- [x] **Step 1: Write session normalization/migration red tests**

Cover old null/root/child selections, new tagged contexts, invalid ids, branch fallback, expansion default true, per-root values, and pruning:

```ts
test('migrates legacy child selection and defaults repository lists to expanded', () => {
  const restored = restoreRestorableWorkspaceStateFromSession({
    ...defaultSessionState(),
    workspaceActiveRepoByRoot: { '/workspace': '/workspace/api' },
  })
  expect(restored.workspaceActiveContextByRoot).toEqual({
    '/workspace': { kind: 'repository', repositoryId: '/workspace/api' },
  })
  expect(restored.workspaceRepositoryListExpandedByRoot).toEqual({})
  expect(workspaceRepositoryListExpanded(restored, '/workspace')).toBe(true)
})
```

- [x] **Step 2: Run persistence tests and observe failure**

Run:

```bash
bun run test -- src/shared/settings-defaults.test.ts src/server/modules/settings-source.test.ts src/web/restorable-workspace-state.test.ts
```

Expected: FAIL because tagged context and expansion maps do not exist.

- [x] **Step 3: Implement normalized restorable fields**

Persist new fields, retain legacy read normalization, and stop writing `workspaceActiveRepoByRoot`. A missing expansion entry means true. Keep this state restorable rather than runtime-coherent.

- [x] **Step 4: Write store selection red tests**

Prove overview/repository/branch activation, project restore, missing/deleting branch fallback, independent root collapse, and cleanup when the parent closes.

- [x] **Step 5: Run store tests and observe failure**

Run:

```bash
bun run test -- src/web/stores/repos/selection.test.ts src/web/stores/repos/workspace-projects.test.ts src/web/hooks/useAppBootstrap.test.tsx src/web/hooks/useSessionPersistence.test.tsx
```

Expected: FAIL because store actions and persistence still use repository-or-null selection.

- [x] **Step 6: Implement tagged navigation and per-root collapse actions**

Add:

```ts
activateWorkspaceOverview(rootId: string): void
activateWorkspaceRepository(rootId: string, repositoryId: string): void
activateBranchWorkspace(rootId: string, branchWorkspaceId: string): void
toggleWorkspaceRepositoryList(rootId: string): void
```

Repository activation sets `activeId` to the child; overview/branch activation sets it to the root. Project activation resolves tagged selection against the current workspace and branch snapshots, otherwise falls back to root Overview.

- [x] **Step 7: Run Task 8 tests**

Run the commands from Steps 2 and 5.

Expected: PASS.

---

### Task 9: Build the A-v2 UI, Preserve Pull-All, and Remove Legacy Batch/AGENTS Code

**Files:**

- Create: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/RepoView.test.tsx`
- Create: `src/shared/workspace-pull.ts`
- Create: `src/server/modules/workspace-pull-plan.ts`
- Create: `src/server/modules/workspace-pull-plan.test.ts`
- Create: `src/server/modules/workspace-pull-write-paths.ts`
- Create: `src/server/modules/workspace-pull-write-paths.test.ts`
- Modify: `src/server/routes/workspace.ts`
- Modify: `src/web/workspace-client.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`
- Delete: `src/shared/workspace-worktrees.ts`
- Delete: `src/server/modules/workspace-worktree-plan.ts`
- Delete: `src/server/modules/workspace-worktree-plan.test.ts`
- Delete: `src/server/modules/workspace-worktree-write-paths.ts`
- Delete: `src/server/modules/workspace-worktree-write-paths.test.ts`
- Delete: `src/server/modules/workspace-agents-source.ts`
- Delete: `src/server/modules/workspace-agents-source.test.ts`
- Delete: `src/web/hooks/useWorkspaceWorktreeActions.ts`
- Delete: `src/web/components/repo-workspace/WorkspaceWorktreeDialog.tsx`
- Delete: `src/web/components/repo-workspace/WorkspaceWorktreeDialog.test.tsx`
- Delete: `src/web/stores/repos/workspace-worktrees.ts`
- Delete: `src/web/stores/repos/workspace-worktrees.test.ts`

**Interfaces:**

- Produces: one non-expandable branch workspace row with lifecycle-specific actions and root-scoped terminal badges.
- Produces: create/extend and delete/repair dialog modes backed entirely by server plans.
- Preserves: configured-repository root pull as `拉取全部仓库` using pull-only contracts/modules.
- Removes: legacy batch create/remove contracts, UI, AGENTS synchronization source, tests, errors, and translations.

- [x] **Step 1: Write branch workspace list red tests**

Render ready, active, create-incomplete, needs-repair, and delete-incomplete rows. Verify label uses common branch, item is non-expandable, root actions receive the branch path, count/bell/activity use only the root key, drag reorder persists ids, and lifecycle action sets are exact.

- [x] **Step 2: Write dialog red tests**

Verify repository subset selection, per-repository default base, auxiliary unchecked/default-link behavior, fixed existing members on extension, approvals from plan, modified/unmanaged/terminal deletion confirmations, repair, cancel, and retry.

- [x] **Step 3: Run list/dialog tests and observe failure**

Run:

```bash
bun run test -- src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: FAIL because the components do not exist.

- [x] **Step 4: Implement list and dialogs from shared row/dialog primitives**

Keep the row one level deep. Ready actions are editor, external terminal, internal terminal, delete, and drag. Active exposes progress/cancel only; create-incomplete and needs-repair expose inspect/retry; delete-incomplete exposes continue-delete/error only.

- [x] **Step 5: Write rail A-v2 and collapse red tests**

Assert Overview renders branch items in the existing lower worktree slot, repository selection renders `BranchList`, branch selection keeps Overview as parent section, collapsing hides only Overview/repository rows, header actions/status remain, and lower context stays visible.

- [x] **Step 6: Run rail/view tests and observe failure**

Run:

```bash
bun run test -- src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
```

Expected: FAIL because the rail has legacy batch controls and no branch folder context.

- [x] **Step 7: Implement A-v2 composition and active folder view**

Compose `WorkspaceRepositoryRail` with a collapsible upper list and conditional lower list. `RepoView` selects `BranchWorkspacePane` for a tagged branch context; the pane combines the parent header/rail, explicit folder file tree, and branch workspace terminal panel without nested Git panels.

- [x] **Step 8: Extract pull-only behavior before deleting legacy modules**

Write failing pull plan/write tests copied down to the actual required behavior: configured repository order, current primary worktree branch, sequential pull, cancellation, retry, and no AGENTS sync. Implement `workspace-pull-*`, update route/client/rail labels to `workspace.pull-all`, and verify pull tests pass.

- [x] **Step 9: Remove legacy batch and AGENTS files and translations**

Delete only the files listed above after all imports have moved. Remove `workspace.batch.*`, legacy create/remove worktree keys, and `workspace.agents.write-failed`; retain any generic repository worktree strings still used elsewhere. Historic `AGENTS.md` files remain untouched.

- [x] **Step 10: Add four-language copy and run dictionary tests**

Add branch workspace, lifecycle, approval, collapse, repair, delete, and pull-all copy in English, Simplified Chinese, Japanese, and Korean. Run:

```bash
bun run test -- src/shared/i18n/dictionaries.test.ts
```

Expected: PASS with aligned placeholders and no empty values.

- [x] **Step 11: Run focused UI/server regression set**

Run:

```bash
bun run test -- src/server/modules/branch-workspace-source.test.ts src/server/modules/branch-workspace-materialization-source.test.ts src/server/modules/branch-workspace-read.test.ts src/server/modules/branch-workspace-plan.test.ts src/server/modules/branch-workspace-write-paths.test.ts src/server/modules/workspace-pull-plan.test.ts src/server/modules/workspace-pull-write-paths.test.ts src/server/routes/workspace.test.ts src/web/workspace-client.test.ts src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx src/web/components/RepoView.test.tsx
```

Expected: PASS.

- [x] **Step 12: Run full verification**

Run fresh commands:

```bash
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: all commands exit `0`; the full test count has zero failures.

---

## Plan Self-Review

- Spec coverage: Tasks 1–5 cover durable identity, local/SSH materialization, reconciliation, partial operations, repair, destructive approvals, provenance, and terminal shutdown. Tasks 6–9 cover protected folder capabilities, terminal integration, restorable selection, collapse, A-v2 UI, pull preservation, i18n, and AGENTS removal.
- Type consistency: `rootId`, `branchWorkspaceId`, persisted `path`, common `branch`, and repository `repositoryName` are used consistently across source, plan, boundary, query, navigation, terminal, and UI interfaces.
- State consistency: manifests/query snapshots are runtime-coherent; tagged selection, expansion, row order, and terminal selection are restorable in their documented owners; dialog inputs remain local.
- Safety consistency: modified copies, unmanaged content, outside-root sources, and descendant terminals require plan approvals; dirty/locked/primary worktrees, protected branches, path mismatches, stale plans, and terminal-close failures remain blockers.
- Placeholder scan: every task names concrete files, signatures, red/green commands, and expected outcomes; no unresolved implementation marker remains.
- Project-rule override: commit steps required by the generic planning template are intentionally omitted because this repository prohibits commits unless the user requests them.
