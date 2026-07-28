package com.mrongm.hobgoblin.data

import java.nio.charset.StandardCharsets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WorkspaceRegistryCodecTest {
    @Test
    fun `shared v1 fixtures decode into the Android read contract`() {
        val workspaceRegistry = WorkspaceRegistryCodec.decodeWorkspaceConfigs(
            fixture("workspace-configs.json"),
        )
        val branchRegistry = WorkspaceRegistryCodec.decodeBranchWorkspaces(
            fixture("branch-workspaces.json"),
        )

        assertEquals(1, workspaceRegistry.version)
        assertEquals("/srv/workspace", workspaceRegistry.workspaces.single().rootId)
        assertEquals(listOf("api", "web"), workspaceRegistry.workspaces.single().repositoryNames)

        val branchWorkspace = branchRegistry.workspaces.single().branchWorkspaces.single()
        assertEquals("feature/auth", branchWorkspace.branch)
        assertEquals("/srv/workspace/hobgoblin-feature-auth", branchWorkspace.path)
        assertEquals(listOf("api", "web"), branchWorkspace.repositories.map { it.repositoryName })
    }

    @Test
    fun `unknown additive fields remain forward compatible`() {
        val registry = WorkspaceRegistryCodec.decodeWorkspaceConfigs(
            """{
                "version": 1,
                "futureRegistryField": true,
                "workspaces": [{
                    "rootId": "/srv/workspace",
                    "repo": ["api"],
                    "futureWorkspaceField": "ignored"
                }]
            }""".trimIndent(),
        )

        assertEquals(listOf("api"), registry.workspaces.single().repositoryNames)
    }

    @Test
    fun `unsupported versions fail closed`() {
        assertThrows(IllegalArgumentException::class.java) {
            WorkspaceRegistryCodec.decodeWorkspaceConfigs("""{"version":2,"workspaces":[]}""")
        }
        assertThrows(IllegalArgumentException::class.java) {
            WorkspaceRegistryCodec.decodeBranchWorkspaces("""{"version":2,"workspaces":[]}""")
        }
    }

    @Test
    fun `invalid branch workspace relationships fail closed`() {
        val invalid = fixture("branch-workspaces.json").replace(
            "/srv/workspace/hobgoblin-feature-auth/api",
            "/srv/other/api",
        )

        assertThrows(IllegalArgumentException::class.java) {
            WorkspaceRegistryCodec.decodeBranchWorkspaces(invalid)
        }
    }

    private fun fixture(name: String): String {
        val stream = requireNotNull(javaClass.classLoader?.getResourceAsStream("workspace-catalog/v1/$name"))
        return stream.use { input -> String(input.readBytes(), StandardCharsets.UTF_8) }
    }
}
