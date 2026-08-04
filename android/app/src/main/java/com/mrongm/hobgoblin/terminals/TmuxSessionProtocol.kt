package com.mrongm.hobgoblin.terminals

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

enum class TerminalLaunchMode {
    Native,
    TmuxIfAvailable,
}

data class TmuxSessionDescriptor(
    val projectRoot: String,
    val workingDirectory: String,
    val terminalNumber: Int,
)

data class TmuxSessionIdentity(
    val sessionName: String,
    val initialPath: String,
) {
    init {
        require(TmuxSessionProtocol.isCurrentSessionName(sessionName)) {
            "Current Hobgoblin tmux session name is required"
        }
        require(TmuxSessionProtocol.normalizePath(initialPath) == initialPath) {
            "Normalized absolute tmux initial path is required"
        }
    }
}

data class RemoteTmuxSession(
    val sessionName: String,
    val sessionPath: String,
    val serverName: String? = null,
)

data class DiscoveredTmuxSession(
    val identity: TmuxSessionIdentity,
    val terminalNumber: Int,
)

sealed interface TmuxServerTarget {
    data object Default : TmuxServerTarget

    data class Named(
        val serverName: String,
    ) : TmuxServerTarget {
        init {
            require(TmuxSessionProtocol.isCurrentServerName(serverName)) {
                "Current Hobgoblin tmux server name is required"
            }
        }
    }
}

data class TmuxSessionTarget(
    val server: TmuxServerTarget,
    val sessionName: String,
) {
    init {
        require(TmuxSessionProtocol.isSafeSessionName(sessionName)) {
            "Safe tmux session name is required"
        }
    }
}

data class HostDiscoveredTmuxSession(
    val server: TmuxServerTarget,
    val identity: TmuxSessionIdentity?,
    val terminalNumber: Int?,
    val attachedClients: Int,
    val sessionName: String = requireNotNull(identity).sessionName,
    val initialPath: String = requireNotNull(identity).initialPath,
) {
    init {
        require((identity == null) == (terminalNumber == null)) {
            "Hobgoblin tmux identity and terminal number must be present together"
        }
        require(terminalNumber == null || terminalNumber > 0) {
            "Positive tmux terminal number is required"
        }
        require(attachedClients >= 0) { "Non-negative tmux attached client count is required" }
        require(TmuxSessionProtocol.isSafeSessionName(sessionName)) { "Safe tmux session name is required" }
        require(TmuxSessionProtocol.normalizePath(initialPath) == initialPath) {
            "Normalized absolute tmux initial path is required"
        }
        if (identity == null) {
            require(server == TmuxServerTarget.Default) {
                "Ordinary tmux sessions are supported only on the default server"
            }
        } else {
            require(identity.sessionName == sessionName && identity.initialPath == initialPath) {
                "Hobgoblin tmux discovery fields must match its identity"
            }
        }
    }
}

data class HostTmuxPathGroup(
    val initialPath: String,
    val sessions: List<HostDiscoveredTmuxSession>,
) {
    companion object {
        fun from(sessions: List<HostDiscoveredTmuxSession>): List<HostTmuxPathGroup> =
            sessions
                .groupBy(HostDiscoveredTmuxSession::initialPath)
                .toSortedMap()
                .map { (initialPath, pathSessions) ->
                    HostTmuxPathGroup(
                        initialPath = initialPath,
                        sessions = pathSessions.sortedWith(HostSessionComparator),
                    )
                }

        private val HostSessionComparator =
            compareBy<HostDiscoveredTmuxSession> { session -> session.terminalNumber ?: Int.MAX_VALUE }
                .thenBy { session ->
                    when (session.server) {
                        TmuxServerTarget.Default -> ""
                        is TmuxServerTarget.Named -> session.server.serverName
                    }
                }
                .thenBy(HostDiscoveredTmuxSession::sessionName)
    }
}

data class TmuxDiscoveryScope(
    val projectRoot: String,
    val allowedInitialPaths: Set<String>,
)

data class ScopedDiscoveredTmuxSession(
    val projectRoot: String,
    val discovery: DiscoveredTmuxSession,
)

object TmuxSessionProtocol {
    fun serverName(projectRoot: String): String? {
        val normalizedProjectRoot = normalizePath(projectRoot) ?: return null
        val digest = digestPrefix(listOf(ServerProtocol, normalizedProjectRoot))
        return "$ServerNamePrefix$digest"
    }

