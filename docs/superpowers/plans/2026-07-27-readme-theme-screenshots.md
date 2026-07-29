# README Theme Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce six privacy-safe Hobgoblin screenshots for macOS, Signal, and Tokyo Night in light and dark appearance, then publish them consistently across every localized README.

**Architecture:** Run the existing web/server build with an isolated server data directory and a disposable generic Git repository. Use the in-app browser to establish one stable workspace scene, switch only theme preset and appearance between captures, and write PNG bytes directly into `docs/screenshots/`. README changes reuse those assets through a repeated two-column HTML layout.

**Tech Stack:** Hobgoblin server mode, React web UI, Git, in-app browser automation, PNG, Markdown/HTML.

## Global Constraints

- Presets are exactly `macos`, `signal`, and `tokyo-night`.
- Appearances are exactly `light` and `dark`.
- Capture content uses generic placeholders and contains no real usernames, paths, emails, tokens, or internal identifiers.
- All captures use one identical repository state, layout, and viewport.
- No application source code, dependencies, theme tokens, commits, pushes, or legacy screenshot deletions are part of the task.

---

### Task 1: Create the isolated capture environment

**Files:**
- Create: disposable files below `/private/tmp/hobgoblin-readme-capture/`
- Create: isolated app data below `/private/tmp/hobgoblin-readme-data/`
- Modify: none in the repository

**Interfaces:**
- Produces: a generic local Git repository that Hobgoblin can open and an isolated server data directory.

- [ ] **Step 1: Create a generic Git repository**

  Initialize a repository named `demo-workspace`, configure the local author as `Demo Developer <demo@example.invalid>`, add generic source and documentation files, and create representative commits and worktrees.

- [ ] **Step 2: Add safe visible state**

  Use branch names such as `main`, `feature/search`, and `fix/theme`, and leave one generic tracked file modified so the workspace visibly demonstrates branch and status handling.

- [ ] **Step 3: Start isolated server mode**

  Run the existing server at a free localhost port with `--data-dir /private/tmp/hobgoblin-readme-data`. Expected result: the server reports a localhost URL and does not load the user's ordinary Hobgoblin settings.

### Task 2: Establish one canonical workspace scene

**Files:**
- Modify: isolated app settings below `/private/tmp/hobgoblin-readme-data/`
- Modify: none in the repository

**Interfaces:**
- Consumes: the server and demo repository from Task 1.
- Produces: one stable browser tab showing the canonical capture scene.

- [ ] **Step 1: Open the isolated app**

  Navigate the in-app browser to the isolated localhost URL and inspect the rendered DOM before interacting.

- [ ] **Step 2: Open `demo-workspace`**

  Use the app's visible repository-opening flow and enter the disposable repository path. Verify that the UI shows only generic project and branch names.

- [ ] **Step 3: Compose the scene**

  Select a representative worktree, show repository navigation and the file area, and keep a useful detail or terminal surface visible. Do not change this layout after the first capture.

- [ ] **Step 4: Privacy review the viewport**

  Inspect the full viewport and replace any visible real user, home path, email, token, or private identifier before capture.

### Task 3: Capture the six theme variants

**Files:**
- Create: `docs/screenshots/macos-light.png`
- Create: `docs/screenshots/macos-dark.png`
- Create: `docs/screenshots/signal-light.png`
- Create: `docs/screenshots/signal-dark.png`
- Create: `docs/screenshots/tokyo-night-light.png`
- Create: `docs/screenshots/tokyo-night-dark.png`

**Interfaces:**
- Consumes: the canonical scene from Task 2.
- Produces: six same-size PNG assets referenced by Task 4.

- [ ] **Step 1: Capture macOS**

  Set the preset to macOS, capture light mode, switch only appearance to dark, and capture dark mode.

- [ ] **Step 2: Capture Signal**

  Keep the scene unchanged, set the preset to Signal, and capture light and dark mode.

- [ ] **Step 3: Capture Tokyo Night**

  Keep the scene unchanged, set the preset to Tokyo Night, and capture light and dark mode.

- [ ] **Step 4: Verify image integrity**

  Run `file docs/screenshots/*.png` and `sips -g pixelWidth -g pixelHeight docs/screenshots/*.png`. Expected result: six valid non-empty PNG files with identical dimensions.

### Task 4: Replace the README screenshot galleries

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ko.md`
- Modify: `README.ja.md`

**Interfaces:**
- Consumes: the six PNG paths from Task 3.
- Produces: four localized, structurally identical three-row screenshot galleries.

- [ ] **Step 1: Replace the English gallery**

  Add `### macOS`, `### Signal`, and `### Tokyo Night` beneath `## Screenshots`; under each heading, render the matching light and dark assets side by side at `49%` width with explicit English alt text.

- [ ] **Step 2: Replace localized galleries**

  Apply the same paths and structure to Chinese, Korean, and Japanese README files, localizing only the section heading and alt text while preserving official theme names.

- [ ] **Step 3: Verify references**

  Run `rg -n "screenshot-20260626|docs/screenshots/" README*.md`. Expected result: no legacy screenshot references and exactly six new asset references in each README.

### Task 5: Final verification

**Files:**
- Verify: all files created or modified by Tasks 3 and 4

**Interfaces:**
- Consumes: completed assets and README galleries.
- Produces: evidence that the documentation update is complete and repository checks remain green.

- [ ] **Step 1: Review the rendered assets**

  Visually inspect all six images for correct theme/appearance, identical layout, readable content, clipping, transient overlays, and privacy safety.

- [ ] **Step 2: Run project verification**

  Run `bun run typecheck` and `bun run test`. Expected result: both commands exit successfully.

- [ ] **Step 3: Review the final diff**

  Run `git status --short` and `git diff -- README.md README.zh-CN.md README.ko.md README.ja.md`. Confirm that only the planned documentation and screenshot assets changed, with no commit or push.
