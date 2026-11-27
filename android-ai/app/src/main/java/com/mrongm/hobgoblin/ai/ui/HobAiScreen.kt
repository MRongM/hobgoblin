package com.mrongm.hobgoblin.ai.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.text.format.DateUtils
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.findViewTreeLifecycleOwner
import com.mrongm.hobgoblin.ai.R
import com.mrongm.hobgoblin.ai.data.AiConversationDeleteMode
import com.mrongm.hobgoblin.ai.data.AiMessage
import com.mrongm.hobgoblin.ai.data.AiProject
import com.mrongm.hobgoblin.ai.data.AiProvider
import com.mrongm.hobgoblin.ai.data.AiRefreshInterval
import com.mrongm.hobgoblin.ai.data.AiSession
import com.mrongm.hobgoblin.ai.data.AiSessionPage
import com.mrongm.hobgoblin.ai.data.AiTerminalRecord
import com.mrongm.hobgoblin.ai.data.AiTurn
import com.mrongm.hobgoblin.ai.data.AiWorktree
import com.mrongm.hobgoblin.ai.data.HobAiClient
import com.mrongm.hobgoblin.ai.data.aiServerOrigin
import com.mrongm.hobgoblin.ai.data.isAiLanAddress
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HobAiScreen(state: HobAiState, onExit: () -> Unit) {
    val scope = rememberCoroutineScope()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val foreground = rememberAiForeground()
    var reload by remember { mutableIntStateOf(0) }
    var browseProjects by remember { mutableStateOf(false) }
    var refreshingInbox by remember(state.connection) { mutableStateOf(false) }
    var pendingDelete by remember(state.connection) { mutableStateOf<AiSession?>(null) }
    var selectedTerminal by remember(state.connection) { mutableStateOf<AiTerminalRecord?>(null) }
    val terminalApi = remember(state.connection) { state.connection?.let(::HobAiClient) }
    val listVisible = state.page == AiPage.Inbox || drawer.isOpen
    val refreshSeconds = state.refreshInterval.seconds

    LaunchedEffect(state) { state.load() }
    LaunchedEffect(state.connection, listVisible, foreground, refreshSeconds) {
        if (!foreground || !listVisible || state.connection == null) return@LaunchedEffect
        state.refreshInbox()
        while (refreshSeconds > 0) {
            delay(refreshSeconds * 1_000L)
            state.refreshInbox()
        }
    }
    LaunchedEffect(state.page, state.project, foreground, reload) {
        if (state.page == AiPage.Worktree && foreground) state.project?.let { state.loadWorktrees(it) }
    }
    LaunchedEffect(state.page, state.activeId, state.submittedTurns, foreground, refreshSeconds) {
        if (state.page == AiPage.Chat && foreground) state.activeId?.let { state.watchChat(it) }
    }

    fun showDrawer(projects: Boolean = false) {
        browseProjects = projects
        scope.launch { drawer.open() }
    }
    fun refreshSessions() {
        if (refreshingInbox) return
        refreshingInbox = true
        scope.launch {
            try {
                state.refreshInbox(refreshNative = true)
            } finally {
                refreshingInbox = false
            }
        }
    }

    fun loadMoreSessions() {
        if (!state.loadingList && !state.loadingMoreSessions) scope.launch { state.loadMoreSessions() }
    }

    fun confirmDelete(session: AiSession) {
        pendingDelete = session
    }

    fun navigate(action: () -> Unit) {
        action()
        scope.launch { drawer.close() }
    }
    fun back() {
        when {
            drawer.isOpen -> scope.launch { drawer.close() }
            state.busy -> Unit
            state.page == AiPage.Terminals && selectedTerminal != null -> selectedTerminal = null
            state.page == AiPage.Inbox || (state.page == AiPage.Settings && state.connection == null) -> onExit()
            else -> state.back()
        }
    }

    BackHandler(enabled = state.loaded, onBack = ::back)
    pendingDelete?.let { item ->
        val current = state.sessions.firstOrNull { it.id == item.id } ?: item
        val mode = current.deleteMode
        val confirmation = when (mode) {
            AiConversationDeleteMode.StopBackground -> R.string.ai_stop_and_delete_confirmation
            AiConversationDeleteMode.RemoveDesktopCopy -> R.string.ai_remove_desktop_copy_confirmation
            null -> R.string.ai_delete_session_confirmation
        }
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.ai_delete_session)) },
            text = { Text(stringResource(confirmation, current.title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        scope.launch { state.deleteSession(item.id, mode) }
                    },
                    enabled = !state.busy,
                ) {
                    val label = if (mode == AiConversationDeleteMode.StopBackground) R.string.ai_stop_and_delete else R.string.ai_delete
                    Text(stringResource(label), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(stringResource(R.string.ai_cancel)) }
            },
        )
    }
    ModalNavigationDrawer(
        drawerState = drawer,
        gesturesEnabled = drawer.isOpen,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.widthIn(max = 340.dp),
                drawerShape = RoundedCornerShape(topEnd = 17.dp, bottomEnd = 17.dp),
                drawerContainerColor = AiPaper,
            ) {
                if (drawer.isOpen || drawer.targetValue == DrawerValue.Open) {
                    AiDrawer(
                        state = state,
                        projectFirst = browseProjects,
                        onClose = { scope.launch { drawer.close() } },
                        onNew = { project -> navigate { state.newSession(project) } },
                        onOpen = { id -> navigate { state.openSession(id) } },
                        onDelete = ::confirmDelete,
                        onRefresh = ::refreshSessions,
                        onLoadMore = ::loadMoreSessions,
                        onSettings = { navigate(state::openSettings) },
                    )
                }
            }
        },
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize().imePadding(),
            containerColor = AiPaper,
            topBar = {
                HobTopBar(
                    title = when (state.page) {
                        AiPage.Inbox -> stringResource(R.string.ai_app_name)
                        AiPage.Settings -> stringResource(if (state.connection == null) R.string.ai_connection else R.string.ai_settings)
                        AiPage.Worktree -> stringResource(R.string.ai_worktree)
                        AiPage.Chat -> state.session?.title ?: stringResource(R.string.ai_new)
                        AiPage.Terminals -> selectedTerminal?.title ?: stringResource(R.string.ai_terminals)
                    },
                    subtitle = if (state.page == AiPage.Chat) state.session?.provider?.label ?: state.selection?.provider?.label else null,
                    modifier = Modifier.statusBarsPadding(),
                    leading = {
                        if (state.page == AiPage.Inbox && state.connection != null) {
                            HobIconButton(AiIcon.Menu, stringResource(R.string.ai_browse), onClick = { showDrawer() })
                        } else if (state.page != AiPage.Inbox) {
                            HobIconButton(AiIcon.Back, stringResource(R.string.ai_back), onClick = ::back, enabled = !state.busy)
                        }
                    },
                    trailing = {
                        when (state.page) {
                            AiPage.Inbox -> if (state.connection != null) {
                                HobIconButton(
                                    AiIcon.Refresh, stringResource(R.string.ai_refresh), ::refreshSessions,
                                    enabled = !state.loadingList,
                                )
                            }
                            AiPage.Chat -> HobIconButton(
                                AiIcon.Menu, stringResource(R.string.ai_browse), onClick = { showDrawer() }, enabled = !state.busy,
                            )
                            else -> Unit
                        }
                    },
                )
            },
            bottomBar = {
                if (state.loaded && state.connection != null && (state.page == AiPage.Inbox || state.page == AiPage.Settings ||
                    (state.page == AiPage.Terminals && selectedTerminal == null))) {
                    Column(Modifier.background(AiPaper).navigationBarsPadding()) {
                        HorizontalDivider(color = AiLine)
                        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                            HobNavItem(stringResource(R.string.ai_projects), AiIcon.Folder, false, { showDrawer(true) }, Modifier.weight(1f))
                            HobNavItem(stringResource(R.string.ai_threads), AiIcon.Chat, state.page == AiPage.Inbox, {
                                if (state.page != AiPage.Inbox) state.back()
                            }, Modifier.weight(1f))
                            HobNavItem(stringResource(R.string.ai_terminals), AiIcon.Terminal, state.page == AiPage.Terminals, {
                                state.openTerminals()
                            }, Modifier.weight(1f))
                            HobNavItem(stringResource(R.string.ai_settings), AiIcon.Settings, state.page == AiPage.Settings, {
                                if (state.page != AiPage.Settings) state.openSettings()
                            }, Modifier.weight(1f))
                        }
                    }
                }
            },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                if (!state.loaded) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                } else {
                    when (state.page) {
                        AiPage.Inbox -> PullToRefreshBox(refreshingInbox, ::refreshSessions, Modifier.fillMaxSize()) {
                            AiInbox(state, onDelete = ::confirmDelete, onLoadMore = ::loadMoreSessions)
                        }
                        AiPage.Settings -> AiSettings(
                            state,
                            onTest = { address, key -> scope.launch { state.verifyConnection(address, key) } },
                            onSave = { scope.launch { state.saveConnection() } },
                        )
                        AiPage.Worktree -> AiPicker(state, onRefresh = { reload++ })
                        AiPage.Terminals -> if (terminalApi != null) {
                            val record = selectedTerminal
                            if (record == null) {
                                AiTerminalRecords(terminalApi, foreground, refreshSeconds) { selectedTerminal = it }
                            } else {
                                AiTerminalTranscript(terminalApi, record, state, foreground, refreshSeconds)
                            }
                        }
                        AiPage.Chat -> {
                            val refreshChat: () -> Unit = { scope.launch { state.refreshCurrentChat() } }
                            PullToRefreshBox(state.refreshingChat, refreshChat, Modifier.fillMaxSize()) {
                                AiChat(
                                    state,
                                    onSend = { scope.launch { state.send() } },
                                    onStop = { scope.launch { state.stop() } },
                                    onRefresh = refreshChat,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberAiForeground(): Boolean {
    val owner = LocalView.current.findViewTreeLifecycleOwner()
    var foreground by remember(owner) {
        mutableStateOf(owner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) ?: true)
    }
    DisposableEffect(owner) {
        val lifecycle = owner?.lifecycle
        val observer = LifecycleEventObserver { _, _ ->
            foreground = lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) ?: true
        }
        lifecycle?.addObserver(observer)
        onDispose { lifecycle?.removeObserver(observer) }
    }
    return foreground
}

@Composable
private fun AiInbox(state: HobAiState, onDelete: (AiSession) -> Unit, onLoadMore: () -> Unit) {
    val running = state.sessions.filter(AiSession::running)
    val recent = state.sessions.filterNot(AiSession::running)
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.ai_sessions), fontSize = 25.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp)
                    Text(stringResource(R.string.ai_home_subtitle), color = AiMuted, fontSize = 12.sp, lineHeight = 18.sp)
                }
                HobPrimaryButton(
                    stringResource(R.string.ai_new),
                    { state.newSession() },
                    enabled = state.projects.isNotEmpty() && !state.hasPending,
                    icon = AiIcon.Plus,
                )
            }
            if (state.loadingList) LinearProgressIndicator(Modifier.fillMaxWidth())
            AiFailureText(state.failure ?: state.listFailure)
            if (state.hasPending) {
                TextButton(onClick = state::resumePending) { Text(stringResource(R.string.ai_retry_send)) }
            }
            state.rememberedSessionId?.takeIf { id -> state.sessions.none { it.id == id } }?.let { id ->
                TextButton(onClick = { state.openSession(id) }) { Text(stringResource(R.string.ai_continue_last)) }
            }
            if (!state.loadingList && state.projects.isEmpty() && state.listFailure == null) {
                Text(stringResource(R.string.ai_no_projects), color = AiMuted, fontSize = 13.sp)
            }
        }
        listOf(R.string.ai_running to running, R.string.ai_recent to recent).forEach { (label, sessions) ->
            if (sessions.isNotEmpty()) {
                item(key = "section:$label") { AiListHeading(stringResource(label)) }
                items(sessions, key = { it.id }) { session ->
                    AiSessionRow(session, state.locationLabel(session), { onDelete(session) }, state.busy) {
                        state.openSession(session.id)
                    }
                }
            }
        }
        if (state.sessions.isEmpty() && state.projects.isNotEmpty()) item {
            Text(stringResource(R.string.ai_no_sessions), Modifier.padding(top = 10.dp), color = AiMuted, fontSize = 13.sp)
        }
        if (state.hasMoreSessions) item(key = "more-sessions") {
            AiLoadMore(state.loadingMoreSessions, !state.loadingList, onLoadMore)
        }
    }
}

