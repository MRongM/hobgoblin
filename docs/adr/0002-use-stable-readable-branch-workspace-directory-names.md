# Use stable readable branch workspace directory names

Branch workspace directories use a cross-platform-safe `goblin-<branch-slug>` name and append a short hash only when that readable name collides with another branch or an existing entry. The chosen path is persisted in the branch workspace manifest and never recomputed for that workspace, preserving readable paths without making ambiguous branch-name normalization part of identity.
