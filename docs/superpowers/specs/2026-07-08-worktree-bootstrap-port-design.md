# Worktree Bootstrap Port Design

> **Superseded (2026-07-29):** Hobgoblin no longer reads, previews, trusts, or generates `goblin.toml`. Worktree dependencies are now selected manually from immediate untracked source entries and materialized by copy or symlink. This document is retained as implementation history.

## Goal

Port the repo-configured worktree bootstrap feature into Hobgoblin's current codebase.

When a user creates a new Git worktree, Hobgoblin should read the repository's `goblin.toml` and optionally bootstrap the new worktree by copying, symlinking, hardlinking, and running a setup command. The port must support both local repositories and SSH remote repositories.

## Scope

In scope:

- Parse `[worktree]` configuration from `goblin.toml`.
- Support `copy`, `symlink`, `hardlink`, `exclude`, and `setup`.
- Preview bootstrap configuration when the create-worktree dialog opens.
- Run bootstrap after a successful worktree creation when the user-visible decision is `run`.
- Store a trusted `goblin.toml` config hash per repository.
- Preserve the current create-worktree dialog and branch-action flow.
- Support current local and SSH remote repository workflows.
- Keep this project's existing detached-worktree creation mode.
- Add focused tests for shared contracts, local bootstrap, remote bootstrap, service orchestration, settings trust state, and UI decision forwarding.

Out of scope:

- Migrating the source branch's newer create-worktree page structure.
- Replacing `repo-backend.ts` with the source branch's newer `repo-source.ts` layer.
- Adding a settings page for trusted bootstrap configs.
- Adding explicit Run / Skip buttons to the create-worktree form.
- Supporting extra `goblin.toml` fields beyond the source feature's `[worktree]` table.
- Running bootstrap before the worktree has been created.

## Existing Context

The source branch already has the feature implemented around these concepts:

- `src/shared/worktree-bootstrap-summary.ts` defines preview, summary, and run/skip decision types.
- `src/system/git/worktree-bootstrap.ts` owns local parsing, validation, materialization, and setup execution.
- The create-worktree request carries a `worktreeBootstrap` decision.
- Settings persist one trusted config hash per repository.
- The UI previews the config and lets the user trust the current hash.

The current Hobgoblin branch has drifted from the source branch:

- Repository operations still flow through `src/server/modules/repo-backend.ts`.
- HTTP routes parse request bodies directly rather than through `procedure-schemas.ts`.
- The create-worktree entry is still the branch-action dialog in `src/web/hooks/useBranchActionItems.ts`.
- `CreateWorktreeInput` still includes a `detached` mode.
- There is no `repo-settings.ts` shared module or worktree bootstrap contract yet.

The port should therefore adapt the behavior to the current architecture instead of cherry-picking the source branch's later feature structure.

## Recommended Approach

Use a targeted capability port.

Do not migrate the source branch's newer create-worktree page or repository-source refactor. Instead, introduce the smallest boundaries needed by the current project:

- Shared bootstrap contracts in `src/shared`.
- Local bootstrap execution in `src/system/git`.
- Remote bootstrap preview and execution in `src/system/ssh`.
- Server orchestration in the existing repo backend/write-path layers.
- UI preflight state in the existing create-worktree dialog host path.

This keeps the implementation aligned with the current codebase and avoids unrelated architectural churn.

## Configuration Contract

`goblin.toml` uses a `[worktree]` table:

```toml
[worktree]
copy = [".env"]
symlink = ["config/*.json"]
hardlink = ["cache/index.db"]
exclude = ["*.log"]
setup = "bun install"
```

Rules:

- All paths are repository-relative.
- Missing non-glob source paths are skipped and reported.
- Dynamic glob paths expand inside the source repository.
- `exclude` removes matching paths from `copy`, `symlink`, and `hardlink` operations.
- `setup` is optional and runs in the new worktree root after materialization.
- Empty or missing `[worktree]` means no bootstrap operations.

Invalid configuration:

- Non-table `[worktree]`.
- Non-array `copy`, `symlink`, `hardlink`, or `exclude`.
- Non-string entries in those arrays.
- Non-string `setup`.
- `setup` containing NUL.
- Absolute paths.
- Windows-rooted paths in config entries.
- Paths containing control characters.
- Paths containing `..`.
- Paths targeting `.git`.
- Negative glob patterns.
- Entries targeting the repository root.

