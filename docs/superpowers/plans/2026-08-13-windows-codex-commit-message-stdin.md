# Windows Codex Commit Message Stdin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Windows command-line length failures when Codex generates a Git commit message.

**Architecture:** Keep the existing renderer, server, and system boundaries. At the system provider command boundary, pass a constant `-` argument to Codex and stream the already-bounded prompt through stdin; leave Claude and result parsing unchanged.

**Tech Stack:** TypeScript, Node.js strip-only mode, execa, Vitest, Bun

---

### Task 1: Reproduce the invocation regression in a focused test

**Files:**

- Modify: `src/system/commit-message-ai.test.ts`

- [x] **Step 1: Change the Codex invocation assertion to require stdin**

Update the focused invocation test to expect:

```ts
expect(mocks.execa).toHaveBeenCalledWith(
  'codex',
  ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '-'],
  expect.objectContaining({
    cwd: '/repo',
    input: expect.stringContaining('Return only the commit message.'),
    reject: false,
  }),
)
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts -t "invokes codex in JSONL"
```

Expected: FAIL because the implementation still puts the prompt in argv and sets stdin to ignore.

### Task 2: Send Codex prompts through stdin

**Files:**

- Modify: `src/system/commit-message-ai.ts`
- Modify: `src/system/commit-message-ai.test.ts`

- [x] **Step 1: Implement the minimal provider command change**

Use this Codex provider shape:

```ts
codex: {
  command: 'codex',
  args: () => ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '-'],
  input: (prompt) => prompt,
  outputMode: 'codex-jsonl',
},
```

- [x] **Step 2: Update prompt-content and fallback assertions**

Read Codex prompt assertions from the execa options' `input` property and require the resolved-executable fallback to use the same constant argv plus stdin contract. Leave Claude assertions unchanged.

- [x] **Step 3: Run the focused system test and verify GREEN**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts
```

Expected: PASS.

### Task 3: Verify project safety gates

**Files:**

- No production changes

- [x] **Step 1: Run type checking**

```sh
bun run typecheck
```

Expected: exit code 0.

- [x] **Step 2: Run the full test suite**

```sh
bun run test
```

Observed on Win11: 3997 tests passed and 111 unrelated existing platform-assumption tests failed. The focused Codex and cross-layer commit-message suites pass.

- [x] **Step 3: Run architecture validation**

```sh
bun run check:architecture
```

Expected: exit code 0.

- [x] **Step 4: Review the final diff**

Confirm that Codex alone changed transport from argv to stdin, no API contract changed, and no unrelated files were modified.
