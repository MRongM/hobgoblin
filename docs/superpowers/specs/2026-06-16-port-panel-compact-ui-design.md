# Port Panel Compact UI Design

## Goal

Make the repository `Ports` tab more compact without changing port-forwarding behavior.

The approved direction is the existing single-row form with reduced horizontal width:

```text
Local port | Remote port | LAN | icon-only Forward
```

The panel should stay readable in a dense desktop tool layout while taking less width than the current form.

## Scope

In scope:

- Keep the current single-row form structure.
- Narrow the local and remote port inputs.
- Shorten the visible LAN toggle text to `LAN`.
- Keep the full LAN label available through `aria-label` and `title`.
- Change the start button to an icon-only control.
- Keep the start button accessible through `aria-label` and `title`.
- Slightly tighten active session row spacing.

Out of scope:

- Changing the port-forwarding API shape.
- Changing local/remote port follow behavior.
- Changing LAN binding behavior.
- Persisting form defaults.
- Adding presets or new forwarding modes.
- Refactoring shared UI primitives globally.

## Product Behavior

The form keeps the same actions and data entry model:

- Local port remains the primary required input.
- Remote port continues to follow local port until the user edits remote port.
- LAN off still binds to `127.0.0.1`.
- LAN on still binds to `0.0.0.0` and shows the existing warning.
- Forward starts the same request as today.

The visible UI becomes denser:

- Port inputs use a compact local class instead of the default full-width input sizing.
- The LAN control displays `LAN` to reduce text width.
- The forward action uses only the play icon.
- Session rows reduce horizontal gaps and padding but keep route text, status, open, copy, and stop actions visible.

## Architecture

Keep the change local to `src/web/components/repo-workspace/ProjectPortsPanel.tsx`.

Do not add new global variants to `Input`, `Switch`, or `Button` for this task. Only the ports panel currently needs this extra density, so local class overrides are simpler and avoid widening the shared component API.

Lower-level modules remain unchanged:

- `src/shared/port-forwarding.ts` continues to normalize and validate requests.
- `src/web/port-forwarding-client.ts` continues to send the same request object.
- Server and SSH forwarding modules remain untouched.

## Accessibility

The shorter visible labels must not remove assistive labels:

- LAN switch `aria-label` remains the translated full label for allowing LAN connections.
- LAN switch `title` also uses the full label.
- Forward button `aria-label` remains the translated start/forward label.
- Forward button `title` also uses the full label.

Icon-only controls in session rows already use accessible labels and should keep them.

## Testing

Update focused renderer tests for `ProjectPortsPanel`:

- The form still renders `localPort` and `remotePort` inputs.
- The LAN switch still exists and toggles the warning.
- Submitting with LAN off sends `localBindHost: "127.0.0.1"`.
- Submitting with LAN on sends `localBindHost: "0.0.0.0"`.
- The start button remains discoverable by `data-testid="ports-start"`.
- Existing session action behavior remains covered.

Run:

```bash
bun run typecheck
bun run test
```

## Principles

- KISS: use local sizing overrides instead of introducing shared component variants.
- YAGNI: do not add presets, remembered widths, or new API fields.
- DRY: keep existing validation and request construction boundaries.
- SOLID: keep presentation density in the renderer component and leave forwarding lifecycle modules unchanged.