    fun attachOrCreateCommand(
        identity: TmuxSessionIdentity,
        terminalNumber: Int,
        projectRoot: String,
    ): String? {
        if (terminalNumber < 1) return null
        val serverName = serverName(projectRoot) ?: return null
        val sessionTarget = "=${identity.sessionName}"
        val paneTarget = "$sessionTarget:"
        val projectTmux = "$InteractiveTmuxExecutableReference -L ${shellQuote(serverName)}"
        val projectCreateCommand = createAndAttachCommandForTmux(
            projectTmux,
            identity,
            terminalNumber,
            sessionTarget,
            paneTarget,
        )
        val projectAttachCommand = configureAndAttachCommandForTmux(
            projectTmux,
            identity,
            terminalNumber,
            sessionTarget,
            paneTarget,
        )
        val legacyAttachCommand = configureAndAttachCommandForTmux(
            InteractiveTmuxExecutableReference,
            identity,
            terminalNumber,
            sessionTarget,
            paneTarget,
        )
        return "if $projectTmux has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then " +
            "$projectAttachCommand; " +
            "elif $TmuxExecutableReference has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then " +
            "$legacyAttachCommand; " +
            "else $projectCreateCommand; fi"
    }

    fun attachExistingCommand(
        identity: TmuxSessionIdentity,
        terminalNumber: Int,
        projectRoot: String,
    ): String? {
        if (terminalNumber < 1) return null
        val serverName = serverName(projectRoot) ?: return null
        val sessionTarget = "=${identity.sessionName}"
        val paneTarget = "$sessionTarget:"
        val projectTmux = "$InteractiveTmuxExecutableReference -L ${shellQuote(serverName)}"
        val projectAttachCommand = configureAndAttachCommandForTmux(
            projectTmux,
            identity,
            terminalNumber,
            sessionTarget,
            paneTarget,
        )
        val legacyAttachCommand = configureAndAttachCommandForTmux(
            InteractiveTmuxExecutableReference,
            identity,
            terminalNumber,
            sessionTarget,
            paneTarget,
        )
        return "if $projectTmux has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then " +
            "$projectAttachCommand; " +
            "elif $TmuxExecutableReference has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then " +
            "$legacyAttachCommand; " +
            "else printf '%s\\n' 'Hobgoblin tmux session no longer exists. Refresh the workspace.' >&2; exit 44; fi"
    }

    fun attachExistingCommand(
        identity: TmuxSessionIdentity,
        terminalNumber: Int,
        server: TmuxServerTarget,
    ): String? {
        if (terminalNumber < 1) return null
        val sessionTarget = "=${identity.sessionName}"
        val paneTarget = "$sessionTarget:"
        val tmuxCommand = when (server) {
            TmuxServerTarget.Default -> InteractiveTmuxExecutableReference
            is TmuxServerTarget.Named ->
                "$InteractiveTmuxExecutableReference -L ${shellQuote(server.serverName)}"
        }
        val attachCommand = configureAndAttachCommandForTmux(
            tmuxCommand = tmuxCommand,
            identity = identity,
            terminalNumber = terminalNumber,
            sessionTarget = sessionTarget,
            target = paneTarget,
        )
        return "if $tmuxCommand has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then " +
            "$attachCommand; " +
            "else printf '%s\\n' 'Hobgoblin tmux session no longer exists. Refresh the host tmux list.' " +
            ">&2; exit 44; fi"
    }

    private fun createAndAttachCommandForTmux(
        tmuxCommand: String,
        identity: TmuxSessionIdentity,
        terminalNumber: Int,
        sessionTarget: String,
        target: String,
    ): String =
        listOf(
            "$tmuxCommand new-session -d -s ${shellQuote(identity.sessionName)} " +
                "-c ${shellQuote(identity.initialPath)}",
            configureAndAttachCommandForTmux(
                tmuxCommand,
                identity,
                terminalNumber,
                sessionTarget,
                target,
            ),
        ).joinToString(" && ")

    private fun configureAndAttachCommandForTmux(
        tmuxCommand: String,
        identity: TmuxSessionIdentity,
        terminalNumber: Int,
        sessionTarget: String,
        target: String,
    ): String =
        listOf(
            "$tmuxCommand set-option -t ${shellQuote(target)} mouse on",
            "$tmuxCommand set-option -t ${shellQuote(target)} $InitPathOption ${shellQuote(identity.initialPath)}",
            "$tmuxCommand set-option -t ${shellQuote(target)} $TerminalNumberOption " +
                shellQuote(terminalNumber.toString()),
            "$tmuxCommand attach-session -t ${shellQuote(sessionTarget)}",
        ).joinToString(" && ")

    fun normalizePath(value: String): String? {
        if (
            value.isEmpty() ||
            value.length > MaxPathChars ||
            !value.startsWith('/') ||
            value.any { character -> character.code in 0..31 || character.code == 127 }
        ) {
            return null
        }

        val segments = mutableListOf<String>()
        value.split('/').forEach { segment ->
            when (segment) {
                "", "." -> Unit
                ".." -> if (segments.isNotEmpty()) segments.removeAt(segments.lastIndex)
                else -> segments += segment
            }
        }
        return if (segments.isEmpty()) "/" else "/" + segments.joinToString("/")
    }

