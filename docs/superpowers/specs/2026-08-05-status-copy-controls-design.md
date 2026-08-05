# Status Copy Controls Design

## Goal

Remove every row-level copy button from the Status tab while retaining the toolbar action that copies the complete status summary.

## Selected approach

- Render folder, project, branch, worktree, commit hash, commit message, commit author, and commit time as ordinary truncated text without adjacent copy controls.
- Keep `branchStatusClipboardText` unchanged so the toolbar's Copy all action retains its current labels, raw values, ordering, and empty-value behavior.
- Remove copy-only component helpers, props, and translations that become unused.
- Do not change copy actions in Changes, History, Files, Ports, or terminal surfaces.

## Testing

- Assert the Status tab contains exactly one copy button and that it is the Copy all action.
- Assert no row-level copy aria-label is rendered.
- Assert Copy all still writes the complete expected summary once.
- Run the focused component test and repository regression gates.

## Self-review

- The scope matches the supplied screenshot: only the Status tab's per-item controls are removed.
- Displayed values and the aggregate clipboard payload remain unchanged.
- No unresolved behavior or placeholder remains, and no ADR is warranted.
