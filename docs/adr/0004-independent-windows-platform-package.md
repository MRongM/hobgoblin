# Keep Windows as an independent platform package

Windows is a standalone package under `windows/`, alongside Android, with its own application source, build configuration, dependencies, and release artifacts. We deliberately reject a root-package Windows installer or release path and a newly extracted shared-core refactor: the former weakens platform isolation, while the latter expands this migration beyond its proven Windows implementation. A manually requested Windows test build may additionally package the root `src/` application as an x64 unpacked test artifact; it is not an installer or a release asset.

## Consequences

- Windows changes are made and verified from `windows/`; its release artifacts are written below that directory.
- A manually dispatched Windows Test Build can upload a separately named primary-application x64 test artifact from root `src/`; reusable release calls leave that optional job disabled.
- Root-level release automation orchestrates and publishes only the independent Windows package outputs.
- Synchronizing future product features between the primary application and Windows is explicit work, not an implicit source-code dependency.
