# Inline AI Commit And Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is explicitly assigned to inline execution in the current session; do not dispatch subagents.

**Goal:** Add an opt-in switch before the inline commit form's AI provider buttons so one click can generate a commit message, commit the worktree, and trigger the existing push action in order.

**Architecture:** Keep the switch as component-local state and extend the existing draft generation action to return its successful message. Let `InlineCommitForm` own the one-click orchestration while reusing `onCommitAndPush`; keep provider state, Git commit, protected-branch confirmation, push execution, and result reporting in their current owners.

**Tech Stack:** React 19, Radix `Switch`, TypeScript 6 strip-only mode, Vitest, React DOM jsdom tests, existing repository client and branch action write paths.

## Global Constraints

- Do not add runtime TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- The switch is local, defaults off for every form mount, and is never persisted or synchronized.
- Do not add a package, server endpoint, realtime path, settings field, Zustand field, or Git command implementation.
- Reuse the existing commit-then-push path and protected-branch confirmation behavior.
- Keep all examples, tests, and docs privacy-safe with generic paths and messages.
- Do not create a branch or run `git commit`; the user did not authorize Git mutations.
- Follow RED-GREEN-REFACTOR and verify with target Vitest, `bun run typecheck`, `bun run check:architecture`, and `bun run test`.

---

### Task 1: Return The Generated Commit Message

**Files:**

- Modify: `src/web/components/branch-list/InlineCommitDraftProvider.tsx`
- Test: `src/web/components/branch-list/InlineCommitDraftProvider.test.tsx`

**Interfaces:**

- Consumes: `generateRepositoryCommitMessage(repoId, worktreePath, provider, signal)`.
- Produces: `InlineCommitDraftActions.generateMessage(input): Promise<string | null>`; success returns the same message written or staged as a replacement, while all ignored, failed, and cancelled paths return `null`.

- [x] **Step 1: Write a failing return-contract test**

Add a result slot to `DraftControls` and a test that awaits `actions.generateMessage(...)`:

```tsx
test('returns the generated message to the caller', async () => {
  renderProvider(<DraftHarness readerVisible />)
  await flush()
  click('[data-action="open"]')
  click('[data-action="generate-result"]')
  await flush()

  expect(text('[data-slot="generation-result"]')).toBe('feat: generated message')
})
```

The harness button stores `message ?? ''` in local state. Run:

```bash
bun run test -- src/web/components/branch-list/InlineCommitDraftProvider.test.tsx
```

Expected: FAIL because the current action resolves without a value.

- [x] **Step 2: Implement the minimal return contract**

Change the public action type and implementation:

```ts
generateMessage: (input: GenerateInlineCommitMessageInput) => Promise<string | null>
```

Every early exit, abort, provider failure, and caught exception returns `null`; after the existing successful draft update, return `result.message`. Keep the current `finally` cleanup unchanged.

- [x] **Step 3: Verify Task 1 green**

Run the target test again. Expected: all `InlineCommitDraftProvider` tests pass with no new warning or error.

### Task 2: Add The Switch And Auto Pipeline

**Files:**

- Modify: `src/web/components/branch-list/InlineCommitForm.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`

**Interfaces:**

- Consumes: `onGenerate(provider): Promise<string | null>` and existing `onCommitAndPush(message): Promise<void>`.
- Produces: local `autoCommitAndPush` intent and a single-flight `generate -> commitAndPush` handler.

- [x] **Step 1: Write failing form tests**

Add tests requiring:

```ts
expect(switchByLabel('action.commit-auto-commit-and-push').getAttribute('aria-checked')).toBe('false')
expect(
  switchByLabel('action.commit-auto-commit-and-push').compareDocumentPosition(buttonByProvider('codex')) &
    Node.DOCUMENT_POSITION_FOLLOWING,
).not.toBe(0)
```

