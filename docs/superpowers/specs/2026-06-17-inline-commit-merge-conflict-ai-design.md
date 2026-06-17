# Inline Commit And Merge Conflict AI Handoff Design

## Goal

Branch write actions should support two focused UX improvements:

- `Commit` should not open a global blocking dialog. It should expand an input form directly under the target branch row and close after a successful commit.
- `Merge` should keep the existing merge dialog. When Git leaves the worktree in a merge-conflict state, the dialog should show AI handoff buttons for available providers. Clicking a provider opens or selects the worktree terminal and fills the terminal external input with a conflict-resolution command. It must not execute the command automatically.

## Scope

In scope:

- Replace the branch-menu `Commit` dialog with an inline branch-row commit form.
- Reuse existing commit backend, commit-message provider detection, and commit-message generation behavior.
- Keep the existing `MergeDialog` surface.
- Classify merge failures so the UI can distinguish real merge conflicts from ordinary Git errors.
- Show available `Codex` / `Claude` handoff buttons only for merge conflicts.
- Open or select the target worktree terminal and prefill the terminal external input.
- Keep provider command text editable by the user before execution.

Out of scope:

- Automatically resolving conflicts inside the app.
- Automatically running `codex`, `claude`, `git add`, `git commit`, or `git merge --continue`.
- Moving merge errors into the branch row.
- Redesigning the full branch action menu.
- Adding a global AI settings page.

## Confirmed Decisions

- Use the inline layout directly below the selected branch row.
- Keep merge failure AI controls inside the existing merge dialog error area.
- Show provider-specific buttons for available `Codex` and `Claude` tools.
- Clicking a provider only fills the worktree terminal input. It does not send Enter and does not write directly to the PTY.
- Do not create a design-doc commit unless explicitly requested.

## Current State

The current branch write implementation keeps commit and merge inside `src/web/components/branch-list/BranchWriteDialogs.tsx`.

- `CommitDialog` is a global `FormDialog` with message input and optional commit-message generation buttons.
- `MergeDialog` is a global `FormDialog` that shows raw errors inside the dialog.
- `useBranchWriteActions` owns dialog state and calls:
  - `commitRepositoryChanges(repoId, worktreePath, message)`
  - `mergeRepositoryBranch(repoId, worktreePath, branch)`
- Local and SSH-backed remote repositories share `RepoBackend` boundaries.
- `TerminalSlot` already supports an external terminal input and has local `fillExternalInput(value)` logic, but that capability is not exposed to branch actions.

## UX Design

### Inline Commit

When the user selects `Commit` from a branch row menu, that branch row expands a compact inline form under the branch summary.

The form contains:

- Commit message textarea.
- Available `Codex` / `Claude` commit-message generation buttons.
- Cancel button.
- Commit button.
- Inline error area.

The expanded form affects only the target row height. The rest of the branch list, toolbar, detail panel, and other branch menus remain interactive.

On successful commit, the form closes automatically. On failure, it stays open and preserves the message.

### Merge Conflict AI Handoff

`MergeDialog` keeps its current branch selector and confirm flow.

When merge fails:

- Ordinary failures show only the existing error text.
- Merge conflicts show the error text plus available AI handoff buttons.

Clicking `Codex` or `Claude`:

1. Opens or selects the target worktree terminal.
2. Fills the terminal external input with a provider-specific command.
3. Focuses the input.
4. Leaves the merge dialog open so the user can still read the original merge error.

The user must review and execute the command manually.

## Component Design

### `BranchRow`

`BranchRow` should remain a presentation component for branch selection, summary, drag handle, and action menu placement.

Add a narrow optional render slot:

```ts
inlinePanel?: ReactNode
```

The row renders `inlinePanel` below the branch summary/action row. It does not own commit state or call commit APIs.

### `InlineCommitForm`

New component responsible for:

- Controlled commit-message state.
- Submitting the commit.
- Displaying commit errors.
- Provider availability UI.
- Commit-message generation.
- Replacement confirmation when generated text would overwrite existing text.

