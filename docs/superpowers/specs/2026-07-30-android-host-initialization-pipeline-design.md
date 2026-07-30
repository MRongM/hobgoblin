# Android Host Initialization Pipeline Design

## Goal

Simplify Android SSH access initialization so one temporary-password submission automatically trusts a first-seen host key, generates or reuses the selected identity, installs its public key, and immediately runs the existing key-only host connectivity diagnostic.

## Confirmed behavior

- The happy path has one user action after the Host address, user, port, and temporary password are entered.
- A first-seen host key is trusted automatically as TOFU (trust on first use).
- A host key that differs from an already trusted fingerprint fails closed. The UI shows both fingerprints and requires a separate explicit trust action before another initialization attempt.
- An already trusted matching host key proceeds without another prompt.
- A selected or associated readable identity is reused; otherwise Hobgoblin generates a managed identity.
- Public-key installation continues to pin the fingerprint observed before password authentication, so a key change during the connection attempt is rejected.
- Connectivity diagnostics run automatically after public-key installation and authenticate only with the initialized private key.
- The temporary password is never passed to diagnostics, persisted, logged, or retained after the attempt.
- A failed diagnostic does not undo host-key trust or public-key installation. The initialized identity remains attached to the draft so the user can retry diagnostics or save the Host with an offline status.
- Saving the Host remains explicit. Initialization does not persist unfinished form fields.
- Saved-Host diagnostics remain available as an independent action.

## Domain boundaries

**Android SSH access initialization** owns host-key policy, identity preparation, password authentication, and public-key installation.

**Android host connectivity diagnostic** remains a separate key-only reachability and shell probe. The initialization UI chains it after successful installation but does not merge password handling into the diagnostic service.

**Android host online state** remains the persisted outcome of the latest diagnostic. Automatic post-initialization diagnostics update the draft's existing healthy/unhealthy value, which is persisted only if the user saves the Host.

## Architecture

### `SshInitializationService`

`initialize(profile, password)` becomes the authoritative host-key policy boundary:

1. Fetch the current host fingerprint.
2. Evaluate it against `HostKeyTrustStore`.
3. Trust `Unknown` automatically.
4. Continue for a matching `Trusted` fingerprint.
5. Throw a typed changed-key error for `Changed`, carrying previous and current fingerprints.
6. Reject any explicit `Rejected` result.
7. Generate or reuse identity material and install its public key while pinning the observed fingerprint.
8. Clear the password in `finally` on every exit.

The obsolete precheck API and its manual first-use trust states are removed. `trustHostKey` remains available for the exceptional explicit changed-key review and for saved-Host diagnostic recovery.

### Add Host initialization flow

A focused function in the Add Host feature composes two existing callbacks:

1. Invoke SSH access initialization.
2. Retain the returned profile immediately.
3. Run diagnostics with that returned profile, not the pre-initialization draft.
4. Return either a diagnostic result or a diagnostic failure together with the initialized profile.

This function is independently unit tested. It does not own persistence, coroutines, Android context, or SSH implementation details.

### Compose state

`AddHostScreen` continues to own short-lived interaction state:

- password text;
- single-flight submission state;
- initialized identity reference;
- changed-key review details;
- diagnostic loading/result/error state;
- draft diagnostic status.

No new persistence schema, process-wide state, dependency, or background worker is introduced.

## User flow

### Happy path

1. User enters Host fields and a temporary password.
2. User taps `Initialize SSH access` once.
3. The action is disabled for the complete initialization-and-diagnostic pipeline.
4. Hobgoblin automatically trusts a first-seen fingerprint.
5. Hobgoblin generates or reuses an identity and installs its public key.
6. Hobgoblin immediately runs the key-only connectivity diagnostic.
7. The card shows initialized identity status plus online/offline diagnostic feedback.
8. User explicitly saves or cancels the Host form.

### Changed host key

