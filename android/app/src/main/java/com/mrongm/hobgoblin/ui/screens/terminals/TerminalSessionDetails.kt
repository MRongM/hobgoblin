package com.mrongm.hobgoblin.ui.screens.terminals

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.ui.text.LocalizedText
import com.mrongm.hobgoblin.ui.text.resolve

internal fun terminalSessionIdentityText(session: TerminalSessionRecord): LocalizedText = LocalizedText(
    R.string.terminal_session_identity,
    listOf(
        LocalizedText(
            if (terminalSessionIsTmuxBacked(session)) R.string.terminal_kind_tmux else R.string.terminal_kind_native,
        ),
        session.id.take(8),
    ),
)

internal fun terminalSessionTmuxSessionName(session: TerminalSessionRecord): String? =
    session.tmuxIdentity?.sessionName ?: session.tmuxSessionTarget?.sessionName

internal fun terminalSessionIsTmuxBacked(session: TerminalSessionRecord): Boolean =
    session.tmuxIdentity != null || session.tmuxSessionTarget != null

@Composable
internal fun TerminalSessionIdentityDetails(session: TerminalSessionRecord) {
    Text(
        terminalSessionIdentityText(session).resolve(),
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = FontFamily.Monospace,
    )
    terminalSessionTmuxSessionName(session)?.let { sessionName ->
        Text(
            LocalizedText(R.string.terminal_tmux_session_name, listOf(sessionName)).resolve(),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = FontFamily.Monospace,
        )
    }
}