    fun identity(descriptor: TmuxSessionDescriptor): TmuxSessionIdentity? {
        val projectRoot = normalizePath(descriptor.projectRoot) ?: return null
        val workingDirectory = normalizePath(descriptor.workingDirectory) ?: return null
        if (descriptor.terminalNumber < 1) return null
        val digest = digestPrefix(
            listOf(
                SessionProtocol,
                projectRoot,
                workingDirectory,
                descriptor.terminalNumber.toString(),
            ),
        )
        return TmuxSessionIdentity(
            sessionName = "$SessionNamePrefix$digest",
            initialPath = workingDirectory,
        )
    }

    private fun digestPrefix(fields: List<String>): String =
        MessageDigest.getInstance("SHA-256")
            .digest(fields.joinToString("\u0000").toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte ->
                val value = byte.toInt() and 0xff
                "${HexChars[value ushr 4]}${HexChars[value and 0x0f]}"
            }
            .take(HashHexChars)

    fun isCurrentSessionName(value: String): Boolean = CurrentSessionNamePattern.matches(value)

    fun isCurrentServerName(value: String): Boolean = CurrentServerNamePattern.matches(value)

    fun isSafeSessionName(value: String): Boolean =
        value.isNotEmpty() &&
            value.length <= MaxSessionNameChars &&
            value.none { character -> character.code in 0..31 || character.code == 127 }

    fun parseHostSessionDiscoveryOutput(output: String): List<HostDiscoveredTmuxSession>? {
        val lines = output.lineSequence().map { line -> line.removeSuffix("\r") }.iterator()
        if (!lines.hasNext() || lines.next() != HostDiscoveryHeader) return null
        val sessionsByTarget = linkedMapOf<Pair<TmuxServerTarget, String>, HostDiscoveredTmuxSession>()

        lines.forEachRemaining { line ->
            if (line.isEmpty()) return@forEachRemaining
            val fields = line.split('\t')
            if (fields.size !in HostDiscoveryFieldCounts) return@forEachRemaining
            val server = when (val marker = fields[0]) {
                LegacyDefaultServerMarker -> TmuxServerTarget.Default
                else -> if (isCurrentServerName(marker)) TmuxServerTarget.Named(marker) else return@forEachRemaining
            }
            val sessionName = fields[1]
            if (!isSafeSessionName(sessionName)) return@forEachRemaining
            val metadataInitialPath = fields[2]
            val terminalNumberText = fields[3]
            val sessionPath = if (fields.size == HostDiscoveryV2FieldCount) fields[4] else metadataInitialPath
            if (normalizePath(sessionPath) != sessionPath) return@forEachRemaining
            val attachedClientsText = fields.last()
            if (!CanonicalNonNegativeNumberPattern.matches(attachedClientsText)) return@forEachRemaining
            val attachedClients = attachedClientsText.toIntOrNull() ?: return@forEachRemaining
            val terminalNumber = terminalNumberText.toIntOrNull()
            val hobgoblinIdentity = if (
                isCurrentSessionName(sessionName) &&
                normalizePath(metadataInitialPath) == metadataInitialPath &&
                CanonicalTerminalNumberPattern.matches(terminalNumberText) &&
                terminalNumber != null
            ) {
                TmuxSessionIdentity(sessionName, metadataInitialPath) to terminalNumber
            } else {
                null
            }
            val session = if (hobgoblinIdentity != null) {
                HostDiscoveredTmuxSession(
                    server = server,
                    identity = hobgoblinIdentity.first,
                    terminalNumber = hobgoblinIdentity.second,
                    attachedClients = attachedClients,
                )
            } else {
                if (server != TmuxServerTarget.Default) return@forEachRemaining
                HostDiscoveredTmuxSession(
                    server = server,
                    identity = null,
                    terminalNumber = null,
                    attachedClients = attachedClients,
                    sessionName = sessionName,
                    initialPath = sessionPath,
                )
            }
            sessionsByTarget.putIfAbsent(server to sessionName, session)
        }

        return sessionsByTarget.values.sortedWith(
            compareBy(HostDiscoveredTmuxSession::initialPath)
                .thenBy { session -> session.terminalNumber ?: Int.MAX_VALUE }
                .thenBy { session ->
                    when (session.server) {
                        TmuxServerTarget.Default -> ""
                        is TmuxServerTarget.Named -> session.server.serverName
                    }
                }
                .thenBy(HostDiscoveredTmuxSession::sessionName),
        )
    }

