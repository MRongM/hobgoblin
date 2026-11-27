package com.mrongm.hobgoblin.ai.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

internal class AiConnection(val origin: String, val accessKey: String)

internal fun aiServerOrigin(input: String): String? {
    val uri = runCatching { URI(input.trim()) }.getOrNull() ?: return null
    val host = uri.host ?: return null
    if (!uri.scheme.equals("https", ignoreCase = true) || uri.userInfo != null ||
        uri.port !in -1..65535 || uri.port == 0 || uri.query != null || uri.fragment != null ||
        uri.path !in listOf("", "/")
    ) return null
    return URI("https", null, host.lowercase(), uri.port.takeUnless { it == 443 } ?: -1, null, null, null).toASCIIString()
}

internal fun isAiLanAddress(origin: String): Boolean {
    val host = URI(origin).host?.removeSurrounding("[", "]") ?: return false
    if (host.endsWith(".local")) return true
    if (':' in host) return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")
    val parts = host.split('.').map { it.toIntOrNull() ?: return false }
    if (parts.size != 4) return false
    return parts[0] == 10 || (parts[0] == 172 && parts[1] in 16..31) ||
        (parts[0] == 192 && parts[1] == 168) || (parts[0] == 169 && parts[1] == 254)
}

internal enum class AiProvider(val wireName: String, val label: String) {
    Codex("codex", "Codex"),
    Claude("claude", "Claude"),
}

internal data class AiProject(val id: String, val name: String)
internal data class AiWorktree(val id: String, val name: String, val branch: String?, val primary: Boolean)
internal data class AiSubworkspace(
    val id: String,
    val name: String,
    val root: AiWorktree?,
    val worktrees: List<AiWorktree>,
) {
    val targets: List<AiWorktree> get() = listOfNotNull(root) + worktrees
}

internal data class AiTargetCatalog(
    val worktrees: List<AiWorktree>,
    val subworkspaces: List<AiSubworkspace>,
) {
    fun subworkspaceFor(id: String): AiSubworkspace? = subworkspaces.firstOrNull { group -> group.targets.any { it.id == id } }
    fun target(id: String): AiWorktree? =
        worktrees.firstOrNull { it.id == id } ?: subworkspaceFor(id)?.targets?.firstOrNull { it.id == id }
}

internal data class AiMessage(val role: String, val content: String)
internal data class AiTurn(val requestId: String, val state: String, val prompt: String, val error: String?)
internal enum class AiConversationDeleteMode(val wireName: String) {
    StopBackground("stop-background"), RemoveDesktopCopy("remove-desktop-copy"),
}

internal data class AiSession(
    val id: String,
    val projectId: String,
    val worktreeId: String,
    val provider: AiProvider,
    val updatedAt: String,
    val status: String,
    val turn: AiTurn?,
    val messages: List<AiMessage>,
    val terminalActive: Boolean = false,
    val nativeCodex: Boolean = false,
    val terminalWritable: Boolean = false,
    val worktreeName: String? = null,
    val revision: Long? = null,
    val structuredWritable: Boolean? = null,
    val titleHint: String? = null,
) {
    val running: Boolean get() = status == "working" || turn?.state == "working"
    val canSend: Boolean get() = structuredWritable ?: if (nativeCodex) terminalWritable else !terminalActive
    val deleteMode: AiConversationDeleteMode?
        get() = when {
            nativeCodex || terminalActive -> AiConversationDeleteMode.RemoveDesktopCopy
            running -> AiConversationDeleteMode.StopBackground
            else -> null
        }

    fun hasSameRevision(other: AiSession): Boolean =
        id == other.id && updatedAt == other.updatedAt && status == other.status && turn == other.turn &&
            terminalActive == other.terminalActive && nativeCodex == other.nativeCodex &&
            terminalWritable == other.terminalWritable && structuredWritable == other.structuredWritable &&
            revision == other.revision

    val descriptiveTitle: String?
        get() = titleHint?.let(::sessionTitleText) ?: turn?.prompt?.let(::sessionTitleText)
            ?: messages.asSequence().filter { it.role == "user" }.firstNotNullOfOrNull { sessionTitleText(it.content) }

    val title: String get() = descriptiveTitle ?: "${provider.label} · ${id.takeLast(6)}"
}

