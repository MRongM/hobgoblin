# Independent Windows Platform Package Implementation Plan

> **For agentic workers:** Execute these tasks inline in the existing isolated worktree. Do not create commits: repository instructions require explicit user authorization for Git commits.

**Goal:** Make Windows a self-contained Electron platform package whose source and release artifacts are confined to `windows/`.

**Architecture:** Import the selected Windows application snapshot as `windows/src/`, then give it package-local configuration, launcher/installer resources, and Windows-only build commands. Root CI orchestrates this package and publishes only its `windows/release/` outputs.

**Tech Stack:** Bun 1.3.11, Node.js 24, Electron 42, Electron Builder 26, Vite 8, Vitest 4, NSIS.

## Global Constraints

- Keep the root `src/` application unchanged except for test/release orchestration required by this platform split.
- Pin every Windows package dependency to an exact version.
- Use `#/` imports with explicit TypeScript extensions inside `windows/src/`.
- Do not introduce a symlink, root-source import, or automatic code synchronization between the two desktop applications.
- Write all Windows generated outputs under `windows/dist/` or a `windows/release*` directory.
- Run `bun run typecheck`, `bun run test`, and `bun run check:architecture` inside `windows/` after dependency installation.

---

### Task 1: Establish the independent-package contract

**Files:**

- Create: `scripts/windows-package-layout.test.ts`
- Create: `windows/package.json`
- Create: `windows/.gitignore`
- Create: `windows/README.md`

**Produces:** A testable package root whose commands and output ownership are explicit.

- [ ] Write a layout test that requires `windows/package.json`, `windows/src/main/main.ts`, `windows/electron-builder.ts`, `windows/scripts/build-release-artifacts.ts`, and package-local output ignore rules.
- [ ] Run `bun run test -- scripts/windows-package-layout.test.ts`; it must fail before the Windows package exists.
- [ ] Create the Windows package manifest with exact dependencies and local `dev`, validation, test, and release scripts.
- [ ] Add ignored `node_modules`, `dist`, and `release` paths under `windows/` only, plus concise local build instructions.
- [ ] Re-run the layout test and retain it as a regression guard.

### Task 2: Materialize and configure the Windows application snapshot

**Files:**

- Create: `windows/src/**`
- Create: `windows/assets/**`
- Create: `windows/bin/hob.cmd`
- Create: `windows/build/installer.nsh`
- Create: `windows/build/windows-user-path.ps1`
- Create: `windows/LICENSES/**`
- Create: `windows/THIRD_PARTY_NOTICES.md`
- Create: `windows/electron-builder.ts`
- Create: `windows/tsconfig.json`
- Create: `windows/tsconfig.main.json`
- Create: `windows/tsconfig.web.json`
- Create: `windows/tsconfig.test.json`
- Create: `windows/vite.config.ts`
- Create: `windows/vitest.config.ts`

**Produces:** A self-contained copy of the selected Windows implementation with no imports from the root application.

- [ ] Import the selected Windows source and its required packaged resources beneath `windows/`, preserving file contents and test coverage.
- [ ] Configure Electron Builder exclusively for Windows NSIS output and write its output directory to `windows/release`.
- [ ] Configure Vite and TypeScript aliases to resolve only `windows/src`.
- [ ] Run the layout test, then inspect `git diff --no-index` against the selected source revision to ensure source and required resource files were not omitted or altered during import.

### Task 3: Build and validation commands

**Files:**

- Create: `windows/scripts/check-architecture.ts`
- Create: `windows/scripts/typecheck.ts`
- Create: `windows/scripts/dev.ts`
- Create: `windows/scripts/start-server.ts`
- Create: `windows/scripts/build-release-artifacts.ts`
- Create: `windows/scripts/build-windows-fast.ts`
- Create: `windows/scripts/build-release-artifacts.test.ts`
- Create: `windows/scripts/build-windows-fast.test.ts`

**Produces:** Package-local validation and packaging commands with deterministic output locations.

- [ ] Write release-target tests that reject non-Windows targets and verify expected x64/ARM64 installer paths below the Windows package root.
- [ ] Run the new tests and confirm they fail because the release module is absent.
- [ ] Implement package-local release and fast-build commands. The release command must accept one of `x64` or `arm64`, remove only `windows/release`, build `windows/dist/web`, package NSIS, and assert its installer exists inside `windows/release`.
- [ ] Copy the existing architecture/typecheck/dev/server scripts and retain their relative package-root behavior.
- [ ] Run the targeted command tests, `bun run check:architecture`, and `bun run typecheck` in `windows/`.

### Task 4: Route CI and release automation through the package

**Files:**

- Modify: `.github/workflows/windows-test.yml`
- Modify: `.github/workflows/release.yml`

**Produces:** Windows CI that tests and packages only the independent Windows package.

- [ ] Change trigger paths to `windows/**` and the workflow files, retaining root release workflow coverage.
- [ ] Run all Bun install, typecheck, targeted compatibility tests, and build commands with `windows/` as the working directory.
- [ ] Point smoke-test executable discovery and artifact upload paths to `windows/release/`.
- [ ] Before release publication, check the root and Windows package versions are equal; retain the existing release asset validation and names.
- [ ] Remove the root Electron Builder Windows/NSIS target and root Windows release-script branch so no normal root command can emit a Windows installer.
- [ ] Parse both workflow YAML files with a YAML parser or GitHub-compatible syntax validation where available.

### Task 5: Record the platform boundary and verify end-to-end invariants

**Files:**

- Create: `docs/adr/0004-independent-windows-platform-package.md`
- Create: `docs/superpowers/specs/2026-08-15-independent-windows-platform-package-design.md`
- Create: `docs/superpowers/plans/2026-08-15-independent-windows-platform-package.md`
- Modify: `CONTEXT.md`

**Produces:** Durable terminology and decisions for intentional Windows divergence.

- [ ] Add the Windows platform package term to the glossary.
- [ ] Record the independent-package decision and rejected alternatives in an ADR.
- [ ] Re-read the design and plan for conflicting paths, unbounded output deletion, and version-source ambiguity; resolve discrepancies inline.
- [ ] From `windows/`, run `bun run test`, `bun run check:architecture`, and `bun run typecheck` after dependencies are available. Run the Windows release build only on Windows.
