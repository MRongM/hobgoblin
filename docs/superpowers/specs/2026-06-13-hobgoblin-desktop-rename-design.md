# Hobgoblin Desktop Rename Design

## Intent

Rename the desktop application identity from Goblin to Hobgoblin while preserving the ability to run the original Goblin app and the renamed Hobgoblin app side by side on the same PC.

The goal is not a full internal protocol rename. The goal is to change the user-visible product identity and the desktop-level identifiers that affect installation, process ownership, notifications, single-instance behavior, and application data separation.

## Scope

In scope:

- Rename the desktop package identity from `goblin` to `hobgoblin`.
- Rename the visible product name from `Goblin` to `Hobgoblin`.
- Change the desktop bundle identifier from `goblin.app` to `hobgoblin.app`.
- Update macOS app bundle and artifact expectations from `Goblin.app` and `Goblin-<version>-<arch>.dmg` to `Hobgoblin.app` and `Hobgoblin-<version>-<arch>.dmg`.
- Update desktop build, install, close, and publish scripts that use the app name or bundle identifier.
- Update desktop user-facing copy, including the app title, About settings, notification guidance, error dialogs, and `open -b` examples.
- Update PC-side tests whose assertions depend on user-visible product names, bundle identifiers, or desktop command examples.

Out of scope:

- Android package names, Kotlin paths, Gradle settings, Android strings, and Android tests.
- Internal IPC channel names such as `goblin:rpc`.
- Internal preload and renderer bridge globals such as `window.goblinNative` and `__GOBLIN_BOOTSTRAP__`.
- Internal HTTP headers such as `x-goblin-internal-secret`.
- Existing `GOBLIN_*` environment variables used by development and embedded server scripts.
- CSS class names, CSS custom properties, MIME types, and drag payload helper names that use `goblin` as an internal namespace.
- Historical design documents and implementation plans.
- Generic test fixture paths such as `/tmp/goblin-repo` unless the fixture directly represents the application identity.

## Desktop Identity

The selected desktop identity is:

- Display name: `Hobgoblin`
- Package name: `hobgoblin`
- Bundle identifier: `hobgoblin.app`
- App bundle: `Hobgoblin.app`
- DMG artifact pattern: `Hobgoblin-<version>-<arch>.dmg`

`package.json`, `electron-builder.ts`, and the desktop scripts should agree on these values. The implementation should continue to use the existing constants in scripts such as `APP_NAME` and `APP_ID` rather than scattering literal strings.

## Runtime Isolation

Goblin and Hobgoblin must be able to run at the same time without sharing desktop runtime state.

The isolation boundary is the desktop application identity:

- `electron-builder.ts` uses `appId: 'hobgoblin.app'`.
- Install and signing scripts use `APP_ID = 'hobgoblin.app'`.
- Installed app path becomes `~/Applications/Hobgoblin.app`.
- The close-app helper only targets the `Hobgoblin.app` binary path and quits the app named `Hobgoblin`.

This separates Hobgoblin from Goblin for macOS bundle identity, notification identity, app data path derivation, and single-instance ownership.

The embedded server already allocates an available port when the preferred port is occupied. If Goblin already uses the preferred port, Hobgoblin should keep the existing port allocation behavior and bind a different available port.

## User-Facing Copy

Visible product copy should say `Hobgoblin` when it refers to the application. This includes:

- HTML title and favicon alt text.
- Settings and About text.
- Notification test titles and notification troubleshooting text.
- General settings examples for opening repositories from the terminal.
- Main-process error dialogs.
- README and desktop build documentation.

The command example should become:

```bash
open -b hobgoblin.app /path/to/repo
```

Internal examples that describe repository paths, branch names, or unrelated fixture data do not need to be renamed.

## Internal Protocol Names

Internal `goblin` namespaces should remain unchanged unless they leak into user-visible desktop identity.

This keeps the change small and avoids unnecessary churn across main, preload, renderer, server, and tests. These names do not prevent the original Goblin app and Hobgoblin from running together because they live inside each process or inside process-local HTTP traffic protected by each app's own runtime secret.

Examples to preserve:

- `goblin:rpc`
- `goblin:event`
- `x-goblin-internal-secret`
- `window.goblinNative`
- `__GOBLIN_BOOTSTRAP__`
- `GOBLIN_SERVER_PORT`
- `GOBLIN_WEB_DEV_URL`
- `.goblin-terminal-*`
- `application/x-goblin-file-paths+json`

## Error Handling

Existing error handling behavior should remain unchanged except for visible product names.

Examples:

- Embedded server startup failure dialog should say `Hobgoblin failed to start`.
- Build and install errors should refer to `Hobgoblin.app`.
- The close-app script should not attempt to close `Goblin.app`.

No new recovery flow is required.

## Tests

Update focused tests for renamed desktop-facing behavior:

- Main process startup error dialog title.
- Settings strings that include the `open -b` bundle identifier example.
- About settings or component tests that assert the product name or image alt text.
- Build or script tests if present for app name, app id, artifact names, or close-app behavior.

Do not update tests only because they contain internal namespaces or generic fixture paths that remain intentionally unchanged.

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

If Electron build dependencies are available locally, also run a macOS dir build or the existing install build path far enough to confirm the generated app bundle is named `Hobgoblin.app`.

## Risks

The main risk is accidentally leaving a desktop identity string as `Goblin`, which would make the renamed app confusing or could preserve shared macOS identity. A targeted `rg -n -i "goblin"` scan over PC files should be part of verification, with each remaining hit classified as either intentionally internal, Android-only, historical documentation, or a fixture.

The second risk is over-renaming internal protocol names. That would require coordinated edits across preload, renderer, server, and tests without improving side-by-side app isolation. The implementation should avoid that churn.

## Acceptance Criteria

- The desktop app installs and appears as `Hobgoblin`.
- The desktop bundle identifier is `hobgoblin.app`.
- The desktop app bundle is `Hobgoblin.app`.
- User-facing desktop copy no longer refers to the app as `Goblin`.
- Terminal open examples use `open -b hobgoblin.app /path/to/repo`.
- The original Goblin app and Hobgoblin can be installed and launched independently.
- Remaining `goblin` occurrences in PC files are intentionally internal, historical, or fixture-only.
- Android files are unchanged.
- `bun run typecheck`, `bun run check:architecture`, and `bun run test` pass.
