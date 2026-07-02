# Windows Path Support Design

## Goal

Hobgoblin should be usable on Windows for local repository workflows:

- Open and display Windows local paths such as `C:\Users\dev\repo`.
- Derive and display Windows worktree paths correctly.
- Treat Windows absolute paths printed in terminal output as actionable file targets when they are inside the active worktree.
- Open local worktree paths in the configured external editor on Windows.
- Open local worktree paths in an external Windows terminal through the existing `terminal` preference.

## Scope

In scope:

- Local Windows path recognition and normalization for renderer/shared path helpers.
- Terminal path links for Windows absolute paths inside the current worktree.
- Windows external editor CLI detection and open behavior for VS Code, Cursor, and Windsurf.
- Windows external terminal open behavior behind the existing `terminal` setting.
- Focused tests for path semantics, terminal path links, and platform-specific external app command construction.

Out of scope:

- Windows release packaging, NSIS verification, or new release scripts.
- New settings options for Windows Terminal or PowerShell.
- Windows Ghostty support.
- UNC terminal link recognition as clickable paths.
- Remote repository path model changes.
- Tracking terminal shell working directory after `cd`.

## Existing Context

The renderer already has tolerant display helpers in `src/web/lib/paths.ts` for last segment, parent directory, joining paths, and default worktree paths. Those helpers already handle several Windows-shaped strings and should remain the display-facing path utility.

`src/shared/file-path-target.ts` currently recognizes repository-relative terminal path targets and explicitly rejects Windows absolute paths and backslashes. It preserves optional line and column targets for editor opens.

Local file tree operations in `src/system/file-tree/local.ts` use Node `path` and `fs`. On a Windows runtime these APIs naturally use Win32 semantics. The safety-sensitive filesystem boundary should stay in system/server code.

External editor and terminal support is currently macOS-first:

- Editors resolve CLI binaries inside `.app` bundles.
- `terminal` means macOS Terminal.app.
- Ghostty is detected through macOS app bundle paths.

`electron-builder.ts` already contains a Windows target, and `scripts/build-release-artifacts.ts` can build Windows artifacts on a Windows runner, but this design does not change release packaging.

## Recommended Approach

Add a small shared path semantics layer and platform-specific external app backends.

The shared path layer should own string-level path semantics only:

- Path style detection: POSIX absolute, Windows drive absolute, Windows UNC absolute, or relative.
- Line and column suffix parsing.
- Safe relative path validation.
- Worktree containment checks for POSIX and Windows-shaped absolute paths.
- Conversion from an absolute path inside a worktree to a worktree-relative slash path.

The shared layer should not read the filesystem. Filesystem existence, permissions, symlink behavior, and real path resolution stay in `src/system/**`.

External apps should keep the current settings model. The existing `terminal` preference is interpreted by platform:

- macOS: Terminal.app as today.
- Windows: Windows Terminal when `wt.exe` is available; otherwise PowerShell.

Editor preferences remain `vscode`, `cursor`, and `windsurf`. On Windows, detection should look for CLI commands on `PATH`.

This keeps the implementation small, testable, and aligned with current layering.

## Path Rules

Supported terminal/file target forms:

- `src/app.ts`
- `./src/app.ts`
- `docs/guide.md:12:3`
- `/repo/src/app.ts:12`
- `C:\repo\src\app.ts:12`
- `C:/repo/src/app.ts:12:3`

Relative path rules:

- Strip surrounding punctuation already handled by the current parser.
- Strip leading `./`.
- Reject empty paths.
- Reject URLs.
- Reject NUL.
- Reject `.` and `..` segments.
- Reject empty path segments.
- Emit slash-separated worktree-relative paths.

Absolute path rules:

- POSIX absolute paths are valid candidates only when the active worktree is POSIX-shaped.
- Windows drive absolute paths are valid candidates only when the active worktree is Windows-drive-shaped.
- Windows drive comparison is case-insensitive.
- Segment containment must be structural, not raw `startsWith`, so `C:\repo2` is not inside `C:\repo`.
- A clickable absolute path must equal the active worktree path or be below it.
- The reveal path emitted to the file tree is worktree-relative and slash-separated.
- The editor-open path keeps an absolute target path and preserves line/column.

UNC paths:

- UNC paths remain acceptable as local absolute path inputs where Node/system code can handle them on Windows.
- Terminal output does not proactively recognize `\\server\share\...` as clickable in this phase.

Line and column rules:

- `:line` and `:line:column` suffixes are supported.
- Line and column must be positive safe integers.
- Missing, zero, negative, or unsafe integer suffixes reject the candidate.

## Terminal Interaction

Terminal path links should become worktree-aware.

For relative path candidates:

1. Parse the target.
2. Single click reveals `target.path`.
3. Double click resolves `target.path` under the active worktree and opens the editor target with line/column.

For absolute path candidates:

1. Parse the target.
2. Check that it is inside the active worktree using the shared path semantics helper.
3. Single click reveals the derived relative path.
4. Double click opens the absolute editor target with line/column.

Candidates outside the active worktree should not become links. This prevents terminal output from turning arbitrary machine paths into file actions.

The xterm link provider can keep its current ownership: terminal components identify links and emit actions; workspace/file tree components own reveal behavior; server/system code owns editor execution.

## External Terminal Behavior

The `TerminalPref` union should not add new Windows-specific values in this phase.

`terminal` behavior:

- macOS: continue opening Terminal.app.
- Windows: open Windows Terminal with `wt.exe -d <path>` when available.
- Windows fallback: open PowerShell with argv-based arguments that set the directory using `Set-Location -LiteralPath <path>` and keep the shell open.

Availability:

- On macOS, current Terminal.app and Ghostty detection remains.
- On Windows, `terminal` is available when either `wt.exe` or PowerShell is available.
- On non-macOS/non-Windows platforms, current unavailable behavior can remain unless already supported elsewhere.
- `ghostty` remains unavailable on Windows in this phase.

Command construction must avoid shell string interpolation for user paths. Pass path values as argv entries.

## External Editor Behavior

The editor preference model remains unchanged.

Windows detection:

- VS Code: `code.cmd`, `code.exe`, then `code`.
- Cursor: `cursor.cmd`, `cursor.exe`, then `cursor`.
- Windsurf: `windsurf.cmd`, `windsurf.exe`, then `windsurf`.

macOS detection keeps the current `.app` bundle CLI lookup.

Windows local open semantics:

- Without line: `code <path>`
- With line: `code --goto <path>:<line>`
- With line and column: `code --goto <path>:<line>:<column>`

Cursor and Windsurf use the same VS Code-family CLI shape.

Remote editor behavior should remain as it is today. If the existing remote opener works on Windows through the detected CLI in a future implementation, that can be tested separately, but this phase does not broaden remote semantics.

## Data Flow

Open local repository:

1. Renderer receives a user-entered or native-picker path.
2. `untildifyPath` handles tilde only when applicable.
3. Server validates through existing safe path input rules.
4. Repo backend probes the local path.

Create local worktree:

1. Renderer derives a default path with display helpers that tolerate Windows separators.
2. Shared worktree input validation accepts Windows absolute paths.
3. Server delegates to the local repo backend.

Terminal absolute path click:

1. Terminal link provider parses a `FilePathTarget`.
2. It resolves the target against the active worktree path.
3. If the target is inside the worktree, it exposes a link action.
4. Single click sends the relative reveal path.
5. Double click sends the absolute editor target.

Open external terminal:

1. Renderer calls the existing open-terminal path.
2. Server reads settings.
3. System terminal registry resolves the platform-specific `terminal` backend.
4. Windows backend opens Windows Terminal or PowerShell.

Open external editor:

1. Renderer sends an `EditorOpenTarget`.
2. Server reads settings.
3. System editor registry resolves the configured editor.
4. Windows backend invokes the detected CLI with path or `--goto`.

## Error Handling

Invalid path candidates are not clickable terminal links.

Existing structured errors should be reused:

- `error.invalid-path` for invalid local filesystem targets.
- `error.invalid-arguments` for malformed requests.
- `error.editor-not-installed` when the configured editor CLI is unavailable.
- `error.terminal-not-installed` when neither Windows Terminal nor PowerShell is available.

CLI failures should keep current behavior: return stderr, short message, or the thrown error message.

Reveal failures should remain quiet and stable. The file tree's existing loading and missing-node behavior remains the source of truth.

## Testing

Shared path semantics tests:

- Detect POSIX absolute, Windows drive absolute, UNC absolute, and relative path styles.
- Parse line and column targets for Windows absolute paths.
- Reject invalid line and column suffixes.
- Treat Windows drive letters case-insensitively.
- Confirm `C:\repo\src\app.ts` is inside `C:\repo`.
- Confirm `C:\repo2\app.ts` is not inside `C:\repo`.
- Convert worktree-contained Windows absolute paths to slash-separated relative paths.

`src/shared/file-path-target.test.ts`:

- Accept `C:\repo\src\app.ts:12` and `C:/repo/src/app.ts:12:3` as absolute targets.
- Continue accepting existing relative path forms.
- Continue rejecting URLs, malformed suffixes, NUL, and unsafe relative segments.

`src/web/components/terminal/terminal-path-links.test.ts`:

- Worktree-contained Windows absolute paths produce terminal links.
- Worktree-external Windows absolute paths do not produce terminal links.
- Single click reveals a relative slash path.
- Double click opens an editor target that preserves absolute path, line, and column.

`src/web/lib/paths.test.ts`:

- Cover Windows parent, join, default worktree, and relative display behavior.

External app tests:

- Windows terminal command selection prefers `wt.exe`.
- Windows terminal fallback uses PowerShell.
- Windows editor detection checks `.cmd`, `.exe`, and bare command candidates.
- Windows editor open uses `--goto` only when line is present.
- macOS editor and terminal tests remain green.

Avoid tests that fake Win32 filesystem behavior through Node `path` on a POSIX runner. Put cross-platform string semantics in shared helper tests, and leave real filesystem behavior to platform runtime/manual verification.

## Verification

Automated verification:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Manual Windows verification:

1. Open a local repository at a path such as `C:\Users\dev\repo`.
2. Confirm repository probing, file tree listing, and normal Git reads work.
3. Create a worktree and confirm the default path is a Windows sibling path.
4. In terminal output, single-click `C:\Users\dev\repo\src\app.ts:12` and confirm the file tree reveals `src/app.ts`.
5. Double-click the same path and confirm the configured editor opens at line 12.
6. Open the current worktree in external terminal and confirm Windows Terminal opens in that directory, or PowerShell opens there when `wt.exe` is unavailable.
7. Configure VS Code, Cursor, or Windsurf and confirm file tree/editor opens use the selected editor.

## Scope Check

This is a single Windows runtime usability phase. It covers local path handling and external app opening, but it does not change release packaging, add settings options, or refactor remote repository behavior.

## Engineering Principles

- KISS: centralize path string semantics in one small shared helper and keep real filesystem access in system code.
- YAGNI: do not add new settings or release pipeline changes for this phase.
- DRY: reuse the same path target parsing and containment helper for terminal reveal and editor open.
- SOLID: keep parsing, UI interaction, server validation, and OS process launching in separate modules with narrow responsibilities.
