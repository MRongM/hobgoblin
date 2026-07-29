package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustPolicy
import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteWorktreeServiceTest {
    @Test
    fun `create worktree is blocked until host key is trusted`() {
        val service = RemoteWorktreeService(
            client = FakeSshClient(),
            hostKeyStore = FakeHostKeyTrustStore(null),
        )

        val error = assertThrows(IllegalArgumentException::class.java) {
            service.createWorktree(
                target(),
                source = WorktreeCreationSource.ExistingLocal("feature/android"),
                worktreePath = "/srv/app-feature",
            )
        }

        assertEquals("Trust this host key before changing remote worktrees.", error.message)
    }

    @Test
    fun `create worktree runs quoted git worktree add command`() {
        val client = FakeSshClient()
        val service = RemoteWorktreeService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        service.createWorktree(
            target(),
            source = WorktreeCreationSource.ExistingLocal("feature/android"),
            worktreePath = "/srv/app-feature",
        )

        assertTrue(client.lastScript.contains("git -C '/srv/app' worktree add -- '/srv/app-feature' 'feature/android'"))
    }

    @Test
    fun `create worktree from remote ref creates a local tracking branch`() {
        val client = FakeSshClient()
        val service = RemoteWorktreeService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        service.createWorktree(
            target(),
            source = WorktreeCreationSource.TrackRemote(
                remoteRef = "origin/feature/android",
                localBranch = "feature/android",
            ),
            worktreePath = "/srv/app-feature",
        )

        assertTrue(
            client.lastScript.contains(
                "git -C '/srv/app' worktree add -b 'feature/android' --track -- '/srv/app-feature' 'origin/feature/android'",
            ),
        )
    }

    @Test
    fun `allowed clean linked main worktree removal runs quoted git worktree remove command`() {
        val client = FakeSshClient()
        val service = RemoteWorktreeService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        service.removeWorktree(target(), safeWorktree().copy(branch = "main"))

        assertTrue(client.lastScript.contains("git -C '/srv/app' worktree remove '/srv/app-feature'"))
    }

    @Test
    fun `blocked worktree removal does not run remote command`() {
        val client = FakeSshClient()
        val service = RemoteWorktreeService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        val error = assertThrows(IllegalArgumentException::class.java) {
            service.removeWorktree(target(), safeWorktree().copy(isDirty = true, changeCount = 2))
        }

        assertEquals("Dirty worktree cannot be removed.", error.message)
        assertEquals("", client.lastScript)
    }

    @Test
    fun `removal safety blocks unsafe worktrees`() {
        val primary = safeWorktree().copy(path = "/srv/app", isPrimary = true, isLinked = false)
        assertEquals(
            WorktreeRemovalBlockReason.Primary,
            evaluateWorktreeRemoval("/srv/app/", primary).blockReason,
        )
        assertEquals(
            WorktreeRemovalBlockReason.Dirty,
            evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(isDirty = true, changeCount = 1)).blockReason,
        )
        assertEquals(
            WorktreeRemovalBlockReason.Locked,
            evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(isLocked = true)).blockReason,
        )
        assertEquals(
            WorktreeRemovalBlockReason.Missing,
            evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(isMissing = true)).blockReason,
        )
        assertTrue(evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(branch = "main")).allowed)
    }

    @Test
    fun `removal safety blocks inconsistent project path and git primary identities`() {
        assertEquals(
            WorktreeRemovalBlockReason.IdentityChanged,
            evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(path = "/srv/app")).blockReason,
        )
        assertEquals(
            WorktreeRemovalBlockReason.IdentityChanged,
            evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(isPrimary = true)).blockReason,
        )
    }

    @Test
    fun `remove confirmation says remote server worktree is removed`() {
        val text = worktreeRemovalConfirmationText(safeWorktree())

        assertTrue(text.contains("remote worktree"))
        assertTrue(text.contains("SSH server"))
        assertTrue(text.contains("/srv/app-feature"))
    }

    private fun target(): RemoteTarget = RemoteTarget(
        id = "lee@example.com:22/srv/app",
        alias = "Dev",
        host = "example.com",
        user = "lee",
        port = 22,
        remotePath = "/srv/app",
        identityRefId = "identity-1",
    )

    private fun safeWorktree(): RemoteRepositoryWorktree = RemoteRepositoryWorktree(
        path = "/srv/app-feature",
        branch = "feature/android",
        isPrimary = false,
        isLinked = true,
        isBare = false,
        isLocked = false,
        isMissing = false,
        isDirty = false,
        changeCount = 0,
    )

    private class FakeSshClient(
        private val fingerprint: String = "SHA256:test",
        private val result: SshCommandResult = SshCommandResult(ok = true, stdout = "ok"),
    ) : SshClientFacade {
        var lastScript: String = ""

        override fun fetchHostFingerprint(target: RemoteTarget): String = fingerprint

        override fun runDiagnosticProbe(
            target: RemoteTarget,
            probe: SshDiagnosticProbe,
            secrets: SshConnectionSecrets,
        ): SshCommandResult = SshCommandResult(ok = true)

        override fun runCommand(
            target: RemoteTarget,
            script: String,
            secrets: SshConnectionSecrets,
        ): SshCommandResult {
            lastScript = script
            return result
        }
    }

    private class FakeHostKeyTrustStore(
        private var trustedFingerprint: String?,
    ) : HostKeyTrustStore {
        override fun evaluate(target: RemoteTarget, fingerprint: String): HostKeyTrust =
            HostKeyTrustPolicy.evaluate(trustedFingerprint, fingerprint)

        override fun trust(target: RemoteTarget, fingerprint: String): HostKeyTrust.Trusted {
            trustedFingerprint = fingerprint
            return HostKeyTrust.Trusted(fingerprint)
        }
    }
}