The form receives:

```ts
interface InlineCommitFormProps {
  repoId: string
  worktreePath: string
  onCommit: (message: string) => Promise<void>
  onClose: () => void
}
```

The implementation should extract shared commit-message generation behavior from the existing `CommitDialog` rather than duplicating it. A small hook such as `useCommitMessageGeneration` is sufficient.

### `useBranchWriteActions`

Keep owning branch write action state.

Replace commit dialog state with inline state, for example:

```ts
type InlineCommitState = {
  repoId: string
  branchName: string
  worktreePath: string
} | null
```

Return an inline render artifact in addition to existing menu items and dialogs:

```ts
interface BranchWriteActions {
  mainItems: BranchActionItem[]
  destructiveItems: BranchActionItem[]
  dialogs: ReactNode
  inlinePanel: ReactNode
}
```

Only the row that owns the active `repoId + branchName + worktreePath` renders the panel.

### `MergeDialog`

Extend merge failure handling to keep the existing error text and add a conflict-action area only when the merge result is classified as a conflict.

The dialog should not string-match all failures in the renderer. It should receive or derive a structured conflict reason from the merge result.

### `useMergeConflictAiActions`

New focused hook responsible for:

- Probing available commit/AI providers through the existing provider detection path, or a shared provider-detection helper if naming is generalized.
- Building the provider command text.
- Ensuring the worktree terminal exists and is selected.
- Filling the terminal external input through a narrow terminal command bridge.

It does not run Git commands and does not write directly to terminal PTY input.

## Data Flow

### Inline Commit

1. User selects `Commit`.
2. `useBranchWriteActions` sets `inlineCommit`.
3. `BranchRow` renders `InlineCommitForm` under the matching branch row.
4. User enters a message or generates one.
5. Submit calls `commitRepositoryChanges(repoId, worktreePath, message)`.
6. The existing server route commits through `RepoBackend`.
7. On success, result state updates and the inline form closes.
8. On failure, the form remains open and shows the error.

### Merge Conflict Handoff

1. User selects a source branch in `MergeDialog`.
2. Submit calls `mergeRepositoryBranch(repoId, worktreePath, sourceBranch)`.
3. Backend attempts the merge.
4. If Git leaves unmerged entries in the target worktree, the returned result includes `reason: 'merge-conflict'`.
5. Renderer shows provider buttons only for that reason.
6. Provider click ensures/selects the terminal for `{ repoRoot: repoId, branch: targetBranch, worktreePath }`.
7. Renderer fills the terminal external input with the command text and focuses the input.

## Result Classification

Extend `ExecResult` compatibly with an optional reason:

```ts
interface ExecResult {
  ok: boolean
  message: string
  reason?: 'merge-conflict'
}
```

Existing callers remain compatible because `reason` is optional.

For merge operations:

- Local backend should check worktree status after a failed merge and set `reason: 'merge-conflict'` only when unmerged entries are present.
- Remote backend should perform the same check through existing SSH status commands.
- Invalid branch names, missing branches, auth failures, timeouts, network failures, and ordinary Git errors should not get the conflict reason.

The status-based check is preferable to renderer string matching because it reflects Git state instead of stderr wording.

## Terminal Prefill

The terminal already has external input state inside `TerminalSlot`, but branch actions cannot currently fill it.

Add a narrow bridge:

```ts
interface TerminalSessionCommandBridge {
  worktreeSnapshot: (worktreeTerminalKey: string) => WorktreeTerminalSnapshot
  createTerminal: (base: TerminalSessionBase) => Promise<string>
  selectTerminal: (worktreeTerminalKey: string, key: string) => void
  fillExternalInput: (worktreeTerminalKey: string, value: string) => boolean
}
```

`TerminalSlot` registers a fill handler for its worktree while its external input is mounted and controller-owned. Calling `fillExternalInput` should:

