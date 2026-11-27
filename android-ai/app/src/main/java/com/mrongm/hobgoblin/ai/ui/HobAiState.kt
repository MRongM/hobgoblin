package com.mrongm.hobgoblin.ai.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.mrongm.hobgoblin.ai.data.AiApiException
import com.mrongm.hobgoblin.ai.data.AiConnection
import com.mrongm.hobgoblin.ai.data.AiConnectionStore
import com.mrongm.hobgoblin.ai.data.AiConversationDeleteMode
import com.mrongm.hobgoblin.ai.data.AiMessage
import com.mrongm.hobgoblin.ai.data.AiProject
import com.mrongm.hobgoblin.ai.data.AiProvider
import com.mrongm.hobgoblin.ai.data.AiRefreshInterval
import com.mrongm.hobgoblin.ai.data.AiSession
import com.mrongm.hobgoblin.ai.data.AiSessionPage
import com.mrongm.hobgoblin.ai.data.AiSubworkspace
import com.mrongm.hobgoblin.ai.data.AiTargetCatalog
import com.mrongm.hobgoblin.ai.data.AiTurn
import com.mrongm.hobgoblin.ai.data.AiWorktree
import com.mrongm.hobgoblin.ai.data.HobAiClient
import com.mrongm.hobgoblin.ai.data.aiServerOrigin
import com.mrongm.hobgoblin.ai.data.fetchAiSessionWindow
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.util.UUID

internal enum class AiPage { Inbox, Settings, Worktree, Chat, Terminals }

internal enum class AiFailure {
    Address, Key, Unauthorized, Network, LanPermission, Unavailable, Missing, Busy, TerminalActive,
    NativeUnavailable, NativeDeliveryUnknown, SessionChanged, ServerUpdate, Rejected, Storage,
}

internal data class AiSelection(val project: AiProject, val worktree: AiWorktree, val provider: AiProvider, val subworkspace: AiSubworkspace?)

internal class HobAiState(private val store: AiConnectionStore) {
    var page by mutableStateOf(AiPage.Inbox)
        private set
    var loaded by mutableStateOf(false)
        private set
    var connection by mutableStateOf<AiConnection?>(null)
        private set
    var projects by mutableStateOf<List<AiProject>>(emptyList())
        private set
    var sessions by mutableStateOf<List<AiSession>>(emptyList())
        private set
    var rememberedSessionId by mutableStateOf<String?>(null)
        private set
    var project by mutableStateOf<AiProject?>(null)
        private set
    private var catalog by mutableStateOf<AiTargetCatalog?>(null)
    var subworkspace by mutableStateOf<AiSubworkspace?>(null)
        private set
    val worktrees: List<AiWorktree> get() = subworkspace?.targets ?: catalog?.worktrees.orEmpty()
    val subworkspaces: List<AiSubworkspace> get() = catalog?.subworkspaces.orEmpty()
    val targetsLoaded: Boolean get() = catalog != null
    var worktree by mutableStateOf<AiWorktree?>(null)
    var provider by mutableStateOf(AiProvider.Codex)
    var activeId by mutableStateOf<String?>(null)
        private set
    var submittedTurns by mutableStateOf(0)
        private set
    var session by mutableStateOf<AiSession?>(null)
        private set
    var location by mutableStateOf<AiWorktree?>(null)
        private set
    var locationGroup by mutableStateOf<String?>(null)
        private set
    var selection by mutableStateOf<AiSelection?>(null)
        private set
    var draft by mutableStateOf("")
    var busy by mutableStateOf(false)
        private set
    var loadingList by mutableStateOf(false)
        private set
    var loadingMoreSessions by mutableStateOf(false)
        private set
    private var nextSessionCursor by mutableStateOf<String?>(null)
    private var loadedSessionPages = 1
    val hasMoreSessions: Boolean get() = nextSessionCursor != null
    var sessionRemovalCount by mutableIntStateOf(0)
        private set
    var refreshingChat by mutableStateOf(false)
        private set
    var chatHistoryLoaded by mutableStateOf(false)
        private set
    var refreshInterval by mutableStateOf(AiRefreshInterval.Every5Seconds)
        private set
    var listFailure by mutableStateOf<AiFailure?>(null)
        private set
    var failure by mutableStateOf<AiFailure?>(null)
        private set
    var verified by mutableStateOf<AiConnection?>(null)
        private set
    private var pending by mutableStateOf<Submission?>(null)
    private val drafts = mutableMapOf<String?, String>()
    private val projectTargets = mutableStateMapOf<String, AiTargetCatalog>()
    private val inboxRefresh = Mutex()
    private val chatRefresh = Mutex()
    private var client: HobAiClient? = null

