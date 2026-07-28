# Android List Prompts and Private Key Export Design

## Goal

Simplify the Android Host, Project, and Tmux main-tab lists by removing redundant introductory copy, and let users explicitly export the private key associated with an edited SSH Host.

## Scope

- Remove the `Saved hosts` heading and its reserved spacing from a non-empty Host list.
- Remove the `Saved projects` heading and its reserved spacing from the unfiltered Project list.
- Preserve the selected-Host heading and `Show all` action when the Project list is Host-filtered because they communicate active scope rather than saved state.
- Remove the `Choose a host` title and explanatory paragraph from the non-empty Tmux Host chooser.
- Preserve loading, error, empty, filtering, selected-Host, refresh, and action feedback.
- Keep the existing private-key import action on both Add Host and Edit Host.
- Add private-key export only to Edit Host and only while the current draft has an effective identity.
- Place private-key import and export actions in one equal-width row when both are available.
- Keep Settings as the rightmost top-app-bar action on every main tab.
- Show each Host's associated Project count, including zero.
- Show each Project's associated retained Terminal count, including zero.
- Keep Terminal-tab items in a stable creation order without manual drag handles.
- Distinguish Terminal cards by state: running is green, disconnected is yellow, exited or failed is red, and starting remains neutral.
- Reduce the main top-app-bar height while preserving system insets and usable action targets.
- Use the associated Host as the primary title of both Terminal and Project cards.
- Render each Terminal working directory and Project root directory as a highlighted, semibold, wrapping monospace line.
- Export the effective draft identity in the existing precedence order: newly imported identity, newly initialized identity, then the Host's saved identity.
- Do not add public-key export, sharing intents, automatic backups, key deletion, or identity inventory management.

## Interaction Design

The Edit Host form places `Import private key` and `Export private key` together in one equal-width row. When export is unavailable, import occupies the available row width. `Export private key` is absent on Add Host and when no effective identity exists.

Main-tab action order keeps tab-specific creation actions before Settings, making Settings the stable rightmost action. Host cards render the associated Project count at the end of the title row, before the reorder handle. Project cards use the same placement for retained Terminal count. Both counters remain visible at zero to keep scanning and alignment predictable.

The main top app bar uses a compact explicit height. Terminal-tab cards are sorted by immutable creation time with ID as a deterministic tie breaker, so status updates do not move items. Manual reordering and its drag handle are removed from this tab. Card backgrounds use semantic, low-emphasis containers: green for running, yellow for disconnected, red for exited/failed, and the normal surface for starting.

The Terminal card action row contains one connection-state action slot. Starting or running sessions show `Close`; exited, failed, or disconnected sessions show `Reconnect`. These actions are mutually exclusive and switch immediately when retained status changes. Delete and Open remain available beside that slot, and Close keeps its existing confirmation flow.

Terminal and Project cards share a Host-first information hierarchy. The associated saved Host title is the first row; if the Host record is unavailable, the persisted Host reference/ID provides a non-empty fallback. Terminal cards retain the terminal display name or slot and Project context as secondary information. Project cards retain a non-blank Project alias as secondary information, without repeating the path when no alias exists. The directory is the visual anchor below that context: theme primary color, monospace, semibold, and wrapping rather than truncation.

Selecting export first opens a warning dialog. The warning states that the exported private-key file grants SSH access and is no longer protected by Hobgoblin's encrypted private app storage. Cancel closes the dialog without opening the document picker. Confirm opens Android's system document creation UI with a sanitized Host-derived filename. Cancelling the picker is a no-op; successful export shows inline success feedback; write or decrypt failures show an inline error without exposing key material.

## Architecture and Data Flow

`AddHostScreen` owns only short-lived interaction state: confirmation visibility, the identity selected for the pending export, document-picker launch, and success/error presentation. It passes the document output stream and identity ID through a narrow callback.