@Composable
private fun ColumnScope.AiDrawer(
    state: HobAiState,
    projectFirst: Boolean,
    onClose: () -> Unit,
    onNew: (AiProject?) -> Unit,
    onOpen: (String) -> Unit,
    onDelete: (AiSession) -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onSettings: () -> Unit,
) {
    var filter by remember(projectFirst) { mutableStateOf("") }
    val query = filter.trim()
    val scope = rememberCoroutineScope()
    var searchPage by remember(query, state.connection) { mutableStateOf<AiSessionPage?>(null) }
    var loadingSearch by remember(query, state.connection) { mutableStateOf(false) }
    var searchFailure by remember(query, state.connection) { mutableStateOf<AiFailure?>(null) }
    val filtered = if (query.isEmpty()) state.sessions else searchPage?.sessions.orEmpty()

    suspend fun loadSearch(cursor: String? = null) {
        if (loadingSearch) return
        loadingSearch = true
        try {
            val page = state.searchSessions(query, cursor)
            val previous = if (cursor == null) emptyList() else searchPage?.sessions.orEmpty()
            searchPage = page.copy(sessions = (previous + page.sessions).distinctBy(AiSession::id))
            searchFailure = null
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            searchFailure = error.toAiFailure()
        } finally {
            loadingSearch = false
        }
    }

    LaunchedEffect(query, state.connection, state.sessionRemovalCount) {
        if (query.isNotEmpty()) {
            delay(250)
            loadSearch()
        }
    }

    HobTopBar(
        title = stringResource(R.string.ai_threads),
        trailing = {
            HobIconButton(
                AiIcon.Refresh,
                stringResource(R.string.ai_refresh),
                { if (query.isEmpty()) onRefresh() else scope.launch { loadSearch() } },
                enabled = !state.loadingList && !loadingSearch,
            )
            HobIconButton(AiIcon.Close, stringResource(R.string.ai_close), onClose)
        },
    )
    LazyColumn(
        Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        item {
            HobPrimaryButton(
                stringResource(R.string.ai_new), { onNew(null) },
                Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 10.dp),
                enabled = state.projects.isNotEmpty() && !state.hasPending,
                icon = AiIcon.Plus,
            )
            HobField(filter, { filter = it.take(256) }, stringResource(R.string.ai_search))
            if (state.loadingList || loadingSearch) LinearProgressIndicator(Modifier.fillMaxWidth())
            AiFailureText(state.failure ?: searchFailure ?: state.listFailure)
        }
        if (!projectFirst || query.isNotBlank()) {
            val running = filtered.filter(AiSession::running)
            val recent = filtered.filterNot(AiSession::running)
            listOf(R.string.ai_running to running, R.string.ai_recent to recent).forEach { (label, sessions) ->
                if (sessions.isNotEmpty()) {
                    item(key = "drawer-section:$label") { AiListHeading(stringResource(label)) }
                    items(sessions, key = { "recent:" + it.id }) { session ->
                        AiSessionRow(session, state.locationLabel(session), { onDelete(session) }, state.busy) {
                            onOpen(session.id)
                        }
                    }
                }
            }
        }
        item { AiListHeading(stringResource(R.string.ai_by_project)) }
        items(state.projects.filter { project -> project.name.contains(query, true) || filtered.any { it.projectId == project.id } }, key = { it.id }) { project ->
            AiProjectGroup(
                project = project,
                sessions = filtered.filter { it.projectId == project.id },
                locationLabel = state::locationLabel,
                onNew = { onNew(project) },
                onOpen = onOpen,
                onDelete = onDelete,
                busy = state.busy,
                canStart = !state.hasPending,
            )
        }
        if (query.isEmpty() && state.hasMoreSessions) item(key = "more-sessions") {
            AiLoadMore(state.loadingMoreSessions, !state.loadingList, onLoadMore)
        }
        searchPage?.nextCursor?.let { cursor ->
            item(key = "more-search-results") {
                AiLoadMore(loadingSearch, true) { scope.launch { loadSearch(cursor) } }
            }
        }
    }
    HorizontalDivider(color = AiLine)
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(state.connection?.origin.orEmpty(), Modifier.weight(1f), color = AiMuted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        TextButton(onClick = onSettings) { Text(stringResource(R.string.ai_settings)) }
    }
}