    val pendingPrompt: String? get() = pending?.takeIf { page == AiPage.Chat && it.sessionId == activeId }?.prompt
    val hasPending: Boolean get() = pending != null
    val running: Boolean get() = session?.running == true

    fun projectName(id: String?): String? = projects.firstOrNull { it.id == id }?.name

    fun locationLabel(item: AiSession): String? {
        val targets = projectTargets[item.projectId]
        return listOfNotNull(
            projectName(item.projectId),
            targets?.subworkspaceFor(item.worktreeId)?.name,
            targets?.target(item.worktreeId)?.name ?: item.worktreeName?.takeIf(String::isNotBlank),
        ).distinct().joinToString(" / ").ifBlank { null }
    }

    suspend fun load() {
        if (loaded) return
        try {
            refreshInterval = store.refreshInterval()
            connection = store.load()
            client = connection?.let(::HobAiClient)
            rememberedSessionId = store.lastSessionId()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            failure = AiFailure.Storage
        }
        page = if (connection == null) AiPage.Settings else AiPage.Inbox
        loaded = true
    }

    fun openSettings() {
        if (busy) return
        keepDraft()
        verified = null
        failure = null
        page = AiPage.Settings
    }

    fun openTerminals() {
        if (busy || connection == null) return
        page = AiPage.Terminals
    }

    fun terminalCursor(id: String): Long = connection?.let { store.terminalCursor(it.origin, id) } ?: 0L

    fun rememberTerminalCursor(id: String, seq: Long) {
        connection?.let { store.rememberTerminalCursor(it.origin, id, seq) }
    }

    fun changeRefreshInterval(interval: AiRefreshInterval) {
        store.setRefreshInterval(interval)
        refreshInterval = interval
    }

    fun editConnection() {
        verified = null
        failure = null
    }

    fun denyLanPermission() {
        verified = null
        failure = AiFailure.LanPermission
    }

    suspend fun verifyConnection(address: String, accessKey: String) {
        val origin = aiServerOrigin(address)
        if (origin == null) {
            failure = AiFailure.Address
            return
        }
        val key = accessKey.trim().ifEmpty {
            connection?.takeIf { it.origin == origin }?.accessKey.orEmpty()
        }
        if (key.isEmpty() || key.any { it.isWhitespace() || it.isISOControl() }) {
            failure = AiFailure.Key
            return
        }
        val candidate = AiConnection(origin, key)
        operate {
            try {
                HobAiClient(candidate).projects()
            } catch (error: AiApiException) {
                if (error.status != 404) throw error
                failure = AiFailure.Unavailable
                return@operate
            }
            verified = candidate
        }
    }

    suspend fun saveConnection() {
        val checked = verified ?: return
        operate {
            try {
                store.save(checked)
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                failure = AiFailure.Storage
                return@operate
            }
            if (connection?.origin != checked.origin) {
                projects = emptyList()
                sessions = emptyList()
                nextSessionCursor = null
                loadedSessionPages = 1
                projectTargets.clear()
                drafts.clear()
                pending = null
                rememberedSessionId = null
                clearChat()
            }
            connection = checked
            client = HobAiClient(checked)
            verified = null
            page = AiPage.Inbox
        }
    }

