package com.mrongm.hobgoblin.terminals

enum class TmuxStartupPolicy {
    AttachOrCreate,
    AttachExisting,
}

data class TerminalStartupContext(
    val repositoryRemotePath: String?,
    val worktreeRemotePath: String,
    val terminalId: Int?,
    val tmuxIdentity: TmuxSessionIdentity? = null,
    val tmuxStartupPolicy: TmuxStartupPolicy = TmuxStartupPolicy.AttachOrCreate,
    val tmuxServerTarget: TmuxServerTarget? = null,
    val tmuxSessionTarget: TmuxSessionTarget? = null,
) {
    init {
        require(repositoryRemotePath == null || repositoryRemotePath.startsWith("/")) {
            "Repository path must be absolute"
        }
        require(worktreeRemotePath.startsWith("/")) { "Worktree path must be absolute" }
        require(terminalId == null || terminalId >= 1) { "Terminal id must be positive" }
        require(
            tmuxIdentity == null ||
                repositoryRemotePath != null ||
                tmuxServerTarget != null ||
                tmuxSessionTarget != null
        ) {
            "Tmux startup requires a repository path or explicit server target"
        }
        require(tmuxIdentity == null || terminalId != null) {
            "Hobgoblin tmux startup requires a terminal id"
        }
        require(tmuxServerTarget == null || tmuxIdentity != null) {
            "Tmux server target requires a tmux identity"
        }
        require(tmuxServerTarget == null || tmuxSessionTarget == null) {
            "Use only one exact tmux target representation"
        }
        require(tmuxSessionTarget == null || tmuxIdentity == null) {
            "Ordinary tmux target must not carry a Hobgoblin identity"
        }
        require(tmuxServerTarget == null || tmuxStartupPolicy == TmuxStartupPolicy.AttachExisting) {
            "Explicit tmux server target only supports attaching an existing session"
        }
        require(tmuxSessionTarget == null || tmuxStartupPolicy == TmuxStartupPolicy.AttachExisting) {
            "Exact tmux session target only supports attaching an existing session"
        }
        require(terminalId != null || tmuxSessionTarget != null) {
            "Terminal id is required unless attaching an exact ordinary tmux session"
        }
        require(tmuxIdentity == null || tmuxIdentity.initialPath == TmuxSessionProtocol.normalizePath(worktreeRemotePath)) {
            "Tmux initial path must match the worktree path"
        }
    }
}
