package dev.hobgoblin.android.ui.screens.placeholders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

fun localTerminalPlaceholderText(): String =
    "Android-local terminal and local Git are deferred from v1; use SSH terminals for emergency work."

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiagnosticsPlaceholderScreen(
    hostId: String,
    onBack: () -> Unit,
    onOpenTerminal: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Host diagnostics") },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            Text("Host $hostId")
            Button(onClick = onOpenTerminal) {
                Text("Open terminal")
            }
            Text("Run diagnostics")
            Text("SSH")
            Text("Shell")
            Text("Git")
            Text("Path")
            Text("Repo")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalPlaceholderScreen(hostId: String, onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Terminal spike") },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            Text("Host $hostId")
            Text("Terminal disconnected. Reconnect or return to diagnostics.")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsPlaceholderScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        ) {
            Text("Hobgoblin Android")
            Text("SSH remote-first emergency operations.")
            Text("Local terminal")
            Text(localTerminalPlaceholderText())
        }
    }
}