@Composable
private fun AiLoadMore(loading: Boolean, enabled: Boolean, onClick: () -> Unit) {
    TextButton(onClick = onClick, enabled = enabled && !loading, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(if (loading) R.string.ai_loading_sessions else R.string.ai_load_more_sessions))
    }
}

@Composable
private fun AiProjectGroup(
    project: AiProject,
    sessions: List<AiSession>,
    locationLabel: (AiSession) -> String?,
    onNew: () -> Unit,
    onOpen: (String) -> Unit,
    onDelete: (AiSession) -> Unit,
    busy: Boolean,
    canStart: Boolean,
) {
    var expanded by remember(project.id) { mutableStateOf(false) }
    val shape = RoundedCornerShape(14.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(Color.White).border(1.dp, AiLine, shape)) {
        AiTargetRow(
            title = project.name,
            detail = stringResource(R.string.ai_session_count, sessions.size),
            icon = AiIcon.Folder,
            trailing = { HobIcon(AiIcon.Next, Modifier.rotate(if (expanded) 90f else 0f), AiMuted) },
            onClick = { expanded = !expanded },
        )
        if (expanded) {
            HorizontalDivider(color = AiLine)
            sessions.forEach { session ->
                AiSessionRow(session, locationLabel(session), { onDelete(session) }, busy) { onOpen(session.id) }
            }
            TextButton(onClick = onNew, enabled = canStart) { Text(stringResource(R.string.ai_new_in_project)) }
        }
    }
}

