package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustPolicy
import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.domain.workspace.RemotePathAvailability
import java.nio.charset.StandardCharsets
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteWorkspaceCatalogServiceTest {
    @Test
    fun `registry read script follows the server data directory rules and bounds both files`() {
        val client = FakeSshClient(
            commandResults = listOf(
                SshCommandResult(ok = true, stdout = registryOutput(workspace = "MISSING", branches = "MISSING")),
            ),
        )
        val service = service(client)

        val result = service.loadCatalog(target())
        val script = client.scripts.single()

        assertTrue(result is RemoteWorkspaceCatalogResult.Loaded)
        assertTrue(script.contains("GOBLIN_SERVER_DATA_DIR"))
        assertTrue(script.contains("uname -s"))
        assertTrue(script.contains("Library/Application Support/Hobgoblin"))
        assertTrue(script.contains("XDG_STATE_HOME"))
        assertTrue(script.contains(".local/state/hobgoblin"))
        assertTrue(script.contains("[ -d \"\$data_dir\" ]"))
        assertTrue(script.contains("[ -r \"\$data_dir\" ]"))
        assertTrue(script.contains("wc -c"))
        assertTrue(script.contains("4194304"))
        assertTrue(script.contains("base64"))
        assertFalse(script.contains("git "))
        assertFalse(script.contains("tmux"))
    }

    @Test
    fun `missing registry files mean an empty catalog`() {
        val service = service(
            FakeSshClient(
                commandResults = listOf(
                    SshCommandResult(ok = true, stdout = registryOutput(workspace = "MISSING", branches = "MISSING")),
                ),
            ),
        )

        val result = service.loadCatalog(target()) as RemoteWorkspaceCatalogResult.Loaded

        assertTrue(result.snapshot.workspaces.isEmpty())
    }

    @Test
    fun `an unavailable data directory fails without exposing remote output`() {
        val service = service(
            FakeSshClient(
                commandResults = listOf(
                    SshCommandResult(
                        ok = true,
                        stdout = "__HOBGOBLIN_ANDROID_WORKSPACE_CATALOG_V1__\n__DATA_DIR__\tUNAVAILABLE",
                    ),
                ),
            ),
        )

        val result = service.loadCatalog(target()) as RemoteWorkspaceCatalogResult.Failed

        assertEquals("Unable to locate Hobgoblin workspace data.", result.message)
    }

    @Test
    fun `an oversized workspace registry fails closed`() {
        val service = service(
            FakeSshClient(
                commandResults = listOf(
                    SshCommandResult(ok = true, stdout = registryOutput(workspace = "OVERSIZED", branches = "MISSING")),
                ),
            ),
        )

        val result = service.loadCatalog(target()) as RemoteWorkspaceCatalogResult.Failed

        assertEquals("Unable to read Hobgoblin workspace configuration.", result.message)
    }

    @Test
    fun `projection keeps direct roots ordered and ignores nested SSH roots`() {
        val workspaces = """{
            "version": 1,
            "workspaces": [
                {"rootId":"/srv/product","repo":["api","web"]},
                {"rootId":"ssh-config://nested/srv/remote","repo":["ignored"]},
                {"rootId":"/srv/tools","repo":["cli"]}
            ]
        }""".trimIndent()
        val branches = fixture("branch-workspaces.json")
            .replace("/srv/workspace", "/srv/product")
        val service = service(
            FakeSshClient(
                commandResults = listOf(
                    SshCommandResult(ok = true, stdout = registryOutput(ready(workspaces), ready(branches))),
                ),
            ),
        )

        val result = service.loadCatalog(target()) as RemoteWorkspaceCatalogResult.Loaded

        assertEquals(listOf("/srv/product", "/srv/tools"), result.snapshot.workspaces.map { it.rootPath })
        val product = result.snapshot.workspaces.first()
        assertEquals(listOf("/srv/product/api", "/srv/product/web"), product.repositories.map { it.path })
        assertEquals("feature/auth", product.branchWorkspaces.single().branch)
        assertEquals(
            "/srv/product/hobgoblin-feature-auth/api",
            product.branchWorkspaces.single().members.first().worktreePath,
        )
        assertTrue(product.branchWorkspaceError == null)
    }

    @Test
    fun `an invalid branch registry preserves configured workspaces with a partial error`() {
        val service = service(
            FakeSshClient(
                commandResults = listOf(
                    SshCommandResult(
                        ok = true,
                        stdout = registryOutput(ready(fixture("workspace-configs.json")), ready("{")),
                    ),
                ),
            ),
        )

        val result = service.loadCatalog(target()) as RemoteWorkspaceCatalogResult.Loaded
        val workspace = result.snapshot.workspaces.single()

        assertTrue(workspace.branchWorkspaces.isEmpty())
        assertEquals("Unable to read Hobgoblin branch workspace data.", workspace.branchWorkspaceError)
    }

    @Test
    fun `path inspection batches probes and retains unavailable rows`() {
        val client = FakeSshClient(
            commandResults = listOf(
                SshCommandResult(
                    ok = true,
                    stdout = registryOutput(
                        ready(fixture("workspace-configs.json")),
                        ready(fixture("branch-workspaces.json")),
                    ),
                ),
                SshCommandResult(
                    ok = true,
                    stdout = listOf("0\t1", "1\t0", "2\t1", "3\t1", "4\t1", "5\t0").joinToString("\n"),
                ),
            ),
        )
        val service = service(client)

        val result = service.loadCatalog(target(), inspectPaths = true) as RemoteWorkspaceCatalogResult.Loaded
        val workspace = result.snapshot.workspaces.single()
        val branchWorkspace = workspace.branchWorkspaces.single()

        assertEquals(2, client.scripts.size)
        assertEquals(RemotePathAvailability.Unavailable, workspace.repositories[0].availability)
        assertEquals(RemotePathAvailability.Available, workspace.repositories[1].availability)
        assertEquals(RemotePathAvailability.Available, branchWorkspace.rootAvailability)
        assertEquals(RemotePathAvailability.Available, branchWorkspace.members[0].availability)
        assertEquals(RemotePathAvailability.Unavailable, branchWorkspace.members[1].availability)
        assertEquals(2, workspace.repositories.size)
        assertEquals(2, branchWorkspace.members.size)
        assertFalse(client.scripts[1].contains("git "))
        assertFalse(client.scripts[1].contains("tmux"))
    }

    private fun service(client: SshClientFacade): RemoteWorkspaceCatalogService =
        RemoteWorkspaceCatalogService(client, FakeHostKeyTrustStore("SHA256:test"))

    private fun target(): RemoteTarget = RemoteTarget(
        id = "host-safe",
        alias = "Development",
        host = "example.invalid",
        user = "developer",
        port = 22,
        remotePath = "/",
        identityRefId = "identity-safe",
    )

    private fun fixture(name: String): String {
        val stream = requireNotNull(javaClass.classLoader?.getResourceAsStream("workspace-catalog/v1/$name"))
        return stream.use { input -> String(input.readBytes(), StandardCharsets.UTF_8) }
    }

    private fun ready(payload: String): String = "READY\t${Base64.getEncoder().encodeToString(payload.toByteArray())}"

    private fun registryOutput(workspace: String, branches: String): String = listOf(
        "__HOBGOBLIN_ANDROID_WORKSPACE_CATALOG_V1__",
        "__DATA_DIR__\tREADY",
        "__WORKSPACE_CONFIGS__\t$workspace",
        "__BRANCH_WORKSPACES__\t$branches",
    ).joinToString("\n")

    private class FakeSshClient(
        private val commandResults: List<SshCommandResult>,
        private val fingerprint: String = "SHA256:test",
    ) : SshClientFacade {
        private var commandIndex = 0
        val scripts = mutableListOf<String>()

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
            scripts += script
            return commandResults.getOrNull(commandIndex++) ?: error("Unexpected SSH command")
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
