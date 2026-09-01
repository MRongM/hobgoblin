# Windows Local File Path Bridge Design

## Goal

Give the primary application one lexical boundary for recognizing and comparing Windows, PowerShell, and WSL representations of the same local-host path. Use that boundary to make repository synchronization update the repository already in its project context instead of creating a second top-level project, and let the open-repository flow understand explicit Windows and WSL path forms.

## Product Boundary

This work targets the primary application under the root `src/` tree. The independent `windows/` package remains source-isolated and is not an acceptance target.

Repository synchronization retains its existing product meaning: fetch remote-tracking refs and refresh runtime state for the selected repository. It must not open or import a project, change configured workspace membership, move a branch, or update a worktree.

The bridge covers paths on the local Windows host and its registered WSL distributions. SSH repository paths remain remote POSIX paths and do not participate.

## Root Cause

Local workspace discovery stores member identifiers with Node's native Windows spelling, such as `C:\workspace\api`. Git for Windows can report the same root as `C:/workspace/api` and can differ in drive or directory letter case. During synchronization, capability reprobe currently uses the Git-reported spelling as a new repository identifier and performs an exact object-key lookup. The store therefore inserts a duplicate repository without its workspace membership or existing remote state, places it in the top-level project order, and may skip fetch on that duplicate because it initially has no known remotes. The original workspace member remains stale.

macOS does not normally expose this representation mismatch, which is why the same flow appears correct there.

## Design Alternatives

### Patch only the synchronization call site

Compare the probed root with the current repository using the existing `sameLocalHostPath` helper. This is the smallest change, but it leaves WSL locator and UNC recognition fragmented and allows later code to repeat the same exact-key mistake.

### Expand `path-semantics.ts` with more free functions

Add WSL UNC and locator parsing beside the existing path helpers. This keeps the file count low, but mixes worktree-relative calculations with project identity, execution-environment selection, and user-input projection.

### Add a typed local-file-path bridge

Create a focused shared pure-function module layered on the existing path and remote-repository primitives. It classifies syntax, produces a stable identity, retains an authoritative execution locator, and performs only explicit conversions. Repository lifecycle and open-project consumers use this canonical module.

This is the selected approach because it fixes the current defect and establishes one testable boundary without coupling shared code to the filesystem, WSL processes, Git, Electron, or renderer state.

## Path Model

The bridge accepts an optional explicit context:

- Windows context means an ordinary local project executed by native Windows Git.
- WSL context includes a distribution name and means a WSL project executed inside that registered distribution.
- POSIX context represents a non-Windows local host and preserves case-sensitive POSIX identity.

It returns a discriminated resolution containing:

- the recognized input kind;
- the execution environment: `windows`, `wsl`, or `posix`;
- a stable comparison identity;
- an authoritative project locator suitable for the existing open-repository boundary;
- Windows or Linux operational path details when a lossless explicit conversion exists.

The core API is pure and nullable at untrusted boundaries:

```ts
resolveLocalFilePath(input, context?): LocalFilePathResolution | null
localFilePathIdentityKey(input, context?): string | null
sameLocalFilePath(left, right, contexts?): boolean
```

Exact type names may be adjusted during implementation for local conventions, but the discriminated data and failure semantics are fixed by this design.

## Recognition Matrix

| Input | Resolution | Stable equivalence |
| --- | --- | --- |
| `C:\repo` | Windows drive path | Same as `C:/repo` and `/mnt/c/repo` |
| `C:/repo` | Windows drive path | Same as `C:\repo` and `/mnt/c/repo` |
| `/mnt/c/repo` | Standard WSL Windows-drive mount | Same Windows identity, with a native Windows locator |
| `\\server\share\repo` | Ordinary Windows UNC path | Case-insensitive Windows UNC identity |
| `wsl://Ubuntu/home/dev/repo` | WSL repository locator | Same as either supported WSL UNC spelling for Ubuntu |
| `\\wsl.localhost\Ubuntu\home\dev\repo` | WSL UNC path | WSL identity for Ubuntu and `/home/dev/repo` |
| `\\wsl$\Ubuntu\home\dev\repo` | Legacy WSL UNC path | WSL identity for Ubuntu and `/home/dev/repo` |
| `/home/dev/repo` with Ubuntu WSL context | WSL Linux path | Same WSL identity as the Ubuntu locator and UNC forms |
| `/home/dev/repo` without WSL context | POSIX path | Never guesses a WSL distribution |

Windows drive and ordinary UNC identity is case-insensitive. WSL distribution identity is case-insensitive because it is selected through the Windows WSL registry boundary, while the Linux path portion remains case-sensitive. POSIX identity remains case-sensitive.

Normalization is lexical: repeated separators and `.`/`..` segments are collapsed without reading the filesystem. Inputs containing NUL, incomplete drive roots, incomplete UNC shares, missing WSL distributions, or non-absolute paths fail recognition. The bridge does not resolve symlinks, junctions, subst drives, custom WSL automount roots, network share aliases, or physical inode identity.

