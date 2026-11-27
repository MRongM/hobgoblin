package com.mrongm.hobgoblin.ai.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mrongm.hobgoblin.ai.R
import com.mrongm.hobgoblin.ai.data.AiApiException
import com.mrongm.hobgoblin.ai.data.AiProvider
import com.mrongm.hobgoblin.ai.data.AiSession
import com.mrongm.hobgoblin.ai.data.AiTerminalRecord
import com.mrongm.hobgoblin.ai.data.AiTranscriptLine
import com.mrongm.hobgoblin.ai.data.HobAiClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.text.DateFormat
import java.time.Instant
import java.util.Date
import java.util.UUID

private const val MaxTranscriptLines = 20_000
private val TranscriptBackground = Color(0xFF191C2C)
private val TranscriptText = Color(0xFFE5E8F4)
private val TranscriptCommand = Color(0xFFBCCBFF)
private val TranscriptWarning = Color(0xFFFFD59D)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AiTerminalRecords(
    api: HobAiClient,
    foreground: Boolean,
    refreshSeconds: Int,
    onOpen: (AiTerminalRecord) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val lock = remember { Mutex() }
    var records by remember { mutableStateOf<List<AiTerminalRecord>>(emptyList()) }
    var cursor by remember { mutableStateOf<Long?>(null) }
    var loadedOlder by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<AiFailure?>(null) }

    suspend fun load(manual: Boolean = false, older: Boolean = false) = lock.withLock {
        val pageCursor = if (older) cursor ?: return@withLock else null
        refreshing = manual || older
        try {
            val result = api.terminalRecords(pageCursor)
            if (older) {
                records = (records + result.records).distinctBy(AiTerminalRecord::id)
                cursor = result.nextCursor
                loadedOlder = true
            } else if (manual || !loadedOlder || result.nextCursor == null) {
                records = result.records
                cursor = result.nextCursor
                loadedOlder = false
            } else {
                records = (result.records + records).distinctBy(AiTerminalRecord::id)
            }
            loaded = true
            failure = null
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            failure = error.toAiFailure()
        } finally {
            refreshing = false
        }
    }

    LaunchedEffect(api, foreground, refreshSeconds) {
        if (!foreground) return@LaunchedEffect
        load()
        while (refreshSeconds > 0) {
            delay(refreshSeconds * 1_000L)
            load()
        }
    }
    val refresh: () -> Unit = { if (!refreshing) scope.launch { load(manual = true) } }
    PullToRefreshBox(refreshing, refresh, Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 18.dp)) {
            if (failure != null) item {
                AiFailureText(failure)
                TextButton(onClick = refresh) { Text(stringResource(R.string.ai_refresh)) }
            }
            if (records.isEmpty() && failure == null) item {
                Text(
                    stringResource(if (loaded) R.string.ai_terminals_empty else R.string.ai_terminal_records_loading),
                    Modifier.padding(vertical = 20.dp), color = AiMuted,
                )
            }
            items(records, key = AiTerminalRecord::id) { terminal ->
                val opened = remember(terminal.createdAt) {
                    runCatching {
                        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM)
                            .format(Date.from(Instant.parse(terminal.createdAt)))
                    }.getOrNull()
                }
                Row(
                    Modifier.fillMaxWidth().clickable { onOpen(terminal) }.padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(terminal.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
                        Text(terminal.cwd, color = AiMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(listOfNotNull(terminal.provider?.label, opened).joinToString(" · "), color = AiMuted, fontSize = 12.sp)
                    }
                    Text(
                        stringResource(when (terminal.phase) {
                            "open" -> R.string.ai_running
                            "opening", "restarting" -> R.string.ai_terminal_starting
                            "error" -> R.string.ai_terminal_failed
                            "interrupted" -> R.string.ai_terminal_interrupted
                            else -> R.string.ai_terminal_exited
                        }),
                        color = if (terminal.phase == "open") AiRunningInk else AiMuted,
                        fontSize = 12.sp,
                    )
                }
                HorizontalDivider(color = AiLine)
            }
            if (cursor != null) item {
                TextButton(onClick = { scope.launch { load(older = true) } }, enabled = !refreshing) {
                    Text(stringResource(R.string.ai_terminals_more))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AiTerminalTranscript(
    api: HobAiClient,
    record: AiTerminalRecord,
    state: HobAiState,
    foreground: Boolean,
    refreshSeconds: Int,
) {
    val scope = rememberCoroutineScope()
    val lock = remember { Mutex() }
    val list = rememberLazyListState()
    var lines by remember { mutableStateOf<List<AiTranscriptLine>>(emptyList()) }
    var tail by remember { mutableStateOf<AiTranscriptLine?>(null) }
    var cursor by remember { mutableStateOf(state.terminalCursor(record.id)) }
    var moreOlder by remember { mutableStateOf(false) }
    var moreNewer by remember { mutableStateOf(false) }
    var gap by remember { mutableStateOf(false) }
    var initialized by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<AiFailure?>(null) }
    var inputRefresh by remember { mutableStateOf(0) }
    var linkRefresh by remember { mutableStateOf(0) }

    fun merge(newLines: List<AiTranscriptLine>, older: Boolean) {
        if (newLines.isEmpty()) return
        val merged = if (older) newLines + lines else lines + newLines
        lines = if (merged.size > MaxTranscriptLines) merged.takeLast(MaxTranscriptLines) else merged
    }

    suspend fun sync(manual: Boolean = false, older: Boolean = false) = lock.withLock {
        refreshing = manual || older
        try {
            if (older) {
                val first = lines.firstOrNull() ?: return@withLock
                val page = api.terminalTranscript(record.id, beforeSeq = first.seq)
                merge(page.lines, older = true)
                moreOlder = page.hasMoreBefore
                gap = gap || page.gap
            } else {
                val follow = list.firstVisibleItemIndex <= 1
                val needsDelta = initialized || cursor > 0L
                if (!initialized) {
                    val page = api.terminalTranscript(record.id, beforeSeq = cursor.takeIf { it > 0 }?.plus(1))
                    lines = page.lines
                    moreOlder = page.hasMoreBefore
                    gap = page.gap
                    tail = page.tail
                    if (cursor == 0L) {
                        cursor = page.nextAfterSeq
                        state.rememberTerminalCursor(record.id, cursor)
                    }
                    initialized = true
                }
                if (needsDelta) {
                    var remaining = 4
                    do {
                        val page = api.terminalTranscript(record.id, afterSeq = cursor)
                        if (page.gap && lines.isNotEmpty()) {
                            lines = emptyList()
                            moreOlder = false
                        }
                        if (lines.isEmpty()) moreOlder = page.hasMoreBefore
                        merge(page.lines, older = false)
                        tail = page.tail
                        moreNewer = page.hasMoreAfter
                        gap = gap || page.gap
                        if (page.nextAfterSeq != cursor) {
                            cursor = page.nextAfterSeq
                            state.rememberTerminalCursor(record.id, cursor)
                        }
                    } while (moreNewer && --remaining > 0)
                }
                if (follow && (lines.isNotEmpty() || tail != null)) list.requestScrollToItem(0)
            }
            failure = null
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            failure = error.toAiFailure()
        } finally {
            refreshing = false
        }
    }

    LaunchedEffect(api, foreground, refreshSeconds, inputRefresh) {
        if (!foreground) return@LaunchedEffect
        sync()
        while (refreshSeconds > 0) {
            delay(refreshSeconds * 1_000L)
            sync()
        }
    }
    val refresh: () -> Unit = {
        if (!refreshing) {
            linkRefresh++
            scope.launch { sync(manual = true) }
        }
    }
    PullToRefreshBox(refreshing, refresh, Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().background(AiPaper).padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                if (moreOlder && lines.size < MaxTranscriptLines) TextButton(
                    onClick = { scope.launch { sync(older = true) } }, enabled = !refreshing,
                ) {
                    Text(stringResource(R.string.ai_transcript_older))
                }
                TextButton(onClick = refresh, enabled = !refreshing) {
                    Text(stringResource(if (moreNewer) R.string.ai_transcript_continue else R.string.ai_refresh))
                }
            }
            HorizontalDivider(color = AiLine)
            if (failure != null) Column(Modifier.padding(horizontal = 16.dp)) { AiFailureText(failure) }
            if (gap) Text(
                stringResource(R.string.ai_transcript_gap), Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                color = AiMuted, fontSize = 12.sp,
            )
            if (lines.isEmpty() && tail == null && failure == null) Text(
                stringResource(if (initialized) R.string.ai_transcript_empty else R.string.ai_terminals_loading),
                Modifier.padding(16.dp), color = AiMuted,
            )
            SelectionContainer(
                Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                    .clip(RoundedCornerShape(12.dp)).background(TranscriptBackground),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    state = list,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                    reverseLayout = true,
                ) {
                    tail?.let { item(key = 0L) { TranscriptLine(it) } }
                    items(lines.asReversed(), key = AiTranscriptLine::seq) { TranscriptLine(it) }
                }
            }
            if (record.phase == "open") {
                AiLinkedTerminalActions(api, record, foreground, refreshSeconds, linkRefresh) { inputRefresh++ }
            }
        }
    }
}

