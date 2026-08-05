# Hob CLI Project Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this plan.

**Goal:** Provide a safe macOS `hob .` command that imports and activates the selected local project through Hobgoblin's existing external-open pipeline.

**Architecture:** A packaged POSIX launcher delegates one absolute directory to macOS Launch Services using bundle id `hobgoblin.app`. The existing Electron `open-file` queue and renderer project lifecycle remain the sole import implementation. A focused build helper installs a conflict-safe user-level symlink during `bun run install:app`.

**Tech Stack:** POSIX shell, macOS `open`, Electron 42, Bun, TypeScript, Vitest, electron-builder.

## Global Constraints

- Support macOS only in this version.
- Accept zero or one local directory; zero arguments means the current directory.
- Do not add a direct server/settings mutation path.
- Do not modify shell startup files or overwrite an unrelated `hob` command.
- Preserve all pre-existing worktree changes.
- Do not create a branch, worktree, commit, or push.
- Use repo-alias TypeScript imports with explicit extensions and avoid strip-only-incompatible TypeScript syntax.

---

### Task 1: Add and test the macOS launcher

**Files:**

- Create: `bin/hob`
- Create: `src/system/hob-cli.test.ts`

**Interfaces:**

- Consumes: macOS Launch Services bundle id `hobgoblin.app` and the existing directory document-open registration.
- Produces: `hob [directory]`, which invokes `open -b hobgoblin.app <absolute-directory>`.

- [ ] **Step 1: Write failing executable-contract tests**

Create tests that run `bin/hob` through `/bin/sh` with a temporary fake `open` on `PATH`. Assert `hob .` and a directory containing spaces pass exactly `-b`, `hobgoblin.app`, and one absolute directory. Assert `--help`, missing directories, and extra arguments do not invoke `open`.

- [ ] **Step 2: Verify the tests fail because the launcher is absent**

Run:

```bash
bun run test -- src/system/hob-cli.test.ts
```

Expected: FAIL because `bin/hob` does not exist.

- [ ] **Step 3: Implement the minimal launcher**

Implement a POSIX shell script with this control flow:

```sh
#!/bin/sh
set -eu

# Parse --help or zero/one directory, reject other inputs, require Darwin,
# resolve the directory from a subshell, then execute:
open -b hobgoblin.app "$absolute_path"
```

Use quoted variables throughout and make the file executable.

- [ ] **Step 4: Verify the launcher tests pass**

Run:

```bash
bun run test -- src/system/hob-cli.test.ts
```

Expected: all launcher contract tests pass.

### Task 2: Package and install the launcher safely

**Files:**

- Create: `scripts/install-hob-cli.ts`
- Create: `src/system/install-hob-cli.test.ts`
- Modify: `electron-builder.ts`
- Modify: `scripts/build.ts`
- Modify: `src/system/build-script.test.ts`

**Interfaces:**

- Consumes: installed app path ending in `Hobgoblin.app` and the packaged launcher at `Contents/Resources/bin/hob`.
- Produces: `installHobCli(appPath: string, options?: { homeDir?: string; pathValue?: string }): HobCliInstallResult`, which creates or preserves `~/.local/bin/hob` without replacing unrelated entries.

- [ ] **Step 1: Write failing packaging and installer tests**

Assert `electronBuilderConfig.extraResources` includes `{ from: 'bin/hob', to: 'bin/hob' }`. In temporary home directories, assert the installer creates the symlink, is idempotent for its own target, reports whether `~/.local/bin` is on `PATH`, and refuses to replace a regular file or unrelated symlink.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
bun run test -- src/system/install-hob-cli.test.ts src/system/build-script.test.ts
```

Expected: FAIL because the resource and installer do not exist.

- [ ] **Step 3: Implement packaging and conflict-safe installation**

Add the launcher as `extraResources`. Implement the installer with `lstat`/`readlink` conflict detection and a user-scoped `~/.local/bin/hob` symlink. Call it from macOS install mode after codesigning; print success, conflict, and PATH guidance without editing shell configuration.

- [ ] **Step 4: Verify focused packaging and installer tests pass**

Run:

```bash
bun run test -- src/system/hob-cli.test.ts src/system/install-hob-cli.test.ts src/system/build-script.test.ts src/main/desktop-identity.test.ts
```

Expected: all focused tests pass.

### Task 3: Document and verify the complete flow

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ja.md`
- Modify: `README.ko.md`
- Verify: `src/main/main.test.ts`
- Verify: `src/main/external-open.test.ts`
- Verify: `src/web/lib/open-repo-paths.test.ts`

**Interfaces:**

- Consumes: the packaged launcher and existing external-open pipeline.
- Produces: installation and `hob .` usage guidance for every maintained README language.

- [ ] **Step 1: Add concise installation and usage documentation**

Document `hob .`, the automatic `bun run install:app` symlink, the DMG symlink command, the `~/.local/bin` PATH requirement, and macOS-only scope in all maintained README variants.

- [ ] **Step 2: Run focused end-to-end contract tests**

Run:

```bash
bun run test -- src/system/hob-cli.test.ts src/system/install-hob-cli.test.ts src/main/main.test.ts src/main/external-open.test.ts src/web/lib/open-repo-paths.test.ts
```

Expected: launcher, native queue, and renderer import-path tests pass.

- [ ] **Step 3: Run repository regression gates**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
bun run format:check
git diff --check
```

Expected: every command succeeds and no unrelated user change is modified.
