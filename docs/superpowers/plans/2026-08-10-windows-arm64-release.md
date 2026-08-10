# Windows ARM64 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain the Windows x64 release installer and add a natively built, smoke-tested Windows ARM64 NSIS installer to GitHub Releases.

**Architecture:** Extend the existing single-architecture build entry point and Electron Builder configuration, then turn the reusable Windows workflow into an architecture-to-runner matrix. Keep GitHub Release orchestration in `release.yml`, where both `.exe` files become mandatory assets.

**Tech Stack:** Bun 1.3.11, TypeScript strip-only mode, Electron 42, electron-builder 26.15.2, NSIS, Vitest, GitHub Actions.

## Global Constraints

- Keep `Hobgoblin-<version>-x64.exe`; add `Hobgoblin-<version>-arm64.exe`.
- Build ARM64 natively on `windows-11-arm` and x64 on `windows-latest`.
- Run the existing Windows compatibility and packaged internal-terminal smoke gates for both architectures.
- Do not add dependencies or change signing behavior.
- Do not commit or push without explicit user authorization.

---

## File Structure

- Modify `src/system/build-script.test.ts` to lock Windows architecture configuration, native runner selection, and release asset publication.
- Modify `src/system/release-documentation.test.ts` to lock ARM64 download documentation.
- Modify `electron-builder.ts` to allow NSIS output for `arm64` and `x64`.
- Modify `scripts/build-release-artifacts.ts` to accept `windows/arm64`.
- Modify `.github/workflows/windows-test.yml` to build and smoke both Windows architectures on matching native runners.
- Modify `.github/workflows/release.yml` to require and upload the ARM64 installer.
- Modify `docs/releases/v2.2.4.md`, the four README translations, and `docs/index.html` to expose both Windows downloads.

### Task 1: Add Failing Windows ARM64 Release Tests

**Files:**

- Modify: `src/system/build-script.test.ts`
- Modify: `src/system/release-documentation.test.ts`

**Interfaces:**

- Consumes: the existing text-based release configuration regression tests and imported Electron Builder config.
- Produces: failing expectations for the complete Windows ARM64 release contract.

- [ ] **Step 1: Change build configuration expectations**

Expect `windows: ['arm64', 'x64']`, Windows NSIS arches `['arm64', 'x64']`, a Windows matrix mapping `arm64` to `windows-11-arm` and `x64` to `windows-latest`, matrix-driven build/upload paths, and the ARM64 `.exe` in release validation/upload.

- [ ] **Step 2: Change release documentation expectations**

Require `Hobgoblin-2.2.4-arm64.exe` in the current release notes and `Windows ARM64` in all README translations and the Pages install content.

- [ ] **Step 3: Verify RED**

Run:

```sh
bun run test src/system/build-script.test.ts src/system/release-documentation.test.ts
```

Expected: FAIL because Windows packaging, workflows, and download documentation still expose only x64.

### Task 2: Implement the Windows ARM64 Build and Publish Path

**Files:**

- Modify: `electron-builder.ts`
- Modify: `scripts/build-release-artifacts.ts`
- Modify: `.github/workflows/windows-test.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**

- Consumes: `ReleaseArch = 'arm64' | 'x64'`, Electron Builder's `--arm64` flag, and the reusable Windows workflow.
- Produces: architecture-qualified Windows workflow artifacts consumed by the release publish job.

- [ ] **Step 1: Enable ARM64 packaging**

Set the Windows NSIS target arches and supported release-script arches to `['arm64', 'x64']`, and add the Windows ARM64 invocation to the build script usage comment.

- [ ] **Step 2: Add the native Windows matrix**

Use a matrix with these exact entries:

```yaml
matrix:
  include:
    - arch: x64
      runner: windows-latest
    - arch: arm64
      runner: windows-11-arm
```

Set `runs-on`, the build command, failure-log artifact name, release artifact name, and release artifact path from the matrix. Preserve every existing compatibility and packaged terminal smoke step.

- [ ] **Step 3: Publish the new asset**

Add `Hobgoblin-${VERSION}-arm64.exe` to both the expected release asset list and `gh release upload` arguments.

- [ ] **Step 4: Verify GREEN for build configuration**

Run:

```sh
bun run test src/system/build-script.test.ts
```

Expected: PASS.

### Task 3: Document the ARM64 Download

**Files:**

- Modify: `docs/releases/v2.2.4.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ja.md`
- Modify: `README.ko.md`
- Modify: `docs/index.html`

**Interfaces:**

- Consumes: the published `Hobgoblin-2.2.4-arm64.exe` asset name.
- Produces: user-facing architecture selection guidance in every supported documentation locale.

- [ ] **Step 1: Update release notes**

Add `Hobgoblin-2.2.4-arm64.exe` as the Windows ARM64 installer beside the existing x64 entry.

- [ ] **Step 2: Update README translations**

Replace each x64-only Windows download bullet with a `Windows x64 / ARM64` bullet while preserving each file's language.

- [ ] **Step 3: Update GitHub Pages translations**

Change the Windows install heading and description in the static fallback and all four translation dictionaries to describe x64 and ARM64 installers.

- [ ] **Step 4: Verify GREEN for documentation**

Run:

```sh
bun run test src/system/release-documentation.test.ts
```

Expected: PASS.

### Task 4: Verify the Complete Change

**Files:**

- Verify only; no expected file changes.

**Interfaces:**

- Consumes: the complete Windows ARM64 release implementation.
- Produces: local verification evidence and GitHub Actions evidence.

- [ ] **Step 1: Run repository quality gates**

```sh
bun run typecheck
bun run check:architecture
bun run test
```

Expected: all commands exit successfully.

- [ ] **Step 2: Review the diff and repository state**

Run read-only `git diff --check`, `git diff --stat`, and `git status --short`. Confirm no unrelated files changed.

- [ ] **Step 3: Run GitHub-hosted verification when authorized**

Push the branch only after the repository's required dangerous-operation confirmation, then run or observe the Windows workflow. Expected: both `Build Windows x64` and `Build Windows arm64` pass and upload their architecture-specific installers.

## Self-Review

- Spec coverage: build configuration, native runner choice, compatibility tests, packaged terminal smoke, publish validation/upload, and download documentation each map to a task.
- Placeholder scan: no deferred implementation or unspecified error-handling steps remain.
- Type consistency: both production configurations use the existing `arm64 | x64` architecture vocabulary and the workflow matrix exposes `arch` and `runner` consistently.
- Project override: commit and push steps are intentionally absent from implementation; GitHub verification is deferred until explicit authorization.