    fun attachExistingCommand(target: TmuxSessionTarget): String? {
        val sessionTarget = "=${target.sessionName}"
        val tmuxCommand = when (val server = target.server) {
            TmuxServerTarget.Default -> InteractiveTmuxExecutableReference
            is TmuxServerTarget.Named ->
                "$InteractiveTmuxExecutableReference -L ${shellQuote(server.serverName)}"
        }
        return "if $tmuxCommand has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then " +
            "$tmuxCommand attach-session -t ${shellQuote(sessionTarget)}; " +
            "else printf '%s\\n' 'Tmux session no longer exists. Refresh the host tmux list.' " +
            ">&2; exit 44; fi"
    }

    fun parseSessionList(output: String, projectRoot: String? = null): List<RemoteTmuxSession>? {
        if (output.isEmpty()) return emptyList()
        val expectedServerName = projectRoot?.let(::serverName)
        if (projectRoot != null && expectedServerName == null) return null
        val sessions = mutableListOf<RemoteTmuxSession>()
        output.split('\n').forEach { rawLine ->
            val line = rawLine.removeSuffix("\r")
            if (line.isEmpty()) return@forEach
            val fields = line.split('\t')
            if (fields.size !in 2..3) return null
            val sessionName = fields[0]
            val sessionPath = normalizePath(fields[1]) ?: return null
            val serverMarker = fields.getOrNull(2)
            val serverName = when (serverMarker) {
                null, LegacyDefaultServerMarker -> null
                expectedServerName -> expectedServerName
                else -> return null
            }
            if (sessionName.isEmpty()) return null
            sessions += RemoteTmuxSession(
                sessionName = sessionName,
                sessionPath = sessionPath,
                serverName = serverName,
            )
        }
        return sessions
    }

    fun parseDiscoverableSessions(
        output: String,
        projectRoot: String,
        allowedInitialPaths: Set<String>,
    ): List<DiscoveredTmuxSession>? {
        val normalizedProjectRoot = normalizePath(projectRoot) ?: return null
        val expectedServerName = serverName(normalizedProjectRoot) ?: return null
        val normalizedAllowedPaths = allowedInitialPaths.mapNotNull(::normalizePath).toSet()
        val sessionsByName = linkedMapOf<String, DiscoveredTmuxSession>()
        output.lineSequence().forEach { rawLine ->
            val line = rawLine.removeSuffix("\r")
            if (line.isEmpty()) return@forEach
            val fields = line.split('\t')
            if (fields.size !in 3..4) return@forEach
            val serverMarker = fields.getOrNull(3)
            if (serverMarker != null && serverMarker != expectedServerName && serverMarker != LegacyDefaultServerMarker) {
                return@forEach
            }
            val sessionName = fields[0]
            if (!isCurrentSessionName(sessionName)) return@forEach
            val initialPath = fields[1]
            if (normalizePath(initialPath) != initialPath || initialPath !in normalizedAllowedPaths) return@forEach
            val terminalNumberText = fields[2]
            if (!CanonicalTerminalNumberPattern.matches(terminalNumberText)) return@forEach
            val terminalNumber = terminalNumberText.toIntOrNull() ?: return@forEach
            val expectedIdentity = identity(
                TmuxSessionDescriptor(
                    projectRoot = normalizedProjectRoot,
                    workingDirectory = initialPath,
                    terminalNumber = terminalNumber,
                ),
            ) ?: return@forEach
            if (expectedIdentity.sessionName != sessionName) return@forEach
            sessionsByName.putIfAbsent(
                sessionName,
                DiscoveredTmuxSession(identity = expectedIdentity, terminalNumber = terminalNumber),
            )
        }
        return sessionsByName.values.sortedWith(
            compareBy<DiscoveredTmuxSession> { it.identity.initialPath }
                .thenBy { it.terminalNumber },
        )
    }

    fun parseDiscoverableSessions(
        output: String,
        scopes: List<TmuxDiscoveryScope>,
    ): List<ScopedDiscoveredTmuxSession>? {
        val normalizedScopes = normalizeDiscoveryScopes(scopes) ?: return null
        if (normalizedScopes.isEmpty()) return emptyList()
        val rows = output.lineSequence().mapNotNull(::parseBatchDiscoveryRow).toList()
        val sessionsByName = linkedMapOf<String, ScopedDiscoveredTmuxSession>()

        rows.filter { row -> row.scopeMarker != LegacyScopeMarker }.forEach { row ->
            val scopeIndex = row.scopeMarker.toIntOrNull() ?: return@forEach
            val scope = normalizedScopes.getOrNull(scopeIndex) ?: return@forEach
            val expectedServerName = serverName(scope.projectRoot) ?: return@forEach
            if (row.serverMarker != expectedServerName) return@forEach
            val discovery = validateDiscoveryRow(row, scope) ?: return@forEach
            sessionsByName.putIfAbsent(
                discovery.identity.sessionName,
                ScopedDiscoveredTmuxSession(scope.projectRoot, discovery),
            )
        }

        rows.filter { row -> row.scopeMarker == LegacyScopeMarker }.forEach { row ->
            if (row.serverMarker != LegacyDefaultServerMarker) return@forEach
            normalizedScopes.firstNotNullOfOrNull { scope ->
                validateDiscoveryRow(row, scope)?.let { discovery ->
                    ScopedDiscoveredTmuxSession(scope.projectRoot, discovery)
                }
            }?.let { scoped -> sessionsByName.putIfAbsent(scoped.discovery.identity.sessionName, scoped) }
        }

        val scopeOrder = normalizedScopes.mapIndexed { index, scope -> scope.projectRoot to index }.toMap()
        return sessionsByName.values.sortedWith(
            compareBy<ScopedDiscoveredTmuxSession> { scoped -> scopeOrder.getValue(scoped.projectRoot) }
                .thenBy { scoped -> scoped.discovery.identity.initialPath }
                .thenBy { scoped -> scoped.discovery.terminalNumber },
        )
    }

