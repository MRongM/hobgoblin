# Telegram Image-Only Terminal Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop sending terminal output characters through Telegram, restore the localized key-value metadata layout, and remove the Telegram output-character control while preserving optional unread-bell and completion screenshots.

**Architecture:** Disconnect the Telegram write path from the existing terminal excerpt boundary, leaving that server capability available to other consumers. Keep legacy persisted setting fields compatible, expose only a terminal-screen-image switch in the UI, and use metadata-only fallback when image creation is unavailable.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, Hono, Vitest, Bun.

## Global Constraints

- Telegram bell text, completion text, and photo captions contain localized key-value metadata only.
- Only a successful unread-bell or completion-screen render may expose terminal content, as JPEG bytes.
- Keep `includeTerminalOutput` and `outputTailLength` in persisted/API data for backward compatibility during this change.
- Remove the output-character input and its user-facing translations.
- Do not stage, commit, push, or modify branches.

---

### Task 1: Metadata-Only Telegram Delivery

**Files:**

- Modify: `src/server/modules/telegram-notification-write-paths.test.ts`
- Modify: `src/server/modules/telegram-notification-write-paths.ts`
- Modify: `src/server/routes/telegram-notifications.test.ts`
- Modify: `src/server/routes/telegram-notifications.ts`
- Modify: `src/server/app-factory.test.ts`
- Modify: `src/server/app-factory.ts`

- [x] Write failing tests for the key-value layout and prove bells/completion fallbacks never read terminal excerpts.
- [x] Run focused tests and verify RED on compact formatting and current excerpt calls.
- [x] Restore localized key-value formatting and remove excerpt formatting, dependencies, route wiring, and fallback reads.
- [x] Route unread-bell and completion notifications through the same optional terminal-screen-image delivery path.
- [x] Re-run focused tests and verify GREEN.

### Task 2: Screenshot-Only Setting UI

**Files:**

- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/components/settings/pages/NotificationSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [x] Write a failing settings test proving the character input is absent and the screenshot switch still saves the legacy compatibility field.
- [x] Run the settings test and verify RED.
- [x] Remove character-input state/UI and rename the visible screenshot preference.
- [x] Remove obsolete output-character translation keys from all four locales.
- [x] Re-run settings and i18n tests and verify GREEN.

### Task 3: Real Delivery and Repository Verification

**Files:**

- Read only: `tmp/tg.md`
- Verify all modified source, tests, docs, and packaging files.

- [x] Render one synthetic terminal screen image entirely in memory.
- [ ] After explicit network confirmation, send it using `tmp/tg.md` without printing credentials.
- [x] Run typecheck, architecture, server build, focused tests, and the full test suite.
- [x] Run `git diff --check` without committing.
- [ ] Report the real delivery result.

## Self-Review

- Telegram text has no terminal output path.
- Screenshot opt-in remains explicit and backward compatible.
- No output-character control or user-facing copy remains.
- All notification metadata uses the historical localized key-value layout.
- Real-send verification is isolated from automated tests and requires explicit approval.
