---
status: accepted
---

# Publish primary application Windows artifacts

Hobgoblin publishes its official Windows x64 and ARM64 installers from the primary application's root package and `src/` tree. This supersedes ADR-0004's release ownership because maintaining a second application source under `windows/` caused released Windows functionality to drift behind the primary desktop application; the independent Windows package remains available for package-local development and testing but no longer supplies versioned GitHub Release assets.

## Considered options

Continuing to publish the independent package would require every product feature to be implemented and reviewed twice. Publishing both variants would expose two same-version Windows products with different behavior. Making the primary application the single official desktop source preserves macOS/Windows feature parity without introducing a shared-core refactor.

## Consequences

The root package owns Windows installer configuration and official Windows release validation. Release automation must build, smoke-test, and upload root-package x64 and ARM64 installers, while independent-package artifacts use distinct temporary names and are never merged into the versioned release asset set.
