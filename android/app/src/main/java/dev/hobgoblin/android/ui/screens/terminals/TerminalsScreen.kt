package dev.hobgoblin.android.ui.screens.terminals

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

internal fun terminalOverviewTitle(session: TerminalSessionRecord): String =
    session.displayName.ifBlank {
        session.terminalId?.let { "terminal-$it" } ?: "Host terminal"
    }

internal fun terminalOverviewContext(session: TerminalSessionRecord): String = session.targetLabel

internal fun terminalOverviewStatus(session: TerminalSessionRecord): String = session.status.name.lowercase()

@Composable
fun TerminalsScreen(
    sessions: List<TerminalSessionRecord>,
    onOpenTerminalSession: (TerminalSessionRecord) -> Unit,
) {
    val orderedSessions = terminalOverviewOrderedSessions(sessions)
    if (orderedSessions.isEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(HobgoblinSpacing.Md),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                "No terminals",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Existing Host and Project terminal sessions will appear here.",
                modifier = Modifier.padding(top = HobgoblinSpacing.Sm),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(HobgoblinSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        items(orderedSessions, key = { it.id }) { session ->
            TerminalOverviewRow(
                session = session,
                onOpen = { onOpenTerminalSession(session) },
            )
        }
    }
}

@Composable
private fun TerminalOverviewRow(
    session: TerminalSessionRecord,
    onOpen: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
    ) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    terminalOverviewTitle(session),
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    terminalOverviewStatus(session),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                terminalOverviewContext(session),
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            TerminalSessionIdentityDetails(session = session)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onOpen) {
                    Text("Open")
                }
            }
        }
    }
}
