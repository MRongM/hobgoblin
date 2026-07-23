# Telegram Terminal Screen Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, low-quality, in-memory terminal screen images to eligible Telegram output-completion notifications while preserving text fallback and privacy opt-in behavior.

**Architecture:** Extend the existing terminal-host boundary with a bounded active-viewport snapshot, render it asynchronously in the server to JPEG, and send it through a multipart Telegram transport. Reuse existing settings, validation, idempotency, proxy, and fallback boundaries; serialize media work at concurrency 1.

**Tech Stack:** TypeScript 6 strip-only mode, `@xterm/headless`, `sharp` 0.35.3, Hono, Node HTTPS, PQueue, Vitest, Bun.

## Global Constraints

- Do not capture the Electron/browser application window.
- Do not create or persist screenshot files; keep image bytes in memory only.
- Gate terminal contents with the existing `includeTerminalOutput` opt-in.
- Cap screen extraction at 140 columns × 40 rows and JPEG output at 1280×720, quality 65.
- Cap Telegram photo captions at 1024 Unicode characters and uploaded images below a conservative 2 MiB application limit.
- Keep media generation/upload concurrency at 1.
- Preserve text-only delivery when output inclusion is disabled and excerpt fallback when image generation is unavailable.
- Do not retry an ambiguous photo transport failure as text.
- Remove the decorative localized terminal-output separator without removing text fallback content.
- Pin new package versions exactly and update Bun/Electron packaging for native assets.
- Do not stage, commit, branch, push, or alter unrelated user changes.

---

### Task 1: Terminal Screen Snapshot Boundary

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/server/terminal/terminal-render-state.ts`
- Modify: `src/server/terminal/terminal-render-state.test.ts`
- Modify: `src/server/terminal/terminal-session-manager.ts`
- Modify: `src/server/terminal/terminal-session-manager.test.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal-host.ts`
- Modify: `src/server/terminal/terminal-facade.ts`
- Modify: `src/server/terminal/terminal-worker-protocol.ts`
- Modify: `src/server/terminal/terminal-worker-host.ts`

**Interfaces:**

- Produces `TerminalScreenSnapshotInput { sessionId, maxColumns, maxRows }` and `TerminalScreenSnapshot { sessionId, lines, columns, rows, sequence }`.
- Produces `ServerTerminalHost.getScreenSnapshot(input)` and `readTerminalRenderScreenSnapshot(...)`.

- [x] **Step 1: Write failing render-state and manager tests** for active-viewport selection, 140×40 clipping, parse-chain ordering, blank rows, and missing sessions.
- [x] **Step 2: Run** `bun run test -- --configLoader runner src/server/terminal/terminal-render-state.test.ts src/server/terminal/terminal-session-manager.test.ts` **and verify RED** because the snapshot API does not exist.
- [x] **Step 3: Implement the minimal shared types, bounded extractor, manager/facade methods, host contract, and worker protocol action.** Validate integer bounds before reading the model.
- [x] **Step 4: Re-run the focused tests and verify GREEN.**

---

### Task 2: Low-Quality In-Memory JPEG Renderer

**Files:**

- Create: `src/server/modules/telegram-terminal-screen-image.ts`
- Create: `src/server/modules/telegram-terminal-screen-image.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `electron-builder.ts`

**Interfaces:**

- Produces `renderTelegramTerminalScreenImage(snapshot): Promise<Buffer | null>`.
- Uses fixed exported bounds: 140 columns, 40 rows, 1280×720, JPEG quality 65, maximum output 2 MiB.

- [x] **Step 1: Add failing tests** for JPEG magic bytes, bounded metadata dimensions, XML/control-character safety, empty input, and maximum byte rejection using the real renderer.
- [x] **Step 2: Run** `bun run test -- --configLoader runner src/server/modules/telegram-terminal-screen-image.test.ts` **and verify RED** because the renderer does not exist.
- [x] **Step 3: Pin `sharp` 0.35.3**, exclude it from `build:server`, and unpack `node_modules/{sharp,@img}` assets in Electron packaging.
- [x] **Step 4: Implement minimal SVG construction and asynchronous JPEG encoding.** Use a dark background, system monospace text, XML escaping, fixed bounds, quality 65, and in-memory buffers only.
- [x] **Step 5: Re-run the renderer test and verify GREEN.**

