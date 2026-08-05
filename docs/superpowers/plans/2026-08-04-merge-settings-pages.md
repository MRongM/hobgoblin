# Merge Settings Pages Implementation Plan

> **For agentic workers:** Execute this plan inline in the current session. Do not dispatch subagents and do not create Git commits.

**Goal:** Remove Files and Security as standalone settings destinations while showing their existing controls under General and LAN.

**Architecture:** Keep each settings section component intact and let `SettingsSurface` compose multiple sections for a destination. Narrow the canonical `SettingsPage` union, retain redirect-only legacy routes, and expose Security under the LAN destination in both runtimes while preserving the Electron-only boundary of host-level LAN controls.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, TanStack Router, Vitest, Bun.

## Global Constraints

- Use repo-alias imports with explicit `.ts` or `.tsx` extensions.
- Do not change settings persistence, read projections, write paths, or server APIs.
- Preserve old settings URLs through redirects.
- Do not add dependencies, branches, or commits.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

### Task 1: Lock the merged settings behavior with tests

**Files:**

- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/main-router.test.tsx`

**Interfaces:**

- Consumes: `SettingsSurface`, `SETTINGS_PAGES`, and `mainRouter`.
- Produces: regression coverage for destination composition, sidebar removal, and legacy redirects.

- [ ] Change the security interaction test to render `page="lan"` and verify the existing Web-access form still writes the same payload.
- [ ] Change file-area tests to render `page="general"` and verify their existing controls still behave unchanged.
- [ ] Add explicit assertions that General contains the file-area controls, LAN contains the security controls, Web still omits Electron-only LAN controls, and the sidebar contains neither `settings.nav.files` nor `settings.nav.security`.
- [ ] Change router coverage so navigating to `/settings/files` yields General and navigating to `/settings/security` yields LAN in Web runtime.
- [ ] Run `bun run test -- src/web/components/SettingsSurface.test.tsx src/web/main-router.test.tsx` and confirm failures are caused by the still-unmerged pages.

### Task 2: Merge destinations in the settings composition layer

**Files:**

- Modify: `src/shared/settings-pages.ts`
- Modify: `src/web/components/SettingsSurface.tsx`
- Modify: `src/web/components/settings/SettingsLayout.tsx`

**Interfaces:**

- Consumes: existing `GeneralSettings`, `FileAreaSettings`, `LanSettings`, and `SecuritySettings` components.
- Produces: a canonical `SettingsPage` union without `files` or `security`, with General and LAN rendering both relevant sections.

- [ ] Remove `files` and `security` from `SETTINGS_PAGES` and `SETTINGS_PAGE_CONFIG`.
- [ ] Render `GeneralSettings` and `FileAreaSettings` together for `page === 'general'`.
- [ ] Render `SecuritySettings` for `page === 'lan'` in every runtime and render `LanSettings` there only in Electron.
- [ ] Remove the obsolete standalone Files/Security render branches.
- [ ] Remove Files/Security icons and the Electron-only LAN sidebar filter from `SettingsLayout`.
- [ ] Run the focused settings-surface test and confirm it passes.

### Task 3: Preserve legacy settings URLs

**Files:**

- Modify: `src/web/main-router.tsx`

**Interfaces:**

- Consumes: TanStack Router `beforeLoad` redirects.
- Produces: `/settings/files -> /settings/general` and `/settings/security -> /settings/lan` redirects, with `/settings/lan` available in Electron and Web.

- [ ] Add a redirect from the legacy Files route to General.
- [ ] Add a redirect from the legacy Security route to LAN.
- [ ] Remove the Web-to-General guard from the LAN route.
- [ ] Run `bun run test -- src/web/main-router.test.tsx` and confirm it passes.

### Task 4: Verify the complete change

**Files:**

- Review all modified files and documentation from Tasks 1-3.

**Interfaces:**

- Consumes: repository verification commands.
- Produces: fresh evidence that behavior, types, tests, formatting, and architecture boundaries remain valid.

- [ ] Run both focused test files together.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run check:architecture`.
- [ ] Run Prettier in check mode on the modified source and test files, formatting only those files if required.
- [ ] Review `git diff --check`, `git diff --stat`, and the final diff for accidental changes or privacy-unsafe fixtures.