@Composable
private fun AiListHeading(value: String) {
    Text(value, Modifier.padding(top = 14.dp, bottom = 3.dp), color = AiMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
}

private fun AiProvider.mark() = if (this == AiProvider.Codex) "C" else "✳︎"

@Composable
private fun AiSessionRow(
    session: AiSession,
    location: String?,
    onDelete: () -> Unit,
    busy: Boolean,
    onClick: () -> Unit,
) {
    val time = remember(session.updatedAt) {
        runCatching {
            DateUtils.getRelativeTimeSpanString(
                Instant.parse(session.updatedAt).toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS,
            ).toString()
        }.getOrDefault("")
    }
    val shape = RoundedCornerShape(if (session.running) 14.dp else 10.dp)
    val outline = if (session.running) Modifier.border(1.dp, Color(0xFFCDE5D9), shape) else Modifier
    Column {
        Column(
            Modifier.fillMaxWidth().clip(shape).then(outline)
                .background(if (session.running) AiRunningSurface else Color.Transparent),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.weight(1f).heightIn(min = 65.dp)
                        .clickable(enabled = !busy, role = Role.Button, onClick = onClick)
                        .padding(horizontal = if (session.running) 10.dp else 5.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    HobMark(session.provider.mark(), running = session.running)
                    Column(Modifier.weight(1f)) {
                        Text(session.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(location ?: session.provider.label, color = AiMuted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (session.running) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            HobStatusDot()
                            Text(stringResource(R.string.ai_running), color = AiRunningInk, fontSize = 11.sp)
                        }
                    } else Text(time, color = AiMuted, fontSize = 11.sp)
                }
                HobIconButton(
                    AiIcon.Delete, stringResource(R.string.ai_delete_session), onDelete,
                    enabled = !busy,
                )
            }
            Text(
                stringResource(R.string.ai_session_id_value, session.id),
                modifier = Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
                color = AiMuted, fontFamily = FontFamily.Monospace, fontSize = 10.sp,
            )
        }
        if (!session.running) HorizontalDivider(color = AiLine)
    }
}

@Composable
private fun AiSettings(state: HobAiState, onTest: (String, String) -> Unit, onSave: () -> Unit) {
    val context = LocalContext.current
    var address by remember(state.connection) { mutableStateOf(state.connection?.origin.orEmpty()) }
    var key by remember { mutableStateOf("") }
    val needsLanPermission = Build.VERSION.SDK_INT >= 37 &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_LOCAL_NETWORK) != PackageManager.PERMISSION_GRANTED
    val requestLan = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) onTest(address, key) else state.denyLanPermission()
    }
    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            item {
                AiRefreshSetting(state.refreshInterval, state::changeRefreshInterval)
            }
            item {
                AiListHeading(stringResource(R.string.ai_connection_short))
                state.connection?.let { connected ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = 16.dp)
                            .clip(RoundedCornerShape(12.dp)).background(AiRunningSurface).padding(10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        HobStatusDot()
                        Text(connected.origin, color = AiRunningInk, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    }
                }
                Text(stringResource(R.string.ai_setup_hint), Modifier.padding(top = 14.dp), color = AiMuted, fontSize = 12.sp)
            }
            item {
                val label = stringResource(R.string.ai_address)
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    HobField(
                        address, { address = it; state.editConnection() }, "https://hob.example.com", label,
                        enabled = !state.busy,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    )
                }
            }
            item {
                val label = stringResource(R.string.ai_access_key)
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    HobField(
                        key, { key = it; state.editConnection() }, "", label,
                        enabled = !state.busy,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        visualTransformation = PasswordVisualTransformation(),
                    )
                    if (state.connection != null) Text(stringResource(R.string.ai_key_unchanged), color = AiMuted, fontSize = 11.sp)
                }
            }
            item {
                AiFailureText(state.failure)
                if (needsLanPermission && state.failure in listOf(AiFailure.Network, AiFailure.LanPermission)) {
                    TextButton(onClick = { requestLan.launch(Manifest.permission.ACCESS_LOCAL_NETWORK) }) {
                        Text(stringResource(R.string.ai_allow_lan))
                    }
                }
                if (state.verified != null) Text(stringResource(R.string.ai_verified), color = AiRunningInk, fontSize = 13.sp)
                if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            }
        }
        HorizontalDivider(color = AiLine)
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(
                onClick = {
                    if (needsLanPermission && aiServerOrigin(address)?.let(::isAiLanAddress) == true) {
                        requestLan.launch(Manifest.permission.ACCESS_LOCAL_NETWORK)
                    } else onTest(address, key)
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
                enabled = !state.busy,
                shape = RoundedCornerShape(13.dp),
            ) { Text(stringResource(R.string.ai_test_connection), fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
            HobPrimaryButton(
                stringResource(R.string.ai_save_connection), onSave, Modifier.fillMaxWidth(),
                enabled = !state.busy && state.verified != null,
            )
        }
    }
}

