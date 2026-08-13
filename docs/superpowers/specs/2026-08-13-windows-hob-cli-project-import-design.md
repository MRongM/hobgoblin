# Windows Hob CLI Project Import Design

## Goal

Make `hob .` work from a newly opened Windows PowerShell or Command Prompt after Hobgoblin is installed. The command imports and activates the current directory through the same project-opening flow used by the macOS launcher.

## Selected approach

Ship a Windows command launcher, `hob.cmd`, outside the application ASAR and add its installed directory to the current user's `PATH` from the NSIS installer. The launcher accepts zero or one directory, defaults to the current directory, resolves it to an absolute directory, and starts the installed Hobgoblin executable with an explicit `--hob-open <directory>` argument.

The app remains the sole owner of project import behavior:

1. `hob.cmd` validates and forwards one absolute local directory.
2. Electron main extracts only the value following the explicit `--hob-open` marker from either the initial process arguments or a `second-instance` event.
3. Electron main validates and queues the value with `enqueueExternalOpenPath`, then activates the main window.
4. The renderer drains the existing external-open queue and passes the directory to `openRepoPaths`.
5. The existing repository lifecycle resolves the project root, opens or imports the project, records it as recent, and activates it.

The launcher and main process must not call the embedded server directly, write settings, or introduce a second project-import implementation.

## Command contract

- `hob .` imports and activates the project containing the current directory.
- `hob <relative-or-absolute-directory>` does the same for one directory.
- `hob` defaults to the current directory, matching the macOS command.
- `hob -h` and `hob --help` print concise usage without launching the app.
- More than one path, an unknown option, a missing directory, a non-directory, or a missing installed executable exits non-zero with an actionable message.
- Paths containing spaces, non-ASCII characters, drive roots, and UNC roots remain one argument.
- The launcher returns after dispatching the desktop app instead of waiting for the app to exit.

## Electron argument boundary

Create one small main-process helper that extracts a Windows CLI project-open request from an argv array. It recognizes only the exact `--hob-open` marker followed by one non-empty value, only on `win32`; unrelated Chromium, Electron, development, and installer arguments are ignored.

On the first application instance, the request is queued after the single-instance lock is acquired and before renderer initialization. On a later invocation, the `second-instance` handler receives the new argv, queues its request, and uses the existing startup activation barrier before showing the window. `enqueueExternalOpenPath` remains the authoritative absolute-path and safety boundary.

## Packaging and installation

- Package `bin/hob.cmd` as `resources/bin/hob.cmd`, alongside the existing macOS `resources/bin/hob` launcher.
- Configure electron-builder to include the repository's `build/installer.nsh` custom NSIS include.
- During per-user installation or upgrade, add `$INSTDIR\resources\bin` to the current user's `PATH` only when an equivalent entry is absent.
- During uninstall, remove only the exact normalized entry that points to that installation's `resources\bin`; preserve every unrelated `PATH` entry and any path added after installation.
- Broadcast the Windows environment-change notification after an actual registry change. Existing shells keep their inherited environment; newly opened PowerShell and Command Prompt sessions see `hob`.
- Keep installation and upgrade idempotent. Never truncate `PATH`, use `setx`, edit PowerShell profiles, or create shell aliases.

If another `hob` executable already resolves earlier on `PATH`, Hobgoblin does not overwrite that executable. Documentation tells the user how to inspect command resolution rather than silently deleting or replacing a conflicting command.

## Alternatives considered

1. Register a custom URL protocol and have a launcher encode the directory into a URL. This adds protocol ownership and encoding complexity while still requiring a launcher on `PATH`.
2. Build a native `hob.exe` shim. This can avoid batch syntax, but it adds architecture-specific build artifacts and signing work for behavior that a quoted `.cmd` launcher can provide.
3. Have the CLI mutate settings or call the embedded server. This bypasses renderer-owned lifecycle behavior, cannot reliably activate the desktop app, and violates the existing process ownership model.

## Error handling and safety

- The launcher rejects invalid input before starting Electron.
- The explicit argv marker prevents arbitrary Electron arguments from being mistaken for project paths.
- Main-process path validation remains authoritative even if the launcher is bypassed.
- A malformed CLI request never writes project state; a valid request uses the existing renderer error presentation if project probing or import fails.
- PATH installation is user-scoped, exact-entry based, idempotent, and reversible on uninstall.

## Architecture grill

- `docs/arch.md`: Electron main only handles native argv, single-instance activation, and transport into the existing intent flow. Project logic remains outside `src/main`.
- `docs/layering.md`: the new parser is a narrow native boundary helper; it does not create a generic service or duplicate the repo write path.
- `docs/state-sync.md`: the command writes no restorable or runtime-coherent state itself. The existing renderer/server project lifecycle remains authoritative.
- `docs/renderer-model.md`: Electron stays a specialized native shell around the same renderer/server project behavior.
- `docs/realtime.md`: no new realtime transport is required; the existing renderer effect intent is sufficient for this occasional event.
- Architecture imports remain green: main imports only main/shared modules, and no Electron dependency enters server/shared code.

The repository-required `grill-with-docs` skill file is absent at `.claude/skills/grill-with-docs/SKILL.md`, so this section records the equivalent manual review against every applicable app-level design document.

## Testing

- Run `hob.cmd` on Windows with temporary directories and a fake installed executable. Cover `hob .`, the zero-argument default, spaces and non-ASCII paths, help, missing paths, extra arguments, and a missing executable.
- Unit-test argv extraction for packaged initial argv, `second-instance` argv, malformed markers, unrelated switches, and non-Windows platforms.
- Extend main lifecycle tests to prove valid first-instance and second-instance requests enqueue the directory and respect the activation barrier.
- Test packaging declarations and the custom NSIS include contract, including exact add/remove behavior and environment-change notification instructions.
- Retain existing external-open and renderer project-open tests as coverage of the reused import path.
- Run focused tests, `bun run typecheck`, `bun run test`, `bun run check:architecture`, `bun run format:check`, and `git diff --check`.

## Success criteria

1. After installing Hobgoblin on Windows and opening a new terminal, `hob .` dispatches the terminal's current directory.
2. A stopped app starts, imports or opens that directory through the existing project lifecycle, and activates it.
3. A running app receives the same directory through `second-instance`, imports or opens it, and activates its window.
4. Paths with spaces and non-ASCII characters are preserved exactly.
5. Upgrade does not duplicate PATH entries, and uninstall removes only Hobgoblin's own entry.
6. macOS `hob` behavior remains unchanged.

## Self-review

- The command, installation behavior, initial-instance flow, running-instance flow, cleanup behavior, and test evidence are explicit.
- No placeholder, unresolved platform choice, duplicate project lifecycle, or cross-layer import remains.
- The scope is one cohesive Windows parity feature and is suitable for one implementation plan.