## Shared Types

Add a shared bootstrap summary module with these responsibilities:

- `WorktreeBootstrapDecision`
  - `{ kind: 'skip' }`
  - `{ kind: 'run'; configHash: string; configTrusted: boolean }`
- `WorktreeBootstrapPreview`
  - Whether config exists.
  - Whether it has operations.
  - Config hash.
  - Operation counts.
  - Optional setup command.
- `WorktreeBootstrapSummary`
  - Compact path summaries for copied, symlinked, hardlinked, and skipped-missing paths.
  - Optional setup command.
- Summary formatting helpers for non-localized fallback messages.

Extend the create-worktree RPC envelope to include `worktreeBootstrap`.

The server should treat omitted or malformed `worktreeBootstrap` as invalid input at the route or write-path boundary. Internal call sites and tests can use `{ kind: 'skip' }` explicitly where bootstrap is intentionally not involved.

## Local System Design

Add `src/system/git/worktree-bootstrap.ts` using the source feature's responsibilities:

- Resolve the source repository root from the create-worktree `cwd`.
- Load `goblin.toml` from that root.
- Parse TOML with an exact pinned dependency.
- Hash raw config as `sha256:<hex>`.
- Validate all configured paths before executing.
- Expand glob patterns without following symlinks.
- Plan materialization operations before writing.
- Reject ambiguous paths that match multiple materialization modes.
- Reject nested destination conflicts.
- Refuse to overwrite existing destination paths.
- Reject symlink parents in source and target path ancestors.
- Copy directories and files without dereferencing symlinks.
- Create symlinks to absolute source paths.
- Create hardlinks only for files.
- Run setup with the target worktree as cwd and a finite timeout.

The local execution API should expose:

- `getWorktreeBootstrapPreview(sourceCwd, { signal })`.
- `bootstrapWorktreeAfterCreate(sourceCwd, targetWorktreePath, { signal, expectedConfigHash })`.

`expectedConfigHash` is required for a user-approved run. If the file changed after preview, bootstrap fails before materialization or setup.

## SSH Remote Design

Remote bootstrap should execute on the remote host, not locally.

Extend the current SSH command/script layer to support:

- `getRemoteWorktreeBootstrapPreview(target, options)`.
- `bootstrapRemoteWorktreeAfterCreate(target, worktreePath, options)`.
- `createRemoteWorktree(target, input)` followed by bootstrap when requested.

Remote behavior should mirror local semantics:

- Read `goblin.toml` from the remote repository root.
- Compute the same `sha256:<hex>` hash from the remote file content.
- Apply the same path validation rules.
- Expand globs on the remote host.
- Materialize files within the remote worktree.
- Run `setup` in the remote worktree shell.
- Refuse to run if the config hash changed after confirmation.

The remote implementation should use the existing SSH command testing pattern. Tests should assert generated script behavior and command results without requiring a real SSH server.

Remote preview failures do not block worktree creation. They only force the UI decision to `skip`.

## Server Orchestration

Extend `RepoBackend`:

- `getWorktreeBootstrapPreview(signal?)`.
- `createWorktree(input, signal?, options?: { worktreeBootstrap?: WorktreeBootstrapDecision })`.

Local backend:

- Preview delegates to local `getWorktreeBootstrapPreview`.
- Create delegates to local `createWorktree`.
- If creation succeeds and decision is `run`, call `bootstrapWorktreeAfterCreate`.
- If bootstrap succeeds, merge Git and bootstrap messages and include `worktreeBootstrap` summary.
- If bootstrap fails after creation, return a failed result that still indicates the repository changed.

Remote backend:

- Preview delegates to remote preview.
- Create delegates to remote create.
- If decision is `run`, call remote bootstrap after creation.
- Preserve the same partial-success semantics as local.

Extend `createRepositoryWorktree`:

- Validate `cwd`, worktree path, mode, and bootstrap decision.
- Serialize create-worktree operations per repository.
- Pass the bootstrap decision to the backend.
- After a successful bootstrap run, synchronize trusted config state.
- Publish repo snapshot invalidation after creation attempts that changed the repo.
- Publish settings invalidation when trust state changes.

