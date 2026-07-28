# Android SSH Initialization Single-Flight Design

## Goal

Prevent repeated taps on `Initialize SSH access` from launching concurrent identity generation and public-key installation, and avoid duplicate `authorized_keys` entries when the same public-key material is presented with a different comment.

## Confirmed behavior

- One add/edit-host screen may have at most one SSH access initialization attempt in flight.
- The in-flight interval starts before the initialization precheck and ends only after the attempt succeeds, fails, or stops at an explicit host-key trust decision.
- While the attempt is in flight, the initialization action is disabled and shows progress feedback. Repeated taps are ignored at the event boundary.
- A failed attempt releases the guard so the user can retry normally.
- Successful initialization continues to expose the existing explicit `Test connection` action. Initialization and connectivity diagnostics remain separate operations.
- Changing host fields or leaving the screen does not persist the in-flight state.

## Public-key installation

The installation script identifies an existing public key by its SSH key type and Base64-encoded key body. The trailing comment is descriptive metadata and does not participate in identity comparison.

- The same type and key body with a different comment is already authorized and is not appended again.
- A genuinely different key body is appended and remains independently authorized.
- Existing entries are never deleted or rewritten automatically.
- An existing matching key with authorization options remains authoritative; initialization does not append an unrestricted duplicate of that key.
- The script preserves the existing ownership boundary: it only ensures the requested key is present and maintains `.ssh`/`authorized_keys` permissions.

## Architecture

The add/edit-host Compose screen owns the short-lived single-flight state because it is local interaction state. The event handler checks and sets this state synchronously before launching coroutine work, so a second tap cannot enter the precheck or identity-generation path. The complete precheck-and-install sequence is expressed as one coroutine-owned operation with one release path.

`SshInitializationService` continues to own identity reuse/generation. `SshjInitializationClient` continues to own the remote installation command. Public-key token extraction and script generation remain close to that boundary so they can be tested without opening a real SSH connection.

No persistence schema, background worker, process-wide lock, dependency, or automatic key-removal flow is introduced.

## Alternatives considered

### Recommended: screen-local single-flight guard plus material-based remote deduplication

This closes the observed double-tap race at its source, gives immediate UI feedback, and makes repeated installation idempotent when only a key comment differs. It matches the project's local-state guidance and keeps the change within the Android SSH feature.

### Disable only the visible button

This improves presentation but leaves the event handler callable more than once and does not protect the precheck-to-install transition. Rejected because the correctness invariant would depend solely on UI rendering timing.

### Process-wide service lock

This would serialize unrelated host initialization attempts and require lock-key lifecycle management. It is unnecessary because the current application has one caller per visible host draft and the defect originates at that interaction boundary. Rejected as needless complexity.

## Error and security behavior

- The temporary password remains memory-only and is cleared after an installation attempt as it is today.
- A validation, precheck, trust, authentication, or remote-command failure releases the guard and retains the existing actionable error surface.
- Unknown or changed host keys still require explicit trust; single-flight behavior never bypasses host-key verification.
- Public-key installation never removes an older authorization automatically because the application cannot prove whether another client still depends on it.
- Matching by cryptographic key material prevents a comment-only variation from creating a broader duplicate authorization.

## Testing

- A focused unit test proves a second submission is rejected while the first is in flight and that retry becomes available after completion.
- Focused state tests prove the initialization action is unavailable while work is in flight.
- Installation-script tests prove comment-only variants are treated as the same key and different key bodies remain appendable.
- Existing initialization service tests continue to prove identity generation, identity reuse, password clearing, and host-key enforcement.
- Run the focused Android tests first, then `./gradlew testDebugUnitTest assembleDebug` from `android/`.

## Acceptance criteria

1. Rapid repeated taps cause exactly one identity generation and one public-key installation attempt.
2. The initialization action visibly enters a disabled progress state until the attempt settles.
3. Failure allows an explicit retry.
4. Reinstalling identical key material with a different comment does not append another `authorized_keys` line.
5. Different key material is not removed or silently replaced.
6. Host-key trust, temporary-password handling, explicit connectivity diagnostics, and saved online/offline semantics remain unchanged.
