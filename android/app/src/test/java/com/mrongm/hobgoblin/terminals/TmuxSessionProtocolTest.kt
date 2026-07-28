package com.mrongm.hobgoblin.terminals

import java.nio.file.Files
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
    fun `attach existing command never creates a replacement session`() {
        val identity = requireNotNull(TmuxSessionProtocol.identity(descriptor()))
        val command = TmuxSessionProtocol.attachExistingCommand(identity, 1, "/srv/projects/example").orEmpty()
        val serverName = "hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0"

        assertTrue(command.contains("\"\$hobgoblin_tmux_bin\" -L '$serverName' has-session"))
        assertTrue(command.contains("elif \"\$hobgoblin_tmux_bin\" has-session"))
        assertTrue(command.contains("Hobgoblin tmux session no longer exists"))
        assertFalse(command.contains("new-session"))
        assertNull(TmuxSessionProtocol.attachExistingCommand(identity, 0, "/srv/projects/example"))
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
    fun `batch discovery validates scope identity and prefers project scoped rows`() {
        val firstRoot = "/srv/product/api"
        val secondRoot = "/srv/product/web"
        val firstPath = "/srv/product/hobgoblin-feature-auth/api"
        val secondPath = "/srv/product/hobgoblin-feature-auth/web"
        val firstIdentity = requireNotNull(
            TmuxSessionProtocol.identity(TmuxSessionDescriptor(firstRoot, firstPath, terminalNumber = 2)),
        )
        val secondIdentity = requireNotNull(
            TmuxSessionProtocol.identity(TmuxSessionDescriptor(secondRoot, secondPath, terminalNumber = 1)),
        )
        val output = listOf(
            "${firstIdentity.sessionName}\t$firstPath\t2\tlegacy-default\tlegacy",
            "${secondIdentity.sessionName}\t$secondPath\t1\t${TmuxSessionProtocol.serverName(secondRoot)}\t1",
            "${firstIdentity.sessionName}\t$firstPath\t2\t${TmuxSessionProtocol.serverName(firstRoot)}\t0",
            "user-session\t$firstPath\t1\t${TmuxSessionProtocol.serverName(firstRoot)}\t0",
            "${firstIdentity.sessionName}\t$firstPath\t2\t${TmuxSessionProtocol.serverName(secondRoot)}\t1",
        ).joinToString("\n")

        val sessions = TmuxSessionProtocol.parseDiscoverableSessions(
            output = output,
            scopes = listOf(
                TmuxDiscoveryScope("/srv/product//api/.", setOf("$firstPath/")),
                TmuxDiscoveryScope(secondRoot, setOf(secondPath)),
                TmuxDiscoveryScope(firstRoot, setOf(firstPath)),
            ),
        )

        assertEquals(
            listOf(
                ScopedDiscoveredTmuxSession(firstRoot, DiscoveredTmuxSession(firstIdentity, 2)),
                ScopedDiscoveredTmuxSession(secondRoot, DiscoveredTmuxSession(secondIdentity, 1)),
            ),
            sessions,
        )
    }

    @Test
    fun `batch discovery script deduplicates normalized scopes and lists legacy default once`() {
        val script = TmuxSessionProtocol.listDiscoverableSessionsScript(
            listOf(
                TmuxDiscoveryScope("/srv/product/api", setOf("/srv/product/feature/api")),
                TmuxDiscoveryScope("/srv/product//api/.", setOf("/srv/product/feature/api/")),
                TmuxDiscoveryScope("/srv/product/web", setOf("/srv/product/feature/web")),
            ),
        )

        assertEquals(1, Regex("\\tlegacy-default\\tlegacy").findAll(script).count())
        assertEquals(1, Regex(" -u list-sessions ").findAll(script).count())
        assertTrue(script.contains("\t${TmuxSessionProtocol.serverName("/srv/product/api")}\t0"))
        assertTrue(script.contains("\t${TmuxSessionProtocol.serverName("/srv/product/web")}\t1"))
    }

    @Test
    fun `batch discovery continues to legacy server when macOS reports a missing project socket`() {
        val projectRoot = "/srv/product/api"
        val projectServer = requireNotNull(TmuxSessionProtocol.serverName(projectRoot))
        val script = TmuxSessionProtocol.listDiscoverableSessionsScript(
            listOf(TmuxDiscoveryScope(projectRoot, setOf("/srv/product/feature/api"))),
        )
        val tempDirectory = Files.createTempDirectory("hobgoblin-tmux-protocol-test")
        val tmuxExecutable = tempDirectory.resolve("tmux")
        val callLog = tempDirectory.resolve("calls.log")

        try {
            Files.writeString(
                tmuxExecutable,
                """#!/bin/sh
                    printf '%s\n' "${'$'}*" >> "${'$'}HOBGOBLIN_TMUX_TEST_LOG"
                    case "${'$'}*" in
                      *" -L $projectServer "*)
                        printf '%s\n' 'error connecting to /private/tmp/tmux-501/$projectServer (No such file or directory)' >&2
                        exit 1
                        ;;
                      *) exit 0 ;;
                    esac
                """.trimIndent(),
            )
            assertTrue(tmuxExecutable.toFile().setExecutable(true))

            val process = ProcessBuilder("/bin/sh", "-c", script)
                .redirectErrorStream(true)
                .apply {
                    environment()["PATH"] = "${tempDirectory}:${environment()["PATH"].orEmpty()}"
                    environment()["HOBGOBLIN_TMUX_TEST_LOG"] = callLog.toString()
                }
                .start()
            val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
            val exitCode = process.waitFor()

            assertEquals(output, 0, exitCode)
            assertTrue(
                Files.readAllLines(callLog).any { arguments ->
                    arguments.startsWith("-u list-sessions -F ")
                },
            )
        } finally {
            tempDirectory.toFile().deleteRecursively()
        }
    }

    @Test
    fun `batch discovery rejects invalid scope and sorts by scope path and terminal`() {
        assertNull(
            TmuxSessionProtocol.parseDiscoverableSessions(
                output = "",
                scopes = listOf(TmuxDiscoveryScope("relative", setOf("/srv/path"))),
            ),
        )
        assertNull(
            TmuxSessionProtocol.parseDiscoverableSessions(
                output = "",
                scopes = listOf(TmuxDiscoveryScope("/srv/project", setOf("relative"))),
            ),
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

    @Test
    fun `host tmux administration targets the exact discovered default or named socket`() {
        val sessionName = "hobgoblin-v1-aebf050981ac829e36100020"
        val namedServer = TmuxServerTarget.Named("hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0")
        val defaultList = TmuxSessionProtocol.hostServerSessionListCommand(TmuxServerTarget.Default)
        val namedList = TmuxSessionProtocol.hostServerSessionListCommand(namedServer)
        val namedKill = TmuxSessionProtocol.hostSessionKillCommand(namedServer, sessionName)

        assertTrue(defaultList.contains("printf '%s\\n' '${TmuxSessionProtocol.HostDiscoveryHeader}'"))
        assertTrue(defaultList.contains("hobgoblin_tmux_socket_name='default'"))
        assertTrue(defaultList.contains("legacy-default\t#{session_name}"))
        assertTrue(namedList.contains("hobgoblin_tmux_socket_name='${namedServer.serverName}'"))
        assertTrue(namedList.contains("${namedServer.serverName}\t#{session_name}"))
        assertTrue(defaultList.contains("case \"\${TMUX_TMPDIR:-}\" in"))
        assertTrue(defaultList.contains("/tmp/tmux-\$hobgoblin_remote_uid"))
        assertTrue(defaultList.contains("-S \"\$hobgoblin_tmux_socket\" list-sessions"))
        assertTrue(namedKill.orEmpty().contains("-S \"\$hobgoblin_tmux_socket\" kill-session"))
        assertTrue(namedKill.orEmpty().endsWith("-t '=$sessionName'"))
        assertNull(TmuxSessionProtocol.hostSessionKillCommand(TmuxServerTarget.Default, "user-session"))
    }

    @Test
    fun `host discovery parses default and named servers and groups by initial path`() {
        val namedServer = "hobgoblin-project-v1-222222222222222222222222"
        val output = listOf(
            TmuxSessionProtocol.HostDiscoveryHeader,
            "legacy-default\thobgoblin-v1-111111111111111111111111\t/srv/project\t2\t0",
            "$namedServer\thobgoblin-v1-333333333333333333333333\t/srv/project\t1\t2",
            "legacy-default\thobgoblin-v1-444444444444444444444444\t/srv/other\t3\t1",
        ).joinToString("\n")

        val sessions = requireNotNull(TmuxSessionProtocol.parseHostSessionDiscoveryOutput(output))
        val groups = HostTmuxPathGroup.from(sessions)

        assertEquals(3, sessions.size)
        assertEquals(listOf("/srv/other", "/srv/project"), groups.map(HostTmuxPathGroup::initialPath))
        assertEquals(listOf(1, 2), groups[1].sessions.map(HostDiscoveredTmuxSession::terminalNumber))
        assertEquals(TmuxServerTarget.Named(namedServer), groups[1].sessions[0].server)
        assertEquals(TmuxServerTarget.Default, groups[1].sessions[1].server)
        assertEquals(2, groups[1].sessions.first().attachedClients)
    }

    @Test
    fun `host discovery requires its envelope and ignores malformed or duplicate session rows`() {
        val sessionName = "hobgoblin-v1-111111111111111111111111"
        val validRow = "legacy-default\t$sessionName\t/srv/project\t1\t0"
        val output = listOf(
            TmuxSessionProtocol.HostDiscoveryHeader,
            validRow,
            validRow,
            "arbitrary-server\t$sessionName\t/srv/project\t1\t0",
            "legacy-default\tuser-session\t/srv/project\t1\t0",
            "legacy-default\t$sessionName\trelative\t1\t0",
            "legacy-default\t$sessionName\t/srv/project\t01\t0",
            "legacy-default\t$sessionName\t/srv/project\t1\t-1",
            "missing-fields",
        ).joinToString("\n")

        assertEquals(
            listOf(
                HostDiscoveredTmuxSession(
                    server = TmuxServerTarget.Default,
                    identity = TmuxSessionIdentity(sessionName, "/srv/project"),
                    terminalNumber = 1,
                    attachedClients = 0,
                ),
            ),
            TmuxSessionProtocol.parseHostSessionDiscoveryOutput(output),
        )
        assertNull(TmuxSessionProtocol.parseHostSessionDiscoveryOutput(validRow))
        assertNull(TmuxSessionProtocol.parseHostSessionDiscoveryOutput("unexpected\n$validRow"))
    }

    @Test
    fun `host discovery script enumerates exact default and protocol server sockets`() {
        val script = TmuxSessionProtocol.hostSessionDiscoveryCommand()

        assertTrue(script.contains(TmuxSessionProtocol.HostDiscoveryHeader))
        assertTrue(script.contains("TMUX_TMPDIR"))
        assertTrue(script.contains("/tmp/tmux-\$hobgoblin_remote_uid"))
        assertTrue(script.contains("[ -S \"\$hobgoblin_socket\" ]"))
        assertTrue(script.contains(" -u -S \"\$hobgoblin_socket\" list-sessions "))
        assertTrue(script.contains("hobgoblin-project-v1-"))
        assertFalse(script.contains("workspace-configs.json"))
        assertFalse(script.contains("branch-workspaces.json"))
    }

    @Test
    fun `host recovery attaches only the scanned server and never creates a session`() {
        val identity = TmuxSessionIdentity(
            sessionName = "hobgoblin-v1-111111111111111111111111",
            initialPath = "/srv/project",
        )
        val namedServer = "hobgoblin-project-v1-222222222222222222222222"

        val defaultCommand = TmuxSessionProtocol.attachExistingCommand(identity, 1, TmuxServerTarget.Default)
        val namedCommand = TmuxSessionProtocol.attachExistingCommand(
            identity,
            1,
            TmuxServerTarget.Named(namedServer),
        )

        assertTrue(defaultCommand.orEmpty().contains("\"\$hobgoblin_tmux_bin\" has-session"))
        assertFalse(defaultCommand.orEmpty().contains(" -L "))
        assertTrue(namedCommand.orEmpty().contains("\"\$hobgoblin_tmux_bin\" -L '$namedServer' has-session"))
        assertFalse(namedCommand.orEmpty().contains("legacy-default"))
        assertFalse(defaultCommand.orEmpty().contains("new-session"))
        assertFalse(namedCommand.orEmpty().contains("new-session"))
        assertNull(TmuxSessionProtocol.attachExistingCommand(identity, 0, TmuxServerTarget.Default))
    }

    private fun descriptor(terminalNumber: Int = 1): TmuxSessionDescriptor =
        TmuxSessionDescriptor(
            projectRoot = "/srv/projects/example",
            workingDirectory = "/srv/projects/example/worktrees/feature",
            terminalNumber = terminalNumber,
        )
}
