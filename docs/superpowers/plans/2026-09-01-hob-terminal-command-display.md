# Hob Terminal Command Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display `hob /path/to/repo` as the terminal-open command in every maintained settings dictionary.

**Architecture:** Preserve the existing settings component and `hob` launcher. Update the shared localization value in the primary application and independent `windows/` package, with their dictionary tests enforcing the exact user-facing command.

**Tech Stack:** TypeScript, Vitest, Bun

## Global Constraints

- Do not change launcher behavior, project import, packaging, installation, or settings UI structure.
- Keep English, Simplified Chinese, Japanese, and Korean values identical.
- Keep the primary application and `windows/` package aligned.
- Do not create a Git commit without explicit user authorization.

---

### Task 1: Replace the displayed terminal command

**Files:**

- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `windows/src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `windows/src/shared/i18n/en.ts`
- Modify: `windows/src/shared/i18n/zh.ts`
- Modify: `windows/src/shared/i18n/ja.ts`
- Modify: `windows/src/shared/i18n/ko.ts`

**Interfaces:**

- Consumes: the existing `settings.general.open-from-terminal-command` localization key.
- Produces: the exact shared display value `hob /path/to/repo` in both packages.

- [x] **Step 1: Update the two assertions first**

Change both dictionary tests to require:

```ts
expect(dict['settings.general.open-from-terminal-command'], `${lang}.settings.general.open-from-terminal-command`).toBe(
  'hob /path/to/repo',
)
```

- [x] **Step 2: Verify the tests fail for the expected old value**

Run:

```sh
bun run test -- src/shared/i18n/dictionaries.test.ts
(cd "windows" && bun run test -- src/shared/i18n/dictionaries.test.ts)
```

Expected: both commands fail because the dictionaries still contain `open -b hobgoblin.app /path/to/repo`.

- [x] **Step 3: Apply the minimal localization change**

In all eight locale files, use:

```ts
'settings.general.open-from-terminal-command': 'hob /path/to/repo',
```

- [x] **Step 4: Verify the focused tests pass**

Run:

```sh
bun run test -- src/shared/i18n/dictionaries.test.ts
(cd "windows" && bun run test -- src/shared/i18n/dictionaries.test.ts)
```

Expected: both dictionary test files pass.

- [ ] **Step 5: Verify both packages**

Run:

```sh
bun run typecheck
bun run check:architecture
bun run test
(cd "windows" && bun run typecheck)
(cd "windows" && bun run check:architecture)
(cd "windows" && bun run test)
```

Expected: every command exits successfully with no test failures.

## Self-review

- The single task covers every design requirement.
- The plan contains exact values, file paths, commands, and expected outcomes.
- No new type, interface, dependency, or placeholder is introduced.
- The plan deliberately omits commit steps under the user's Git safety rule.