---

### Task 3: Telegram Multipart Photo Transport

**Files:**

- Modify: `src/server/modules/telegram-notification-source.ts`
- Modify: `src/server/modules/telegram-notification-source.test.ts`
- Modify: `src/shared/telegram-notifications.ts`

**Interfaces:**

- Produces `sendTelegramPhoto({ botToken, chatId, caption, photo, proxyUrl })` with the existing `TelegramNotificationResult`.
- Shares request timeout, proxy destruction, status mapping, and bounded response parsing with `sendTelegramMessage`.

- [x] **Step 1: Add failing source tests** for `/sendPhoto`, multipart field escaping, zero-copy photo chunk writing, content length, success, timeout, proxy disposal, empty/oversized photo validation, and 1024-character caption validation.
- [x] **Step 2: Run** `bun run test -- --configLoader runner src/server/modules/telegram-notification-source.test.ts` **and verify RED** because `sendTelegramPhoto` does not exist.
- [x] **Step 3: Refactor the current HTTPS response lifecycle into a shared private request helper, then implement multipart chunks without concatenating the JPEG into a second full body buffer.**
- [x] **Step 4: Re-run the source tests and verify GREEN.**

---

### Task 4: Completion Delivery Integration and Separator Removal

**Files:**

- Modify: `src/server/modules/telegram-notification-write-paths.ts`
- Modify: `src/server/modules/telegram-notification-write-paths.test.ts`
- Modify: `src/server/routes/telegram-notifications.ts`
- Modify: `src/server/routes/telegram-notifications.test.ts`
- Modify: `src/server/app-factory.ts`
- Modify: `src/server/app-factory.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/snapshot.test.ts`

**Interfaces:**

- Completion delivery reads `TerminalScreenSnapshot`, renders JPEG, and calls `sendTelegramPhoto` inside a PQueue with concurrency 1.
- Bell delivery retains excerpt behavior. Text formatters append `\n\n${outputTail}` with no localized separator.

- [x] **Step 1: Add failing formatter/write-path/route tests** for separator removal, 1024-character photo caption, successful image delivery, output opt-out, render failure excerpt fallback, no text retry after photo transport failure, idempotency, and serialized media work.
- [x] **Step 2: Run the Telegram focused tests and verify RED** on missing media options and old separator behavior.
- [x] **Step 3: Implement the minimal dependency wiring and completion orchestration.** Claim idempotency before screen reads, skip image work when output is disabled, and keep all content out of logs.
- [x] **Step 4: Update four locale hints** so “include terminal output” explains completion images and text fallback without renaming persisted fields or stable keys.
- [x] **Step 5: Re-run Telegram, route, app-factory, and i18n tests and verify GREEN.**

---

### Task 5: Repository Verification

**Files:**

- Verify all modified source, tests, docs, package, lock, and packaging files.

- [x] **Step 1: Run** `bun run typecheck` **and fix only introduced errors.**
- [x] **Step 2: Run** `bun run check:architecture` **and keep Electron imports out of server/shared layers.**
- [x] **Step 3: Run all Telegram and terminal-screen focused tests with `--configLoader runner`.**
- [x] **Step 4: Run** `bun run build:server` **to verify `sharp` remains external and worker bundles compile.**
- [x] **Step 5: Run** `bun run test -- --configLoader runner`; compare any failures with the recorded baseline of 5 timeout failures and 3231 passing tests.
- [x] **Step 6: Run** `git diff --check`, `git status --short`, and a focused diff review. Do not commit.

## Self-Review

- Coverage includes screenshot source, image quality, single-request delivery, separator removal, no file persistence, cleanup semantics, privacy gating, fallback, concurrency, packaging, and verification.
- No placeholder tasks or undefined later-stage interfaces remain.
- Type names and layer ownership match the current terminal-host and Telegram write/source patterns.
