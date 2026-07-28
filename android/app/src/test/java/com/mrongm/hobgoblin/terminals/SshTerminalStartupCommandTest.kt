package com.mrongm.hobgoblin.terminals

import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SshTerminalStartupCommandTest {
    @Test
    fun `project startup is not injected through interactive terminal input`() {
        val input = SshTerminalStartupCommand.initialInputForTarget(
            target(remotePath = "/srv/repo-feature"),
            startupContext(terminalId = 2),
        )

        assertNull(input)
    }

    @Test
    fun `project startup is submitted as one non-interactive shell command`() {
        val identity = requireNotNull(
            TmuxSessionProtocol.identity(
                TmuxSessionDescriptor(
                    projectRoot = "/srv/repo",
                    workingDirectory = "/srv/repo-feature",
                    terminalNumber = 2,
                ),
            ),
        )
        val command = SshTerminalStartupCommand.remoteCommandForTarget(
            target(remotePath = "/srv/repo-feature"),
            startupContext(terminalId = 2, tmuxIdentity = identity),
        ).orEmpty()

        assertTrue(command.startsWith("exec /bin/sh -lc '"))
        assertFalse(command.contains('\n'))
        assertFalse(command.endsWith("\r"))
    }

    @Test
    fun `project workspace shell defaults to native without probing tmux`() {
        val target = target(remotePath = "/srv/repo-feature")
        val context = startupContext(terminalId = 2)
        val command = SshTerminalStartupCommand.remoteCommandForTarget(target, context).orEmpty()
        val output = unwrapProjectStartupScript(command)

        assertTrue(output.contains("cd '/srv/repo-feature' || exit"))
        assertTrue(output.contains("exec \"\${SHELL:-/bin/sh}\" -l"))
        assertFalse(output.contains("tmux"))
        assertFalse(command.endsWith("\r"))
    }

    @Test
    fun `explicit tmux launch is strict and suggests native when tmux cannot start`() {
        val identity = requireNotNull(
            TmuxSessionProtocol.identity(
                TmuxSessionDescriptor(
                    projectRoot = "/srv/repo",
                    workingDirectory = "/srv/repo-feature",
                    terminalNumber = 2,
                ),
            ),
        )
        val command = SshTerminalStartupCommand.remoteCommandForTarget(
            target(remotePath = "/srv/repo-feature"),
            startupContext(terminalId = 2, tmuxIdentity = identity),
        ).orEmpty()
        val output = unwrapProjectStartupScript(command)

        assertTrue(output.contains("cd '/srv/repo-feature' || exit"))
        assertTrue(output.contains("\"\$hobgoblin_login_shell\" -lc 'command -v tmux'"))
        assertTrue(output.contains("if ! resolve_hobgoblin_tmux; then"))
        val serverName = "hobgoblin-project-v1-44159cd9e973adba7b472e6f"
        assertTrue(
            output.contains(
                "\"\$hobgoblin_tmux_bin\" -L '$serverName' has-session -t '=${identity.sessionName}'",
            ),
        )
        assertTrue(output.contains("\"\$hobgoblin_tmux_bin\" -L '$serverName' new-session -d"))
        assertTrue(output.contains("set-option -t '=${identity.sessionName}:' mouse on"))
        assertTrue(output.contains("tmux_status=\$?"))
        assertTrue(output.contains("Use New terminal (Native)."))
        assertTrue(output.contains("exit 127"))
        assertTrue(output.contains("exit \"\$tmux_status\""))
        assertFalse(output.contains("exec \"\${SHELL:-/bin/sh}\" -l"))
        assertFalse(output.contains("\\;"))
        assertFalse(output.contains("session_id"))
        assertFalse(command.endsWith("\r"))
    }

    @Test
    fun `recovered tmux startup only attaches an existing session`() {
        val identity = requireNotNull(
            TmuxSessionProtocol.identity(
                TmuxSessionDescriptor(
                    projectRoot = "/srv/repo",
                    workingDirectory = "/srv/repo-feature",
                    terminalNumber = 2,
                ),
            ),
        )
        val command = SshTerminalStartupCommand.remoteCommandForTarget(
            target(remotePath = "/srv/repo-feature"),
            startupContext(
                terminalId = 2,
                tmuxIdentity = identity,
                tmuxStartupPolicy = TmuxStartupPolicy.AttachExisting,
            ),
        ).orEmpty()
        val output = unwrapProjectStartupScript(command)

        assertTrue(output.contains("Hobgoblin tmux session no longer exists"))
        assertFalse(output.contains("new-session"))
    }

    @Test
    fun `workspace shell quotes paths with spaces and single quotes`() {
        val command = SshTerminalStartupCommand.remoteCommandForTarget(
            target(remotePath = "/srv/app's worktree"),
            startupContext(terminalId = 1, worktreeRemotePath = "/srv/app's worktree"),
        ).orEmpty()
        val output = unwrapProjectStartupScript(command)

        assertTrue(output.contains("cd '/srv/app'\"'\"'s worktree' || exit"))
        assertFalse(output.contains("cd '/srv/app's worktree'"))
    }

    @Test
    fun `root project path starts native shell when tmux is not requested`() {
        val command = SshTerminalStartupCommand.remoteCommandForTarget(
            target(remotePath = "/"),
            startupContext(terminalId = 1, worktreeRemotePath = "/"),
        ).orEmpty()
        val output = unwrapProjectStartupScript(command)

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

    private fun unwrapProjectStartupScript(command: String): String {
        val prefix = "exec /bin/sh -lc "
        require(command.startsWith(prefix))
        val quotedScript = command.removePrefix(prefix)
        require(quotedScript.startsWith("'") && quotedScript.endsWith("'"))
        return quotedScript.substring(1, quotedScript.lastIndex).replace("'\"'\"'", "'")
    }

    private fun startupContext(
        terminalId: Int,
        repositoryRemotePath: String = "/srv/repo",
        worktreeRemotePath: String = "/srv/repo-feature",
        tmuxIdentity: TmuxSessionIdentity? = null,
        tmuxStartupPolicy: TmuxStartupPolicy = TmuxStartupPolicy.AttachOrCreate,
    ): TerminalStartupContext =
        TerminalStartupContext(
            repositoryRemotePath = repositoryRemotePath,
            worktreeRemotePath = worktreeRemotePath,
            terminalId = terminalId,
            tmuxIdentity = tmuxIdentity,
            tmuxStartupPolicy = tmuxStartupPolicy,
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
