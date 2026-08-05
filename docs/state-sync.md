# State and Sync

Use this doc for state ownership and sync rules.

## Model

Use 3 classes:

- Local state
- Runtime-coherent state
- Restorable state

Do not assume Zustand means runtime-coherent shared state.

## Local state

- Keep short-lived interaction state in component-local React state.
- Do not sync it across windows.
- Do not persist it for next launch.

Examples:

- dialog input values
- hover and open state
- temporary search state
- renderer-only branch filter state such as `branchSearchQueries`

## Runtime-coherent state

- Use this for state that should converge across windows during the current run.
- Let the server coordinate it.
- Treat renderer state as a projection, cache, or specialized runtime view of server truth.

Representative examples:

- settings query snapshots
- `useThemeStore`
- `useI18nStore`
- recent repos
- repo snapshot and status
- terminal sessions and ownership

Notes:

- `useReposStore` is not a shared cross-window store.
- `RuntimeCoherentRepoProjectionState` names the runtime-coherent repo projection slice.
- `useReposStore.repos` is a renderer-local projection of runtime-coherent repo truth.
- `ReposStore` actions are also grouped by local, restorable, runtime-coherent, and mutation responsibilities.
- Transport payloads may bundle multiple classes together; consumers should split them back into runtime-coherent and restorable views before use.
- Runtime-coherent repo actions should prefer orchestration entrypoints plus focused helper modules for projection/state transitions and sync pipelines.
- Settings truth lives on the server; renderers read it through query snapshots or specialized runtime projections.
- Runtime-coherent state may use invalidation plus refetch or realtime streaming.

## Restorable state

- Use this for state that should survive relaunch, but does not need live multi-window sync.
- Restore it at boot.
- Persist later writes without creating a runtime mirror.

Representative examples:

- saved session state
- fixed desktop detail pane size
- per-workspace desktop repository-list height
- application-global desktop Terminal Focus preference
- active repo and open repo set for next launch
- `restorableRepoCache` for warm restore
- boot-only `useSessionRestoreStore`

Notes:

- `RestorableWorkspaceState` names the workspace fields that serialize into `SessionState`.
- `RestorableRepoCacheState` names the warm-start repo cache slice.
- `RestorableRepoSnapshot` is the stored snapshot shape inside that cache.
- Restorable helpers should focus on boot restore and persistence boundaries, not on live runtime convergence.
- `hydrateSession` belongs to the restorable boot path, while `ensureWorkspaceOpen` and `closeRepo` belong to runtime repo lifecycle.
- Restorable state is not runtime-coherent shared state.
- Session writes are renderer -> persistence only after boot restore; they do not publish runtime invalidation.
- Native-only validation or registration may feed back into server-owned runtime settings and then converge through invalidation/refetch.

## Sync rules

- Use invalidation plus refetch for runtime-coherent state that changes occasionally.
- Use streaming only for continuous flows such as terminal output.
- Treat session restore as boot-only.
- Suppress self-echo when a renderer mutation causes its own invalidation event.

## Rules of thumb

- If the state only matters during one interaction, keep it local.
- Compact workspace focus surfaces (`detail`, `scope`, and `files`) are local presentation state. Do not persist them or project them into desktop pane state.
- Desktop Terminal Focus is an application-global, restorable workspace-layout preference. Project it through `RestorableWorkspaceState.detailFocusMode`, preserve it across project, repository, branch, branch-workspace, and terminal changes, and persist explicit enter/exit changes through `SessionState`.
- When the current destination or compact viewport cannot present Desktop Terminal Focus, keep the preference latent instead of clearing it. Reapply it when an eligible desktop terminal destination is available; clear it only through an explicit exit or session reset.
- If the state must converge across windows right now, make it runtime-coherent.
- If the state only needs to come back on next launch, make it restorable.
- Let the server own runtime-coherent truth for settings, repo data, and terminal state.
