---
status: proposed
---

# Give subworkspaces folder identity and explicit repository member modes

Subworkspaces are named folder contexts whose members may use different branches, and the same subworkspace may mix independent complete repositories with linked Git worktrees. Keep the context's durable identity separate from branch names, and record each member's repository identity, source, materialized path, and mode explicitly. This supports member branch switching and independent local clones without treating a primary repository as a disposable linked worktree or making one member's branch determine the identity of the whole folder.

Keeping common-branch identity would preserve the existing implicit coupling between creation, deduplication, and branch names. Treating every child directory as the same kind of member would obscure Git ownership and make repair and removal unsafe. The chosen model therefore preserves Git's per-repository boundaries while making member ownership explicit; existing workspace identities and managed worktrees remain intact during migration.
