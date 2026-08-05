# Merge Settings Pages Design

## Goal

Remove the standalone Files and Security settings destinations while preserving all of their controls under General and LAN respectively.

## Selected approach

Treat Files and Security as reusable settings sections rather than routable settings pages:

- remove `files` and `security` from the canonical `SettingsPage` list and sidebar configuration;
- render `FileAreaSettings` together with `GeneralSettings` for the General destination;
- render `SecuritySettings` under the LAN destination in every runtime and retain the existing Electron-only visibility of `LanSettings`;
- keep the legacy `/settings/files` and `/settings/security` paths as redirects to `/settings/general` and `/settings/lan` so bookmarks do not silently close Settings;
- make the combined LAN destination available in both Electron and Web, because Security is currently available in both runtimes and must remain reachable after the merge.

The existing section components, settings controllers, query snapshots, write paths, and persistence remain unchanged. `SettingsSurface` continues to own destination composition, so General and LAN do not acquire each other's implementation dependencies.

## Alternatives considered

1. Hide only the two sidebar items. This leaves two canonical pages and direct URLs, so the destinations are not actually removed.
2. Move the Files and Security implementation directly into `GeneralSettings.tsx` and `LanSettings.tsx`. This duplicates composition responsibility and creates unnecessary coupling and code churn.

## Compatibility and behavior

- Existing settings values and mutation behavior are unchanged.
- `/settings/files` redirects to `/settings/general`.
- `/settings/security` redirects to `/settings/lan`.
- The LAN destination becomes visible in Web as the sole destination for the previously Web-visible Security controls, while the host-level LAN controls remain Electron-only.
- No translation copy changes are required: the existing section labels remain valid inside their new destinations.

## Testing

- Assert the canonical settings-page list excludes Files and Security.
- Assert General renders file-area controls and LAN renders Web-access security controls without exposing Electron-only LAN controls on Web.
- Assert the sidebar no longer exposes Files or Security.
- Assert both legacy routes redirect to their merged destinations, including Security-to-LAN in Web runtime.
- Run the focused settings/router tests, typecheck, the full test suite, and the architecture guard.

## Self-review

- No placeholders or unresolved choices remain.
- The page-removal, content-preservation, Web reachability, and legacy-route requirements are mutually consistent.
- The change stays within renderer composition and shared navigation metadata; it does not alter server-owned settings state.
- This reversible UI/navigation decision introduces no new domain term and does not meet the threshold for an ADR.
