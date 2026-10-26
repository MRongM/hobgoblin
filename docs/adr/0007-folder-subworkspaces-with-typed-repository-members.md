---
status: accepted
---

# Register folder locations and derive Git members from disk

A subworkspace is a user-selected folder location. Hobgoblin records its location and display identity, then derives repositories, linked worktrees and current branches from the filesystem and Git whenever it refreshes. Users may add or remove branches manually; creation-time membership, branch names, provenance and application ownership are not durable constraints.

Optional worktree creation and working-copy cloning remain server-backed helpers with transient progress and normal Git safety. Removing a registration preserves the folder and its Git data. This replaces the earlier common-branch identity and managed-member manifest model, following the user's preference for simple folder-based branch management.