@Composable
private fun AiRefreshSetting(current: AiRefreshInterval, onChange: (AiRefreshInterval) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().padding(top = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.ai_refresh_interval), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Box {
            OutlinedButton(onClick = { expanded = true }) { Text(refreshIntervalLabel(current)) }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                AiRefreshInterval.entries.forEach { interval ->
                    DropdownMenuItem(text = { Text(refreshIntervalLabel(interval)) }, onClick = {
                        expanded = false
                        onChange(interval)
                    })
                }
            }
        }
    }
}

@Composable
private fun refreshIntervalLabel(interval: AiRefreshInterval): String =
    if (interval == AiRefreshInterval.Manual) stringResource(R.string.ai_refresh_manual)
    else stringResource(R.string.ai_refresh_seconds, interval.seconds)

@Composable
private fun AiPicker(state: HobAiState, onRefresh: () -> Unit) {
    val project = state.project
    val subworkspace = state.subworkspace
    var filter by remember(project, subworkspace?.id) { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 15.dp, vertical = 12.dp)) {
            HobField(filter, { filter = it }, stringResource(if (project == null) R.string.ai_search_project else R.string.ai_search_targets))
            AiFailureText(state.failure)
            if (state.failure != null) TextButton(onClick = onRefresh) { Text(stringResource(R.string.ai_refresh)) }
            if (project != null) {
                Row(
                    Modifier.height(44.dp).clickable(role = Role.Button) {
                        if (subworkspace != null) state.selectSubworkspace(null) else state.selectProject(null)
                    },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    HobIcon(AiIcon.Back, tint = AiAccent)
                    Text(if (subworkspace == null) stringResource(R.string.ai_all_projects) else project.name, color = AiAccent, fontSize = 13.sp)
                }
                AiListHeading(subworkspace?.name ?: project.name)
            } else AiListHeading(stringResource(R.string.ai_choose_project))
        }
        LazyColumn(
            Modifier.fillMaxWidth().weight(1f).padding(horizontal = 15.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            if (project == null) {
                items(state.projects.filter { it.name.contains(filter, true) }, key = { it.id }) { item ->
                    AiTargetRow(item.name, null, AiIcon.Folder, trailing = { HobIcon(AiIcon.Next, tint = AiMuted) }) {
                        state.selectProject(item)
                    }
                }
            } else {
                if (!state.targetsLoaded && state.failure == null) item {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                }
                items(state.worktrees.filter { it.name.contains(filter, true) || it.branch?.contains(filter, true) == true }, key = { it.id }) { target ->
                    AiTargetRow(
                        target.name,
                        target.branch ?: stringResource(
                            if (target.primary || target.id == subworkspace?.root?.id) R.string.ai_root_directory else R.string.ai_detached,
                        ),
                        AiIcon.Branch,
                        state.worktree == target,
                        trailing = { if (state.worktree == target) HobIcon(AiIcon.Check, tint = AiAccent) },
                    ) { state.worktree = target }
                }
                if (subworkspace == null) {
                    val groups = state.subworkspaces.filter { it.name.contains(filter, true) }
                    if (groups.isNotEmpty()) item(key = "subworkspace-heading") {
                        AiListHeading(stringResource(R.string.ai_subworkspaces))
                    }
                    items(groups, key = { "subworkspace:" + it.id }) { group ->
                        AiTargetRow(
                            group.name,
                            if (group.targets.isEmpty()) stringResource(R.string.ai_unavailable_target) else null,
                            AiIcon.Folder,
                            trailing = { HobIcon(AiIcon.Next, tint = AiMuted) },
                        ) { state.selectSubworkspace(group) }
                    }
                } else if (subworkspace.targets.isEmpty()) item {
                    Text(stringResource(R.string.ai_unavailable_target), color = AiMuted, fontSize = 13.sp)
                }
            }
        }
        HorizontalDivider(color = AiLine)
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            state.worktree?.let {
                Text(listOfNotNull(project?.name, subworkspace?.name, it.name).distinct().joinToString(" / "), color = AiAccent, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.ai_provider), color = AiMuted, fontSize = 12.sp)
                AiProvider.entries.forEach { provider ->
                    val selected = state.provider == provider
                    val shape = RoundedCornerShape(11.dp)
                    Box(
                        Modifier.height(37.dp).clip(shape)
                            .background(if (selected) AiAccentSoft else Color.White)
                            .border(1.dp, AiLine, shape)
                            .selectable(selected, role = Role.RadioButton) { state.provider = provider }
                            .padding(horizontal = 11.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(provider.label, color = if (selected) AiAccent else MaterialTheme.colorScheme.onSurface, fontSize = 12.sp)
                    }
                }
            }
            HobPrimaryButton(stringResource(R.string.ai_start), state::confirmWorktree, Modifier.fillMaxWidth(), enabled = state.worktree != null)
        }
    }
}