- Set the external input value.
- Focus the input.
- Place the cursor at the end.
- Return `true` when the fill succeeded.
- Return `false` when the input is unavailable.

It must not call `writeInput`.

If terminal external input is disabled, AI handoff buttons should be disabled with a title or tooltip explaining that external input must be enabled. They should not fall back to executing text directly.

## AI Command Text

The command should be provider-specific and conservative. It should ask the tool to inspect and resolve current merge conflicts in the current working tree.

Example command shapes:

```text
codex exec --skip-git-repo-check "Resolve the current Git merge conflicts in this working tree. Inspect conflicted files, make minimal edits, and do not run git add, git commit, or git merge --continue."
```

```text
claude --print "Resolve the current Git merge conflicts in this working tree. Inspect conflicted files, make minimal edits, and do not run git add, git commit, or git merge --continue."
```

The exact command builder should live in a small shared helper and be covered by tests. The command is inserted as editable text, so the user can adjust it before running.

## Error Handling

### Inline Commit

- Empty trimmed messages disable the commit button.
- Submitting disables form controls until completion.
- Commit failures preserve the message and show inline error text.
- Commit-message generation failures show inline error text and do not block manual commit.
- Generated replacements require confirmation when the textarea already contains text.
- Cancel closes only the inline form.

### Merge Dialog

- Ordinary merge errors keep current behavior.
- Conflict errors show provider buttons only when provider availability is known.
- Provider detection failures do not hide the merge error.
- No available provider means no provider buttons.
- Terminal open/create failure shows an inline error in the merge dialog.
- External input unavailable disables handoff buttons rather than executing anything.

## Security And Safety

- No AI command is auto-executed.
- The renderer does not write directly to PTY input for handoff.
- No automatic `git add`, `git commit`, or `git merge --continue`.
- Merge conflict state remains visible in Git status until the user resolves it.
- Provider commands are generated locally and editable before execution.
- Existing remote/local backend boundaries are preserved.

## Testing

### Component Tests

- `Commit` action renders `InlineCommitForm` only under the target branch row.
- Other branch rows remain selectable and menus remain usable while the form is open.
- Successful commit closes the form.
- Failed commit keeps the form open with the message preserved.
- Provider buttons render according to provider availability.
- Commit-message generation fills empty input.
- Generated text asks before replacing existing input.
- Generation failures render inline errors.

### Merge Dialog Tests

- Ordinary merge errors do not render AI buttons.
- `reason: 'merge-conflict'` renders available provider buttons.
- Provider button click requests terminal creation/selection and calls `fillExternalInput`.
- Provider button click does not call terminal `writeInput`.
- External input unavailable disables or fails gracefully with an inline error.

### Backend/System Tests

- Local merge conflict result includes `reason: 'merge-conflict'`.
- Local non-conflict merge failure does not include the reason.
- Remote merge conflict result includes `reason: 'merge-conflict'`.
- Remote non-conflict merge failure does not include the reason.
- Optional `ExecResult.reason` does not break existing callers.

### Terminal Tests

- `TerminalSlot` exposes fill handler only when controller-owned external input is mounted.
- `fillExternalInput` updates the draft and focuses the input.
- `fillExternalInput` does not call `writeInput`.
- Command bridge creates/selects the worktree terminal before filling.

## Verification

Implementation should pass:

```text
bun run typecheck
bun run test
bun run check:architecture
```

Manual verification:

1. Open a repository with a dirty worktree.
2. Select `Commit` from a branch row and confirm the form expands under that row.
3. Confirm other branch rows and detail panels remain interactive.
4. Commit successfully and confirm the form closes.
5. Trigger a commit failure and confirm the form preserves input and shows an inline error.
6. Trigger a merge conflict.
7. Confirm the merge dialog shows the original error plus available provider buttons.
8. Click a provider and confirm the worktree terminal is opened or selected.
9. Confirm the terminal external input contains the command and has not executed it.
10. Trigger an ordinary merge failure and confirm no AI handoff buttons appear.
