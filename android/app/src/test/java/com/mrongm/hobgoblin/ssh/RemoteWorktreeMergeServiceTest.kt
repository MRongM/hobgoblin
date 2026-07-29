package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustPolicy
import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryBranch
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositorySnapshot
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class RemoteWorktreeMergeServiceTest {
    @Test
    fun `merge into source branches exclude the destination branch`() {
        assertEquals(
            listOf("main", "release/next"),
            mergeIntoSourceBranches(snapshot(), featureWorktree()),
        )
    }

    @Test
    fun `merge out destinations keep visible unavailable worktrees and exclude source identity`() {
        val dirty = worktree("/srv/app-dirty", "bugfix/dirty", isDirty = true)
        val bare = worktree("/srv/app-bare", null, isBare = true)
        val missing = worktree("/srv/app-missing", "release/missing", isMissing = true)
        val detached = worktree("/srv/app-detached", null)
        val sameBranch = worktree("/srv/app-feature-copy", "feature/android")
        val snapshot = snapshot(
            worktrees = listOf(featureWorktree(), mainWorktree(), dirty, bare, missing, detached, sameBranch),
        )

        val destinations = mergeOutDestinationWorktrees(snapshot, featureWorktree())

        assertEquals(listOf("main", "bugfix/dirty", null, "release/missing"), destinations.map { it.worktree.branch })
        assertTrue(destinations.first().safety.allowed)
        assertEquals(WorktreeMergeBlockReason.Dirty, destinations[1].safety.blockReason)
        assertEquals(WorktreeMergeBlockReason.Bare, destinations[2].safety.blockReason)
        assertEquals(WorktreeMergeBlockReason.Missing, destinations[3].safety.blockReason)
    }

    @Test
    fun `merge safety rejects detached dirty missing and bare worktrees`() {
        assertEquals(WorktreeMergeBlockReason.Detached, evaluateMergeDestination(worktree("/srv/detached", null)).blockReason)
        assertEquals(
            WorktreeMergeBlockReason.Dirty,
            evaluateMergeDestination(worktree("/srv/dirty", "feature/dirty", isDirty = true)).blockReason,
        )
        assertEquals(
            WorktreeMergeBlockReason.Missing,
            evaluateMergeDestination(worktree("/srv/missing", "feature/missing", isMissing = true)).blockReason,
        )
        assertEquals(
            WorktreeMergeBlockReason.Bare,
            evaluateMergeDestination(worktree("/srv/bare", null, isBare = true)).blockReason,
        )
        assertEquals(
            WorktreeMergeBlockReason.Dirty,
            evaluateMergeOutSource(featureWorktree().copy(isDirty = true, changeCount = 1)).blockReason,
        )
    }

    @Test
    fun `merge into runs in destination worktree with safely quoted source branch`() {
        val client = FakeSshClient()
        val service = service(client)

        service.mergeInto(target(), featureWorktree().copy(path = "/srv/app-feature's"), "release/o'brien")

        assertTrue(
            client.lastScript.endsWith(
                "git -C '/srv/app-feature'\"'\"'s' merge -- 'refs/heads/release/o'\"'\"'brien'",
            ),
        )
    }

    @Test
    fun `merge out runs source branch merge in destination worktree`() {
        val client = FakeSshClient()
        val service = service(client)

        service.mergeOut(target(), featureWorktree(), mainWorktree())

        assertTrue(client.lastScript.endsWith("git -C '/srv/app' merge -- 'refs/heads/feature/android'"))
    }

    @Test
    fun `merge into revalidates repository destination branch cleanliness and source ref before merge`() {
        val client = FakeSshClient()
        val service = service(client)

        service.mergeInto(target(), featureWorktree(), "main")

        val script = client.lastScript
        assertTrue(script.contains("git -C '/srv/app' rev-parse --path-format=absolute --git-common-dir"))
        assertTrue(script.contains("git -C '/srv/app' rev-parse --path-format=absolute --show-toplevel"))
        assertTrue(script.contains("[ \"\$repository_root\" = '/srv/app' ] ||"))
        assertTrue(script.contains("git -C '/srv/app-feature' rev-parse --path-format=absolute --git-common-dir"))
        assertTrue(script.contains("git -C '/srv/app-feature' rev-parse --path-format=absolute --show-toplevel"))
        assertTrue(script.contains("[ \"\$destination_root\" = '/srv/app-feature' ] ||"))
        assertTrue(script.contains("git -C '/srv/app-feature' symbolic-ref --quiet --short HEAD"))
        assertTrue(script.contains("= 'feature/android'"))
        assertTrue(
            script.contains(
                "destination_status=\$(git -C '/srv/app-feature' status --porcelain) ||",
            ),
        )
        assertTrue(script.contains("[ -z \"\$destination_status\" ] ||"))
        assertTrue(script.contains("git -C '/srv/app' show-ref --verify --quiet 'refs/heads/main'"))
        assertGuardsRunBeforeMerge(script, "git -C '/srv/app-feature' merge -- 'refs/heads/main'")
    }

    @Test
    fun `merge out revalidates source and destination identities in one command`() {
        val client = FakeSshClient()
        val service = service(client)

        service.mergeOut(target(), featureWorktree(), mainWorktree())

        val script = client.lastScript
        assertTrue(script.contains("git -C '/srv/app-feature' rev-parse --path-format=absolute --git-common-dir"))
        assertTrue(script.contains("git -C '/srv/app-feature' symbolic-ref --quiet --short HEAD"))
        assertTrue(script.contains("= 'feature/android'"))
        assertTrue(script.contains("source_status=\$(git -C '/srv/app-feature' status --porcelain) ||"))
        assertTrue(script.contains("[ -z \"\$source_status\" ] ||"))
        assertTrue(script.contains("git -C '/srv/app' symbolic-ref --quiet --short HEAD"))
        assertTrue(script.contains("= 'main'"))
        assertTrue(script.contains("destination_status=\$(git -C '/srv/app' status --porcelain) ||"))
        assertTrue(script.contains("[ -z \"\$destination_status\" ] ||"))
        assertEquals(1, client.commandCount)
        assertGuardsRunBeforeMerge(script, "git -C '/srv/app' merge -- 'refs/heads/feature/android'")
    }

    @Test
    fun `merge preflight status failure is fail closed before merge`() {
        val tempDirectory = Files.createTempDirectory("worktree-merge-script-").toFile()
        try {
            val mergeMarker = tempDirectory.resolve("merge-ran")
            val fakeGit = tempDirectory.resolve("git")
            fakeGit.writeText(
                """
                #!/bin/sh
                path=${'$'}2
                case "${'$'}*" in
                  *--git-common-dir*) printf '%s\n' /srv/common ;;
                  *--show-toplevel*) printf '%s\n' "${'$'}path" ;;
                  *symbolic-ref*)
                    if [ "${'$'}path" = /srv/app-feature ]; then printf '%s\n' feature/android; else printf '%s\n' main; fi
                    ;;
                  *"status --porcelain"*) exit 9 ;;
                  *"show-ref --verify"*) exit 0 ;;
                  *"merge --"*) : > "${'$'}MERGE_MARKER" ;;
                esac
                """.trimIndent(),
            )
            assertTrue(fakeGit.setExecutable(true))
            val process = ProcessBuilder(
                "/bin/sh",
                "-c",
                remoteMergeScript("/srv/app", featureWorktree(), "main"),
            ).apply {
                environment()["PATH"] = "${tempDirectory.absolutePath}:${System.getenv("PATH").orEmpty()}"
                environment()["MERGE_MARKER"] = mergeMarker.absolutePath
            }.start()

            val exitCode = process.waitFor()
            val stderr = process.errorStream.bufferedReader().readText()

            assertTrue(exitCode != 0)
            assertTrue(stderr.contains("__HOBGOBLIN_ANDROID_WORKTREE_MERGE__:StatusUnavailable"))
            assertFalse(mergeMarker.exists())
        } finally {
            tempDirectory.deleteRecursively()
        }
    }

    @Test
    fun `known preflight sentinel becomes a typed failure while unknown git error stays actionable`() {
        val client = FakeSshClient(
            SshCommandResult(
                ok = false,
                stderr = "__HOBGOBLIN_ANDROID_WORKTREE_MERGE__:IdentityChanged",
            ),
        )

        val error = assertThrows(RemoteWorktreeMergePreflightException::class.java) {
            service(client).mergeInto(target(), featureWorktree(), "main")
        }

        assertEquals(RemoteWorktreeMergePreflightReason.IdentityChanged, error.reason)
    }

    @Test
    fun `merge rejects same branch and dirty source or destination before ssh`() {
        val client = FakeSshClient()
        val service = service(client)

        assertThrows(IllegalArgumentException::class.java) {
            service.mergeInto(target(), featureWorktree(), "feature/android")
        }
        assertThrows(IllegalArgumentException::class.java) {
            service.mergeOut(target(), featureWorktree().copy(isDirty = true), mainWorktree())
        }
        assertThrows(IllegalArgumentException::class.java) {
            service.mergeOut(target(), featureWorktree(), mainWorktree().copy(isDirty = true))
        }
        assertEquals("", client.lastScript)
    }

    @Test
    fun `merge is blocked until host key is trusted`() {
        val client = FakeSshClient()
        val service = RemoteWorktreeMergeService(client, FakeHostKeyTrustStore(null))

        val error = assertThrows(IllegalArgumentException::class.java) {
            service.mergeInto(target(), featureWorktree(), "main")
        }

        assertEquals("Trust this host key before merging remote worktrees.", error.message)
        assertEquals("", client.lastScript)
    }

    @Test
    fun `merge preserves actionable git failure`() {
        val client = FakeSshClient(SshCommandResult(ok = false, stderr = "CONFLICT: resolve in destination worktree"))
        val service = service(client)

        val error = assertThrows(IllegalArgumentException::class.java) {
            service.mergeInto(target(), featureWorktree(), "main")
        }

        assertEquals("CONFLICT: resolve in destination worktree", error.message)
    }

    private fun service(client: FakeSshClient): RemoteWorktreeMergeService =
        RemoteWorktreeMergeService(client, FakeHostKeyTrustStore("SHA256:test"))

    private fun assertGuardsRunBeforeMerge(script: String, mergeCommand: String) {
        val mergeIndex = script.lastIndexOf(mergeCommand)
        assertTrue("Expected merge command in script", mergeIndex >= 0)
        assertTrue("Expected repository guard before merge", script.indexOf("--git-common-dir") in 0 until mergeIndex)
        assertTrue("Expected branch guard before merge", script.indexOf("symbolic-ref") in 0 until mergeIndex)
        assertTrue("Expected clean-worktree guard before merge", script.indexOf("status --porcelain") in 0 until mergeIndex)
    }

    private fun target(): RemoteTarget = RemoteTarget(
        id = "dev@example.test:22/srv/app",
        alias = "Development",
        host = "example.test",
        user = "dev",
        port = 22,
        remotePath = "/srv/app",
        identityRefId = "identity-1",
    )

    private fun snapshot(
        worktrees: List<RemoteRepositoryWorktree> = listOf(featureWorktree(), mainWorktree()),
    ): RemoteRepositorySnapshot = RemoteRepositorySnapshot(
        currentRef = "main",
        defaultBranch = "main",
        statusLines = emptyList(),
        statusChangeCount = 0,
        branches = listOf(
            branch("main", "/srv/app"),
            branch("feature/android", "/srv/app-feature"),
            branch("release/next", null),
        ),
        commits = emptyList(),
        worktrees = worktrees,
    )

    private fun branch(name: String, worktreePath: String?): RemoteRepositoryBranch = RemoteRepositoryBranch(
        name = name,
        isCurrent = name == "main",
        isDefault = name == "main",
        worktreePath = worktreePath,
    )

    private fun mainWorktree(): RemoteRepositoryWorktree = worktree(
        path = "/srv/app",
        branch = "main",
        isPrimary = true,
        isLinked = false,
    )

    private fun featureWorktree(): RemoteRepositoryWorktree = worktree(
        path = "/srv/app-feature",
        branch = "feature/android",
    )

    private fun worktree(
        path: String,
        branch: String?,
        isPrimary: Boolean = false,
        isLinked: Boolean = true,
        isBare: Boolean = false,
        isMissing: Boolean = false,
        isDirty: Boolean = false,
    ): RemoteRepositoryWorktree = RemoteRepositoryWorktree(
        path = path,
        branch = branch,
        isPrimary = isPrimary,
        isLinked = isLinked,
        isBare = isBare,
        isLocked = false,
        isMissing = isMissing,
        isDirty = isDirty,
        changeCount = if (isDirty) 1 else 0,
    )

    private class FakeSshClient(
        private val result: SshCommandResult = SshCommandResult(ok = true, stdout = "ok"),
    ) : SshClientFacade {
        var lastScript: String = ""
        var commandCount: Int = 0

        override fun fetchHostFingerprint(target: RemoteTarget): String = "SHA256:test"

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
            commandCount += 1
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
