# Windows Hob CLI Project Import Design

## Goal

Add `hob` to the primary application Windows installer so PowerShell users can run `hob`, `hob .`, or `hob <directory>` to start or activate Hobgoblin, import the selected local directory as a project, and focus the imported project.

## Selected approach

Port the already-proven launcher and Electron argument bridge from the independent `windows/` package into the primary application, while keeping the existing primary-application project import path authoritative.

The flow is:

1. A packaged `hob.cmd` accepts zero or one directory, resolves it to an absolute Windows path, validates that it exists and is a directory, and starts `Hobgoblin.exe --hob-open <absolute-path>`.
2. The first application instance extracts the explicitly marked path before acquiring Electron's single-instance lock. It attaches the path to the lock data and queues it locally if the lock is acquired.
3. If Hobgoblin is already running, Electron forwards the path to the primary instance through `additionalData`; the primary instance falls back to parsing the second instance command line only when that data is unavailable.
4. The existing `enqueueExternalOpenPath` queue notifies the renderer.
5. The existing renderer drainer calls `openRepoPaths`, which delegates to `ensureWorkspaceOpen`, records/imports the project through the existing lifecycle, and activates the first successful result.

The launcher and Electron main process only transport a validated path. They do not write project settings, call the embedded HTTP API directly, or introduce a second project-import implementation.

## Command contract

- `hob` imports and activates the current PowerShell directory.
- `hob .` behaves identically.
- `hob <directory>` accepts one relative, drive-absolute, or UNC directory and preserves spaces.
- `hob -h` and `hob --help` print concise usage without opening the app.
- More than one directory, an unknown option, a missing path, or a regular file exits non-zero and does not open the app.
- The launcher clears `ELECTRON_RUN_AS_NODE` before starting the desktop application.
- Normal installed use starts the app asynchronously so PowerShell is returned immediately.
- A test-only executable override keeps the launcher contract executable without launching a packaged app.

## Single-instance behavior

The explicit `--hob-open` marker prevents unrelated Electron or Chromium arguments from being interpreted as project paths. Exactly one marker with one non-option value is accepted on Windows; other platforms ignore it.

The first instance passes `{ hobOpenPath }` to `app.requestSingleInstanceLock`. A second instance prefers the corresponding `additionalData` value because Electron may rewrite or reorder command-line arguments. The command-line parser remains a fallback for compatible invocation shapes. Paths are queued before window activation, and activation continues to wait for startup initialization.

## Packaging and installation

- Package `bin/hob.cmd` outside ASAR at `resources/bin/hob.cmd` alongside the existing macOS `bin/hob` resource.
- Extend the NSIS configuration with an include file that adds `$INSTDIR\resources\bin` to the current user's `Path` during installation and removes only that exact entry during uninstall.
- Use a bundled Windows PowerShell script for case-insensitive, slash-normalized, trailing-separator-tolerant PATH comparison.
- Preserve the existing PATH string when the entry already exists and broadcast `WM_SETTINGCHANGE` only after a change.
- Treat PATH-update failure as a visible installer warning, not as a failed Hobgoblin installation.
- Do not modify the machine PATH, PowerShell profiles, shell startup files, or unrelated PATH entries.
- A newly installed command becomes available in newly opened PowerShell sessions; current sessions may need to be reopened.

## Architecture and state ownership

- `bin/hob.cmd` is an OS boundary adapter.
- `src/main/windows-cli-project-open.ts` is a pure Electron argument-boundary parser.
- `src/main/main.ts` owns single-instance and native activation behavior.
- `src/main/external-open.ts` remains the runtime queue boundary.
- The renderer and server retain all project lifecycle, validation, persistence, recent-project, and activation behavior.
- No new runtime-coherent or restorable state is introduced, and no architecture import boundary changes.

## Error handling and safety

- Reject invalid input before starting the app.
- Quote all paths so spaces and ordinary Windows metacharacters remain one argument.
- Resolve paths through `cmd.exe`'s path expansion rather than manually concatenating working directories.
- Continue applying `toSafeSessionPath` at the existing main-process external-open boundary.
- Deduplicate equal queued paths through the existing queue.
- Preserve current renderer error toasts if the selected directory cannot be imported.
- Never overwrite a `hob` executable owned by another application; installation exposes the bundled directory through PATH instead of copying over a global command.

## Alternatives considered

1. **Port the independent Windows implementation into the primary application (selected).** This has executable tests, matches the primary app's existing external-open flow, and minimizes platform divergence.
2. **Register a custom URL protocol.** This could generalize to more actions but adds encoding, protocol ownership, and validation complexity for a single directory path.
3. **Have `hob` call the embedded server or edit persisted project state.** This would bypass native activation and renderer lifecycle orchestration, duplicate import policy, and behave poorly when the app is not running.

## Testing

- Unit-test Windows argument extraction for drive paths, UNC paths, missing values, duplicate markers, and non-Windows platforms.
- Extend main-process lifecycle tests for first-instance queueing, second-instance command-line forwarding, and `additionalData` fallback.
- Execute `hob.cmd` on Windows against a capture command to verify current-directory defaulting, spaces, help, invalid arguments, missing paths, regular files, and `ELECTRON_RUN_AS_NODE` clearing.
- Execute the PATH transformation script to verify add/remove behavior, idempotence, case-insensitive matching, normalization, and preservation of unrelated entries.
- Assert electron-builder packages both launchers and wires the NSIS include.
- Add Windows launcher and PATH tests to the primary Windows CI focused-test list.
- Update every maintained README language and the website terminal-command copy.
- Run focused tests, `bun run typecheck`, `bun run test`, `bun run check:architecture`, `bun run format:check`, and `git diff --check`.

## Self-review

- Scope is limited to the primary application Windows installer; the independent Windows package is reference evidence, not the acceptance target.
- Command semantics are explicit for zero/one argument, help, invalid input, relative paths, spaces, drive paths, and UNC paths.
- Startup and already-running behavior converge on the same external-open queue.
- Project import remains single-sourced in the renderer/server lifecycle.
- Installation is user-scoped, idempotent, reversible, and does not replace unrelated commands or PATH entries.
- No placeholder, unresolved architecture decision, or new persistence model remains.