@Composable
private fun AiTargetRow(
    title: String,
    detail: String?,
    icon: AiIcon,
    selected: Boolean = false,
    trailing: @Composable () -> Unit,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(11.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 57.dp).clip(shape)
            .background(if (selected) AiAccentSoft else Color.Transparent)
            .clickable(role = Role.Button, onClick = onClick).padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(33.dp).clip(RoundedCornerShape(9.dp)).background(AiAccentSoft), contentAlignment = Alignment.Center) {
            HobIcon(icon, tint = AiAccent)
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            detail?.let { Text(it, color = AiMuted, fontSize = 11.sp, fontFamily = if (icon == AiIcon.Branch) FontFamily.Monospace else FontFamily.Default) }
        }
        trailing()
    }
}

@Composable
private fun AiChat(state: HobAiState, onSend: () -> Unit, onStop: () -> Unit, onRefresh: () -> Unit) {
    val session = state.session
    val pending = state.pendingPrompt
    val provider = session?.provider ?: state.selection?.provider
    val project = state.selection?.project?.name ?: state.projectName(session?.projectId)
    val location = state.location
    val messages = session?.messages.orEmpty()
    val turn = session?.turn
    val separateTurn = turn?.takeIf { it.state != "completed" || messages.lastOrNull()?.role != "assistant" }
    val listState = rememberLazyListState()
    var oldCount by remember(state.activeId) { mutableIntStateOf(0) }
    var unseen by remember(state.activeId) { mutableStateOf(false) }
    val count = messages.size + if (pending != null) 1 else 0
    val scrollScope = rememberCoroutineScope()
    LaunchedEffect(state.activeId, count) {
        val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
        if (count > 0 && (oldCount <= 1 || lastVisible >= oldCount - 1)) {
            listState.scrollToItem(count - 1)
            unseen = false
        } else if (count > oldCount) unseen = true
        oldCount = count
    }
    Column(Modifier.fillMaxSize()) {
        AiContextStrip(project, state.locationGroup, location)
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            state = listState,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            itemsIndexed(messages) { index, message ->
                val completed = turn?.takeIf { it.state == "completed" && index == messages.lastIndex }
                AiMessageRow(message, provider, completed)
            }
            if (pending != null) item { AiMessageRow(AiMessage("user", pending), provider) }
            if (state.running && turn?.state != "working") item {
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                    HobStatusDot()
                    Text(stringResource(R.string.ai_running), color = AiRunningInk, fontSize = 12.sp)
                }
            }
            if (separateTurn != null) item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    AiSpeaker(provider)
                    if (separateTurn.state == "working") {
                        Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                            HobStatusDot()
                            Text(stringResource(R.string.ai_running), color = AiRunningInk, fontSize = 12.sp)
                        }
                    }
                    AiTurnRecord(separateTurn)
                }
            }
            if (count == 0 && separateTurn == null && state.failure == null) item {
                Column(Modifier.fillMaxWidth().padding(top = 50.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    HobMark("H", 47)
                    Text(
                        stringResource(when {
                            state.activeId == null -> R.string.ai_chat_empty
                            state.chatHistoryLoaded -> R.string.ai_no_messages
                            else -> R.string.ai_loading_session
                        }),
                        Modifier.padding(top = 9.dp), fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                    )
                    if (state.activeId == null) Text(stringResource(R.string.ai_prompt_hint), color = AiMuted, fontSize = 13.sp)
                }
            }
        }
        if (unseen) TextButton(onClick = {
            scrollScope.launch { if (count > 0) listState.scrollToItem(count - 1) }
            unseen = false
        }) { Text(stringResource(R.string.ai_show_new)) }
        if (state.failure != null) {
            Column(Modifier.padding(horizontal = 12.dp)) {
                AiFailureText(state.failure)
                if (state.activeId != null && pending == null) {
                    TextButton(onClick = onRefresh) { Text(stringResource(R.string.ai_refresh)) }
                }
            }
        }
        HorizontalDivider(color = AiLine)
        AiComposer(state, provider, onSend, onStop)
    }
}

