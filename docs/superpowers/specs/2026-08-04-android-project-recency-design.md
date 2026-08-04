# Android Project Recency Design

## Goal

Show when each Android Project was first saved and put newly created Projects first until the user chooses a manual order.

## Confirmed Semantics

The Project created time is the immutable device-local time when Android first saves a Project record. It is not the creation time of the remote directory, Git repository, or Git history, and editing a Project preserves it.

The existing drag order remains authoritative after the user saves a manual Project order. Descending created time is only the default when no effective saved Project order exists.

Legacy Project records do not contain a trustworthy created time. They remain usable, display an explicit unknown-time label, and follow timestamped Projects while preserving their existing relative storage order.

## Considered Approaches

1. **Persist an honest nullable created time — selected.** New Projects receive a real timestamp, old records remain explicitly unknown, and the codec migrates forward without inventing history.
2. **Infer time from persisted list position.** This could approximate recency but cannot provide the requested creation time and may be wrong after edits.
3. **Backfill legacy records with migration time.** This would make every existing Project appear newly created and would present fabricated information.

## Scope

- Add an optional created-time field to the Android Project profile and persistence format.
- Assign the field exactly once in the Project factory used by setup and tmux imports.
- Preserve the field through Project edits and storage round trips.
- Decode legacy four-field and five-field records with unknown created time.
- When no effective manual Project order exists, sort timestamped Projects by created time descending and keep unknown legacy Projects last in their existing relative order.
- When a saved manual Project order still references any current Project, retain the existing manual-order behavior, including appending newly discovered Projects after retained ordered items.
- Apply the global ordering before the existing Host filter.
- Show localized relative created time on every Project card; show localized unknown-time text for legacy records.
- Add aligned English, Simplified Chinese, Japanese, and Korean resources.
- Do not change Host or Worktree ordering, remote data, Project identity, or Git behavior.

## Presentation

The created-time line appears with the Project metadata after its kind and before the optional SSH address. It uses small label typography and `onSurfaceVariant`, leaving the host, alias, path, terminal count, and actions visually dominant.

Android's locale-aware relative-time formatter supplies the time phrase with minute-level resolution. Older timestamps may naturally render as locale-formatted dates. The text is recomputed when the card recomposes; no timer is introduced.

## Architecture

`RemoteRepositoryProfile` owns the optional immutable timestamp because it is part of the restorable Android Project record. `RemoteRepositoryCodec` appends one backward-compatible storage field and explicitly maps old records to unknown time.

`ProjectsScreen.kt` owns a pure ordering projection that selects default recency or the existing manual-order policy. The screen formats the timestamp only at the presentation boundary. No server, realtime, terminal, or Git layer changes are required.

## Error Handling and Compatibility

- Non-positive or malformed persisted timestamps make that record invalid rather than silently changing its identity or time.
- Legacy records remain valid and do not get rewritten with fabricated values.
- Unknown-time records remain deterministic because stable sorting preserves their current storage order.
- Filtering cannot create a second ordering policy because it operates after global ordering.

## Testing

- Prove new Project creation accepts and retains a deterministic created time.
- Prove the storage codec round-trips created time and still decodes legacy four-field and five-field records as unknown.
- Prove default ordering is newest-first, keeps unknown legacy records last and stable, and uses default ordering when saved IDs are entirely stale.
- Prove a valid saved manual order remains authoritative.
- Prove Host filtering preserves the global order.
- Prove every Project card uses the stored timestamp, locale-aware relative formatting, and localized unknown-time fallback.
- Verify all maintained locale resources remain aligned.
- Run focused Android tests, the complete Android unit suite, Lint, debug assembly, and root repository checks.

## Acceptance Criteria

1. A newly saved Android Project has an immutable device-local created time.
2. Without an effective manual order, the newest timestamped Project appears first.
3. A valid saved manual order remains unchanged by created-time sorting.
4. Legacy Projects remain visible, display unknown creation time, and retain their relative order after timestamped Projects.
5. Every Project card displays localized creation-time metadata.
6. Editing, filtering, opening, and terminal activity do not change a Project's created time or manual order.