private val attachmentMarker = Regex("^(?:\\[Image #\\d+]\\s*)+")
private val windowsDrivePath = Regex("^[A-Za-z]:[\\\\/]")

private fun sessionTitleText(value: String): String? = value.lineSequence()
    .map { it.trim().replaceFirst(attachmentMarker, "").trim() }
    .firstOrNull { line ->
        line.isNotBlank() && (line.any(Char::isWhitespace) ||
            !(line.startsWith("/") && line.indexOf('/', 1) >= 0 ||
                windowsDrivePath.containsMatchIn(line) || "://" in line))
    }?.take(80)

internal class AiApiException(val status: Int, val code: String?) : IOException("Hob API returned HTTP $status")

internal data class AiSessionPage(val sessions: List<AiSession>, val projects: List<AiProject>, val nextCursor: String?)

internal suspend fun fetchAiSessionWindow(
    depth: Int,
    fetch: suspend (cursor: String?) -> AiSessionPage,
): AiSessionPage {
    val first = fetch(null)
    if (depth <= 1 || first.nextCursor == null) return first
    val sessions = first.sessions.toMutableList()
    var cursor = first.nextCursor
    for (index in 1 until depth) {
        val next = fetch(cursor ?: break)
        sessions += next.sessions
        cursor = next.nextCursor
    }
    return first.copy(sessions = sessions.distinctBy(AiSession::id), nextCursor = cursor)
}

internal data class AiTerminalRecord(
    val id: String,
    val cwd: String,
    val phase: String,
    val createdAt: String,
    val provider: AiProvider?,
    val terminalTitle: String? = null,
    val workspaceId: String? = null,
    val worktreeId: String? = null,
) {
    private val directoryName: String
        get() = cwd.trimEnd('/', '\\').substringAfterLast('/').substringAfterLast('\\').ifBlank { cwd }

    private val reportedTitle: String?
        get() = terminalTitle?.trim()?.takeIf(String::isNotEmpty)

    val title: String get() = reportedTitle ?: directoryName

    val listTitle: String?
        get() {
            val raw = reportedTitle ?: return null
            val withoutDirectory = raw.removeSuffix(" | $cwd").removeSuffix(" | $directoryName")
            return withoutDirectory.takeUnless { it == cwd || it == directoryName }
        }
}

internal data class AiTerminalPage(val records: List<AiTerminalRecord>, val nextCursor: Long?)

internal data class AiTranscriptLine(val seq: Long, val text: String?, val truncated: Boolean)

internal data class AiTranscriptPage(
    val lines: List<AiTranscriptLine>,
    val nextAfterSeq: Long,
    val hasMoreBefore: Boolean,
    val hasMoreAfter: Boolean,
    val gap: Boolean,
    val tail: AiTranscriptLine?,
)

internal class HobAiClient(private val connection: AiConnection) {
    suspend fun terminalRecords(cursor: Long? = null): AiTerminalPage {
        val json = get("/terminal-records" + if (cursor == null) "" else "?cursor=$cursor")
        return AiTerminalPage(
            json.getJSONArray("records").objects { row ->
                val provider = row.optionalString("agentProvider") ?: row.optionalString("detectedAgentProvider")
                AiTerminalRecord(
                    row.getString("id"), row.getString("cwd"), row.getString("phase"), row.getString("createdAt"),
                    AiProvider.entries.firstOrNull { it.wireName == provider },
                    row.optionalString("title"),
                    row.optionalString("workspaceId"),
                    row.optionalString("worktreeId"),
                )
            },
            if (json.isNull("nextCursor")) null else json.getLong("nextCursor"),
        )
    }

    suspend fun liveTerminalTitles(workspaceId: String): Map<String, String> =
        get("/workspaces/${segment(workspaceId)}/terminals").getJSONArray("terminals").objects { row ->
            row.optionalString("title")?.takeIf(String::isNotBlank)?.let { row.getString("id") to it }
        }.filterNotNull().toMap()

