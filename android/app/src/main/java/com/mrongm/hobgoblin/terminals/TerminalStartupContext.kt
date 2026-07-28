package com.mrongm.hobgoblin.terminals

enum class TmuxStartupPolicy {
    AttachOrCreate,
    AttachExisting,
}

data class TerminalStartupContext(
    val repositoryRemotePath: String,
    val worktreeRemotePath: String,
    val terminalId: Int,
    val tmuxIdentity: TmuxSessionIdentity? = null,
    val tmuxStartupPolicy: TmuxStartupPolicy = TmuxStartupPolicy.AttachOrCreate,
) {
    init {
        require(repositoryRemotePath.startsWith("/")) { "Repository path must be absolute" }
        require(worktreeRemotePath.startsWith("/")) { "Worktree path must be absolute" }
        require(terminalId >= 1) { "Terminal id must be positive" }
        require(tmuxIdentity == null || tmuxIdentity.initialPath == TmuxSessionProtocol.normalizePath(worktreeRemotePath)) {
            "Tmux initial path must match the worktree path"
        }
    }
}