Add an auto-flow test where `onGenerate` resolves to `feat: generated message`; enable the switch, click `Codex`, and assert `onCommitAndPush` receives that exact message once and `onClose` runs. Add a failure test where `onGenerate` resolves to `null` and assert neither commit callback runs.

Run:

```bash
bun run test -- src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: FAIL because the switch and automatic orchestration do not exist.

- [x] **Step 2: Implement the compact switch**

Import `useState` and the existing `Switch`. Render a compact labelled switch before the provider buttons only when `onCommitAndPush` exists:

```tsx
<label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
  <Switch
    checked={autoCommitAndPush}
    disabled={isPending || generating !== null}
    aria-label={t('action.commit-auto-commit-and-push')}
    title={t('action.commit-auto-commit-and-push')}
    onCheckedChange={setAutoCommitAndPush}
  />
  <span>{t('action.commit-auto-commit-and-push')}</span>
</label>
```

- [x] **Step 3: Implement the single-flight pipeline**

Change `onGenerate` to return `Promise<string | null>`. When the switch is off, preserve ordinary generation. When it is on, call `run('commitAndPush', ...)`, await generation, replace the visible draft with the returned message, clear any pending replacement, and await the existing `onCommitAndPush`. Reuse one `submitAndClose` helper for manual and automatic submission error handling.

- [x] **Step 4: Verify Task 2 green**

Run the target test again. Expected: all `BranchWriteDialogs` tests pass.

### Task 3: Wire Copy And End-To-End Behavior

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`

**Interfaces:**

- Consumes: the existing `useBranchWriteActions` wiring, `commitRepositoryChanges`, and `actions.push`.
- Produces: translated `action.commit-auto-commit-and-push` copy and integration proof that the existing write path is used.

- [x] **Step 1: Add a failing integration test**

Configure Codex availability and push capability, open the inline commit form, enable the new switch, click `Codex`, and assert this order-facing outcome:

```ts
expect(repoClientMocks.generateRepositoryCommitMessage).toHaveBeenCalledWith(
  '/tmp/repo',
  '/tmp/repo-feature',
  'codex',
  expect.any(AbortSignal),
)
expect(repoClientMocks.commitRepositoryChanges).toHaveBeenCalledWith(
  '/tmp/repo',
  '/tmp/repo-feature',
  'feat: generated message',
)
expect(push).toHaveBeenCalledTimes(1)
```

Run:

```bash
bun run test -- src/web/hooks/useBranchActionItems.test.tsx
```

Expected: FAIL until the switch/copy is wired through the real provider and hook tree.

- [x] **Step 2: Add all four translations**

Add the same key beside the existing commit generation labels:

```ts
// zh
'action.commit-auto-commit-and-push': '生成后提交并推送',
// en
'action.commit-auto-commit-and-push': 'Commit and push after generating',
// ja
'action.commit-auto-commit-and-push': '生成後にコミットしてプッシュ',
// ko
'action.commit-auto-commit-and-push': '생성 후 커밋하고 푸시',
```

- [x] **Step 3: Verify target behavior and dictionaries**

Run:

```bash
bun run test -- src/web/components/branch-list/InlineCommitDraftProvider.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx src/web/hooks/useBranchActionItems.test.tsx src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: all selected test files pass.

### Task 4: Full Verification

**Files:**

- Review: `CONTEXT.md`
- Review: `docs/superpowers/specs/2026-07-31-inline-ai-commit-and-push-design.md`
- Review all implementation changes with `git diff --check` and `git diff`.

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: a verified, architecture-safe feature with no unrelated changes.

- [x] **Step 1: Run static and architecture checks**

```bash
bun run typecheck
bun run check:architecture
```

Expected: both commands exit 0.

- [x] **Step 2: Run the full suite**

```bash
bun run test
```

Expected: all test files and tests pass; known jsdom canvas/focus notices may remain unchanged from baseline.

- [x] **Step 3: Inspect the final diff**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: only the approved inline AI commit-and-push behavior, tests, translations, glossary entry, design, and plan are changed; no package, generated, branch, or commit changes exist.