    suspend fun refreshInbox(refreshNative: Boolean = false) = inboxRefresh.withLock {
        val api = client ?: return@withLock
        loadingList = refreshNative || sessions.isEmpty()
        try {
            val previous = sessions
            val depth = if (refreshNative) loadedSessionPages else 1
            val page = fetchAiSessionWindow(depth) { cursor ->
                api.sessionPage(cursor, refresh = refreshNative && cursor == null)
            }
            if (client !== api || sessions !== previous) return@withLock
            projects = page.projects
            val knownById = previous.associateBy(AiSession::id)
            val current = page.sessions.map { item ->
                if (item.descriptiveTitle == null) item.copy(titleHint = knownById[item.id]?.descriptiveTitle) else item
            }
            val last = current.lastOrNull()
            if (refreshNative || loadedSessionPages == 1 || page.nextCursor == null || last == null) {
                sessions = current
                nextSessionCursor = page.nextCursor
                if (!refreshNative) loadedSessionPages = 1
            } else {
                val openProjects = page.projects.mapTo(hashSetOf(), AiProject::id)
                val retained = previous.filter { it.projectId in openProjects && sessionOrder.compare(it, last) > 0 }
                sessions = (current + retained).distinctBy(AiSession::id)
            }
            listFailure = null
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            if (client === api) listFailure = error.toAiFailure()
        } finally {
            loadingList = false
        }
    }

    suspend fun loadMoreSessions() = inboxRefresh.withLock {
        val api = client ?: return@withLock
        val cursor = nextSessionCursor ?: return@withLock
        loadingMoreSessions = true
        try {
            val previous = sessions
            val page = api.sessionPage(cursor)
            if (client !== api || sessions !== previous) return@withLock
            sessions = (previous + page.sessions).distinctBy(AiSession::id).sortedWith(sessionOrder)
            nextSessionCursor = page.nextCursor
            loadedSessionPages++
            listFailure = null
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            if (client === api) listFailure = error.toAiFailure()
        } finally {
            loadingMoreSessions = false
        }
    }

    suspend fun searchSessions(query: String, cursor: String?): AiSessionPage {
        val api = client ?: return AiSessionPage(emptyList(), emptyList(), null)
        return api.sessionPage(cursor, search = query)
    }

    fun newSession(project: AiProject? = null) {
        if (busy || pending != null) return
        keepDraft()
        selectProject(project)
        page = AiPage.Worktree
    }

    fun selectProject(item: AiProject?) {
        project = item
        worktree = null
        subworkspace = null
        catalog = item?.let { projectTargets[it.id] }
        failure = null
    }

    fun selectSubworkspace(group: AiSubworkspace?) {
        subworkspace = group
        worktree = null
    }