    fun matches(identity: TmuxSessionIdentity, session: RemoteTmuxSession): Boolean =
        isCurrentSessionName(identity.sessionName) &&
            session.sessionName == identity.sessionName &&
            normalizePath(session.sessionPath) == identity.initialPath

    fun listSessionsScript(projectRoot: String): String = combinedListScript(
        projectRoot = projectRoot,
        format = "#{session_name}\t#{session_path}",
    )

    fun listDiscoverableSessionsScript(projectRoot: String): String = combinedListScript(
        projectRoot = projectRoot,
        format = "#{session_name}\t#{${InitPathOption}}\t#{${TerminalNumberOption}}",
    )

    fun listDiscoverableSessionsScript(scopes: List<TmuxDiscoveryScope>): String {
        val normalizedScopes = requireNotNull(normalizeDiscoveryScopes(scopes)) { "Invalid tmux discovery scope" }
        require(normalizedScopes.isNotEmpty()) { "At least one tmux discovery scope is required" }
        val format = "#{session_name}\t#{${InitPathOption}}\t#{${TerminalNumberOption}}"
        val projectListings = normalizedScopes.mapIndexed { index, scope ->
            val serverName = requireNotNull(serverName(scope.projectRoot))
            "run_tmux_list $TmuxExecutableReference -u -L ${shellQuote(serverName)} list-sessions " +
                "-F ${shellQuote("$format\t$serverName\t$index")} || exit ${'$'}?"
        }
        return listOf(
            tmuxExecutableResolverScript(),
            "$TmuxResolverFunction || exit 127",
            batchListFunction(),
            *projectListings.toTypedArray(),
            "run_tmux_list $TmuxExecutableReference -u list-sessions " +
                "-F ${shellQuote("$format\t$LegacyDefaultServerMarker\t$LegacyScopeMarker")} || exit ${'$'}?",
        ).joinToString("\n")
    }

    fun hostSessionDiscoveryCommand(): String {
        val format = "${'$'}hobgoblin_server_marker\t#{session_name}\t#{${InitPathOption}}\t" +
            "#{${TerminalNumberOption}}\t#{session_path}\t#{session_attached}"
        return listOf(
            tmuxExecutableResolverScript(),
            "$TmuxResolverFunction || exit 127",
            hostTmuxSocketDirectorySetup("discovery"),
            "printf '%s\\n' ${shellQuote(HostDiscoveryHeader)}",
            "if [ ! -e \"${'$'}hobgoblin_tmux_socket_dir\" ]; then exit 0; fi",
            "if [ ! -d \"${'$'}hobgoblin_tmux_socket_dir\" ] || " +
                "[ ! -r \"${'$'}hobgoblin_tmux_socket_dir\" ]; then",
            "  printf '%s\\n' 'Unable to read tmux socket directory' >&2; exit 1",
            "fi",
            "list_hobgoblin_tmux_socket() {",
            "  hobgoblin_server_marker=${'$'}1",
            "  hobgoblin_socket=${'$'}2",
            "  hobgoblin_tmux_output=${'$'}(\"${'$'}hobgoblin_tmux_bin\" -u -S \"${'$'}hobgoblin_socket\" " +
                "list-sessions -F \"$format\" 2>&1)",
            "  hobgoblin_tmux_status=${'$'}?",
            "  if [ \"${'$'}hobgoblin_tmux_status\" -eq 0 ]; then",
            "    [ -z \"${'$'}hobgoblin_tmux_output\" ] || printf '%s\\n' \"${'$'}hobgoblin_tmux_output\"",
            "    return 0",
            "  fi",
            "  case \"${'$'}hobgoblin_tmux_output\" in",
            "    *\"no server running\"*|*\"failed to connect to server\"*|*\"no sessions\"*|" +
                "*\"error connecting to \"*\"(No such file or directory)\"*) return 0 ;;",
            "  esac",
            "  printf '%s\\n' \"${'$'}hobgoblin_tmux_output\" >&2",
            "  return \"${'$'}hobgoblin_tmux_status\"",
            "}",
            "hobgoblin_socket=\"${'$'}hobgoblin_tmux_socket_dir/default\"",
            "if [ -S \"${'$'}hobgoblin_socket\" ]; then",
            "  list_hobgoblin_tmux_socket ${shellQuote(LegacyDefaultServerMarker)} " +
                "\"${'$'}hobgoblin_socket\" || exit ${'$'}?",
            "fi",
            "for hobgoblin_socket in \"${'$'}hobgoblin_tmux_socket_dir\"/${ServerNamePrefix}*; do",
            "  [ -S \"${'$'}hobgoblin_socket\" ] || continue",
            "  hobgoblin_server_name=${'$'}{hobgoblin_socket##*/}",
            "  hobgoblin_server_suffix=${'$'}{hobgoblin_server_name#${ServerNamePrefix}}",
            "  [ \"${'$'}{#hobgoblin_server_suffix}\" -eq $HashHexChars ] || continue",
            "  case \"${'$'}hobgoblin_server_suffix\" in *[!a-f0-9]*) continue ;; esac",
            "  list_hobgoblin_tmux_socket \"${'$'}hobgoblin_server_name\" " +
                "\"${'$'}hobgoblin_socket\" || exit ${'$'}?",
            "done",
        ).joinToString("\n")
    }

