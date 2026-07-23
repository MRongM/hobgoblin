package dev.hobgoblin.android.terminals

import dev.hobgoblin.android.data.ssh.HostKeyTrustStore
import dev.hobgoblin.android.domain.ssh.DiagnosticCategory
import dev.hobgoblin.android.domain.ssh.HostKeyTrust
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.ssh.SshClientFacade
import dev.hobgoblin.android.ssh.SshCommandResult
import dev.hobgoblin.android.ssh.SshConnectionSecrets
import dev.hobgoblin.android.ssh.SshDiagnosticProbe
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteTmuxSessionServiceTest {
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
                    "${discoveryIdentity.sessionName}\t$FeaturePath\t1",
                    "user-session\t$FeaturePath\t1",
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
        assertEquals(listOf(TmuxSessionProtocol.listDiscoverableSessionsScript()), client.scripts)
        assertTrue(client.secrets.all { it.acceptedHostFingerprint == "SHA256:trusted" })
    }

    @Test
    fun `missing tmux and no server are empty discovery results`() {
        listOf(
            SshCommandResult(ok = false, stderr = "no server running on /tmp/tmux-1000/default"),
            SshCommandResult(ok = false, message = "exit 127"),
        ).forEach { commandResult ->
            val result = service(FakeSshClient(commandResult)).discoverAssociatedSessions(
                target = target(),
                projectRoot = ProjectRoot,
                allowedInitialPaths = setOf(FeaturePath),
            )

            assertEquals(RemoteTmuxDiscoveryResult.Found(emptyList()), result)
        }
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
    fun `exact live name and path are listed before the session is killed`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "$SessionName\t/srv/feature"),
            SshCommandResult(ok = true),
        )
        val service = service(client)

        val result = service.closeAssociatedSession(target(), identity())

        assertEquals(RemoteTmuxCloseResult.Closed, result)
        assertEquals(
            listOf(
                TmuxSessionProtocol.listSessionsScript(),
                TmuxSessionProtocol.killSessionScript(SessionName),
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

        val result = service(client).closeAssociatedSession(target(), identity())

        assertEquals(RemoteTmuxCloseResult.Missing, result)
        assertEquals(listOf(TmuxSessionProtocol.listSessionsScript()), client.scripts)
    }

    @Test
    fun `different name at the same path is treated as missing and not killed`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "hobgoblin-v1-0123456789abcdef01234567\t/srv/feature"),
        )

        val result = service(client).closeAssociatedSession(target(), identity())

        assertEquals(RemoteTmuxCloseResult.Missing, result)
        assertEquals(1, client.scripts.size)
    }

    @Test
    fun `no tmux server is idempotently treated as missing`() {
        val client = FakeSshClient(
            SshCommandResult(ok = false, stderr = "no server running on /tmp/tmux-1000/default"),
        )

        assertEquals(RemoteTmuxCloseResult.Missing, service(client).closeAssociatedSession(target(), identity()))
    }

    @Test
    fun `malformed list output fails closed`() {
        val client = FakeSshClient(SshCommandResult(ok = true, stdout = "malformed"))

        val result = service(client).closeAssociatedSession(target(), identity())

        assertEquals(RemoteTmuxCloseResult.Failed("tmux returned an invalid session list"), result)
        assertEquals(1, client.scripts.size)
    }

    @Test
    fun `tmux unavailable fails closed`() {
        val client = FakeSshClient(SshCommandResult(ok = false, message = "exit 127"))

        assertEquals(
            RemoteTmuxCloseResult.Failed("exit 127"),
            service(client).closeAssociatedSession(target(), identity()),
        )
    }

    @Test
    fun `session disappearing during exact kill is treated as missing`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "$SessionName\t/srv/feature"),
            SshCommandResult(ok = false, stderr = "can't find session: $SessionName"),
        )

        assertEquals(RemoteTmuxCloseResult.Missing, service(client).closeAssociatedSession(target(), identity()))
    }

    @Test
    fun `kill command failure keeps a failure result`() {
        val client = FakeSshClient(
            SshCommandResult(ok = true, stdout = "$SessionName\t/srv/feature"),
            SshCommandResult(ok = false, stderr = "permission denied"),
        )

        assertEquals(
            RemoteTmuxCloseResult.Failed("permission denied"),
            service(client).closeAssociatedSession(target(), identity()),
        )
    }

    @Test
    fun `untrusted host fails before tmux commands run`() {
        val client = FakeSshClient()
        val service = RemoteTmuxSessionService(client, FakeHostKeyTrustStore(trusted = false))

        val result = service.closeAssociatedSession(target(), identity())

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

        override fun fetchHostFingerprint(target: RemoteTarget): String = "SHA256:trusted"

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
        const val FeaturePath = "/srv/projects/example/worktrees/feature"
    }
}
