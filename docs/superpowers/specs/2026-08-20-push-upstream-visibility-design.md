# Push Upstream Visibility Design

## Goal

Make the configured Git upstream explicit for single-branch pushes, branch-workspace batch pulls, and branch-workspace batch pushes.

## Domain language

Use the existing `CONTEXT.md` term **Branch upstream**: the optional Git upstream configured for one local branch. This feature does not introduce a second push-target model and does not predict the upstream that a first push may create.

## Selected approach

Carry the authoritative branch snapshot upstream into the existing branch-workspace sync plan and render it beside the local target branch. Reuse the same snapshot value in single-push action and confirmation surfaces.

This is preferred over:

- resolving a new push destination in the renderer, which would duplicate Git remote-selection policy;
- adding a new server endpoint only for display, which is unnecessary because both single and batch flows already read branch snapshots;
- adding confirmation to every push, which would change interaction policy beyond the visibility request.

## Behavior

- A single-branch push action displays the branch's configured upstream without adding a confirmation step.
- Existing protected-branch push confirmations label and display the configured upstream.
- Batch pull and batch push rows display the local target branch and its configured upstream together.
- A missing upstream displays the existing localized `no upstream` value.
- A configured but missing remote-tracking ref displays the upstream plus the existing localized `gone` state.
- Display is informational. Readiness, selection, execution order, remote fallback, upstream creation, and protected-branch confirmation behavior remain unchanged.

## Data flow

`buildBranchWorkspaceGitActionPlan` reads the target branch from the authoritative repository snapshot and adds `upstream: string | null` plus `trackingGone: boolean` to each `BranchWorkspaceSyncMemberPlan`. These values already participate in the plan fingerprint, so execution continues to reject stale plans when upstream state changes.

`SyncContent` renders the values from the plan. Single-push action labels, Local-panel push hints, and protected-push confirmations render the `RepoBranchState.tracking` value already available in the renderer. A focused `BranchUpstreamDisplay` component keeps labeled upstream, missing, and gone presentation consistent across confirmation and batch surfaces.

## Testing

- Plan tests assert upstream and gone state are projected for pull and push plans.
- Batch dialog tests assert pull and push rows show configured upstreams, missing upstreams, and gone state.
- Single-push action and dialog tests assert the upstream is visible and explicitly labeled.
- Final verification runs `bun run typecheck`, `bun run test`, `bun run check:architecture`, and `git diff --check`.