    internal fun normalizeDiscoveryScopes(scopes: List<TmuxDiscoveryScope>): List<TmuxDiscoveryScope>? {
        val pathsByProjectRoot = linkedMapOf<String, LinkedHashSet<String>>()
        scopes.forEach { scope ->
            val projectRoot = normalizePath(scope.projectRoot) ?: return null
            val allowedPaths = scope.allowedInitialPaths.map { path -> normalizePath(path) ?: return null }
            pathsByProjectRoot.getOrPut(projectRoot, ::linkedSetOf).addAll(allowedPaths)
        }
        return pathsByProjectRoot.map { (projectRoot, paths) ->
            TmuxDiscoveryScope(projectRoot = projectRoot, allowedInitialPaths = paths)
        }
    }

    internal fun tmuxExecutableResolverScript(): String = listOf(
        "$TmuxResolverFunction() {",
        "hobgoblin_tmux_bin=${'$'}(command -v tmux 2>/dev/null || true);",
        "if [ -z \"${'$'}hobgoblin_tmux_bin\" ]; then",
        "hobgoblin_login_shell=${'$'}{SHELL:-/bin/sh};",
        "[ -x \"${'$'}hobgoblin_login_shell\" ] || hobgoblin_login_shell=/bin/sh;",
        "hobgoblin_tmux_bin=${'$'}(\"${'$'}hobgoblin_login_shell\" -lc 'command -v tmux' " +
            "2>/dev/null | tail -n 1);",
        "fi;",
        "case \"${'$'}hobgoblin_tmux_bin\" in",
        "/*) [ -x \"${'$'}hobgoblin_tmux_bin\" ] ;;",
        "*) return 1 ;;",
        "esac;",
        "}",
    ).joinToString(" ")

    internal fun tmuxExecutableResolverInvocation(): String = TmuxResolverFunction

    fun killSessionScript(projectRoot: String, sessionName: String, serverName: String?): String? {
        if (!isCurrentSessionName(sessionName)) return null
        val expectedServerName = serverName(projectRoot) ?: return null
        if (serverName != null && serverName != expectedServerName) return null
        return listOf(
            tmuxExecutableResolverScript(),
            "$TmuxResolverFunction || exit 127",
            "$TmuxExecutableReference${serverName?.let { " -L ${shellQuote(it)}" }.orEmpty()} " +
                "kill-session -t ${shellQuote("=$sessionName")}",
        ).joinToString("\n")
    }

    fun hostServerSessionListCommand(server: TmuxServerTarget): String {
        val (serverMarker, socketName) = hostServerMarkers(server)
        val format = listOf(
            serverMarker,
            "#{session_name}",
            "#{@hobgoblin_init_path}",
            "#{@hobgoblin_terminal_number}",
            "#{session_path}",
            "#{session_attached}",
        ).joinToString("\t")
        return listOf(
            tmuxExecutableResolverScript(),
            "$TmuxResolverFunction || exit 127",
            hostServerSocketSetup(socketName),
            "printf '%s\\n' ${shellQuote(HostDiscoveryHeader)}",
            "[ -S \"${'$'}hobgoblin_tmux_socket\" ] || exit 0",
            batchListFunction(),
            "run_tmux_list $TmuxExecutableReference -u -S \"${'$'}hobgoblin_tmux_socket\" " +
                "list-sessions -F ${shellQuote(format)} || exit ${'$'}?",
        ).joinToString("\n")
    }

