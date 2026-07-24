package dev.hobgoblin.android.terminals

import dev.hobgoblin.android.domain.ssh.RemoteTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SshTerminalStartupCommandTest {
    @Test
    fun `project workspace shell defaults to native without probing tmux`() {
        val target = target(remotePath = "/srv/repo-feature")
        val context = startupContext(terminalId = 2)
        val command = SshTerminalStartupCommand.initialInputForTarget(target, context)
        val output = command.orEmpty()

        assertTrue(output.contains("cd '/srv/repo-feature' || exit"))
        assertTrue(output.contains("exec \"\${SHELL:-/bin/sh}\" -l"))
        assertFalse(output.contains("tmux"))
        assertTrue(output.endsWith("\r"))
    }

    @Test
    fun `explicit tmux launch matches current attach create and mouse command`() {
        val identity = requireNotNull(
            TmuxSessionProtocol.identity(
                TmuxSessionDescriptor(
                    projectRoot = "/srv/repo",
                    workingDirectory = "/srv/repo-feature",
                    terminalNumber = 2,
                ),
            ),
        )
        val command = SshTerminalStartupCommand.initialInputForTarget(
            target(remotePath = "/srv/repo-feature"),
            startupContext(terminalId = 2, tmuxIdentity = identity),
        )
        val output = command.orEmpty()

        assertTrue(output.contains("cd '/srv/repo-feature' || exit"))
        assertTrue(output.contains("command -v tmux >/dev/null 2>&1"))
        assertTrue(
            output.contains(
                "exec tmux new-session -A -s '${identity.sessionName}' -c '/srv/repo-feature' " +
                    "\\; set-option -t '=${identity.sessionName}:' mouse on " +
                    "\\; set-option -t '=${identity.sessionName}:' " +
                    "@hobgoblin_init_path '/srv/repo-feature' " +
                    "\\; set-option -t '=${identity.sessionName}:' @hobgoblin_terminal_number '2'",
            ),
        )
        assertTrue(output.contains("else\n  exec \"\${SHELL:-/bin/sh}\" -l\nfi"))
        assertFalse(output.contains("fi\nexec \"\${SHELL:-/bin/sh}\" -l"))
        assertFalse(output.contains("session_id"))
        assertTrue(output.endsWith("\r"))
    }

    @Test
    fun `workspace shell quotes paths with spaces and single quotes`() {
        val command = SshTerminalStartupCommand.initialInputForTarget(
            target(remotePath = "/srv/app's worktree"),
            startupContext(terminalId = 1, worktreeRemotePath = "/srv/app's worktree"),
        )
        val output = command.orEmpty()

        assertTrue(output.contains("cd '/srv/app'\"'\"'s worktree' || exit"))
        assertFalse(output.contains("cd '/srv/app's worktree'"))
    }

    @Test
    fun `root project path starts native shell when tmux is not requested`() {
        val command = SshTerminalStartupCommand.initialInputForTarget(
            target(remotePath = "/"),
            startupContext(terminalId = 1, worktreeRemotePath = "/"),
        )
        val output = command.orEmpty()

        assertTrue(output.contains("cd '/' || exit"))
        assertFalse(output.contains("tmux"))
        assertTrue(output.contains("exec \"\${SHELL:-/bin/sh}\" -l"))
    }

    @Test
    fun `temporary terminal startup does not enable tmux`() {
        val command = SshTerminalStartupCommand.initialInputForTarget(
            target = target(remotePath = "/srv/repo"),
            startupContext = null,
        )

        assertEquals("cd '/srv/repo' && pwd\r", command)
        assertFalse(command.orEmpty().contains("tmux"))
    }

    @Test
    fun `startup input failure output includes exception class when message is blank`() {
        val output = SshTerminalStartupCommand.startupInputFailureOutput(BlankMessageException())

        assertTrue(output.contains("Startup cd failed"))
        assertTrue(output.contains("BlankMessageException"))
    }

    private fun startupContext(
        terminalId: Int,
        repositoryRemotePath: String = "/srv/repo",
        worktreeRemotePath: String = "/srv/repo-feature",
        tmuxIdentity: TmuxSessionIdentity? = null,
    ): TerminalStartupContext =
        TerminalStartupContext(
            repositoryRemotePath = repositoryRemotePath,
            worktreeRemotePath = worktreeRemotePath,
            terminalId = terminalId,
            tmuxIdentity = tmuxIdentity,
        )

    private fun target(
        alias: String? = "Dev",
        remotePath: String,
    ): RemoteTarget = RemoteTarget(
        id = "lee@example.com:22$remotePath",
        alias = alias,
        host = "example.com",
        user = "lee",
        port = 22,
        remotePath = remotePath,
        identityRefId = null,
    )

    private class BlankMessageException : RuntimeException()
}
