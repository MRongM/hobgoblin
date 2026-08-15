# Keep Windows as an independent platform package

Windows is a standalone package under `windows/`, alongside Android, with its own application source, build configuration, dependencies, and generated artifacts. We deliberately reject conditional Windows behavior in the root desktop/web application and a newly extracted shared-core refactor: the former weakens platform isolation, while the latter expands this migration beyond its proven Windows implementation.

## Consequences

- Windows changes are made and verified from `windows/`; its release artifacts are written below that directory.
- Root-level release automation orchestrates Windows outputs but does not build Windows application code from the root package.
- Synchronizing future product features between the primary application and Windows is explicit work, not an implicit source-code dependency.