1. Initialization stops before identity generation or public-key installation.
2. The password is cleared.
3. The card displays previous and current fingerprints.
4. The user may explicitly trust the current fingerprint.
5. Trusting only updates host-key trust; the user re-enters the temporary password and starts a fresh initialization attempt.

### Diagnostic failure after installation

1. The initialized identity remains selected on the draft.
2. The draft records an unhealthy status.
3. The UI distinguishes successful key setup from failed connectivity.
4. The user may retry the key-only diagnostic without re-entering the server password.

## Error and security behavior

- Validation and network failures before installation remain initialization errors.
- Incorrect passwords and remote `authorized_keys` failures do not start diagnostics.
- Host-key changes never overwrite trust automatically.
- A first-use fingerprint is trusted before password authentication; subsequent installation pins that exact fingerprint.
- Diagnostic `ok = false` and thrown diagnostic errors both retain the initialized profile and produce offline feedback.
- Changing Host, user, port, or selected identity while the pipeline is running invalidates its UI result so an old target cannot update the new draft.
- Existing `authorized_keys` material-based deduplication remains unchanged.
- No automatic removal or rollback of remote public keys is attempted.
- Error messages must not contain the password, private-key bytes, or complete sensitive commands.

## UI and copy

- Keep the existing Material 3 card and sentence-case actions.
- Remove the normal-path manual `Trust host key` step.
- Replace the post-install requirement to manually test with automatic loading and result feedback.
- Keep an explicit retry/test action after initialization.
- Keep the exceptional changed-key fingerprints and explicit trust action visually separate from the normal password flow.
- Preserve imported-key actions and saved-Host diagnostics.

## Testing

### Service tests

- First-seen fingerprints are trusted automatically before installation.
- Matching trusted fingerprints install normally without rewriting trust.
- Changed fingerprints throw the typed error before identity generation/import or installation.
- Explicitly rejected fingerprints remain blocked.
- Password arrays are cleared for success and every failure path.
- Existing identity reuse, generated identity creation, fingerprint pinning, and `authorized_keys` deduplication remain covered.

### Flow tests

- Diagnostics receive the profile returned by initialization.
- Diagnostics run only after successful initialization.
- Diagnostic result and diagnostic exception paths both retain the initialized profile.

### UI contract and state tests

- Add and Edit Host wiring no longer invokes the precheck callback.
- One submission performs initialization followed by diagnostics.
- Manual first-use trust UI is absent from the normal path.
- Changed-key review, automatic diagnostic feedback, single-flight behavior, draft online/offline status, and explicit retry remain present.

### Verification

- Focused Android unit tests for initialization service and Add Host flow.
- Complete Android unit suite and debug assembly.
- Repository typecheck, Vitest suite, and architecture boundary check required by `AGENTS.md`.
- `git diff --check` and scoped diff review.

## Alternatives considered

### Recommended: service-owned trust policy plus feature-local pipeline

This keeps security policy out of Compose, preserves the domain distinction between initialization and diagnostics, and gives both halves focused tests without adding an application-wide abstraction.

### UI-only sequencing

This has fewer initial edits but makes Compose responsible for TOFU policy and callback ordering. It is harder to test and risks another caller bypassing the changed-key invariant.

### Combined application coordinator

A coordinator depending on both SSH services would expose one call but introduces a new architectural unit for a single screen and blurs the password-free diagnostic boundary. It is unnecessary for the current scope.

## Acceptance criteria

1. One password submission performs first-use trust, identity preparation, public-key installation, and key-only diagnostics in order.
2. Matching trusted fingerprints proceed silently; changed fingerprints stop before key creation or upload.
3. The temporary password is cleared after every attempt and never reaches diagnostics.
4. Diagnostics use the initialized profile and begin automatically only after installation succeeds.
5. Diagnostic failure retains the initialized identity and shows offline feedback with an explicit retry path.
6. Repeated taps cannot create concurrent initialization pipelines.
7. Host form persistence remains explicit and existing import/export and saved diagnostics behavior remain intact.