    suspend fun terminalTranscript(id: String, afterSeq: Long? = null, beforeSeq: Long? = null): AiTranscriptPage {
        require(TerminalIdPattern.matches(id)) { "Invalid terminal identifier" }
        val cursor = when {
            afterSeq != null -> "&afterSeq=$afterSeq"
            beforeSeq != null -> "&beforeSeq=$beforeSeq"
            else -> ""
        }
        val json = get("/terminal-records/$id/transcript?limit=200$cursor")
        fun line(value: JSONObject, seq: Long) =
            AiTranscriptLine(seq, value.optionalString("text"), value.getBoolean("truncated"))
        return AiTranscriptPage(
            json.getJSONArray("lines").objects { line(it, it.getLong("seq")) },
            json.getLong("nextAfterSeq"),
            json.getBoolean("hasMoreBefore"),
            json.getBoolean("hasMoreAfter"),
            json.getBoolean("gap"),
            json.optJSONObject("tail")?.let { line(it, 0) },
        )
    }

    suspend fun linkedTerminalSession(terminalId: String): AiSession? {
        require(TerminalIdPattern.matches(terminalId)) { "Invalid terminal identifier" }
        return try {
            readSession(get("/terminal-records/$terminalId/session"))
        } catch (error: AiApiException) {
            if (error.status == 404) null else throw error
        }
    }

    suspend fun attachTerminal(terminalId: String, provider: AiProvider, threadId: String?): AiSession {
        require(TerminalIdPattern.matches(terminalId)) { "Invalid terminal identifier" }
        val body = JSONObject().put("provider", provider.wireName)
        threadId?.let { body.put("providerSessionId", it) }
        return readSession(request("POST", "/terminal-records/$terminalId/session", body))
    }

    suspend fun writeTerminalSession(sessionId: String, requestId: String, data: String) {
        request("POST", sessionPath(sessionId) + "/input", JSONObject().put("requestId", requestId).put("data", data))
    }

    suspend fun projects(): List<AiProject> = get("/workspaces").getJSONArray("workspaces").objects(::readProject)

    suspend fun targets(projectId: String): AiTargetCatalog {
        val base = "/workspaces/" + segment(projectId)
        val json = try {
            get("$base/targets")
        } catch (error: AiApiException) {
            if (error.status != 404) throw error
            get("$base/worktrees")
        }
        return AiTargetCatalog(
            worktrees = json.getJSONArray("worktrees").objects(::readWorktree),
            subworkspaces = json.optJSONArray("subworkspaces")?.objects { group ->
                AiSubworkspace(
                    id = group.getString("id"),
                    name = group.getString("name"),
                    root = group.optJSONObject("root")?.let(::readWorktree),
                    worktrees = group.getJSONArray("worktrees").objects(::readWorktree),
                )
            }.orEmpty(),
        )
    }

    suspend fun sessionPage(cursor: String? = null, search: String = "", refresh: Boolean = false): AiSessionPage {
        val path = buildString {
            append("/sessions?native=1")
            if (refresh) append("&refresh=1")
            cursor?.let { append("&cursor=").append(java.net.URLEncoder.encode(it, "UTF-8")) }
            if (search.isNotBlank()) append("&q=").append(java.net.URLEncoder.encode(search, "UTF-8"))
        }
        val result = try {
            get(path)
        } catch (error: AiApiException) {
            if (error.status == 404) throw AiApiException(404, "session_paging_unavailable")
            throw error
        }
        return AiSessionPage(
            result.getJSONArray("sessions").objects(::readSession),
            result.getJSONArray("workspaces").objects(::readProject),
            result.optionalString("nextCursor"),
        )
    }

    suspend fun session(sessionId: String): AiSession = readSession(get(sessionPath(sessionId) + "?native=1"))

    suspend fun sessionStatus(sessionId: String): AiSession = try {
        readSession(get(sessionPath(sessionId) + "/status?native=1"))
    } catch (error: AiApiException) {
        if (error.status != 404) throw error
        session(sessionId)
    }

    suspend fun submit(
        projectId: String,
        worktreeId: String,
        provider: AiProvider,
        sessionId: String?,
        requestId: String,
        prompt: String,
        nativeCodex: Boolean,
        expectedRevision: Long? = null,
    ): String {
        val body = JSONObject().put("requestId", requestId).put("prompt", prompt)
        val path = if (sessionId == null) {
            body.put("mode", "background").put("provider", provider.wireName).put("worktreeId", worktreeId)
            "/workspaces/" + segment(projectId) + "/sessions"
        } else {
            expectedRevision?.let { body.put("expectedRevision", it) }
            sessionPath(sessionId) + if (nativeCodex) "/turns?native=1" else "/turns"
        }
        return request("POST", path, body).getString("sessionId")
    }