## Execution Environment Invariant

Identity and execution are related but not interchangeable.

- A Windows drive form and its standard `/mnt/<drive>` form identify a Windows project and produce a native Windows project locator.
- A WSL locator, WSL UNC path, or Linux path with explicit WSL context identifies a WSL project and produces the existing `wsl://<distribution>/<path>` locator.
- The current terminal shell does not select or change the project's Git backend.
- A PowerShell process can open a WSL project through an explicit WSL form; a WSL shell can identify a Windows project through `/mnt/<drive>`.
- Existing repository state remains authoritative after opening. The bridge never silently migrates a project between Windows and WSL execution.

## Repository Synchronization Flow

Capability reprobe receives both the current repository identifier and Git's reported root. Before any store write, it resolves their local-file identities.

If the identities match, the existing repository identifier remains the canonical store key. The refreshed capability is applied to that existing entry, preserving its `workspaceRootId`, remote configuration, selection state, and project-order membership. Fetch and the final snapshot/status refresh therefore run against the original repository state.

If the identities do not match, synchronization fails safely with a diagnostic rather than opening or importing the reported root. A genuine repository-root relocation belongs to an explicit open/import flow, not synchronization.

The reprobe write path never inserts the probed spelling. Broader canonicalization of every repository-open and workspace-discovery write path is deferred until a concrete caller requires it, avoiding an eager migration of saved project identifiers and workspace candidate ids.

No automatic deletion is performed for duplicates already persisted in user sessions, because an equivalent repository may have been intentionally opened as its own project as well as used as a workspace member. Cleanup needs a separately reviewable migration policy.

## Open Repository Adaptation

The open-repository dialog projects recognized explicit input into the existing source model:

- a Windows drive, ordinary UNC, or standard `/mnt/<drive>` input selects Local and supplies the native Windows locator;
- a `wsl://` or WSL UNC input selects WSL and fills both distribution and Linux path;
- a Linux absolute path entered while WSL is already selected retains that selected distribution;
- a Linux absolute path without a WSL distribution is not guessed and remains invalid until context is supplied.

Recognition happens as deterministic form projection. Availability checks, registered-distribution validation, and repository probing remain at their existing system boundaries. Manually toggling the source remains possible and does not rewrite unrelated saved state.

## Compatibility And Migration

The bridge supersedes scattered local-host equality helpers at repository lifecycle and other identity-sensitive consumers. Existing worktree-relative path functions remain in `path-semantics.ts`; they solve containment and relative-path calculations rather than project identity.

Saved local repository identifiers are not eagerly rewritten. Callers compare through bridge identities and retain their established canonical store keys, avoiding session churn. Existing `wsl://` identifiers remain the authoritative persisted WSL locator format.

## Failure And Safety Semantics

- Invalid or ambiguous input returns `null` at parsing boundaries and a localized validation error at UI or command boundaries.
- Synchronization never inserts a project as a side effect of a path spelling mismatch.
- A mismatched reprobe root aborts before fetch rather than fetching or mutating an unexpected repository.
- Network Git remains cancellable and coalesced by the existing repository operation path.
- No destructive Git command, filesystem mutation, package change, or path-based command construction is introduced.

## Verification

Focused tests prove:

- all Windows drive, separator, letter-case, and standard WSL mount variants share one identity;
- ordinary UNC identity remains Windows-local and distinct from WSL UNC;
- both WSL UNC hosts and `wsl://` normalize to one distribution-scoped, Linux-case-sensitive identity;
- bare Linux paths require explicit WSL context and never guess a distribution;
- SSH repository identifiers and relative or malformed paths are rejected by the local bridge;
- capability reprobe retains the original workspace-member key, membership, remotes, and project order when Git reports an equivalent Windows spelling;
- synchronization fetches and refreshes that original member without adding a top-level project;
- a genuinely different reprobe root fails without store insertion;
- the open dialog adapts explicit Windows, `/mnt/<drive>`, WSL locator, and WSL UNC input while preserving ambiguous-input validation;
- existing local POSIX, worktree, terminal, workspace, WSL, and SSH behavior remains unchanged.

Repository verification runs:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

A packaged Windows smoke test should cover Git-for-Windows root spelling, PowerShell paste, `\\wsl.localhost`, `\\wsl$`, and registered WSL distribution behavior.

## Non-Goals

- Pulling, rebasing, merging, resetting, or checking out branches during synchronization.
- Importing repositories discovered during synchronization.
- Automatically removing already-persisted duplicate projects.
- Guessing a WSL distribution for a bare Linux path.
- Supporting custom WSL automount roots or arbitrary path aliases.
- Resolving symlinks, junctions, subst mappings, or network-share physical identity.
- Changing SSH path semantics or choosing Git from the current internal-terminal shell.
- Modifying the independent `windows/` package.
