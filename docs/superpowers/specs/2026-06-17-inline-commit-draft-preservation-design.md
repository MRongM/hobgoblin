# Inline Commit Draft Preservation Design

## Goal

Inline commit message generation must survive active project switches.

When a user starts AI commit-message generation in an inline commit form, switches to another open project, and later switches back, the original worktree should still have its inline commit form open. If generation completed while the project was hidden, the generated message should be visible when the user returns.

## Scope

In scope:

- Preserve inline commit draft state across active repo switches.
- Preserve in-flight AI commit-message generation across `RepoView` unmount/remount.
- Key drafts by `repoId + worktreePath`.
- Keep draft state renderer-local for the current window session.
- Keep current commit submission, provider detection, replacement confirmation, and inline error behavior.
- Abort generation only when the user explicitly cancels the draft or the provider unmounts.

Out of scope:

- Persisting commit drafts across app restarts.
- Synchronizing commit drafts across windows.
- Redesigning branch rows, branch action menus, or commit backend APIs.
- Adding background notifications for hidden completed generation.
- Garbage-collecting drafts for disappeared worktrees beyond explicit cancel or successful commit.

## Confirmed Decisions

- Use an app-level renderer-local draft provider.
- Key each draft by `repoId + worktreePath`, not by branch name.
- Switching projects must not abort generation.
- Switching back to the original project/worktree should reopen the inline form with the latest draft state.
- User cancel clears the draft and aborts its in-flight generation.
- Successful commit clears the draft.
- No design-doc git commit unless explicitly requested.

## Current State

`InlineCommitForm` currently stores its message and error with component-local `useState`.

`useCommitMessageGeneration` also keeps generation state inside the form subtree and aborts generation during cleanup:

- provider availability is loaded by the hook
- generation controller is stored in a ref
- cleanup aborts `generationAbortRef.current`

The active workspace renders only the current `visibleRepoId`. `App` wraps `RepoView` with an error boundary keyed by `visibleRepoId`, so switching projects unmounts the previous repo view. Since the inline commit form lives under a branch row inside that view, switching projects destroys its local draft and aborts generation.

This is a state ownership bug: the draft is short-lived interaction state, but it must outlive the currently visible repo subtree.

## Architecture

Add a small renderer-local `InlineCommitDraftProvider` under `App`, outside `RepoView`.

Recommended placement:

- inside the existing app shell provider stack
- outside `RepoView`
- near `TerminalSessionProvider` / `MainWindowNavigationProvider`

The provider owns only current-window interaction state. It must not write to session persistence, server runtime state, or `useReposStore` repo projections.

Drafts are stored by a stable key derived from:

```ts
repoId + "\0" + worktreePath
```

Each draft contains:

```ts
interface InlineCommitDraft {
  repoId: string
  worktreePath: string
  open: boolean
  message: string
  error: string | null
  generating: CommitMessageProvider | null
  pendingGeneratedMessage: string | null
}
```

The provider also keeps an internal map of in-flight `AbortController`s by draft key. Controllers should not be exposed to components.

## Component Design

### `InlineCommitDraftProvider`

Responsibilities:

- Open a draft for `repoId + worktreePath`.
- Update draft message and error.
- Start AI generation for a draft.
- Apply or clear pending generated messages.
- Clear a draft after cancel or successful commit.
- Abort a draft generation only on explicit cancel/clear.
- Abort all in-flight generation on provider unmount.

The provider should expose focused hooks, for example:

```ts
useInlineCommitDraft(repoId: string, worktreePath: string): InlineCommitDraft | null
useInlineCommitDraftActions(): InlineCommitDraftActions
```

`InlineCommitDraftActions` should include only UI-safe actions:

```ts
openDraft(repoId: string, worktreePath: string): void
clearDraft(repoId: string, worktreePath: string): void
setMessage(repoId: string, worktreePath: string, message: string): void
setError(repoId: string, worktreePath: string, error: string | null): void
generateMessage(input: GenerateInlineCommitMessageInput): Promise<void>
applyPendingGeneratedMessage(repoId: string, worktreePath: string): void
clearPendingGeneratedMessage(repoId: string, worktreePath: string): void
```

### `InlineCommitForm`

Convert `InlineCommitForm` from self-owned state to a controlled form.

It receives:

- `message`
- `error`
- `generating`
- `pendingGeneratedMessage`
- `availableProviders`
- `onMessageChange`
- `onErrorChange`
- `onGenerate`
- `onApplyPendingGeneratedMessage`
- `onClearPendingGeneratedMessage`
- `onClose`
- `onCommit`

It remains responsible for:

- rendering the textarea and buttons
- trimming submit input
- disabling commit while empty, committing, or generating
- showing replacement confirmation
- showing inline errors

It should not own generation lifecycle or abort behavior.

### Commit Message Generation

Move generation lifecycle out of the form subtree and into the draft provider.

Provider behavior:

1. Ignore generation if the draft is absent, already generating, or lacks `repoId/worktreePath`.
2. Create a controller for the draft and store it internally by draft key.
3. Set `generating` to the selected provider.
4. Clear draft error and pending generated message.
5. Call `generateRepositoryCommitMessage(repoId, worktreePath, provider, signal)`.
6. If aborted, return without writing an error.
7. If the result is not ok, write the formatted error.
8. If the current draft message is empty, write the generated message directly.
9. If the current draft message is non-empty, write `pendingGeneratedMessage`.
10. Clear `generating` only if the current controller still matches the completed request.

Provider availability can be loaded once inside the provider with `getCommitMessageProviders`. If loading fails, expose no provider buttons.

### `useBranchWriteActions`

Replace row-local inline commit state with draft provider calls.

The `Commit` action should call:

```ts
openDraft(repo.id, worktreePath)
```

`inlinePanel` should render when the current row's worktree has an open draft:

```ts
const draft = useInlineCommitDraft(repo.id, worktreePath)
draft?.open ? <InlineCommitForm ... /> : null
```

`handleCommit` continues to call `commitRepositoryChanges`. On success, clear the draft. On failure, leave the draft open and write the error.

## Data Flow

### Open Draft

1. User selects `Commit` from a branch row menu.
2. `useBranchWriteActions` calls `openDraft(repoId, worktreePath)`.
3. The matching branch row renders `InlineCommitForm`.
4. The form reads and writes draft state through provider actions.

### Generate Message While Switching Projects

1. User starts AI generation from the inline commit form.
2. Provider starts the generation request and stores its controller by draft key.
3. User switches to another project.
4. The previous `RepoView`, branch row, and form unmount.
5. Provider remains mounted, so the generation request continues.
6. The request completes and updates the draft.
7. User switches back.
8. The branch row remounts, reads the open draft, and renders the generated message.

### Cancel

1. User clicks Cancel in the inline commit form.
2. Provider aborts any in-flight generation for that draft.
3. Provider removes the draft.
4. The inline form disappears.

### Commit

1. User submits a non-empty trimmed message.
2. Existing commit API runs.
3. On success, provider clears the draft.
4. On failure, provider keeps the draft open and writes the error.

## Error Handling

- Provider availability failure results in no AI buttons.
- Generation failure writes the formatted provider error into the draft.
- Aborted generation does not show an error.
- Hidden generation completion updates draft state silently.
- Commit failure preserves message and writes the commit error.
- Commit success clears message, error, pending replacement, and in-flight controller.
- If a worktree disappears from the refreshed branch list, its draft may remain hidden in provider state. This is acceptable because drafts are session-local and bounded by explicit cancel, commit success, or app close.

## Testing

Focused tests should cover:

- `InlineCommitForm` renders controlled `message`, `error`, `generating`, and replacement confirmation state.
- Starting generation, unmounting the form, resolving the request, and remounting the form preserves the generated message.
- Switching active repo does not abort generation for a hidden draft.
- `repoId + worktreePath` drafts are isolated from other worktrees.
- Cancel aborts generation and clears the draft.
- Successful commit clears the draft.
- Failed commit preserves message and shows the error.
- Existing branch row `inlinePanel` rendering continues to work.

Verification commands:

```sh
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
bun run test src/web/hooks/useBranchActionItems.test.tsx
bun run typecheck
```

## Design Principles

- KISS: keep draft preservation in one focused provider instead of changing repo lifecycle or rendering multiple hidden repo views.
- YAGNI: do not persist drafts, sync them across windows, or add hidden-completion notifications.
- DRY: keep one generation implementation shared by all inline commit forms through the provider.
- SOLID: separate draft lifecycle from form rendering and branch action orchestration.
