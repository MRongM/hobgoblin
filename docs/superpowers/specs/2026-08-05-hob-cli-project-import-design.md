# Hob CLI Project Import Design

## Goal

Add a macOS `hob` command so `hob .` opens the current directory as a project in the installed Hobgoblin desktop app.

## Selected approach

Ship a small POSIX launcher named `hob` outside the application ASAR. The launcher accepts zero or one local directory, defaults to the current directory, resolves it to an absolute directory path, and invokes macOS `open` with Hobgoblin's existing bundle identifier.

The app continues to own import behavior:

1. macOS delivers the directory through Electron's existing `open-file` event.
2. Electron main validates and queues the path through `enqueueExternalOpenPath`.
3. The renderer drains the queue and passes the path to `openRepoPaths`.
4. `ensureWorkspaceOpen` probes the directory, resolves the project root, records it as recent, opens it, and activates it.

The launcher must not call the embedded server, mutate settings files, or implement a second project-import path.

## Command contract

- `hob .` imports and activates the project containing the current directory.
- `hob /absolute/or/relative/directory` does the same for one directory.
- `hob` defaults to the current directory.
- `hob --help` prints concise usage without launching the app.
- More than one path, an unknown option, a missing directory, or a non-directory exits non-zero with a useful message.
- Paths containing spaces are passed as one argument.
- Non-macOS execution exits non-zero and explains that this first version is macOS-only.

## Packaging and installation

- Add the launcher to `electron-builder` as an `extraResources` file so it is available at `Hobgoblin.app/Contents/Resources/bin/hob` and not hidden inside ASAR.
- `bun run install:app` creates `~/.local/bin/hob` as a symlink to the installed launcher.
- Installation may create `~/.local/bin`, but it must not modify shell startup files or overwrite a pre-existing unrelated `hob` file or symlink.
- If `~/.local/bin` is not on `PATH`, installation prints the exact PATH guidance instead of editing user configuration.
- Release documentation includes the safe one-time symlink command for users who install from a DMG.

## Alternatives considered

1. Parse path arguments in the Electron executable and launch it directly. This can become cross-platform later, but duplicates macOS document-open behavior and couples the CLI to Electron's development and packaged argv layouts.
2. Have `hob` write settings or call the embedded server. This bypasses renderer-owned project lifecycle behavior, cannot reliably activate the app, and introduces a second import path.
3. Register a custom URL protocol. This adds encoding, validation, and protocol-ownership complexity without improving the single local-directory use case.

## Error handling and safety

- The launcher validates the directory before calling `open`.
- Existing main-process absolute-path validation remains authoritative at the native boundary.
- Existing renderer errors remain visible through the current failed-open toast.
- CLI installation is user-scoped and conflict-safe; it never silently replaces another command.

## Testing

- Execute the launcher against a fake `open` command and assert the bundle identifier and one absolute path are passed correctly, including a path with spaces.
- Assert help and invalid argument cases do not invoke `open`.
- Test the user-scoped symlink installer with temporary directories, including idempotence and unrelated-target conflict behavior.
- Assert desktop packaging includes the launcher outside ASAR.
- Retain the existing Electron `open-file` and renderer external-open tests as coverage of the reused import path.
- Run the focused tests, typecheck, full test suite, architecture guard, and formatting checks.

## Self-review

- No unresolved platform or installation choice remains: this version is macOS-only and user-scoped.
- The CLI only transports a path; all project validation and state changes remain in the existing application flow.
- The design does not overwrite commands or mutate shell configuration.
- The feature is reversible and does not require an ADR.
