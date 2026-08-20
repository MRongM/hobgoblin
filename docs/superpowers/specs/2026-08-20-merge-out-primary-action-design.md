# Merge-out Primary Action Design

## Goal

Make the more complete “pull destination, merge, and push” merge-out path visually easier to identify than the local merge-only path.

## Selected approach

Use the existing dialog action hierarchy instead of adding a new color token:

- Keep **Cancel** first as an outline button.
- Place **Merge into destination** second and render it as an outline button.
- Place **Pull destination, merge, and push** last and render it with the existing default primary button color.

The primary color communicates the preferred complete workflow. It must not use the destructive red variant because neither merge-out mode is a delete or destructive confirmation.

This is preferred over giving both actions a filled color, which would remove their hierarchy, or introducing a one-off accent class, which would duplicate the established button system.

## Behavior boundaries

- Change only the action order and visual variants in `MergeOutDialog`.
- Preserve the current enabled/disabled rules, pending indicators, click handlers, form submission behavior, Git plan, and execution modes.
- A destination without a usable upstream continues to disable the primary pull-merge-push action while leaving an eligible merge-only action available.
- A remote destination continues to disable merge-only and allow only the pull-merge-push action.

## Domain review

This is presentation hierarchy for the existing repository branch merge-out modes. It adds no domain term, state, or irreversible architectural decision, so `CONTEXT.md` and ADRs remain unchanged.

## Testing

- Assert the footer order is Cancel, merge-only, then pull-merge-push.
- Assert merge-only uses the outline variant and pull-merge-push uses the default primary variant.
- Re-run the focused dialog tests and the project verification commands.
