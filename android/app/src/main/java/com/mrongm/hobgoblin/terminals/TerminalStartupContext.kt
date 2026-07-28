package com.mrongm.hobgoblin.terminals

enum class TmuxStartupPolicy {
    AttachOrCreate,
    AttachExisting,
}

data class TerminalStartupContext(
    val repositoryRemotePath: String?,
    val worktreeRemotePath: String,
    val terminalId: Int,
    val tmuxIdentity: TmuxSessionIdentity? = null,
    val tmuxStartupPolicy: TmuxStartupPolicy = TmuxStartupPolicy.AttachOrCreate,
    val tmuxServerTarget: TmuxServerTarget? = null,
) {
    init {
        require(repositoryRemotePath == null || repositoryRemotePath.startsWith("/")) {
            "Repository path must be absolute"
        }
        require(worktreeRemotePath.startsWith("/")) { "Worktree path must be absolute" }
        require(terminalId >= 1) { "Terminal id must be positive" }
        require(tmuxIdentity == null || repositoryRemotePath != null || tmuxServerTarget != null) {
            "Tmux startup requires a repository path or explicit server target"
        }
        require(tmuxServerTarget == null || tmuxIdentity != null) {
            "Tmux server target requires a tmux identity"
        }
        require(tmuxServerTarget == null || tmuxStartupPolicy == TmuxStartupPolicy.AttachExisting) {
            "Explicit tmux server target only supports attaching an existing session"
        }
        require(tmuxIdentity == null || tmuxIdentity.initialPath == TmuxSessionProtocol.normalizePath(worktreeRemotePath)) {
            "Tmux initial path must match the worktree path"
        }
    }
}