@Composable
private fun AiLinkedTerminalActions(
    api: HobAiClient,
    record: AiTerminalRecord,
    foreground: Boolean,
    refreshSeconds: Int,
    refreshRequest: Int,
    onInput: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var linked by remember { mutableStateOf<AiSession?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var hadLink by remember { mutableStateOf(false) }
    var attaching by remember { mutableStateOf(false) }
    var provider by remember { mutableStateOf(record.provider ?: AiProvider.Codex) }
    var threadId by remember { mutableStateOf("") }
    var draft by remember { mutableStateOf("") }
    var pending by remember { mutableStateOf<Pair<String, String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<AiFailure?>(null) }
    var linkFailure by remember { mutableStateOf<AiFailure?>(null) }

    suspend fun refreshLink() {
        if (busy || attaching) return
        try {
            val result = api.linkedTerminalSession(record.id)
            if (busy || attaching) return
            if (linked?.id != result?.id) pending = null
            linked = result
            hadLink = hadLink || result != null
            loaded = true
            linkFailure = null
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            linkFailure = error.toAiFailure()
        }
    }

    LaunchedEffect(api, record.id, foreground, refreshSeconds, refreshRequest) {
        if (!foreground) return@LaunchedEffect
        refreshLink()
        while (refreshSeconds > 0) {
            delay(refreshSeconds * 1_000L)
            refreshLink()
        }
    }

    fun submit(data: String) {
        val session = linked ?: return
        if (busy) return
        val attempt = pending?.takeIf { it.second == data } ?: (UUID.randomUUID().toString() to data)
        pending = attempt
        busy = true
        scope.launch {
            try {
                api.writeTerminalSession(session.id, attempt.first, attempt.second)
                if (data != "\u0003") draft = ""
                pending = null
                failure = null
                onInput()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                if (error is AiApiException && error.status < 500) pending = null
                if (error is AiApiException && error.code in setOf("session_unavailable", "session_not_found")) {
                    linked = null
                }
                failure = error.toAiFailure()
            } finally {
                busy = false
            }
        }
    }

    HorizontalDivider(color = AiLine)
    Column(Modifier.fillMaxWidth().background(AiPaper).padding(horizontal = 12.dp, vertical = 6.dp)) {
        AiFailureText(failure ?: linkFailure)
        if (linked != null) {
            OutlinedTextField(
                draft, { draft = it }, Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.ai_terminal_input)) }, singleLine = true, enabled = !busy,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { submit("\u0003") }, enabled = !busy) { Text("Ctrl+C") }
                if (linked?.provider == AiProvider.Codex && linked?.nativeCodex != true) {
                    TextButton(onClick = { attaching = true }, enabled = !busy) {
                        Text(stringResource(R.string.ai_terminal_link_history))
                    }
                }
                TextButton(onClick = { submit("$draft\r") }, enabled = !busy && draft.isNotBlank()) {
                    Text(stringResource(R.string.ai_send))
                }
            }
        } else if (hadLink) {
            Text(stringResource(R.string.ai_terminal_link_inactive), color = AiMuted, fontSize = 12.sp)
        } else if (loaded && linkFailure == null) {
            TextButton(onClick = { attaching = true }) { Text(stringResource(R.string.ai_terminal_attach)) }
        }
    }
    val linkingHistory = linked?.provider == AiProvider.Codex
    val threadProvided = threadId.trim().isNotEmpty()
    val threadValid = terminalThreadId.matches(threadId.trim())
    if (attaching) AlertDialog(
        onDismissRequest = { if (!busy) attaching = false },
        title = { Text(stringResource(R.string.ai_terminal_attach)) },
        text = {
            Column {
                Row {
                    (linked?.provider?.let(::listOf) ?: AiProvider.entries).forEach { candidate ->
                        TextButton(onClick = { provider = candidate }, enabled = !busy && candidate != provider) {
                            Text(candidate.label)
                        }
                    }
                }
                if (provider == AiProvider.Codex) OutlinedTextField(
                    threadId, { threadId = it },
                    label = { Text(stringResource(
                        if (linkingHistory) R.string.ai_terminal_required_thread_id else R.string.ai_terminal_thread_id,
                    )) }, singleLine = true, enabled = !busy, isError = threadProvided && !threadValid,
                )
                AiFailureText(failure)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                busy = true
                scope.launch {
                    try {
                        val thread = threadId.trim().takeIf { provider == AiProvider.Codex && it.isNotEmpty() }
                        linked = api.attachTerminal(record.id, provider, thread)
                        hadLink = true
                        attaching = false
                        failure = null
                        linkFailure = null
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        failure = error.toAiFailure()
                    } finally {
                        busy = false
                    }
                }
            }, enabled = !busy && (provider != AiProvider.Codex || (!linkingHistory && !threadProvided) || threadValid)) {
                Text(stringResource(R.string.ai_terminal_attach))
            }
        },
        dismissButton = {
            TextButton(onClick = { attaching = false }, enabled = !busy) { Text(stringResource(R.string.ai_cancel)) }
        },
    )
}

private val terminalThreadId = Regex("^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")

@Composable
private fun TranscriptLine(line: AiTranscriptLine) {
    val missing = line.text == null
    val text = line.text ?: stringResource(R.string.ai_transcript_gap)
    val content = text.trimStart()
    val color = when {
        missing -> TranscriptWarning
        content.startsWith("$ ") || content.startsWith("> ") || content.startsWith("• Ran ") -> TranscriptCommand
        else -> TranscriptText
    }
    Text(
        if (line.truncated && !missing) "$text …" else text.ifEmpty { " " },
        color = color,
        fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 18.sp,
    )
}
