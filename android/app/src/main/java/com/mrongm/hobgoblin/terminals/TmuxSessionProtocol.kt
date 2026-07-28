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
        val projectTmux = "$TmuxExecutableReference -L ${shellQuote(serverName)}"
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
            TmuxExecutableReference,
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
        val projectTmux = "$TmuxExecutableReference -L ${shellQuote(serverName)}"
        val projectAttachCommand = configureAndAttachCommandForTmux(
            projectTmux,
            identity,
            terminalNumber,
            sessionTarget,
            paneTarget,
        )
        val legacyAttachCommand = configureAndAttachCommandForTmux(
            TmuxExecutableReference,
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
            "    *\"no server running\"*|*\"failed to connect to server\"*|*\"no sessions\"*) return 0 ;;",
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
        "    *\"no server running\"*|*\"failed to connect to server\"*|*\"no sessions\"*) return 0 ;;",
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
    private const val LegacyDefaultServerMarker = "legacy-default"
    private const val LegacyScopeMarker = "legacy"
    private const val TmuxResolverFunction = "resolve_hobgoblin_tmux"
    private const val TmuxExecutableReference = "\"${'$'}hobgoblin_tmux_bin\""
    private const val InitPathOption = "@hobgoblin_init_path"
    private const val TerminalNumberOption = "@hobgoblin_terminal_number"
    private const val HashHexChars = 24
    private const val MaxPathChars = 4_096
    private val CurrentSessionNamePattern = Regex("^hobgoblin-v1-[a-f0-9]{24}$")
    private val CanonicalTerminalNumberPattern = Regex("^[1-9][0-9]*$")
    private val HexChars = "0123456789abcdef".toCharArray()

    private data class BatchDiscoveryRow(
        val sessionName: String,
        val initialPath: String,
        val terminalNumber: String,
        val serverMarker: String,
        val scopeMarker: String,
    )
}
