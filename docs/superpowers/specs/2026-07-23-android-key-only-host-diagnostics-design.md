# Android Key-Only Host Diagnostics Design

## Goal

Make Android host diagnostics use the host profile's saved private key without presenting the temporary server-password setup flow, and let users test a newly initialized identity from the add-host screen before saving the host.

## User experience

- SSH access initialization remains the only flow that accepts a temporary server password.
- The diagnostics screen always runs a key-based host diagnostic. A host without an associated private key receives a clear, actionable authentication error instead of a password field.
- After first-time SSH access initialization succeeds, the success card exposes a `Test connection` button.
- Pressing `Test connection` runs the same host diagnostic used by the saved-host diagnostics screen with the newly associated identity.
- The button shows a loading label while the probe runs. A successful result shows `online`; a failed result shows `offline` and the diagnostic message.
- Saving the draft persists the latest diagnostic outcome, so a successful test appears as `online` in the host list.
- Changing host, user, port, or identity invalidates the draft's connection-test result.

## Domain boundaries

`Android SSH access initialization` and `Android host connectivity diagnostic` are separate operations:

- Initialization may fetch and trust a host key, accept a temporary password, generate or reuse a private key, and install its public key.
- Diagnostics require an associated identity, verify the trusted host key, authenticate with the saved private key, and probe the remote shell.
- Diagnostics never create an identity, install a public key, or accept a server password.

`Android host online state` remains the persisted result of the latest diagnostic. No background polling or realtime presence state is introduced.

## Architecture

### Diagnostic enforcement

`SshDiagnosticsService` rejects a target without `identityRefId` before network I/O. This makes the key-only rule a service invariant rather than a UI convention. Existing `SshjClientFacade` behavior remains responsible for loading protected identity bytes and authenticating with that private key.

### Diagnostics screen

`DiagnosticsScreen` loses its initialization-check, password, and initialization callbacks. Its run action delegates directly to `onRunDiagnostics`. Host-key trust handling remains part of diagnostic results because it is independent of password-based identity installation.

### Add-host connection test

`AddHostScreen` receives one diagnostic callback accepting the current draft profile. The action is exposed only after initialization returns an identity reference. The screen owns ephemeral loading/result state and copies the diagnostic outcome into the draft's `lastDiagnosticStatus`. `HobgoblinAndroidApp` wires the callback to the existing `SshDiagnosticsService` without saving the draft prematurely.

### Status recording

A focused domain helper records a `DiagnosticsResult` on an `SshHostProfile` as `healthy` or `unhealthy`. Both the saved-host diagnostics route and add-host draft use it, removing duplicated string mapping while preserving the existing persistence format.

## Alternatives considered

### Recommended: explicit test action after initialization

This keeps initialization and diagnostics separately retryable, matches the requested one-click interaction, and makes failures attributable to the correct operation.

### Automatically diagnose as part of initialization

This saves one tap but couples two operations, makes a successful key installation appear failed when only the follow-up probe fails, and does not provide an explicit one-click test action. Rejected.

### Save first, then navigate to diagnostics

This reuses the existing screen with minimal code but requires extra navigation, initially persists an unverified offline host, and does not satisfy testing at first generation. Rejected.

## Error and security behavior

- Missing identity: return `AuthFailed` with guidance to configure SSH key access; do not contact the host.
- Missing or unreadable protected identity material: report the existing authentication failure path; do not fall back to password authentication.
- Unknown host key: preserve the existing explicit trust flow.
- Changed host key: remain offline and require review; never silently retrust.
- Temporary passwords and private-key bytes are not added to Compose state, host records, logs, diagnostic results, or documentation examples.

## Testing

- Service test proves a missing identity fails before fingerprint or shell calls.
- Existing service tests continue to prove successful key-based diagnostics and host-key enforcement.
- UI source-contract tests prove the add-host test action is gated by a newly initialized identity.
- Domain tests prove diagnostic results map to persisted `healthy` and `unhealthy` states.
- Source compilation proves removed diagnostics-screen password callbacks have no stale call sites.
- Run the Android unit suite and debug assembly after focused red-green cycles.

## Acceptance criteria

1. The saved-host diagnostics screen contains no password field and no SSH initialization action.
2. Every host diagnostic requires and uses the profile's associated private key.
3. Missing identity produces an actionable authentication failure without network access.
4. First-time initialization success exposes one `Test connection` action on the same screen.
5. That action diagnoses using the newly associated identity and renders `online` or `offline` feedback.
6. Saving after a successful test makes the host list show `online`.
7. Existing host-key trust, encrypted identity storage, terminal, repository, and port-forward behavior remain unchanged.