    suspend fun loadWorktrees(item: AiProject) {
        val api = client ?: return
        try {
            val available = api.targets(item.id)
            if (page == AiPage.Worktree && project == item) {
                catalog = available
                projectTargets[item.id] = available
                subworkspace = subworkspace?.id?.let { id -> available.subworkspaces.find { it.id == id } }
                worktree = worktree?.id?.let { id -> worktrees.find { it.id == id } }
                failure = null
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            if (page == AiPage.Worktree && project == item) failure = error.toAiFailure()
        }
    }

    fun confirmWorktree() {
        val currentProject = project ?: return
        val currentWorktree = worktree ?: return
        selection = AiSelection(currentProject, currentWorktree, provider, subworkspace)
        location = currentWorktree
        locationGroup = subworkspace?.name
        activeId = null
        session = null
        draft = ""
        drafts.remove(null)
        failure = null
        page = AiPage.Chat
    }

    fun openSession(id: String) {
        if (busy) return
        keepDraft()
        activeId = id
        selection = null
        session = sessions.firstOrNull { it.id == id }
        chatHistoryLoaded = false
        updateChatLocation(session)
        draft = drafts[id].orEmpty()
        rememberSession(id)
        failure = null
        page = AiPage.Chat
    }

    fun back() {
        if (busy) return
        when {
            page == AiPage.Chat -> {
                keepDraft()
                page = AiPage.Inbox
            }
            page == AiPage.Worktree && subworkspace != null -> selectSubworkspace(null)
            page == AiPage.Worktree && project != null -> selectProject(null)
            page != AiPage.Settings || connection != null -> page = AiPage.Inbox
        }
        failure = null
    }

    suspend fun watchChat(id: String) {
        val api = client ?: return
        while (isActiveChat(api, id)) {
            try {
                refreshChat(api, id)
                return
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                if (!isActiveChat(api, id)) return
                if (error is AiApiException && error.code == "session_not_found" && !busy) {
                    removeSession(id)
                }
                failure = error.toAiFailure()
                if (error !is IOException || error is AiApiException && error.status !in 502..504) return
                if (refreshInterval.seconds == 0) return
                delay(refreshInterval.seconds * 1_000L)
            }
        }
    }

    private suspend fun refreshChat(api: HobAiClient, id: String) {
        chatRefresh.withLock { loadChat(api, id) }
        while (isActiveChat(api, id) && refreshInterval.seconds > 0) {
            delay(refreshInterval.seconds * 1_000L)
            chatRefresh.withLock {
                if (!isActiveChat(api, id) || busy) return@withLock
                val current = session ?: return@withLock
                val status = api.sessionStatus(id)
                if (!current.hasSameRevision(status)) loadChat(api, id)
            }
        }
    }

    suspend fun refreshCurrentChat() {
        val api = client ?: return
        val id = activeId ?: return
        if (!isActiveChat(api, id) || busy || refreshingChat) return
        refreshingChat = true
        try {
            chatRefresh.withLock { loadChat(api, id) }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            if (isActiveChat(api, id)) failure = error.toAiFailure()
        } finally {
            refreshingChat = false
        }
    }

    private suspend fun loadChat(api: HobAiClient, id: String) {
        if (!isActiveChat(api, id) || busy) return
        val previous = session
        val loaded = api.session(id)
        if (!isActiveChat(api, id) || busy || session !== previous) return
        updateSession(loaded)
        chatHistoryLoaded = true
        failure = null
        if (loaded.projectId !in projectTargets) readProjectTargets(api, loaded.projectId)
        if (isActiveChat(api, id)) updateChatLocation(loaded)
    }

    suspend fun send() {
        val api = client ?: return
        if (busy || running || session?.canSend == false) return
        val queued = pending ?: newSubmission() ?: return
        if (queued.sessionId != activeId) return
        pending = queued
        operate {
            val id = try {
                api.submit(
                    queued.projectId, queued.worktreeId, queued.provider, queued.sessionId, queued.requestId,
                    queued.prompt, queued.nativeCodex,
                    session?.revision,
                )
            } catch (error: AiApiException) {
                if (error.code == "revision_conflict" && queued.sessionId != null) {
                    pending = null
                    updateSession(api.session(queued.sessionId))
                    throw error
                }
                if (error.code == "desktop_terminal_active") {
                    pending = null
                    session?.let { updateSession(it.copy(terminalActive = true)) }
                    return@operate
                }
                if (error.status in 400..499 || error.code in setOf("unavailable", "terminal_control_disabled")) {
                    pending = null
                }
                throw error
            }
            pending = null
            draft = ""
            drafts.remove(queued.sessionId)
            val message = AiMessage("user", queued.prompt)
            val turn = AiTurn(queued.requestId, "working", queued.prompt, null)
            val optimistic = session?.let { it.copy(status = "working", turn = turn, messages = it.messages + message) }
                ?: AiSession(id, queued.projectId, queued.worktreeId, queued.provider, "", "working", turn, listOf(message))
            updateSession(optimistic)
            activeId = id
            rememberSession(id)
            submittedTurns++
        }
    }

    fun resumePending() {
        val queued = pending ?: return
        if (busy) return
        if (queued.sessionId != null) {
            openSession(queued.sessionId)
        } else {
            activeId = null
            session = null
            chatHistoryLoaded = false
            selection = queued.selection
            location = queued.selection?.worktree
            locationGroup = queued.selection?.subworkspace?.name
            draft = queued.prompt
            page = AiPage.Chat
            failure = null
        }
    }

    suspend fun stop() {
        val api = client ?: return
        val current = session ?: return
        val turn = current.turn?.takeIf { it.state == "working" } ?: return
        operate {
            try {
                updateSession(current.copy(turn = api.stop(current.id, turn.requestId)))
            } catch (error: AiApiException) {
                if (error.code != "turn_not_working") throw error
            }
            updateSession(api.session(current.id))
        }
    }

    suspend fun deleteSession(id: String, mode: AiConversationDeleteMode?) {
        val api = client ?: return
        operate {
            api.deleteSession(id, mode)
            removeSession(id)
        }
    }

    private fun newSubmission(): Submission? {
        val prompt = draft.takeIf { it.isNotBlank() && it.length <= 64 * 1024 } ?: return null
        val current = session
        val target = selection
        return Submission(
            requestId = UUID.randomUUID().toString(),
            sessionId = activeId,
            projectId = current?.projectId ?: target?.project?.id ?: return null,
            worktreeId = current?.worktreeId ?: target?.worktree?.id ?: return null,
            provider = current?.provider ?: target?.provider ?: return null,
            nativeCodex = current?.nativeCodex == true,
            prompt = prompt,
            selection = target,
        )
    }

    private suspend fun operate(action: suspend () -> Unit) {
        if (busy) return
        busy = true
        failure = null
        try {
            action()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            failure = error.toAiFailure()
        } finally {
            busy = false
        }
    }

    private fun isActiveChat(api: HobAiClient, id: String): Boolean =
        client === api && page == AiPage.Chat && activeId == id

    private fun updateSession(updated: AiSession) {
        session = updated
        val previous = sessions.firstOrNull { it.id == updated.id }
        val summary = updated.copy(
            messages = emptyList(),
            titleHint = updated.descriptiveTitle ?: previous?.descriptiveTitle,
            worktreeName = updated.worktreeName ?: previous?.worktreeName,
            turn = updated.turn?.let { it.copy(prompt = it.prompt.trimStart().lineSequence().first().trimEnd().take(80)) },
        )
        if (previous != summary) {
            sessions = (listOf(summary) + sessions.filterNot { it.id == summary.id }).sortedWith(sessionOrder)
        }
    }

    private fun updateChatLocation(current: AiSession?) {
        val targets = current?.let { projectTargets[it.projectId] }
        location = current?.let { targets?.target(it.worktreeId) }
        locationGroup = current?.let { targets?.subworkspaceFor(it.worktreeId)?.name }
    }

    private fun removeSession(id: String) {
        sessions = sessions.filterNot { it.id == id }
        sessionRemovalCount++
        drafts.remove(id)
        if (pending?.sessionId == id) pending = null
        if (rememberedSessionId == id) rememberSession(null)
        if (activeId == id) {
            clearChat()
            if (page == AiPage.Chat) page = AiPage.Inbox
        }
    }

    private fun rememberSession(id: String?) {
        store.rememberSession(id)
        rememberedSessionId = id
    }

    private fun keepDraft() {
        if (page == AiPage.Chat) drafts[activeId] = draft
    }

    private suspend fun readProjectTargets(api: HobAiClient, projectId: String) {
        try {
            val available = api.targets(projectId)
            if (client === api) projectTargets[projectId] = available
        } catch (error: Exception) {
            if (error is CancellationException) throw error
        }
    }

    private fun clearChat() {
        activeId = null
        session = null
        chatHistoryLoaded = false
        selection = null
        location = null
        locationGroup = null
        draft = ""
    }

    private data class Submission(
        val requestId: String,
        val sessionId: String?,
        val projectId: String,
        val worktreeId: String,
        val provider: AiProvider,
        val nativeCodex: Boolean,
        val prompt: String,
        val selection: AiSelection?,
    )
}

private val sessionOrder = compareByDescending(AiSession::updatedAt).thenBy(AiSession::id)

internal fun Exception.toAiFailure(): AiFailure = when (this) {
    is AiApiException -> when {
        status == 401 || status == 403 -> AiFailure.Unauthorized
        code == "session_working" || code == "turn_not_working" -> AiFailure.Busy
        code == "desktop_terminal_active" -> AiFailure.TerminalActive
        code == "session_changed" -> AiFailure.SessionChanged
        code == "revision_conflict" -> AiFailure.SessionChanged
        code == "control_in_use" || code == "interactive_input_active" -> AiFailure.Busy
        code == "session_paging_unavailable" -> AiFailure.ServerUpdate
        code == "native_terminal_unavailable" -> AiFailure.NativeUnavailable
        code == "native_delivery_unknown" -> AiFailure.NativeDeliveryUnknown
        status == 404 -> AiFailure.Missing
        status >= 500 || status in 300..399 -> AiFailure.Unavailable
        else -> AiFailure.Rejected
    }
    is IOException -> AiFailure.Network
    else -> AiFailure.Unavailable
}
