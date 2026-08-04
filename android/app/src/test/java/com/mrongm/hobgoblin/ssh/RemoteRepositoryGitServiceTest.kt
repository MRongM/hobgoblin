package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustPolicy
import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteRepositoryGitServiceTest {
    @Test
    fun `directory listing parser keeps parent and child directories`() {
        val output = """
            ..	/home/lee
            app	/home/lee/app
            api	/home/lee/api
        """.trimIndent()

        val entries = parseRemoteDirectoryEntries(output)

        assertEquals("..", entries[0].name)
        assertEquals("/home/lee", entries[0].path)
        assertEquals("app", entries[1].name)
        assertEquals("/home/lee/app", entries[1].path)
        assertTrue(entries.all { it.isDirectory })
    }

    @Test
    fun `directory listing parser normalizes root child paths`() {
        val output = """
            home	//home
            srv	//srv
        """.trimIndent()

        val entries = parseRemoteDirectoryEntries(output)

        assertEquals("/home", entries[0].path)
        assertEquals("/srv", entries[1].path)
    }

    @Test
    fun `project inspection parser classifies git repositories`() {
        val output = """
            __HOBGOBLIN_ANDROID_PROJECT_KIND__
            git
            __HOBGOBLIN_ANDROID_PROJECT_PATH__
            /srv/app
            __HOBGOBLIN_ANDROID_PROJECT_WORKTREE__
            /srv/app-feature
            __HOBGOBLIN_ANDROID_PROJECT_CURRENT__
            feature/android
            __HOBGOBLIN_ANDROID_PROJECT_DEFAULT__
            main
        """.trimIndent()

        val inspection = parseRemoteProjectInspection("/srv/app/subdir", output)

        assertEquals(RemoteProjectKind.GitRepository, inspection.kind)
        assertEquals("/srv/app", inspection.resolvedPath)
        assertEquals("/srv/app-feature", inspection.worktreePath)
        assertEquals("feature/android", inspection.currentRef)
        assertEquals("main", inspection.defaultBranch)
    }

    @Test
    fun `project inspection parser classifies readable non git directories as plain workspaces`() {
        val output = """
            __HOBGOBLIN_ANDROID_PROJECT_KIND__
            plain
            __HOBGOBLIN_ANDROID_PROJECT_PATH__
            /srv/scripts
            __HOBGOBLIN_ANDROID_PROJECT_WORKTREE__
            /srv/scripts
            __HOBGOBLIN_ANDROID_PROJECT_CURRENT__
            __HOBGOBLIN_ANDROID_PROJECT_DEFAULT__
        """.trimIndent()

        val inspection = parseRemoteProjectInspection("/srv/scripts", output)

        assertEquals(RemoteProjectKind.PlainWorkspace, inspection.kind)
        assertEquals("/srv/scripts", inspection.resolvedPath)
        assertEquals("/srv/scripts", inspection.worktreePath)
        assertEquals(null, inspection.currentRef)
        assertEquals(null, inspection.defaultBranch)
    }

    @Test
    fun `project inspection service accepts a plain workspace`() {
        val output = """
            __HOBGOBLIN_ANDROID_PROJECT_KIND__
            plain
            __HOBGOBLIN_ANDROID_PROJECT_PATH__
            /srv/scripts
            __HOBGOBLIN_ANDROID_PROJECT_CURRENT__
            __HOBGOBLIN_ANDROID_PROJECT_DEFAULT__
        """.trimIndent()
        val service = RemoteRepositoryGitService(
            client = FakeSshClient(commandResults = listOf(SshCommandResult(ok = true, stdout = output))),
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        val inspection = service.inspectProject(target("/srv/scripts"))

        assertEquals(RemoteProjectKind.PlainWorkspace, inspection.kind)
        assertEquals("/srv/scripts", inspection.resolvedPath)
    }

    @Test
    fun `project inspection rejects inaccessible paths`() {
        val client = FakeSshClient(
            commandResults = listOf(
                SshCommandResult(ok = false, stderr = "Remote path is not readable", message = "Remote path is not readable"),
            ),
        )
        val service = RemoteRepositoryGitService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        val error = assertThrows(IllegalArgumentException::class.java) {
            service.inspectProject(target("/srv/missing"))
        }

        assertEquals("Remote path is not readable", error.message)
    }

    @Test
    fun `project inspection script requires a readable directory before classification`() {
        val output = """
            __HOBGOBLIN_ANDROID_PROJECT_KIND__
            plain
            __HOBGOBLIN_ANDROID_PROJECT_PATH__
            /srv/scripts
            __HOBGOBLIN_ANDROID_PROJECT_CURRENT__
            __HOBGOBLIN_ANDROID_PROJECT_DEFAULT__
        """.trimIndent()
        val client = FakeSshClient(commandResults = listOf(SshCommandResult(ok = true, stdout = output)))
        val service = RemoteRepositoryGitService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        service.inspectProject(target("/srv/scripts"))
        val script = client.scripts.single()

        assertTrue(script.contains("[ -d \"\$requested\" ]"))
        assertTrue(script.contains("[ -r \"\$requested\" ]"))
        assertTrue(script.indexOf("[ -r \"\$requested\" ]") < script.indexOf("git -C"))
    }

    @Test
    fun `project inspection canonicalizes linked worktrees to the primary worktree`() {
        val output = """
            __HOBGOBLIN_ANDROID_PROJECT_KIND__
            git
            __HOBGOBLIN_ANDROID_PROJECT_PATH__
            /srv/app
            __HOBGOBLIN_ANDROID_PROJECT_WORKTREE__
            /srv/app-feature
            __HOBGOBLIN_ANDROID_PROJECT_CURRENT__
            main
            __HOBGOBLIN_ANDROID_PROJECT_DEFAULT__
            main
        """.trimIndent()
        val client = FakeSshClient(commandResults = listOf(SshCommandResult(ok = true, stdout = output)))
        val service = RemoteRepositoryGitService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        val inspection = service.inspectProject(target("/srv/app-feature"))
        val script = client.scripts.single()

        assertEquals("/srv/app", inspection.resolvedPath)
        assertEquals("/srv/app-feature", inspection.worktreePath)
        assertTrue(script.contains("worktree list --porcelain"))
        assertTrue(script.contains("primary_worktree="))
        assertTrue(script.contains("resolved=\$primary_worktree"))
    }

    @Test
    fun `project path resolution parser keeps primary and current worktree identities`() {
        val output = listOf(
            "/srv/app-feature\u0000git\u0000/srv/app-feature\u0000/srv/app",
            "/srv/scripts\u0000plain\u0000/srv/scripts\u0000/srv/scripts",
            "/srv/invalid\u0000unknown\u0000/srv/invalid\u0000/srv/invalid",
            "relative\u0000git\u0000relative\u0000relative",
        ).joinToString("\n")

        val resolutions = parseRemoteProjectPathResolutions(output)

        assertEquals(setOf("/srv/app-feature", "/srv/scripts"), resolutions.keys)
        assertEquals(RemoteProjectKind.GitRepository, resolutions.getValue("/srv/app-feature").kind)
        assertEquals("/srv/app", resolutions.getValue("/srv/app-feature").projectPath)
        assertEquals("/srv/app-feature", resolutions.getValue("/srv/app-feature").worktreePath)
        assertEquals(RemoteProjectKind.PlainWorkspace, resolutions.getValue("/srv/scripts").kind)
        assertEquals("/srv/scripts", resolutions.getValue("/srv/scripts").projectPath)
        assertEquals("/srv/scripts", resolutions.getValue("/srv/scripts").worktreePath)
    }

    @Test
    fun `project path resolution batches unique paths in one trusted command`() {
        val output = listOf(
            "/srv/app-feature\u0000git\u0000/srv/app-feature\u0000/srv/app",
            "/srv/scripts\u0000plain\u0000/srv/scripts\u0000/srv/scripts",
        ).joinToString("\n")
        val client = FakeSshClient(
            commandResults = listOf(SshCommandResult(ok = true, stdout = output)),
        )
        val service = RemoteRepositoryGitService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        val resolutions = service.resolveProjectPaths(
            target = target("/"),
            remotePaths = listOf("/srv/app-feature", "/srv/app-feature", "/srv/scripts"),
        )

        assertEquals(setOf("/srv/app-feature", "/srv/scripts"), resolutions.keys)
        assertEquals(1, client.fingerprintReads)
        assertEquals(1, client.scripts.size)
        assertEquals(1, Regex("resolve_project_path '/srv/app-feature'").findAll(client.scripts.single()).count())
        assertTrue(client.scripts.single().contains("worktree list --porcelain"))
    }

    @Test
    fun `empty project path resolution avoids host and command work`() {
        val client = FakeSshClient()
        val service = RemoteRepositoryGitService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        assertEquals(emptyMap<String, Any>(), service.resolveProjectPaths(target("/"), emptyList()))
        assertEquals(0, client.fingerprintReads)
        assertTrue(client.scripts.isEmpty())
    }

    @Test
    fun `directory browse is blocked until host key is trusted`() {
        val service = RemoteRepositoryGitService(
            client = FakeSshClient(),
            hostKeyStore = FakeHostKeyTrustStore(null),
        )

        val error = assertThrows(IllegalArgumentException::class.java) {
            service.browseDirectories(target("/srv"))
        }

        assertEquals("Trust this host key before loading repository data.", error.message)
    }

    @Test
    fun `snapshot parser maps branches to existing worktree paths`() {
        val output = """
            __HOBGOBLIN_ANDROID_CURRENT__
            main
            __HOBGOBLIN_ANDROID_DEFAULT__
            main
            __HOBGOBLIN_ANDROID_STATUS__
             M app/src/Main.kt
            ?? notes.md
            __HOBGOBLIN_ANDROID_COMMITS__
            abc123${'\u0000'}Fix terminal input${'\u0000'}Lee${'\u0000'}2 hours ago
            __HOBGOBLIN_ANDROID_BRANCHES__
            main${'\u0000'}*
            feature/android${'\u0000'} 
            __HOBGOBLIN_ANDROID_REMOTE_BRANCHES__
            origin/main${'\u0000'}
            origin/feature/android${'\u0000'}
            origin/HEAD${'\u0000'}refs/remotes/origin/main
            __HOBGOBLIN_ANDROID_WORKTREES__
            worktree /srv/app
            HEAD abc123
            branch refs/heads/main
            
            worktree /srv/app-feature-android
            HEAD def456
            branch refs/heads/feature/android
            locked dependency update

            worktree /srv/app-missing
            HEAD fed321
            branch refs/heads/missing
            prunable gitdir file points to non-existent location
            __HOBGOBLIN_ANDROID_WORKTREE_STATUS__
            /srv/app${'\u0000'}2
            /srv/app-feature-android${'\u0000'}0
            /srv/app-missing${'\u0000'}0
        """.trimIndent()

        val snapshot = parseRemoteRepositorySnapshot(output)

        assertEquals("main", snapshot.currentRef)
        assertEquals("main", snapshot.defaultBranch)
        assertEquals(2, snapshot.statusChangeCount)
        assertEquals("abc123", snapshot.commits.single().shortHash)
        assertEquals("Fix terminal input", snapshot.commits.single().subject)
        assertEquals(listOf(" M app/src/Main.kt", "?? notes.md"), snapshot.statusLines)
        assertEquals("/srv/app", snapshot.branches.first { it.name == "main" }.worktreePath)
        assertTrue(snapshot.branches.first { it.name == "main" }.isCurrent)
        assertTrue(snapshot.branches.first { it.name == "main" }.isDefault)
        assertEquals("/srv/app-feature-android", snapshot.branches.first { it.name == "feature/android" }.worktreePath)
        assertEquals(listOf("origin/main", "origin/feature/android"), snapshot.remoteBranches)
        assertFalse(snapshot.worktrees.last().isPrimary)
        assertTrue(snapshot.worktrees.first { it.path == "/srv/app" }.isDirty)
        assertEquals(2, snapshot.worktrees.first { it.path == "/srv/app" }.changeCount)
        assertTrue(snapshot.worktrees.first { it.path == "/srv/app-feature-android" }.isLinked)
        assertTrue(snapshot.worktrees.first { it.path == "/srv/app-feature-android" }.isLocked)
        assertTrue(snapshot.worktrees.first { it.path == "/srv/app-missing" }.isMissing)
    }

    @Test
    fun `snapshot script reads existing remote refs without fetching`() {
        val client = FakeSshClient(commandResults = listOf(SshCommandResult(ok = true, stdout = "")))
        val service = RemoteRepositoryGitService(
            client = client,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:test"),
        )

        service.loadSnapshot(target("/srv/app"))

        val script = client.scripts.single()
        assertTrue(script.contains("refs/remotes/"))
        assertTrue(script.contains("%(symref)"))
        assertFalse(script.contains(" fetch "))
    }

    @Test
    fun `snapshot parser keeps detached and bare worktree states`() {
        val output = """
            __HOBGOBLIN_ANDROID_CURRENT__
            abc123
            __HOBGOBLIN_ANDROID_DEFAULT__
            main
            __HOBGOBLIN_ANDROID_STATUS__
            __HOBGOBLIN_ANDROID_COMMITS__
            __HOBGOBLIN_ANDROID_BRANCHES__
            main${'\u0000'}${' '}
            __HOBGOBLIN_ANDROID_WORKTREES__
            worktree /srv/app
            HEAD abc123
            bare

            worktree /srv/app-detached
            HEAD def456
            __HOBGOBLIN_ANDROID_WORKTREE_STATUS__
            /srv/app${'\u0000'}0
            /srv/app-detached${'\u0000'}0
        """.trimIndent()

        val snapshot = parseRemoteRepositorySnapshot(output)

        assertEquals("abc123", snapshot.currentRef)
        assertTrue(snapshot.worktrees.first { it.path == "/srv/app" }.isBare)
        assertEquals(null, snapshot.worktrees.first { it.path == "/srv/app" }.branch)
        assertEquals(null, snapshot.worktrees.first { it.path == "/srv/app-detached" }.branch)
        assertFalse(snapshot.branches.single().isCurrent)
    }

    private fun target(remotePath: String): RemoteTarget = RemoteTarget(
        id = "lee@example.com:22$remotePath",
        alias = "Dev",
        host = "example.com",
        user = "lee",
        port = 22,
        remotePath = remotePath,
        identityRefId = "identity-1",
    )

    private class FakeSshClient(
        private val fingerprint: String = "SHA256:test",
        private val commandResults: List<SshCommandResult> = emptyList(),
    ) : SshClientFacade {
        private var commandIndex = 0
        var fingerprintReads = 0
        val scripts = mutableListOf<String>()

        override fun fetchHostFingerprint(target: RemoteTarget): String {
            fingerprintReads += 1
            return fingerprint
        }

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
            scripts += script
            return commandResults.getOrNull(commandIndex++) ?: SshCommandResult(ok = true, stdout = "")
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
