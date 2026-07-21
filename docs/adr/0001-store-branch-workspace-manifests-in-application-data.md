# Store branch workspace manifests in application data

Branch workspaces need durable identity, repository membership, and non-repository entry materialization intent that cannot be reconstructed reliably from Git worktrees or directory contents. Hobgoblin therefore stores their authoritative manifests in server-owned application data, while treating Git and the filesystem as observed state used for validation and reconciliation; this avoids adding application metadata to user workspace directories at the cost of requiring Hobgoblin-managed restore and migration.