@Composable
private fun AiContextStrip(project: String?, subworkspace: String?, worktree: AiWorktree?) {
    val shape = RoundedCornerShape(topStart = 5.dp, bottomStart = 5.dp, topEnd = 11.dp, bottomEnd = 11.dp)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp)
            .heightIn(min = 49.dp).clip(shape).background(Color(0xFFF2EFFD))
            .border(1.dp, Color(0xFFDEDAF4), shape),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(3.dp).height(49.dp).background(Color(0xFF796BC7)))
        Row(
            Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HobIcon(AiIcon.Branch, tint = AiAccent)
            Column {
                Text(
                    listOfNotNull(project, subworkspace, worktree?.name).distinct().joinToString(" / ")
                        .ifBlank { stringResource(R.string.ai_worktree_details) },
                    color = AiAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                worktree?.let {
                    Text(it.branch ?: stringResource(if (it.primary) R.string.ai_root_directory else R.string.ai_detached), color = AiMuted, fontFamily = FontFamily.Monospace, fontSize = 10.sp)
                }
            }
        }
    }
}

@Composable
private fun AiComposer(state: HobAiState, provider: AiProvider?, onSend: () -> Unit, onStop: () -> Unit) {
    val run = state.running
    val retry = state.pendingPrompt != null
    val label = stringResource(
        if (run) R.string.ai_stop else if (retry) R.string.ai_retry_send else R.string.ai_send,
    )
    val session = state.session
    val terminalActive = session?.terminalActive == true
    val enabled = !state.busy && if (run) !terminalActive else session?.canSend != false && session?.status != "closed" &&
        (retry || (state.draft.isNotBlank() && state.draft.length <= 64 * 1024 && (session != null || state.selection != null)))
    val shape = RoundedCornerShape(15.dp)
    val placeholder = if (provider == null) stringResource(R.string.ai_message) else stringResource(R.string.ai_message_to, provider.label)
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(shape).background(Color.White).border(1.dp, Color(0xFFDCDBEA), shape).padding(5.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            BasicTextField(
                state.draft,
                { state.draft = it },
                modifier = Modifier.weight(1f).semantics { contentDescription = placeholder },
                enabled = !retry,
                maxLines = 4,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = SolidColor(AiAccent),
                decorationBox = { field ->
                    Box(Modifier.heightIn(min = 42.dp).padding(horizontal = 8.dp, vertical = 8.dp), contentAlignment = Alignment.CenterStart) {
                        if (state.draft.isEmpty()) Text(placeholder, color = AiMuted, fontSize = 14.sp)
                        field()
                    }
                },
            )
            HobIconButton(
                if (run) AiIcon.Stop else AiIcon.Send, label, if (run) onStop else onSend,
                enabled = enabled,
                background = if (run) AiAccentSoft else AiAccent.copy(alpha = if (enabled) 1f else .45f),
                tint = if (run) AiAccent else Color.White,
            )
        }
        val note = when {
            session?.nativeCodex == true && terminalActive -> R.string.ai_native_terminal_connected
            session?.nativeCodex == true -> R.string.ai_native_terminal_unavailable
            terminalActive -> R.string.ai_desktop_terminal_active
            retry -> R.string.ai_retry_note
            run -> R.string.ai_running_draft
            else -> null
        }
        note?.let { Text(stringResource(it), Modifier.padding(top = 4.dp, start = 3.dp), color = AiMuted, fontSize = 10.sp, lineHeight = 15.sp) }
    }
}

