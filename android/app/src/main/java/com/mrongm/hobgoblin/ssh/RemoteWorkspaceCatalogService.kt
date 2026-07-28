package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.WorkspaceRegistryCodec
import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceOperationKind
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceProgress
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceRegistry
import com.mrongm.hobgoblin.domain.workspace.RemoteBranchWorkspaceMemberSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemoteBranchWorkspaceOperation
import com.mrongm.hobgoblin.domain.workspace.RemoteBranchWorkspaceSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemoteConfiguredWorkspaceSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemotePathAvailability
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceCatalogSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceRepositorySnapshot
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol
import java.nio.charset.StandardCharsets
import java.util.Base64

sealed interface RemoteWorkspaceCatalogResult {
    data class Loaded(
        val snapshot: RemoteWorkspaceCatalogSnapshot,
    ) : RemoteWorkspaceCatalogResult

    data class Failed(
        val message: String,
    ) : RemoteWorkspaceCatalogResult
}

class RemoteWorkspaceCatalogService(
    private val client: SshClientFacade,
    private val hostKeyStore: HostKeyTrustStore,
) {
    fun loadCatalog(
        target: RemoteTarget,
        inspectPaths: Boolean = false,
    ): RemoteWorkspaceCatalogResult {
        val fingerprint = trustedFingerprint(target)
        val result = client.runCommand(
            target = target,
            script = registryReadScript(),
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        if (!result.ok) return RemoteWorkspaceCatalogResult.Failed(DataDirectoryError)

        val envelope = runCatching { parseRegistryEnvelope(result.stdout) }.getOrElse {
            return RemoteWorkspaceCatalogResult.Failed(DataDirectoryError)
        }
        if (!envelope.dataDirectoryReady) return RemoteWorkspaceCatalogResult.Failed(DataDirectoryError)

        val workspaceRegistry = when (val payload = envelope.workspaceConfigs) {
            RegistryPayload.Missing -> emptyWorkspaceRegistry()
            is RegistryPayload.Ready -> runCatching {
                WorkspaceRegistryCodec.decodeWorkspaceConfigs(payload.json)
            }.getOrElse {
                return RemoteWorkspaceCatalogResult.Failed(WorkspaceRegistryError)
            }
            RegistryPayload.Invalid -> return RemoteWorkspaceCatalogResult.Failed(WorkspaceRegistryError)
        }

        val branchResult = when (val payload = envelope.branchWorkspaces) {
            RegistryPayload.Missing -> BranchRegistryRead.Success(emptyBranchRegistry())
            is RegistryPayload.Ready -> runCatching {
                BranchRegistryRead.Success(WorkspaceRegistryCodec.decodeBranchWorkspaces(payload.json))
            }.getOrElse { BranchRegistryRead.Failed }
            RegistryPayload.Invalid -> BranchRegistryRead.Failed
        }

        var snapshot = projectCatalog(target.id, workspaceRegistry, branchResult)
        if (inspectPaths && snapshot.workspaces.isNotEmpty()) {
            snapshot = inspectPaths(target, fingerprint, snapshot)
        }
        return RemoteWorkspaceCatalogResult.Loaded(snapshot)
    }

    private fun inspectPaths(
        target: RemoteTarget,
        fingerprint: String,
        snapshot: RemoteWorkspaceCatalogSnapshot,
    ): RemoteWorkspaceCatalogSnapshot {
        val paths = linkedSetOf<String>()
        snapshot.workspaces.forEach { workspace ->
            paths += workspace.rootPath
            workspace.repositories.forEach { repository -> paths += repository.path }
            workspace.branchWorkspaces.forEach { branchWorkspace ->
                paths += branchWorkspace.path
                branchWorkspace.members.forEach { member -> paths += member.worktreePath }
            }
        }
        if (paths.isEmpty()) return snapshot

        val result = client.runCommand(
            target = target,
            script = pathInspectionScript(paths.toList()),
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        if (!result.ok) return snapshot
        val availability = runCatching { parsePathAvailability(paths.toList(), result.stdout) }.getOrElse {
            return snapshot
        }
        return snapshot.copy(
            workspaces = snapshot.workspaces.map { workspace ->
                workspace.copy(
                    repositories = workspace.repositories.map { repository ->
                        repository.copy(availability = availability.getValue(repository.path))
                    },
                    branchWorkspaces = workspace.branchWorkspaces.map { branchWorkspace ->
                        branchWorkspace.copy(
                            rootAvailability = availability.getValue(branchWorkspace.path),
                            members = branchWorkspace.members.map { member ->
                                member.copy(availability = availability.getValue(member.worktreePath))
                            },
                        )
                    },
                )
            },
        )
    }

    private fun trustedFingerprint(target: RemoteTarget): String {
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before loading workspace data."
        }
        return fingerprint
    }

    companion object {
        private const val DataDirectoryError = "Unable to locate Hobgoblin workspace data."
        private const val WorkspaceRegistryError = "Unable to read Hobgoblin workspace configuration."
        private const val BranchRegistryError = "Unable to read Hobgoblin branch workspace data."
        private const val MaxRegistryBytes = 4 * 1024 * 1024

        private const val HeaderMarker = "__HOBGOBLIN_ANDROID_WORKSPACE_CATALOG_V1__"
        private const val DataDirectoryMarker = "__DATA_DIR__"
        private const val WorkspaceConfigsMarker = "__WORKSPACE_CONFIGS__"
        private const val BranchWorkspacesMarker = "__BRANCH_WORKSPACES__"

        internal fun registryReadScript(): String = """
            if [ -n "${'$'}{GOBLIN_SERVER_DATA_DIR:-}" ]; then
              data_dir=${'$'}GOBLIN_SERVER_DATA_DIR
            elif [ "${'$'}(uname -s 2>/dev/null)" = "Darwin" ]; then
              data_dir="${'$'}HOME/Library/Application Support/Hobgoblin"
            elif [ -n "${'$'}{XDG_STATE_HOME:-}" ]; then
              data_dir=${'$'}XDG_STATE_HOME/hobgoblin
            else
              data_dir=${'$'}HOME/.local/state/hobgoblin
            fi
            printf '%s\n' '$HeaderMarker'
            if [ -d "${'$'}data_dir" ] && [ -r "${'$'}data_dir" ]; then
              :
            else
              printf '%s\t%s\n' '$DataDirectoryMarker' 'UNAVAILABLE'
              exit 0
            fi
            printf '%s\t%s\n' '$DataDirectoryMarker' 'READY'
            read_registry() {
              label=${'$'}1
              file=${'$'}2
              if [ ! -e "${'$'}file" ]; then
                printf '%s\t%s\n' "${'$'}label" 'MISSING'
                return
              fi
              if [ ! -f "${'$'}file" ] || [ ! -r "${'$'}file" ]; then
                printf '%s\t%s\n' "${'$'}label" 'UNAVAILABLE'
                return
              fi
              size=${'$'}(wc -c < "${'$'}file" 2>/dev/null | tr -d '[:space:]')
              case "${'$'}size" in ''|*[!0-9]*) printf '%s\t%s\n' "${'$'}label" 'UNAVAILABLE'; return;; esac
              if [ "${'$'}size" -gt $MaxRegistryBytes ]; then
                printf '%s\t%s\n' "${'$'}label" 'OVERSIZED'
                return
              fi
              encoded=${'$'}(base64 < "${'$'}file" 2>/dev/null | tr -d '\r\n') || {
                printf '%s\t%s\n' "${'$'}label" 'UNAVAILABLE'
                return
              }
              printf '%s\t%s\t%s\n' "${'$'}label" 'READY' "${'$'}encoded"
            }
            read_registry '$WorkspaceConfigsMarker' "${'$'}data_dir/workspace-configs.json"
            read_registry '$BranchWorkspacesMarker' "${'$'}data_dir/branch-workspaces.json"
        """.trimIndent()

        internal fun pathInspectionScript(paths: List<String>): String = paths.mapIndexed { index, path ->
            require(TmuxSessionProtocol.normalizePath(path) == path) { "A normalized absolute path is required" }
            "if [ -d ${shellQuote(path)} ]; then printf '%s\\t%s\\n' '$index' '1'; " +
                "else printf '%s\\t%s\\n' '$index' '0'; fi"
        }.joinToString("\n")

        private fun parseRegistryEnvelope(output: String): RegistryEnvelope {
            val lines = output.lineSequence().filter { it.isNotEmpty() }.toList()
            require(lines.firstOrNull() == HeaderMarker) { "Invalid workspace catalog response" }
            val fields = lines.drop(1).associate { line ->
                val parts = line.split('\t', limit = 3)
                require(parts.size >= 2) { "Invalid workspace catalog response" }
                parts[0] to parts.drop(1)
            }
            val dataDirectoryReady = fields[DataDirectoryMarker]?.singleOrNull() == "READY"
            if (!dataDirectoryReady) {
                return RegistryEnvelope(false, RegistryPayload.Invalid, RegistryPayload.Invalid)
            }
            return RegistryEnvelope(
                dataDirectoryReady = true,
                workspaceConfigs = parseRegistryPayload(fields.getValue(WorkspaceConfigsMarker)),
                branchWorkspaces = parseRegistryPayload(fields.getValue(BranchWorkspacesMarker)),
            )
        }

        private fun parseRegistryPayload(fields: List<String>): RegistryPayload = when (fields.firstOrNull()) {
            "MISSING" -> RegistryPayload.Missing
            "READY" -> {
                require(fields.size == 2) { "Invalid registry payload" }
                val bytes = Base64.getDecoder().decode(fields[1])
                require(bytes.size <= MaxRegistryBytes) { "Registry payload is oversized" }
                RegistryPayload.Ready(String(bytes, StandardCharsets.UTF_8))
            }
            else -> RegistryPayload.Invalid
        }

        private fun projectCatalog(
            hostId: String,
            configs: com.mrongm.hobgoblin.domain.workspace.WorkspaceConfigRegistry,
            branchResult: BranchRegistryRead,
        ): RemoteWorkspaceCatalogSnapshot {
            val branchGroups = (branchResult as? BranchRegistryRead.Success)
                ?.registry
                ?.workspaces
                ?.associateBy { it.rootId }
                .orEmpty()
            val branchError = BranchRegistryError.takeIf { branchResult is BranchRegistryRead.Failed }
            val workspaces = configs.workspaces
                .filter { config -> config.rootId.startsWith('/') }
                .map { config ->
                    val branchWorkspaces = branchGroups[config.rootId]?.branchWorkspaces.orEmpty().map { manifest ->
                        RemoteBranchWorkspaceSnapshot(
                            id = manifest.id,
                            branch = manifest.branch,
                            path = manifest.path,
                            operation = manifest.operation?.toRemoteOperation(),
                            rootAvailability = RemotePathAvailability.Unknown,
                            members = manifest.repositories.map { member ->
                                RemoteBranchWorkspaceMemberSnapshot(
                                    repositoryName = member.repositoryName,
                                    repositoryRootPath = joinPath(config.rootId, member.repositoryName),
                                    worktreePath = member.worktreePath,
                                    progress = member.progress.storageValue,
                                    availability = RemotePathAvailability.Unknown,
                                )
                            },
                        )
                    }
                    RemoteConfiguredWorkspaceSnapshot(
                        rootPath = config.rootId,
                        repositories = config.repositoryNames.map { name ->
                            RemoteWorkspaceRepositorySnapshot(
                                name = name,
                                path = joinPath(config.rootId, name),
                                availability = RemotePathAvailability.Unknown,
                            )
                        },
                        branchWorkspaces = branchWorkspaces,
                        branchWorkspaceError = branchError,
                    )
                }
            return RemoteWorkspaceCatalogSnapshot(hostId = hostId, workspaces = workspaces)
        }

        private fun parsePathAvailability(paths: List<String>, output: String): Map<String, RemotePathAvailability> {
            val byIndex = output.lineSequence().filter { it.isNotBlank() }.associate { line ->
                val fields = line.split('\t')
                require(fields.size == 2) { "Invalid path inspection response" }
                val index = fields[0].toInt()
                require(index in paths.indices) { "Invalid path inspection index" }
                val availability = when (fields[1]) {
                    "1" -> RemotePathAvailability.Available
                    "0" -> RemotePathAvailability.Unavailable
                    else -> throw IllegalArgumentException("Invalid path inspection value")
                }
                index to availability
            }
            require(byIndex.size == paths.size) { "Incomplete path inspection response" }
            return paths.mapIndexed { index, path -> path to byIndex.getValue(index) }.toMap()
        }

        private fun emptyWorkspaceRegistry() =
            com.mrongm.hobgoblin.domain.workspace.WorkspaceConfigRegistry(version = 1, workspaces = emptyList())

        private fun emptyBranchRegistry() = BranchWorkspaceRegistry(version = 1, workspaces = emptyList())

        private fun BranchWorkspaceOperationKind.toRemoteOperation(): RemoteBranchWorkspaceOperation = when (this) {
            BranchWorkspaceOperationKind.Create -> RemoteBranchWorkspaceOperation.Create
            BranchWorkspaceOperationKind.Extend -> RemoteBranchWorkspaceOperation.Extend
            BranchWorkspaceOperationKind.Reduce -> RemoteBranchWorkspaceOperation.Reduce
            BranchWorkspaceOperationKind.Repair -> RemoteBranchWorkspaceOperation.Repair
            BranchWorkspaceOperationKind.Remove -> RemoteBranchWorkspaceOperation.Remove
        }

        private val BranchWorkspaceProgress.storageValue: String
            get() = when (this) {
                BranchWorkspaceProgress.Pending -> "pending"
                BranchWorkspaceProgress.Complete -> "complete"
                BranchWorkspaceProgress.Removed -> "removed"
                BranchWorkspaceProgress.Failed -> "failed"
            }

        private fun joinPath(parent: String, child: String): String =
            if (parent == "/") "/$child" else "${parent.removeSuffix("/")}/$child"

        private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"
    }
}

private data class RegistryEnvelope(
    val dataDirectoryReady: Boolean,
    val workspaceConfigs: RegistryPayload,
    val branchWorkspaces: RegistryPayload,
)

private sealed interface RegistryPayload {
    data object Missing : RegistryPayload
    data class Ready(val json: String) : RegistryPayload
    data object Invalid : RegistryPayload
}

private sealed interface BranchRegistryRead {
    data class Success(val registry: BranchWorkspaceRegistry) : BranchRegistryRead
    data object Failed : BranchRegistryRead
}