The per-repo queue should cover Git worktree creation, bootstrap, trust sync, and invalidation. This avoids concurrent create operations racing on the same target paths or trusted hash state.

## Settings Trust State

Add a shared repo settings model:

- `RepoSettingsEntry`
- `WorktreeBootstrapTrust`
- `WORKTREE_BOOTSTRAP_CONFIG_HASH_RE`
- `isWorktreeBootstrapConfigHash`
- `isRepoWorktreeBootstrapConfigTrusted`

Persist `repoSettings` in `server-settings.json` as part of server settings data.

Expose `repoSettings: RepoSettingsEntry[]` through the full settings snapshot path so the create-worktree UI can derive the trusted state from the same settings query used by the rest of the renderer.

Normalization rules:

- Empty or non-string repo ids are dropped.
- Invalid hashes are dropped.
- A retained trust entry gets a server-generated `trustedAt` timestamp when written; persisted trust entries with a non-string timestamp are dropped during normalization.
- Repo settings entries with no retained fields are pruned.

Server write helpers:

- `trustServerRepoWorktreeBootstrapConfig({ repoId, configHash })`.
- `untrustServerRepoWorktreeBootstrapConfig({ repoId, configHash })`.

Trust sync semantics:

- Only sync trust after `createWorktree` and bootstrap both succeed.
- `configTrusted: true` writes the hash when not already trusted.
- `configTrusted: false` removes the matching hash when currently trusted.
- A settings write failure after a successful bootstrap returns a failed result with repository-changed semantics, because the worktree was still created.

Trust is scoped to repository id and exact config hash. Changing `goblin.toml` requires a new decision.

## HTTP And Client Contracts

Add route:

- `POST /api/repo/worktree-bootstrap-preview`
  - input: `{ cwd: string }`
  - output: `WorktreeBootstrapPreviewResult`

Extend route:

- `POST /api/repo/create-worktree`
  - input includes `worktreeBootstrap`.

Extend web client:

- `getRepositoryWorktreeBootstrapPreview(cwd, signal?)`.
- `createRepositoryWorktree(cwd, input, worktreeBootstrap, signal?, sourceToken?)`.

Extend embedded RPC metadata:

- `repo.worktreeBootstrapPreview`.
- `repo.createWorktree` request type includes `worktreeBootstrap`.

All imports should use repo aliases with explicit `.ts` / `.tsx` extensions.

## UI Design

Keep the current branch-action create-worktree dialog.

When the dialog opens:

- Start a bootstrap preview request for the session repo id.
- Read the current settings snapshot.
- Reset preflight state when the dialog closes or repo session changes.
- Abort stale preview requests.

Submission state:

- Disable submit while preview or relevant settings trust state is still loading.
- If preview fails, do not show bootstrap UI and submit `{ kind: 'skip' }`.
- If preview succeeds but has no operations, submit `{ kind: 'skip' }`.
- If preview succeeds and has operations, submit `{ kind: 'run', configHash, configTrusted }`.

Trust checkbox:

- Show only when preview succeeds, has operations, and has a config hash.
- Default checked state is whether the current repo settings trust the hash.
- User changes are retained for the open dialog session.
- Label uses the existing localized pattern: "Trust this config" / "信任当前 goblin.toml 配置".

Detached mode:

- Keep this project's detached worktree creation mode.
- Bootstrap runs consistently after any successful worktree creation mode when the decision is `run`.

The form should not add a separate Run / Skip control. The feature stays compact: successful preview means run once by default, and the checkbox only controls future trust.

## User Feedback

Success:

- Existing create-worktree success flow remains.
- If bootstrap produced details, success toast includes localized summary lines for copied, symlinked, hardlinked, skipped-missing, and setup.

Failure:

- Preview failure is silent in the form and forces skip.
- Create failure shows the existing Git error.
- Bootstrap failure after creation shows a bootstrap failure message and refreshes repo state so the new worktree is visible.
- Hash mismatch reports that `goblin.toml` changed after confirmation.

Do not show full expanded path lists in the dialog. Keep the detailed path summary in the post-action toast.

## Error Handling

Expected result classes:

- No config: `ok=true`, empty preview, create without bootstrap.
- Invalid config preview: `ok=false`, UI submits skip.
- Invalid config at run time: create has happened, bootstrap fails, repo refreshes.
- Config hash mismatch: create has happened, bootstrap does not run, repo refreshes.
- Missing source path: skip that path and include it in summary.
- Destination exists: bootstrap fails.
- Setup failure: bootstrap fails with setup output when available.
- Aborted request: return `cancelled`.

Partial-success rule:

If Git worktree creation succeeds but bootstrap or trust sync fails, the final result can be `ok=false`, but must carry enough signal for the web store to refresh the repository snapshot. This prevents the UI from hiding a worktree that already exists.

## Security Model

`setup` is a repository-configured command, so it is treated as user-authorized code execution only after an explicit create-worktree action.

Safety controls:

- Never run setup during preview.
- Re-read and hash-check config before execution.
- Reject unsafe paths before materialization.
- Do not overwrite existing target files.
- Do not follow symlink ancestors for source or target containment.
- Do not allow `.git` targets.
- Keep remote setup on the remote host.
- Use argv-based process execution where possible.
- Keep setup timeout finite.
- Respect abort signals.

The trust checkbox does not grant broad trust to a repository. It records one exact config hash for one repository id.

## Tests

System local:

- TOML parse success and errors.
- Config hash stability.
- Path validation rejects absolute, rooted, control, parent, root, `.git`, and negative glob entries.
- Glob expansion includes dot paths and ignores `.git`.
- Exclude removes nested copy paths.
- Copy preserves directories.
- Symlink creates links without dereferencing source symlinks.
- Hardlink rejects directories.
- Destination existing fails.
- Missing source is skipped and summarized.
- Setup success and failure.
- Hash mismatch prevents bootstrap execution.
- Abort returns cancelled.

System remote:

- Preview command returns the expected preview shape.
- Create then bootstrap runs in remote worktree.
- Remote setup failure returns a bootstrap failure.
- Hash mismatch prevents remote bootstrap execution.
- Remote path rules match local rules.
- Generated command/script tests do not require real SSH.

Server:

- Preview route delegates to the backend.
- Create route requires and forwards `worktreeBootstrap`.
- Local create `skip` does not call bootstrap.
- Local create `run` calls bootstrap after create.
- Remote create `run` calls remote bootstrap after create.
- Bootstrap failure after create still triggers repo invalidation.
- Trust write happens only after successful bootstrap.
- Trust unwrite happens only after successful bootstrap with `configTrusted=false`.
- Settings invalidation publishes when trust state changes.

Shared/settings:

- Repo settings normalize valid trust entries.
- Invalid hashes are dropped.
- `isRepoWorktreeBootstrapConfigTrusted` checks exact repo id and hash.
- Default settings snapshot includes empty repo settings.

Web:

- Dialog preview starts on open and aborts on close.
- Submit is disabled while preview/settings trust state is loading.
- Preview failure submits skip.
- No-operation preview submits skip.
- Operation preview submits run with config hash.
- Trusted hash defaults checkbox checked.
- Unchecked trusted hash submits `configTrusted:false`.
- Branch action forwards the decision to `createRepositoryWorktree`.
- Toast renders bootstrap summaries with localized messages.

Verification commands:

- `bun run typecheck`
- `bun run test`
- `bun run check:architecture`

## Principle Application

KISS:

- Keep the existing dialog and branch-action flow.
- Add only the server and system boundaries needed by the feature.

YAGNI:

- No new settings page.
- No run/skip button group.
- No new config fields.
- No repository-source refactor.

DRY:

- Shared preview and summary contracts are used by web, server, local, and remote code.
- Local and remote bootstrap use the same decision semantics and summary shape.

SOLID:

- Shared modules define data contracts.
- System modules own filesystem and shell behavior.
- Server modules own orchestration and invalidation.
- Web modules own presentation and user decision state.

## Acceptance Criteria

- Creating a local worktree with `goblin.toml` can copy `.env`, run setup, and show a bootstrap summary.
- Creating an SSH remote worktree with equivalent config performs the bootstrap on the remote host.
- A trusted config hash is reused for the same repo and hash.
- Changing `goblin.toml` after preview prevents bootstrap execution.
- Preview failure does not block ordinary worktree creation.
- Bootstrap failure after create refreshes repo state so the created worktree is visible.
- Detached worktree creation remains available in this project.
- Typecheck, tests, and architecture guard pass.
