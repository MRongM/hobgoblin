package com.mrongm.hobgoblin.terminals

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.DiagnosticCategory
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.ssh.SshClientFacade
import com.mrongm.hobgoblin.ssh.SshCommandResult
import com.mrongm.hobgoblin.ssh.SshConnectionSecrets
import com.mrongm.hobgoblin.ssh.SshDiagnosticProbe
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteTmuxSessionServiceTest {
    @Test
    fun `host discovery trusts once and runs one versioned scan command`() {
        val sessionName = "hobgoblin-v1-111111111111111111111111"
        val client = FakeSshClient(
            SshCommandResult(
                ok = true,
                stdout = listOf(
                    TmuxSessionProtocol.HostDiscoveryHeader,
                    "legacy-default\t$sessionName\t/srv/project\t1\t0",
                ).joinToString("\n"),
            ),
        )

        val result = service(client).discoverHostSessions(target())

        assertEquals(
            RemoteHostTmuxDiscoveryResult.Loaded(
                listOf(
                    HostDiscoveredTmuxSession(
                        server = TmuxServerTarget.Default,
                        identity = TmuxSessionIdentity(sessionName, "/srv/project"),
                        terminalNumber = 1,
                        attachedClients = 0,
                    ),
                ),
            ),
            result,
        )
        assertEquals(1, client.fingerprintReads)
        assertEquals(listOf(TmuxSessionProtocol.hostSessionDiscoveryCommand()), client.scripts)
    }

    @Test
    fun `host discovery distinguishes empty catalog protocol failure and SSH failure`() {
        val empty = service(
            FakeSshClient(SshCommandResult(ok = true, stdout = TmuxSessionProtocol.HostDiscoveryHeader)),
        ).discoverHostSessions(target())
        val invalid = service(
            FakeSshClient(SshCommandResult(ok = true, stdout = "unexpected-output")),
        ).discoverHostSessions(target())
        val failed = service(
            FakeSshClient(SshCommandResult(ok = false, stderr = "permission denied")),
        ).discoverHostSessions(target())

        assertEquals(RemoteHostTmuxDiscoveryResult.Loaded(emptyList()), empty)
        assertEquals(RemoteHostTmuxDiscoveryResult.Failed("tmux returned an invalid host session list"), invalid)
        assertEquals(RemoteHostTmuxDiscoveryResult.Failed("permission denied"), failed)
    }

    @Test
    fun `untrusted host fails host discovery before SSH command`() {
        val client = FakeSshClient()
        val service = RemoteTmuxSessionService(client, FakeHostKeyTrustStore(trusted = false))

        val result = service.discoverHostSessions(target())

        assertTrue(result is RemoteHostTmuxDiscoveryResult.Failed)
        assertTrue(client.scripts.isEmpty())
    }

    @Test
    fun `trusted discovery returns only descriptor verified sessions`() {
        val discoveryIdentity = requireNotNull(
            TmuxSessionProtocol.identity(
                TmuxSessionDescriptor(ProjectRoot, FeaturePath, terminalNumber = 1),
            ),
        )
        val client = FakeSshClient(
            SshCommandResult(
                ok = true,
                stdout = listOf(
                    "${discoveryIdentity.sessionName}\t$FeaturePath\t1\t$ProjectServerName\t0",
                    "user-session\t$FeaturePath\t1\tlegacy-default\tlegacy",
                ).joinToString("\n"),
            ),
        )

        val result = service(client).discoverAssociatedSessions(
            target = target(),
            projectRoot = ProjectRoot,
            allowedInitialPaths = setOf(FeaturePath),
        )

        assertEquals(
            RemoteTmuxDiscoveryResult.Found(
                listOf(DiscoveredTmuxSession(discoveryIdentity, terminalNumber = 1)),
            ),
            result,
        )
        assertEquals(
            listOf(
                TmuxSessionProtocol.listDiscoverableSessionsScript(
                    listOf(TmuxDiscoveryScope(ProjectRoot, setOf(FeaturePath))),
                ),
            ),
            client.scripts,
        )
        assertTrue(client.secrets.all { it.acceptedHostFingerprint == "SHA256:trusted" })
    }

    @Test
    fun `no tmux server is an empty discovery result`() {
        val result = service(
            FakeSshClient(SshCommandResult(ok = false, stderr = "no server running on /tmp/tmux-1000/default")),
        ).discoverAssociatedSessions(
            target = target(),
            projectRoot = ProjectRoot,
            allowedInitialPaths = setOf(FeaturePath),
        )

        assertEquals(RemoteTmuxDiscoveryResult.Found(emptyList()), result)
    }

    @Test
    fun `missing tmux is an explicit discovery failure`() {
        val result = service(FakeSshClient(SshCommandResult(ok = false, message = "exit 127")))
            .discoverAssociatedSessions(
                target = target(),
                projectRoot = ProjectRoot,
                allowedInitialPaths = setOf(FeaturePath),
            )

        assertEquals(RemoteTmuxDiscoveryResult.Failed("exit 127"), result)
    }

    @Test
    fun `discovery command failure and invalid scope fail without recovering sessions`() {
        val failed = service(FakeSshClient(SshCommandResult(ok = false, stderr = "permission denied")))
            .discoverAssociatedSessions(target(), ProjectRoot, setOf(FeaturePath))
        val invalidScopeClient = FakeSshClient()
        val invalidScope = service(invalidScopeClient)
            .discoverAssociatedSessions(target(), "relative/project", setOf(FeaturePath))

        assertEquals(RemoteTmuxDiscoveryResult.Failed("permission denied"), failed)
        assertTrue(invalidScope is RemoteTmuxDiscoveryResult.Failed)
        assertEquals(emptyList<String>(), invalidScopeClient.scripts)
    }

    @Test
    fun `untrusted host fails discovery before tmux commands run`() {
        val client = FakeSshClient()
        val service = RemoteTmuxSessionService(client, FakeHostKeyTrustStore(trusted = false))

        val result = service.discoverAssociatedSessions(target(), ProjectRoot, setOf(FeaturePath))

        assertTrue(result is RemoteTmuxDiscoveryResult.Failed)
        assertEquals(emptyList<String>(), client.scripts)
    }

    @Test
    fun `batch discovery uses one trust decision and one SSH command for every scope`() {
        val secondRoot = "/srv/projects/other"
        val secondPath = "/srv/projects/other/worktrees/feature"
        val firstIdentity = requireNotNull(
            TmuxSessionProtocol.identity(TmuxSessionDescriptor(ProjectRoot, FeaturePath, 1)),
        )
        val secondIdentity = requireNotNull(
            TmuxSessionProtocol.identity(TmuxSessionDescriptor(secondRoot, secondPath, 2)),
        )
        val client = FakeSshClient(
            SshCommandResult(
                ok = true,
                stdout = listOf(
                    "${firstIdentity.sessionName}\t$FeaturePath\t1\t$ProjectServerName\t0",
                    "${secondIdentity.sessionName}\t$secondPath\t2\t${TmuxSessionProtocol.serverName(secondRoot)}\t1",
                ).joinToString("\n"),
            ),
        )

        val result = service(client).discoverAssociatedSessions(
            target = target(),
            scopes = listOf(
                TmuxDiscoveryScope(ProjectRoot, setOf(FeaturePath)),
                TmuxDiscoveryScope(secondRoot, setOf(secondPath)),
            ),
        )

        assertEquals(
            RemoteTmuxBatchDiscoveryResult.Found(
                listOf(
                    ScopedDiscoveredTmuxSession(ProjectRoot, DiscoveredTmuxSession(firstIdentity, 1)),
                    ScopedDiscoveredTmuxSession(secondRoot, DiscoveredTmuxSession(secondIdentity, 2)),
                ),
            ),
            result,
        )
        assertEquals(1, client.fingerprintReads)
        assertEquals(1, client.scripts.size)
    }

    @Test
    fun `invalid batch scope fails before host trust or SSH command`() {
        val client = FakeSshClient()

        val result = service(client).discoverAssociatedSessions(
            target = target(),
            scopes = listOf(TmuxDiscoveryScope("relative", setOf(FeaturePath))),
        )

        assertTrue(result is RemoteTmuxBatchDiscoveryResult.Failed)
        assertEquals(0, client.fingerprintReads)
        assertTrue(client.scripts.isEmpty())
    }

    @Test
    fun `exact live name and path are listed before the session is killed`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "$SessionName\t/srv/feature\t$ProjectServerName"),
            SshCommandResult(ok = true),
        )
        val service = service(client)
        val method = service.javaClass.methods.firstOrNull { candidate ->
            candidate.name == "closeAssociatedSession" && candidate.parameterCount == 3
        }

        assertTrue("Expected project-root-aware tmux close", method != null)
        val result = method?.invoke(service, target(), identity(), ProjectRoot)

        assertEquals(RemoteTmuxCloseResult.Closed, result)
        assertEquals(
            listOf(
                TmuxSessionProtocol.listSessionsScript(ProjectRoot),
                TmuxSessionProtocol.killSessionScript(ProjectRoot, SessionName, ProjectServerName),
            ),
            client.scripts,
        )
        assertTrue(client.secrets.all { it.acceptedHostFingerprint == "SHA256:trusted" })
    }

    @Test
    fun `same name at another initial path is treated as missing and not killed`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "$SessionName\t/srv/other"),
        )

        val result = service(client).closeAssociatedSession(target(), identity(), ProjectRoot)

        assertEquals(RemoteTmuxCloseResult.Missing, result)
        assertEquals(listOf(TmuxSessionProtocol.listSessionsScript(ProjectRoot)), client.scripts)
    }

    @Test
    fun `different name at the same path is treated as missing and not killed`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "hobgoblin-v1-0123456789abcdef01234567\t/srv/feature"),
        )

        val result = service(client).closeAssociatedSession(target(), identity(), ProjectRoot)

        assertEquals(RemoteTmuxCloseResult.Missing, result)
        assertEquals(1, client.scripts.size)
    }

    @Test
    fun `no tmux server is idempotently treated as missing`() {
        val client = FakeSshClient(
            SshCommandResult(ok = false, stderr = "no server running on /tmp/tmux-1000/default"),
        )

        assertEquals(
            RemoteTmuxCloseResult.Missing,
            service(client).closeAssociatedSession(target(), identity(), ProjectRoot),
        )
    }

    @Test
    fun `malformed list output fails closed`() {
        val client = FakeSshClient(SshCommandResult(ok = true, stdout = "malformed"))

        val result = service(client).closeAssociatedSession(target(), identity(), ProjectRoot)

        assertEquals(RemoteTmuxCloseResult.Failed("tmux returned an invalid session list"), result)
        assertEquals(1, client.scripts.size)
    }

    @Test
    fun `tmux unavailable fails closed`() {
        val client = FakeSshClient(SshCommandResult(ok = false, message = "exit 127"))

        assertEquals(
            RemoteTmuxCloseResult.Failed("exit 127"),
            service(client).closeAssociatedSession(target(), identity(), ProjectRoot),
        )
    }

    @Test
    fun `session disappearing during exact kill is treated as missing`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "$SessionName\t/srv/feature"),
            SshCommandResult(ok = false, stderr = "can't find session: $SessionName"),
        )

        assertEquals(
            RemoteTmuxCloseResult.Missing,
            service(client).closeAssociatedSession(target(), identity(), ProjectRoot),
        )
    }

    @Test
    fun `kill command failure keeps a failure result`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "$SessionName\t/srv/feature"),
            SshCommandResult(ok = false, stderr = "permission denied"),
        )

        assertEquals(
            RemoteTmuxCloseResult.Failed("permission denied"),
            service(client).closeAssociatedSession(target(), identity(), ProjectRoot),
        )
    }

    @Test
    fun `untrusted host fails before tmux commands run`() {
        val client = FakeSshClient()
        val service = RemoteTmuxSessionService(client, FakeHostKeyTrustStore(trusted = false))

        val result = service.closeAssociatedSession(target(), identity(), ProjectRoot)

        assertTrue(result is RemoteTmuxCloseResult.Failed)
        assertEquals(emptyList<String>(), client.scripts)
    }

    private fun service(client: FakeSshClient): RemoteTmuxSessionService =
        RemoteTmuxSessionService(client, FakeHostKeyTrustStore(trusted = true))

    private fun identity(): TmuxSessionIdentity =
        TmuxSessionIdentity(sessionName = SessionName, initialPath = "/srv/feature")

    private fun target(): RemoteTarget = RemoteTarget(
        id = "lee@example.com:22/srv/feature",
        alias = "Dev",
        host = "example.com",
        user = "lee",
        port = 22,
        remotePath = "/srv/feature",
        identityRefId = "identity-1",
    )

    private class FakeSshClient(
        vararg results: SshCommandResult,
    ) : SshClientFacade {
        private val remaining = ArrayDeque(results.toList())
        val scripts = mutableListOf<String>()
        val secrets = mutableListOf<SshConnectionSecrets>()
        var fingerprintReads = 0

        override fun fetchHostFingerprint(target: RemoteTarget): String {
            fingerprintReads += 1
            return "SHA256:trusted"
        }

        override fun runCommand(
            target: RemoteTarget,
            script: String,
            secrets: SshConnectionSecrets,
        ): SshCommandResult {
            scripts += script
            this.secrets += secrets
            return remaining.removeFirstOrNull()
                ?: SshCommandResult(ok = false, message = "unexpected command")
        }

        override fun runDiagnosticProbe(
            target: RemoteTarget,
            probe: SshDiagnosticProbe,
            secrets: SshConnectionSecrets,
        ): SshCommandResult = SshCommandResult(ok = false, message = DiagnosticCategory.Unknown.name)
    }

    private class FakeHostKeyTrustStore(
        private val trusted: Boolean,
    ) : HostKeyTrustStore {
        override fun evaluate(target: RemoteTarget, fingerprint: String): HostKeyTrust =
            if (trusted) HostKeyTrust.Trusted(fingerprint) else HostKeyTrust.Unknown

        override fun trust(target: RemoteTarget, fingerprint: String): HostKeyTrust.Trusted =
            HostKeyTrust.Trusted(fingerprint)
    }

    private companion object {
        const val SessionName = "hobgoblin-v1-aebf050981ac829e36100020"
        const val ProjectRoot = "/srv/projects/example"
        const val ProjectServerName = "hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0"
        const val FeaturePath = "/srv/projects/example/worktrees/feature"
    }
}
