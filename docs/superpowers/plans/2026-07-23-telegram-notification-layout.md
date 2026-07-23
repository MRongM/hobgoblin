# Telegram Notification Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Telegram terminal notifications easier to scan with a compact summary line, exact branch deduplication, and an accurate no-new-output title.

**Architecture:** Keep formatting in the existing server-owned Telegram formatter and keep transport as plain text. Build one localized summary line from existing validated context, render optional detail lines with fixed Unicode icons, and omit a branch only when it exactly matches the context name after trimming.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Vitest, Bun.

## Global Constraints

- Preserve the existing transport, notification triggers, settings, localization keys, validation, deduplication, and 4096-character whole-message budget.
- Do not add `parse_mode`, dependencies, settings, protocol fields, or persistence.
- Do not infer branch duplication from path similarity; compare trimmed strings exactly.
- Keep “terminal output activity became idle” distinct from command or process completion.
- Preserve native visible terminal content without redaction or masking; only existing control-sequence removal, whitespace folding, and configured truncation may transform it.
- Collapse four or more consecutive `─` characters to `───` before counting; do not alter ASCII hyphens or other printable content.
- Do not stage, commit, branch, or push.

---

### Task 1: Specify the compact localized message

**Files:**

- Modify: `src/server/modules/telegram-notification-write-paths.test.ts`

**Interfaces:**

- Consumes: `formatTelegramBellMessage(context, lang)` and `formatTelegramOutputCompletionMessage(context, lang)`.
- Produces: exact behavioral coverage for summary layout, branch deduplication, output separator, and localized idle titles.

- [x] **Step 1: Write failing formatter tests**

Assert a duplicate-branch bell formats as:

```text
🔔 Hobgoblin 未读终端提醒

api · 工作树 feature/login · #2
🖥 bun run test
📁 ~/src/api-feature-login
```

Assert a distinct branch adds `🌿 feature/login`, output uses `── 终端输出 ──`, and completion titles say “no new terminal output” in all four locales.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test -- src/server/modules/telegram-notification-write-paths.test.ts
```

Expected: failures show the formatter still emits one labeled field per line and the old completion title.

---

### Task 2: Implement the compact formatter and localized copy

**Files:**

- Modify: `src/server/modules/telegram-notification-write-paths.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Consumes: the existing validated `TelegramBellNotificationContext` and localized context-kind/output labels.
- Produces: the unchanged formatter function signatures with compact plain-text output.

- [x] **Step 1: Implement the minimal formatter**

Build the summary with:

```ts
[context.project, `${contextKind} ${context.context}`, `#${context.terminalIndex}`].join(' · ')
```

Append `🖥`, `📁`, and a non-duplicate `🌿` detail line, then change the output prefix to:

```ts
`\n\n── ${dict['telegram.notification.message.output-tail']} ──\n`
```

Remove the obsolete labeled-line helper and update all four localized completion titles without renaming the stable key.

- [x] **Step 2: Run focused tests and verify GREEN**

Run:

```bash
bun run test -- src/server/modules/telegram-notification-write-paths.test.ts src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: all selected tests pass.

- [x] **Step 3: Run repository verification**

Run `bun run typecheck`, `bun run check:architecture`, the Telegram targeted tests, and `bun run test`. Confirm any full-suite failures match the existing detached-file-area `localStorage` baseline only, then run `git diff --check`.

---

### Task 3: Compact long terminal horizontal rules

**Files:**

- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/shared/telegram-notifications.test.ts`
- Modify: `src/web/components/terminal/terminal-output-tail.ts`
- Modify: `src/web/components/terminal/terminal-output-tail.test.ts`

**Interfaces:**

- Consumes: `normalizeTelegramOutput(value)` and the streaming `createTerminalOutputTail(maxCharacters)` collector.
- Produces: identical `string | undefined` and `TerminalOutputTail` interfaces with long `─` runs compacted before character limits apply.

- [x] **Step 1: Write failing normalization and streaming tests**

Assert `normalizeTelegramOutput()` converts four or more `─` characters to `───`, preserves three `─` characters and ASCII hyphens, and assert the collector compacts a run split across two `push()` calls without evicting useful surrounding output.

- [x] **Step 2: Run focused tests and verify RED**

Run `bun run test -- src/shared/telegram-notifications.test.ts src/web/components/terminal/terminal-output-tail.test.ts`. Expected: long `─` runs remain unbounded.

- [x] **Step 3: Implement the minimal shared and streaming normalization**

Apply `/─{4,}/gu` in shared normalization. In the collector, track the current consecutive `─` count and append at most three; reset the count on every other visible or normalized whitespace character and during `reset()`.

- [x] **Step 4: Run focused and repository verification**

Run the focused tests, Telegram write-path tests, `bun run typecheck`, `bun run check:architecture`, and `git diff --check`. Keep full-suite baseline failures explicit.
