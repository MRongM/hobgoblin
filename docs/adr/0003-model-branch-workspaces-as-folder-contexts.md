# Model branch workspaces as explicit folder contexts

Branch workspaces are durable folder-level working contexts whose contained Git worktrees remain independent repository boundaries. Hobgoblin therefore models them with a dedicated server-owned branch-workspace slice and a renderer folder-context adapter instead of inserting synthetic entries into `RepoState` or the top-level project list; this requires explicit file and terminal target adaptation, but prevents non-Git lifecycle and orchestration rules from leaking into every repository consumer.
