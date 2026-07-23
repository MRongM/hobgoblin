package dev.hobgoblin.android.terminals

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TmuxSessionProtocolTest {
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

        assertEquals(
            "exec tmux new-session -A -s '${identity.sessionName}' " +
                "-c '/srv/projects/example/worktrees/feature' " +
                "\\; set-option -t '=${identity.sessionName}:' mouse on " +
                "\\; set-option -t '=${identity.sessionName}' " +
                "@hobgoblin_init_path '/srv/projects/example/worktrees/feature' " +
                "\\; set-option -t '=${identity.sessionName}' @hobgoblin_terminal_number '1'",
            TmuxSessionProtocol.attachOrCreateCommand(identity, terminalNumber = 1),
        )
        assertNull(TmuxSessionProtocol.attachOrCreateCommand(identity, terminalNumber = 0))
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
        val output = listOf(
            "${secondIdentity.sessionName}\t/srv/projects/example\t2",
            "hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/feature\t1",
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
    fun `discoverable session list command reads fixed Hobgoblin metadata`() {
        assertEquals(
            "command -v tmux >/dev/null 2>&1 || exit 127\n" +
                "tmux list-sessions -F '#{session_name}\\t#{@hobgoblin_init_path}\\t" +
                "#{@hobgoblin_terminal_number}'",
            TmuxSessionProtocol.listDiscoverableSessionsScript(),
        )
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
    fun `tmux administration scripts use exact protocol targets`() {
        val sessionName = "hobgoblin-v1-aebf050981ac829e36100020"

        assertEquals(
            "command -v tmux >/dev/null 2>&1 || exit 127\ntmux list-sessions -F '#{session_name}\\t#{session_path}'",
            TmuxSessionProtocol.listSessionsScript(),
        )
        assertEquals(
            "command -v tmux >/dev/null 2>&1 || exit 127\ntmux kill-session -t '=$sessionName'",
            TmuxSessionProtocol.killSessionScript(sessionName),
        )
        assertNull(TmuxSessionProtocol.killSessionScript("user-session"))
    }

    private fun descriptor(terminalNumber: Int = 1): TmuxSessionDescriptor =
        TmuxSessionDescriptor(
            projectRoot = "/srv/projects/example",
            workingDirectory = "/srv/projects/example/worktrees/feature",
            terminalNumber = terminalNumber,
        )
}