    fun hostSessionKillCommand(
        server: TmuxServerTarget,
        sessionName: String,
    ): String? {
        if (!isSafeSessionName(sessionName)) return null
        val (_, socketName) = hostServerMarkers(server)
        return listOf(
            tmuxExecutableResolverScript(),
            "$TmuxResolverFunction || exit 127",
            hostServerSocketSetup(socketName),
            "if [ ! -S \"${'$'}hobgoblin_tmux_socket\" ]; then " +
                "printf '%s\\n' 'no server running for exact Hobgoblin tmux target' >&2; exit 1; fi",
            "$TmuxExecutableReference -u -S \"${'$'}hobgoblin_tmux_socket\" " +
                "kill-session -t ${shellQuote("=$sessionName")}",
        ).joinToString("\n")
    }

    private fun hostServerMarkers(server: TmuxServerTarget): Pair<String, String> = when (server) {
        TmuxServerTarget.Default -> LegacyDefaultServerMarker to "default"
        is TmuxServerTarget.Named -> server.serverName to server.serverName
    }

    private fun hostServerSocketSetup(socketName: String): String = listOf(
        "hobgoblin_tmux_socket_name=${shellQuote(socketName)}",
        hostTmuxSocketDirectorySetup("operation"),
        "hobgoblin_tmux_socket=\"${'$'}hobgoblin_tmux_socket_dir/${'$'}hobgoblin_tmux_socket_name\"",
    ).joinToString("\n")

    private fun hostTmuxSocketDirectorySetup(operation: String): String = listOf(
        "hobgoblin_remote_uid=${'$'}(id -u 2>/dev/null) || exit ${'$'}?",
        "case \"${'$'}hobgoblin_remote_uid\" in ''|*[!0-9]*) " +
            "printf '%s\\n' 'Unable to resolve remote uid for tmux $operation' >&2; exit 1 ;; esac",
        "case \"${'$'}{TMUX_TMPDIR:-}\" in",
        "  /*) hobgoblin_tmux_socket_dir=\"${'$'}{TMUX_TMPDIR%/}/tmux-${'$'}hobgoblin_remote_uid\" ;;",
        "  *) hobgoblin_tmux_socket_dir=\"/tmp/tmux-${'$'}hobgoblin_remote_uid\" ;;",
        "esac",
    ).joinToString("\n")

    private fun combinedListScript(projectRoot: String, format: String): String {
        val serverName = requireNotNull(serverName(projectRoot)) { "Normalized absolute tmux project root is required" }
        return listOf(
            tmuxExecutableResolverScript(),
            "$TmuxResolverFunction || exit 127",
            "hobgoblin_remote_uid=${'$'}(id -u 2>/dev/null) || exit ${'$'}?",
            "case \"${'$'}hobgoblin_remote_uid\" in ''|*[!0-9]*) " +
                "printf '%s\\n' 'Unable to resolve remote uid for tmux discovery' >&2; exit 1 ;; esac",
            "hobgoblin_project_socket=\"/tmp/tmux-${'$'}hobgoblin_remote_uid/$serverName\"",
            "hobgoblin_legacy_socket=\"/tmp/tmux-${'$'}hobgoblin_remote_uid/default\"",
            "run_tmux_list() {",
            "  tmux_output=${'$'}(\"${'$'}@\" 2>&1)",
            "  tmux_status=${'$'}?",
            "  if [ \"${'$'}tmux_status\" -eq 0 ]; then",
            "    [ -z \"${'$'}tmux_output\" ] || printf '%s\\n' \"${'$'}tmux_output\"",
            "    return 0",
            "  fi",
            "  case \"${'$'}tmux_output\" in",
            "    *\"no server running\"*|*\"failed to connect to server\"*|*\"no sessions\"*|" +
                "*\"error connecting to \"*\"(No such file or directory)\"*) return 0 ;;",
            "  esac",
            "  printf '%s\\n' \"${'$'}tmux_output\" >&2",
            "  return \"${'$'}tmux_status\"",
            "}",
            "run_tmux_list $TmuxExecutableReference -u -L ${shellQuote(serverName)} list-sessions " +
                "-F ${shellQuote("$format\t$serverName")} || exit ${'$'}?",
            "if [ -S \"${'$'}hobgoblin_project_socket\" ]; then",
            "  run_tmux_list $TmuxExecutableReference -u -S \"${'$'}hobgoblin_project_socket\" list-sessions " +
                "-F ${shellQuote("$format\t$serverName")} || exit ${'$'}?",
            "fi",
            "run_tmux_list $TmuxExecutableReference -u list-sessions " +
                "-F ${shellQuote("$format\t$LegacyDefaultServerMarker")} || exit ${'$'}?",
            "if [ -S \"${'$'}hobgoblin_legacy_socket\" ]; then",
            "  run_tmux_list $TmuxExecutableReference -u -S \"${'$'}hobgoblin_legacy_socket\" list-sessions " +
                "-F ${shellQuote("$format\t$LegacyDefaultServerMarker")} || exit ${'$'}?",
            "fi",
        ).joinToString("\n")
    }

