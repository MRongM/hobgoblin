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

object TmuxSessionProtocol {
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

    fun matches(identity: TmuxSessionIdentity, session: RemoteTmuxSession): Boolean =
        isCurrentSessionName(identity.sessionName) &&
            session.sessionName == identity.sessionName &&
            normalizePath(session.sessionPath) == identity.initialPath

    fun listSessionsScript(): String = listOf(
        "command -v tmux >/dev/null 2>&1 || exit 127",
        "tmux list-sessions -F '#{session_name}\\t#{session_path}'",
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
    private const val HashHexChars = 24
    private const val MaxPathChars = 4_096
    private val CurrentSessionNamePattern = Regex("^hobgoblin-v1-[a-f0-9]{24}$")
    private val HexChars = "0123456789abcdef".toCharArray()
}