    suspend fun stop(sessionId: String, requestId: String): AiTurn =
        readTurn(request("DELETE", turnPath(sessionId, requestId)))

    suspend fun deleteSession(sessionId: String, mode: AiConversationDeleteMode?) {
        try {
            val query = mode?.let { "?mode=" + it.wireName }.orEmpty()
            request("DELETE", "/conversations/" + segment(sessionId) + query)
        } catch (error: AiApiException) {
            if (error.status != 404 || error.code != "conversation_not_found") throw error
        }
    }

    private suspend fun get(path: String): JSONObject = request("GET", path)

    private suspend fun request(method: String, path: String, body: JSONObject? = null): JSONObject =
        withContext(Dispatchers.IO) {
            val url = URI(connection.origin + Prefix + path).toURL()
            val http = url.openConnection() as HttpURLConnection
            try {
                http.requestMethod = method
                http.instanceFollowRedirects = false
                http.connectTimeout = 8_000
                http.readTimeout = 15_000
                http.setRequestProperty("Accept", "application/json")
                http.setRequestProperty("Authorization", "Bearer " + connection.accessKey)
                if (body != null) {
                    val payload = body.toString().toByteArray(Charsets.UTF_8)
                    http.doOutput = true
                    http.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    http.setFixedLengthStreamingMode(payload.size)
                    http.outputStream.use { it.write(payload) }
                }
                val status = http.responseCode
                if (status !in 200..299) {
                    val code = http.errorStream?.bufferedReader(Charsets.UTF_8)?.use { reader ->
                        runCatching { JSONObject(reader.readText()).optJSONObject("error")?.optionalString("code") }
                            .getOrNull()
                    }
                    throw AiApiException(status, code)
                }
                if (status == HttpURLConnection.HTTP_NO_CONTENT) JSONObject()
                else http.inputStream.bufferedReader(Charsets.UTF_8).use { JSONObject(it.readText()) }
            } finally {
                http.disconnect()
            }
        }

    private fun readSession(json: JSONObject): AiSession = AiSession(
        id = json.getString("id"),
        projectId = json.getString("workspaceId"),
        worktreeId = json.getString("worktreeId"),
        provider = AiProvider.entries.first { it.wireName == json.getString("provider") },
        updatedAt = json.getString("updatedAt"),
        status = json.getString("status"),
        terminalActive = json.optBoolean("terminalActive"),
        nativeCodex = json.optBoolean("nativeCodex"),
        terminalWritable = json.optBoolean("terminalWritable"),
        worktreeName = json.optionalString("worktreeName"),
        titleHint = json.optionalString("title"),
        revision = json.optLong("revision").takeIf { it > 0 },
        structuredWritable = if (json.isNull("structuredWritable")) null else json.getBoolean("structuredWritable"),
        turn = json.optJSONObject("latestTurn")?.let(::readTurn),
        messages = json.optJSONArray("messages")?.objects {
            AiMessage(it.getString("role"), it.getString("content"))
        }.orEmpty(),
    )

    private fun readTurn(json: JSONObject): AiTurn =
        AiTurn(json.getString("requestId"), json.getString("state"), json.getString("prompt"), json.optionalString("error"))

    private fun readWorktree(json: JSONObject): AiWorktree =
        AiWorktree(json.getString("id"), json.getString("name"), json.optionalString("branch"), json.optBoolean("primary"))

    private fun readProject(json: JSONObject): AiProject = AiProject(json.getString("id"), json.getString("name"))

    private fun sessionPath(sessionId: String): String = "/sessions/" + segment(sessionId)
    private fun turnPath(sessionId: String, requestId: String): String =
        sessionPath(sessionId) + "/turns/" + segment(requestId)

    private fun segment(id: String): String {
        require(IdPattern.matches(id)) { "Invalid Hob resource identifier" }
        return id
    }

    private companion object {
        const val Prefix = "/api/open/v1"
        val IdPattern = Regex("[a-f0-9-]{24,36}")
        val TerminalIdPattern = Regex("[A-Za-z0-9_-]{16,64}")
    }
}

private fun JSONObject.optionalString(name: String): String? = if (isNull(name)) null else getString(name)

private inline fun <T> JSONArray.objects(transform: (JSONObject) -> T): List<T> =
    List(length()) { transform(getJSONObject(it)) }
