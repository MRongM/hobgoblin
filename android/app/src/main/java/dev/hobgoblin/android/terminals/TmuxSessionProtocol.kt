package dev.hobgoblin.android.terminals

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
)

data class DiscoveredTmuxSession(
    val identity: TmuxSessionIdentity,
    val terminalNumber: Int,
)

object TmuxSessionProtocol {
    fun attachOrCreateCommand(identity: TmuxSessionIdentity, terminalNumber: Int): String? {
        if (terminalNumber < 1) return null
        val target = "=${identity.sessionName}"
        return listOf(
            "exec tmux new-session -A -s ${shellQuote(identity.sessionName)} " +
                "-c ${shellQuote(identity.initialPath)}",
            "set-option -t ${shellQuote("$target:")} mouse on",
            "set-option -t ${shellQuote(target)} $InitPathOption ${shellQuote(identity.initialPath)}",
            "set-option -t ${shellQuote(target)} $TerminalNumberOption ${shellQuote(terminalNumber.toString())}",
        ).joinToString(" \\; ")
    }

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
        val serialized = listOf(
            SessionProtocol,
            projectRoot,
            workingDirectory,
            descriptor.terminalNumber.toString(),
        ).joinToString("\u0000")
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(serialized.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte ->
                val value = byte.toInt() and 0xff
                "${HexChars[value ushr 4]}${HexChars[value and 0x0f]}"
            }
            .take(HashHexChars)
        return TmuxSessionIdentity(
            sessionName = "$SessionNamePrefix$digest",
            initialPath = workingDirectory,
        )
    }

    fun isCurrentSessionName(value: String): Boolean = CurrentSessionNamePattern.matches(value)

    fun parseSessionList(output: String): List<RemoteTmuxSession>? {
        if (output.isEmpty()) return emptyList()
        val sessions = mutableListOf<RemoteTmuxSession>()
        output.split('\n').forEach { rawLine ->
            val line = rawLine.removeSuffix("\r")
            if (line.isEmpty()) return@forEach
            val fields = line.split('\t')
            if (fields.size != 2) return null
            val sessionName = fields[0]
            val sessionPath = normalizePath(fields[1]) ?: return null
            if (sessionName.isEmpty()) return null
            sessions += RemoteTmuxSession(sessionName = sessionName, sessionPath = sessionPath)
        }
        return sessions
    }

    fun parseDiscoverableSessions(
        output: String,
        projectRoot: String,
        allowedInitialPaths: Set<String>,
    ): List<DiscoveredTmuxSession>? {
        val normalizedProjectRoot = normalizePath(projectRoot) ?: return null
        val normalizedAllowedPaths = allowedInitialPaths.mapNotNull(::normalizePath).toSet()
        val sessionsByName = linkedMapOf<String, DiscoveredTmuxSession>()
        output.lineSequence().forEach { rawLine ->
            val line = rawLine.removeSuffix("\r")
            if (line.isEmpty()) return@forEach
            val fields = line.split('\t')
            if (fields.size != 3) return@forEach
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

    fun matches(identity: TmuxSessionIdentity, session: RemoteTmuxSession): Boolean =
        isCurrentSessionName(identity.sessionName) &&
            session.sessionName == identity.sessionName &&
            normalizePath(session.sessionPath) == identity.initialPath

    fun listSessionsScript(): String = listOf(
        "command -v tmux >/dev/null 2>&1 || exit 127",
        "tmux list-sessions -F '#{session_name}\\t#{session_path}'",
    ).joinToString("\n")

    fun listDiscoverableSessionsScript(): String = listOf(
        "command -v tmux >/dev/null 2>&1 || exit 127",
        "tmux list-sessions -F '#{session_name}\\t#{${InitPathOption}}\\t#{${TerminalNumberOption}}'",
    ).joinToString("\n")

    fun killSessionScript(sessionName: String): String? {
        if (!isCurrentSessionName(sessionName)) return null
        return listOf(
            "command -v tmux >/dev/null 2>&1 || exit 127",
            "tmux kill-session -t ${shellQuote("=$sessionName")}",
        ).joinToString("\n")
    }

    private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"

    private const val SessionProtocol = "hobgoblin-terminal-session-v1"
    private const val SessionNamePrefix = "hobgoblin-v1-"
    private const val InitPathOption = "@hobgoblin_init_path"
    private const val TerminalNumberOption = "@hobgoblin_terminal_number"
    private const val HashHexChars = 24
    private const val MaxPathChars = 4_096
    private val CurrentSessionNamePattern = Regex("^hobgoblin-v1-[a-f0-9]{24}$")
    private val CanonicalTerminalNumberPattern = Regex("^[1-9][0-9]*$")
    private val HexChars = "0123456789abcdef".toCharArray()
}