@Composable
private fun AiSpeaker(provider: AiProvider?) {
    Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
        HobMark(provider?.mark() ?: "H", 23)
        Text(provider?.label ?: stringResource(R.string.ai_app_name), color = AiMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AiMessageRow(message: AiMessage, provider: AiProvider?, turn: AiTurn? = null) {
    if (message.role == "user") {
        BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            val shape = RoundedCornerShape(topStart = 15.dp, topEnd = 15.dp, bottomStart = 15.dp, bottomEnd = 4.dp)
            Surface(Modifier.widthIn(max = maxWidth * .83f), shape = shape, color = Color(0xFFE9E6FB)) {
                Text(message.content, Modifier.padding(horizontal = 13.dp, vertical = 9.dp), style = MaterialTheme.typography.bodyMedium)
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            AiSpeaker(provider)
            turn?.let { AiTurnRecord(it) }
            AiMarkdown(message.content)
        }
    }
}

@Composable
private fun AiTurnRecord(turn: AiTurn) {
    var expanded by remember(turn.requestId) { mutableStateOf(false) }
    val status = when (turn.state) {
        "working" -> R.string.ai_running
        "completed" -> R.string.ai_turn_completed
        "cancelled" -> R.string.ai_stopped
        else -> R.string.ai_turn_failed
    }
    val shape = RoundedCornerShape(11.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(Color.White).border(1.dp, AiLine, shape)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 43.dp).clickable(role = Role.Button) { expanded = !expanded }.padding(9.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(when (turn.state) {
                    "working" -> R.string.ai_progress
                    "completed" -> R.string.ai_activity
                    else -> status
                }),
                fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            )
            HobIcon(AiIcon.Next, Modifier.rotate(if (expanded) 90f else 0f), AiMuted)
        }
        if (expanded) {
            HorizontalDivider(color = AiLine)
            Text(stringResource(status), Modifier.padding(10.dp), color = AiMuted, fontSize = 12.sp)
        }
    }
}

@Composable
internal fun AiFailureText(failure: AiFailure?) {
    val resource = when (failure) {
        AiFailure.Address -> R.string.ai_error_address
        AiFailure.Key -> R.string.ai_error_key
        AiFailure.Unauthorized -> R.string.ai_error_unauthorized
        AiFailure.Network -> R.string.ai_error_network
        AiFailure.LanPermission -> R.string.ai_error_lan
        AiFailure.Unavailable -> R.string.ai_error_unavailable
        AiFailure.Missing -> R.string.ai_error_missing
        AiFailure.Busy -> R.string.ai_error_busy
        AiFailure.TerminalActive -> R.string.ai_desktop_terminal_active
        AiFailure.NativeUnavailable -> R.string.ai_native_terminal_unavailable
        AiFailure.NativeDeliveryUnknown -> R.string.ai_native_delivery_unknown
        AiFailure.SessionChanged -> R.string.ai_session_changed
        AiFailure.ServerUpdate -> R.string.ai_session_paging_unavailable
        AiFailure.Rejected -> R.string.ai_error_rejected
        AiFailure.Storage -> R.string.ai_error_storage
        null -> return
    }
    Text(stringResource(resource), Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.error)
}
