# Android Hobgoblin Rename Design

## Goal

Rename the imported Android project from Goblin to Hobgoblin and change its Android package identity from `dev.goblin.android` to `dev.hobgoblin.android`.

The migration is intentionally complete: maintained Android source, tests, resources, configuration, runtime identifiers, and Android-owned documentation must not retain the former Goblin name.

## Scope

The migration applies only to `android/` and covers:

- Gradle project name, namespace, and application ID.
- Android application label and manifest class references.
- Kotlin package declarations, imports, and source directory paths in main and test source sets.
- Public and private Kotlin symbols whose names contain `Goblin`.
- Filenames and Android resource names containing `goblin`.
- Persistence keys, notification identifiers, SSH key comments, shell markers, and other runtime strings containing the former name.
- Documentation under `android/docs/`.

The migration does not rename the top-level `android/` directory and does not change code outside `android/`.

## Canonical Mapping

| Former value | Replacement |
| --- | --- |
| `GoblinAndroid` | `HobgoblinAndroid` |
| `Goblin` | `Hobgoblin` |
| `goblin` | `hobgoblin` |
| `GOBLIN` | `HOBGOBLIN` |
| `dev.goblin.android` | `dev.hobgoblin.android` |
| `dev/goblin/android` | `dev/hobgoblin/android` |

Case-preserving replacement applies to compound identifiers such as `goblin-android`, `goblin_android`, and `__GOBLIN_ANDROID_*__`.

## Migration Strategy

Perform one atomic source-tree migration without deprecated aliases or compatibility wrappers:

1. Rename package directories for main and test source sets.
2. Apply case-preserving identifier replacement to maintained files under `android/`.
3. Rename Kotlin files and resources whose filenames contain the former name.
4. Update Gradle and manifest identity settings.
5. Clean generated Android outputs before compiling and testing the renamed project.

This approach keeps the codebase internally consistent and avoids carrying a second identity that is not required by the requested full rename.

## Compatibility

Changing `applicationId` to `dev.hobgoblin.android` makes the result a distinct Android application. Existing installations of `dev.goblin.android` and their sandboxed application data are not upgraded or migrated.

Internal persisted names and remote command markers are renamed rather than retained. No migration layer is added because the requested outcome is a complete identity replacement.

The renamed `hobgoblin-` tmux session prefix retains the existing 32-character session-name limit by using a 22-character SHA-256 hex prefix instead of the former 24-character prefix.

## Verification

The migration is complete only when all checks pass:

1. A case-insensitive PCRE search for `(?<!hob)goblin` in maintained files under `android/`, excluding generated directories, returns no matches. The negative lookbehind is required because `hobgoblin` contains `goblin` as a substring.
2. Kotlin source and test files reside under `dev/hobgoblin/android` and declare `dev.hobgoblin.android` packages.
3. Gradle configuration reports `namespace` and `applicationId` as `dev.hobgoblin.android`.
4. `./gradlew clean test` succeeds from `android/`.
5. Root `bun run typecheck`, `bun run test`, and `bun run check:architecture` succeed.

## Safety

- Existing unrelated worktree changes remain untouched.
- Generated build outputs may be removed only through Gradle's `clean` task.
- No Git commit, branch operation, or network Git write is part of this work.
