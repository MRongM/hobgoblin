# Branch Created-From Metadata Design

## Goal

Replace the branch status “Baseline” signal, which currently reports whether a branch is merged into the repository default branch, with the branch name selected when Hobgoblin created that branch.

The new signal is creation provenance, not a commit-graph inference. It must remain stable when the default branch changes or when later merges alter branch ancestry.

## User Experience

- A non-default branch status shows “Created from” and the exact local or remote branch ref selected when Hobgoblin created it.
- A branch without recorded Hobgoblin creation metadata shows “unknown”. Hobgoblin does not guess from the commit graph or reflog.
- The default branch continues to omit this row, preserving the current status-panel density.
- “Copy all status details” includes the created-from label and its branch value or “unknown”.
- The former “included”, “unique commits”, and merge-status concepts are removed from this surface.

## Scope

Record provenance for every Hobgoblin flow that creates a local branch:

- direct branch creation records the selected `baseBranch`;
- new-branch worktree creation records the selected `baseRef`;
- branch workspace member creation records its repository-specific base branch through the existing new-branch worktree path; and
- remote-tracking branch creation records the selected `remoteRef`.

Existing-branch, detached-worktree, and worktree-only operations do not write provenance. Branches created outside Hobgoblin, and existing branches that predate this feature, remain unknown.

## Considered Approaches

### 1. Repository-local Git configuration

Store the selected source as `branch.<branch-name>.hobgoblin-created-from` in the repository's local Git configuration.

This is the selected approach. It is exact for Hobgoblin-created branches, survives app restarts, works through the same local and SSH Git boundaries as branch creation, and stays local to the repository rather than entering commits or remotes. Git's branch rename and deletion behavior also keeps branch-scoped configuration aligned with normal branch lifecycle operations.

### 2. Hobgoblin application-data registry

A server-owned registry could map repository and branch identities to source names. This avoids repository configuration writes but introduces repository identity, branch rename/delete reconciliation, persistence migration, and multi-client coherence concerns for metadata that naturally belongs beside a local branch.

This is rejected as unnecessary state ownership and synchronization complexity.

### 3. Git reflog or commit-graph inference

Reflog creation messages can contain the original start point, while merge-base heuristics can identify plausible ancestors.

This is rejected because reflogs expire or may be disabled, and graph-based candidates become ambiguous as history evolves. Neither provides stable creation provenance.

## Domain Contract

`BranchSnapshotInfo` replaces `mergedToDefault?: boolean` with `createdFrom?: string`.

- A non-empty `createdFrom` is the exact validated branch/ref name captured by a Hobgoblin creation flow.
- Absence means provenance is unavailable.
- The field is a read-model projection of repository-local Git configuration, not renderer-owned state.
- Restorable repo snapshots accept the optional field so warm restore can show the last authoritative value until refresh.
- Legacy cached `mergedToDefault` data is ignored during restore and is not migrated because it represents a different concept.

## Write Flow

Branch creation remains authoritative. After Git successfully creates a branch, the system writes the selected source name to the new branch's local configuration section.

Local creation uses argument-array Git execution. SSH creation extends the typed remote Git command boundary; renderer and route code never construct shell commands.

Metadata recording is non-critical follow-up work:

- a branch-creation failure performs no metadata write;
- a metadata-write failure does not roll back or report an otherwise successful branch/worktree creation as failed;
- the subsequent snapshot therefore reports unknown if metadata could not be persisted; and
- no rollback is attempted because worktree creation may already have checked out and bootstrapped the new branch.

The write is attached to the lowest shared creation paths so direct creation, ordinary worktree creation, and branch workspace orchestration cannot drift into separate implementations.

## Read Flow

Local snapshots read all Hobgoblin branch-source configuration entries in one Git command and project them onto the parsed local branch list.

SSH snapshots add a dedicated marked output section for the same configuration entries. The existing remote snapshot parser projects the section onto branches after parsing, keeping local and remote `BranchSnapshotInfo` semantics identical.

Malformed entries, empty values, values that fail branch/ref validation, command failure, and cancellation do not fail the whole repository snapshot. They are ignored, leaving affected branches without `createdFrom`.

The existing default-branch lookup and prioritization remain because they still drive default badges and branch ordering. The merged-to-default Git query and projection are removed.

## Renderer

`BranchStatus` replaces its conditional merge row with a conditional created-from row for non-default branches.

- Known values use the existing monospaced branch-value presentation.
- Missing values use a neutral “unknown” status chip.
- The row uses branch/provenance semantics rather than merge success or attention tones.
- Clipboard text mirrors the visible value.

Translation keys are renamed around created-from semantics in English, Simplified Chinese, Japanese, and Korean. Obsolete merge-status keys are removed when no longer referenced.

## Safety and Compatibility

- Branch and source names must pass the existing safe branch/ref validation before reaching Git configuration or SSH shell construction.
- Git commands continue to use argument arrays locally and typed, shell-quoted commands remotely.
- Metadata is repository-local and is never committed or pushed.
- No application-data migration is required.
- Old caches remain readable because the new field is optional and legacy unknown properties are discarded by snapshot parsing.
- Architecture boundaries remain unchanged: Git metadata is owned by system/server reads and writes, shared types define the transport contract, and the renderer only displays the projection.

## Testing

Follow red-green-refactor for each behavior:

- local branch helpers record direct, worktree, and remote-tracking creation sources only after successful creation;
- failed creation does not attempt source recording, while failed recording does not change creation success;
- source configuration parsing accepts valid entries and ignores malformed, unsafe, empty, or unrelated entries;
- local snapshots replace merged-to-default projection with created-from projection;
- SSH command tests cover safely quoted metadata writes and the new snapshot section;
- SSH snapshot parsing projects recorded sources and tolerates a missing section for compatibility;
- branch workspace tests verify that member creation reaches the existing new-branch worktree source-recording path without duplicate orchestration;
- persistence tests accept `createdFrom` and ignore legacy `mergedToDefault` data;
- renderer tests verify known/unknown display and copied status text.

Repository verification runs:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

## Out of Scope

- Backfilling existing branches from reflogs, action history, or commit ancestry.
- Synchronizing provenance across clones or remotes.
- Allowing users to edit the recorded source.
- Changing branch merge, deletion-safety, or default-branch behavior outside this status signal.