`SecureIdentityStore` remains the private-key source boundary. A focused export method loads the protected identity, writes the original bytes to the caller-provided output stream, flushes the stream, and clears the decrypted byte array in a `finally` block. The Compose UI never receives a private-key `ByteArray`.

The application root wires Edit Host to this export method. Add Host receives no export capability. Export does not mutate the Host profile or identity reference.

The application root derives both count maps from its existing snapshots. Projects are grouped by `hostProfileId`; retained terminal sessions with a non-null `repositoryId` are grouped by that Project ID. Screens receive immutable maps and remain independent of repository/session stores.

## Security and Privacy

- Export is user-initiated, Edit-only, and protected by a disclosure confirmation.
- The system document provider chooses the destination; no broad storage permission is added.
- Private-key text is never logged, copied to the clipboard, placed in a sharing intent, or stored in Compose state.
- Decrypted bytes are cleared after both successful and failed writes.
- The localized privacy policy states that an explicitly exported document contains the original private-key material outside Hobgoblin's encrypted private storage.

## Localization

Remove the now-unused Host, Project, and Tmux prompt resources from all maintained locales. Add localized strings for export action, confirmation title/body, success, read/write failure, and pluralized Project/Terminal counts. English, Simplified Chinese, Japanese, and Korean resource sets must remain aligned.

## Testing

- Source-contract tests prove the three redundant prompt resource references are absent while scoped/feedback actions remain.
- State tests prove export availability is Edit-only, follows effective-identity availability, and produces a safe default filename.
- Store tests prove exported bytes match the decrypted source and that the temporary plaintext array is zeroed, including write failure.
- App wiring tests prove Edit Host connects the export callback while Add Host does not expose an export action.
- Source-contract tests prove import/export share one equal-width row and Settings is the final top-bar action.
- Pure aggregation tests prove Projects group by Host, only Project-associated terminals are counted, and unknown entries display zero.
- Terminal state tests prove ordering is status-independent and each status maps to the intended semantic card tone.
- Terminal state tests prove the connection action maps active sessions to Close and inactive sessions to Reconnect; source contracts prove both buttons are not rendered together.
- Main-tab source contracts prove the compact app-bar height is explicit.
- Presentation tests prove Host-title fallback behavior and preservation of Terminal/Project secondary names.
- Source contracts prove both directory lines use primary color, monospace type, semibold weight, and wrapping.
- Localization contract tests and the complete Android unit-test suite protect locale parity and existing behavior.

## Acceptance Criteria

1. Non-empty Host and unfiltered Project lists start directly with their cards.
2. The non-empty Tmux Host chooser starts directly with Host cards.
3. A filtered Project list still identifies the selected Host and allows clearing the filter.
4. Edit Host can import a replacement private key as before.
5. Edit Host shows export only when its effective identity exists; Add Host never shows export.
6. Export requires confirmation and writes the effective private key through the Android document picker.
7. Cancellation does nothing; failures are actionable and never reveal private-key content.
8. Plaintext private-key bytes are cleared after every export attempt.
9. Import and export render in one equal-width row when both are available.
10. Settings remains the rightmost top-app-bar action.
11. Every Host shows its Project count, including zero.
12. Every Project shows its retained Terminal count, including zero; Host-only terminal sessions are excluded.
13. Terminal-tab items cannot be manually reordered and do not jump when their status changes.
14. Running, disconnected, and exited/failed cards use green, yellow, and red backgrounds respectively; starting is neutral.
15. The main title bar is visibly shorter without overlapping system insets or actions.
16. Each Terminal item shows Close only while starting/running, or Reconnect only while exited/failed/disconnected.
17. Terminal and Project cards use their associated Host as the title and retain meaningful Terminal/Project names as secondary context.
18. Terminal working directories and Project root directories are highlighted, semibold, monospace, and not ellipsized.
19. All maintained locales, focused tests, the Android test suite, and project verification commands pass.
