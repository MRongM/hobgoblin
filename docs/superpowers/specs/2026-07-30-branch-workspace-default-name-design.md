# Branch Workspace Default Name Design

## Goal

When the user opens the New branch workspace dialog, prefill the common branch name with `feat/YYYYMMDD`, using the renderer's local calendar date.

## Behavior

- Initialize the editable common branch name each time the create dialog opens.
- Use exactly `feat/` followed by an eight-digit local date, for example `feat/20260730`.
- Do not update an already-open dialog when midnight passes.
- Do not overwrite user input when repository or dependency snapshots refresh.
- Keep extension and other existing-workspace flows unchanged; they continue to show the workspace's persisted common branch name.
- Do not invent collision suffixes. Existing planning validation reports duplicate or invalid branch names, and the user can edit the proposed value.

## Architecture

The value remains component-local interaction state in `BranchWorkspaceDialog`. A feature-local pure helper formats the default from an optional `Date`, and the existing open-reset effect calls it only in create mode. No server contract, persistence, realtime path, translation, or shared domain model changes are required.

The ordinary worktree dialog already proposes `feat/YYYYMMDD-<current-branch>`. Its suffix policy is different from the branch workspace requirement, so coupling the two components or introducing a configurable naming abstraction would add unnecessary scope. The small branch-workspace helper keeps the behavior explicit and testable.

## Testing

- Freeze the local clock and verify that create mode prefills `feat/20260730`.
- Preserve existing coverage proving dependency refresh does not reset form input.
- Preserve existing coverage proving extend mode displays the persisted common branch name.
- Run the focused component suite, type checking, the full test suite, and the architecture guard.

## Documentation Decision

This change uses the existing **Branch workspace** and common branch name concepts. It adds no domain term and makes no hard-to-reverse architectural decision, so `CONTEXT.md` and ADRs remain unchanged.
