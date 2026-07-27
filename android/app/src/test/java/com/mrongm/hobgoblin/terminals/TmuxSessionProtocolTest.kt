package com.mrongm.hobgoblin.terminals

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TmuxSessionProtocolTest {
    @Test
    fun `project server name matches the desktop reference vector`() {
        assertEquals(
            "hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0",
            TmuxSessionProtocol.serverName("/srv//projects/example/./"),
        )
        assertNull(TmuxSessionProtocol.serverName("srv/projects/example"))
    }

    @Test
    fun `identity matches the public desktop reference vector`() {
        val identity = TmuxSessionProtocol.identity(
            TmuxSessionDescriptor(
                projectRoot = "/srv/projects/example",
                workingDirectory = "/srv/projects/example/worktrees/feature",
                terminalNumber = 1,
            ),
        )

        assertEquals("hobgoblin-v1-aebf050981ac829e36100020", identity?.sessionName)
        assertEquals("/srv/projects/example/worktrees/feature", identity?.initialPath)
    }

    @Test
    fun `identity normalizes paths lexically before hashing`() {
        val normalized = TmuxSessionProtocol.identity(
            TmuxSessionDescriptor(
                projectRoot = "/srv//projects/example/./",
                workingDirectory = "/srv/projects/example/worktrees/other/../feature/",
                terminalNumber = 1,
            ),
        )
        val canonical = TmuxSessionProtocol.identity(
            TmuxSessionDescriptor(
                projectRoot = "/srv/projects/example",
                workingDirectory = "/srv/projects/example/worktrees/feature",
                terminalNumber = 1,
            ),
        )

        assertEquals(canonical, normalized)
    }

    @Test
    fun `path normalization rejects unsafe or non absolute paths`() {
        assertEquals("/srv/repo/other", TmuxSessionProtocol.normalizePath("/srv//repo/feature/../other/"))
        assertEquals("/", TmuxSessionProtocol.normalizePath("/../../"))
        assertNull(TmuxSessionProtocol.normalizePath("srv/repo"))
        assertNull(TmuxSessionProtocol.normalizePath("/srv/repo\nfeature"))
        assertNull(TmuxSessionProtocol.normalizePath("/srv/\u007ffeature"))
        assertNull(TmuxSessionProtocol.normalizePath("/" + "x".repeat(4_096)))
    }

    @Test
    fun `identity rejects invalid terminal numbers`() {
        assertNull(TmuxSessionProtocol.identity(descriptor(terminalNumber = 0)))
        assertNull(TmuxSessionProtocol.identity(descriptor(terminalNumber = -1)))
    }

    @Test
    fun `attach command writes fixed metadata on the exact session`() {
        val identity = requireNotNull(TmuxSessionProtocol.identity(descriptor()))
        val command = TmuxSessionProtocol.attachOrCreateCommand(identity, 1, "/srv/projects/example").orEmpty()

        assertTrue(command.contains("set-option -t '=${identity.sessionName}:' mouse on"))
        assertTrue(
            command.contains(
                "set-option -t '=${identity.sessionName}:' " +
                    "@hobgoblin_init_path '/srv/projects/example/worktrees/feature'",
            ),
        )
        assertTrue(command.contains("@hobgoblin_terminal_number '1'"))
        assertFalse(command.contains("\\;"))
        assertTrue(command.contains("new-session -d"))
        assertTrue(command.contains("attach-session -t '=${identity.sessionName}'"))
        assertNull(TmuxSessionProtocol.attachOrCreateCommand(identity, 0, "/srv/projects/example"))
    }

    @Test
    fun `attach command prefers the project server and falls back to an existing legacy session`() {
        val identity = requireNotNull(TmuxSessionProtocol.identity(descriptor()))
        val command = TmuxSessionProtocol.attachOrCreateCommand(identity, 1, "/srv/projects/example")
        val serverName = "hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0"
        assertTrue(
            command.orEmpty().contains(
                "\"\$hobgoblin_tmux_bin\" -L '$serverName' has-session -t '=${identity.sessionName}'",
            ),
        )
        assertTrue(command.orEmpty().contains("elif \"\$hobgoblin_tmux_bin\" has-session"))
        assertTrue(command.orEmpty().contains("\"\$hobgoblin_tmux_bin\" -L '$serverName' new-session -d"))
        assertTrue(command.orEmpty().contains("else \"\$hobgoblin_tmux_bin\" -L '$serverName' new-session -d"))
        assertFalse(command.orEmpty().contains('\n'))
    }

    @Test
    fun `current protocol name validator excludes legacy and malformed names`() {
        assertTrue(TmuxSessionProtocol.isCurrentSessionName("hobgoblin-v1-aebf050981ac829e36100020"))
        assertFalse(TmuxSessionProtocol.isCurrentSessionName("hobgoblin-aebf050981ac829e3610"))
        assertFalse(TmuxSessionProtocol.isCurrentSessionName("hobgoblin-v1-AEBF050981AC829E36100020"))
        assertFalse(TmuxSessionProtocol.isCurrentSessionName("hobgoblin-v1-aebf050981ac829e3610002"))
    }

    @Test
    fun `session list parser is strict and normalizes paths`() {
        assertEquals(
            listOf(
                RemoteTmuxSession(
                    sessionName = "hobgoblin-v1-aebf050981ac829e36100020",
                    sessionPath = "/srv/repo/feature",
                ),
            ),
            TmuxSessionProtocol.parseSessionList(
                "hobgoblin-v1-aebf050981ac829e36100020\t/srv//repo/./feature/\r\n",
            ),
        )
        assertEquals(emptyList<RemoteTmuxSession>(), TmuxSessionProtocol.parseSessionList(""))
        assertNull(TmuxSessionProtocol.parseSessionList("missing-tab"))
        assertNull(TmuxSessionProtocol.parseSessionList("name\trelative/path"))
        assertNull(TmuxSessionProtocol.parseSessionList("name\t/path\textra"))
    }

    @Test
    fun `combined session list retains a validated project server origin`() {
        val serverName = "hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0"

        val sessions = TmuxSessionProtocol.parseSessionList(
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/repo/feature\t$serverName",
            "/srv/projects/example",
        )
        assertEquals(serverName, sessions?.singleOrNull()?.serverName)
        assertNull(
            TmuxSessionProtocol.parseSessionList(
                "hobgoblin-v1-aebf050981ac829e36100020\t/srv/repo/feature\t" +
                    "hobgoblin-project-v1-0123456789abcdef01234567",
                "/srv/projects/example",
            ),
        )
    }

    @Test
    fun `discoverable session parser verifies metadata allowed path and exact descriptor hash`() {
        val secondIdentity = requireNotNull(
            TmuxSessionProtocol.identity(
                TmuxSessionDescriptor(
                    projectRoot = "/srv/projects/example",
                    workingDirectory = "/srv/projects/example",
                    terminalNumber = 2,
                ),
            ),
        )
        val serverName = "hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0"
        val output = listOf(
            "${secondIdentity.sessionName}\t/srv/projects/example\t2\t$serverName",
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/feature\t1\tlegacy-default",
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/feature\t1",
            "user-session\t/srv/projects/example/worktrees/feature\t1",
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/./feature\t1",
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/other\t1",
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/feature\t01",
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/feature\t2147483648",
            "hobgoblin-v1-0123456789abcdef01234567\t/srv/projects/example/worktrees/feature\t1",
            "missing-fields",
        ).joinToString("\n")

        assertEquals(
            listOf(
                DiscoveredTmuxSession(
                    identity = secondIdentity,
                    terminalNumber = 2,
                ),
                DiscoveredTmuxSession(
                    identity = TmuxSessionIdentity(
                        "hobgoblin-v1-aebf050981ac829e36100020",
                        "/srv/projects/example/worktrees/feature",
                    ),
                    terminalNumber = 1,
                ),
            ),
            TmuxSessionProtocol.parseDiscoverableSessions(
                output = output,
                projectRoot = "/srv/projects/./example/",
                allowedInitialPaths = setOf(
                    "/srv/projects/example/",
                    "/srv/projects/example/worktrees/feature",
                ),
            ),
        )
    }

    @Test
    fun `discoverable parser rejects invalid caller root and accepts empty session output`() {
        assertNull(
            TmuxSessionProtocol.parseDiscoverableSessions(
                output = "",
                projectRoot = "relative/project",
                allowedInitialPaths = setOf("/srv/project"),
            ),
        )
        assertEquals(
            emptyList<DiscoveredTmuxSession>(),
            TmuxSessionProtocol.parseDiscoverableSessions(
                output = "",
                projectRoot = "/srv/project",
                allowedInitialPaths = setOf("/srv/project"),
            ),
        )
    }

    @Test
    fun `discoverable session list command emits parser compatible tab delimited fields`() {
        val script = TmuxSessionProtocol.listDiscoverableSessionsScript("/srv/projects/example")

        assertTrue(script.contains("#{session_name}\t#{@hobgoblin_init_path}\t"))
        assertTrue(script.contains("#{@hobgoblin_terminal_number}\thobgoblin-project-v1-"))
        assertTrue(script.contains("hobgoblin_remote_uid=\$(id -u 2>/dev/null)"))
        assertTrue(script.contains("/tmp/tmux-\$hobgoblin_remote_uid/"))
        assertTrue(script.contains("-S \"\$hobgoblin_project_socket\""))
        assertFalse(script.contains("\\t"))
    }

    @Test
    fun `association requires both exact name and normalized initial path`() {
        val identity = requireNotNull(TmuxSessionProtocol.identity(descriptor()))

        assertTrue(
            TmuxSessionProtocol.matches(
                identity,
                RemoteTmuxSession(identity.sessionName, "/srv/projects/example/worktrees/feature/./"),
            ),
        )
        assertFalse(
            TmuxSessionProtocol.matches(
                identity,
                RemoteTmuxSession(identity.sessionName, "/srv/projects/example/worktrees/other"),
            ),
        )
        assertFalse(
            TmuxSessionProtocol.matches(
                identity,
                RemoteTmuxSession("hobgoblin-v1-0123456789abcdef01234567", identity.initialPath),
            ),
        )
    }

    @Test
    fun `tmux administration scripts reject non protocol targets`() {
        val sessionName = "hobgoblin-v1-aebf050981ac829e36100020"

        assertNull(TmuxSessionProtocol.killSessionScript("/srv/projects/example", "user-session", null))
        assertNull(
            TmuxSessionProtocol.killSessionScript(
                "/srv/projects/example",
                sessionName,
                "hobgoblin-project-v1-0123456789abcdef01234567",
            ),
        )
    }

    @Test
    fun `tmux administration scripts address project and legacy servers explicitly`() {
        val serverName = "hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0"
        val listScript = TmuxSessionProtocol.listSessionsScript("/srv/projects/example")
        val discoveryScript = TmuxSessionProtocol.listDiscoverableSessionsScript("/srv/projects/example")
        val killScript = TmuxSessionProtocol.killSessionScript(
            "/srv/projects/example",
            "hobgoblin-v1-aebf050981ac829e36100020",
            serverName,
        )

        assertTrue(listScript.orEmpty().contains("\"\$hobgoblin_login_shell\" -lc 'command -v tmux'"))
        assertTrue(listScript.orEmpty().contains("\"\$hobgoblin_tmux_bin\" -u -L '$serverName' list-sessions"))
        assertTrue(listScript.orEmpty().contains("#{session_path}\t$serverName"))
        assertTrue(listScript.orEmpty().contains("#{session_path}\tlegacy-default"))
        assertTrue(
            listScript.orEmpty().contains(
                "run_tmux_list \"\$hobgoblin_tmux_bin\" -u -L '$serverName' list-sessions",
            ),
        )
        assertTrue(listScript.orEmpty().contains("run_tmux_list \"\$hobgoblin_tmux_bin\" -u list-sessions"))
        assertTrue(discoveryScript.orEmpty().contains("\"\$hobgoblin_tmux_bin\" -u -L '$serverName' list-sessions"))
        assertTrue(discoveryScript.orEmpty().contains("#{@hobgoblin_terminal_number}\t$serverName"))
        assertTrue(killScript.orEmpty().contains("resolve_hobgoblin_tmux || exit 127"))
        assertTrue(
            killScript.orEmpty().endsWith(
                "\"\$hobgoblin_tmux_bin\" -L '$serverName' " +
                    "kill-session -t '=hobgoblin-v1-aebf050981ac829e36100020'",
            ),
        )
    }

    private fun descriptor(terminalNumber: Int = 1): TmuxSessionDescriptor =
        TmuxSessionDescriptor(
            projectRoot = "/srv/projects/example",
            workingDirectory = "/srv/projects/example/worktrees/feature",
            terminalNumber = terminalNumber,
        )
}