    private fun batchListFunction(): String = listOf(
        "run_tmux_list() {",
        "  tmux_output=${'$'}(\"${'$'}@\" 2>&1)",
        "  tmux_status=${'$'}?",
        "  if [ \"${'$'}tmux_status\" -eq 0 ]; then",
        "    [ -z \"${'$'}tmux_output\" ] || printf '%s\\n' \"${'$'}tmux_output\"",
        "    return 0",
        "  fi",
        "  case \"${'$'}tmux_output\" in",
        "    *\"no server running\"*|*\"failed to connect to server\"*|*\"no sessions\"*|" +
            "*\"error connecting to \"*\"(No such file or directory)\"*) return 0 ;;",
        "  esac",
        "  printf '%s\\n' \"${'$'}tmux_output\" >&2",
        "  return \"${'$'}tmux_status\"",
        "}",
    ).joinToString("\n")

    private fun parseBatchDiscoveryRow(rawLine: String): BatchDiscoveryRow? {
        val line = rawLine.removeSuffix("\r")
        if (line.isEmpty()) return null
        val fields = line.split('\t')
        if (fields.size != 5) return null
        return BatchDiscoveryRow(
            sessionName = fields[0],
            initialPath = fields[1],
            terminalNumber = fields[2],
            serverMarker = fields[3],
            scopeMarker = fields[4],
        )
    }

    private fun validateDiscoveryRow(
        row: BatchDiscoveryRow,
        scope: TmuxDiscoveryScope,
    ): DiscoveredTmuxSession? {
        if (!isCurrentSessionName(row.sessionName)) return null
        if (normalizePath(row.initialPath) != row.initialPath || row.initialPath !in scope.allowedInitialPaths) return null
        if (!CanonicalTerminalNumberPattern.matches(row.terminalNumber)) return null
        val terminalNumber = row.terminalNumber.toIntOrNull() ?: return null
        val identity = identity(
            TmuxSessionDescriptor(
                projectRoot = scope.projectRoot,
                workingDirectory = row.initialPath,
                terminalNumber = terminalNumber,
            ),
        ) ?: return null
        if (identity.sessionName != row.sessionName) return null
        return DiscoveredTmuxSession(identity = identity, terminalNumber = terminalNumber)
    }

    private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"

    private const val SessionProtocol = "hobgoblin-terminal-session-v1"
    private const val SessionNamePrefix = "hobgoblin-v1-"
    private const val ServerProtocol = "hobgoblin-tmux-server-v1"
    private const val ServerNamePrefix = "hobgoblin-project-v1-"
    const val HostDiscoveryHeader = "HOBGOBLIN_ANDROID_TMUX_V2"
    private const val LegacyDefaultServerMarker = "legacy-default"
    private const val LegacyScopeMarker = "legacy"
    private const val TmuxResolverFunction = "resolve_hobgoblin_tmux"
    private const val TmuxExecutableReference = "\"${'$'}hobgoblin_tmux_bin\""
    private const val InteractiveTmuxExecutableReference = "COLORTERM=truecolor $TmuxExecutableReference"
    private const val InitPathOption = "@hobgoblin_init_path"
    private const val TerminalNumberOption = "@hobgoblin_terminal_number"
    private const val HashHexChars = 24
    private const val HostDiscoveryV1FieldCount = 5
    private const val HostDiscoveryV2FieldCount = 6
    private val HostDiscoveryFieldCounts = setOf(HostDiscoveryV1FieldCount, HostDiscoveryV2FieldCount)
    private const val MaxSessionNameChars = 256
    private const val MaxPathChars = 4_096
    private val CurrentSessionNamePattern = Regex("^hobgoblin-v1-[a-f0-9]{24}$")
    private val CurrentServerNamePattern = Regex("^hobgoblin-project-v1-[a-f0-9]{24}$")
    private val CanonicalTerminalNumberPattern = Regex("^[1-9][0-9]*$")
    private val CanonicalNonNegativeNumberPattern = Regex("^(?:0|[1-9][0-9]*)$")
    private val HexChars = "0123456789abcdef".toCharArray()

    private data class BatchDiscoveryRow(
        val sessionName: String,
        val initialPath: String,
        val terminalNumber: String,
        val serverMarker: String,
        val scopeMarker: String,
    )
}
