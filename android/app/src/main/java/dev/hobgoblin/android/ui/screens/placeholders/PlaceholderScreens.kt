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
import androidx.compose.ui.res.stringResource
import dev.hobgoblin.android.R
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

fun localTerminalPlaceholderTextResource(): Int = R.string.placeholder_local_terminal_deferred

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
                title = { Text(stringResource(R.string.diagnostics_title)) },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text(stringResource(R.string.common_back))
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
            Text(stringResource(R.string.placeholder_host_label, hostId))
            Button(onClick = onOpenTerminal) {
                Text(stringResource(R.string.diagnostics_open_terminal))
            }
            Text(stringResource(R.string.placeholder_run_diagnostics))
            Text(stringResource(R.string.placeholder_ssh))
            Text(stringResource(R.string.placeholder_shell))
            Text(stringResource(R.string.placeholder_git))
            Text(stringResource(R.string.placeholder_path))
            Text(stringResource(R.string.placeholder_repo))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalPlaceholderScreen(hostId: String, onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.placeholder_terminal_spike)) },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text(stringResource(R.string.common_back))
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
            Text(stringResource(R.string.placeholder_host_label, hostId))
            Text(stringResource(R.string.placeholder_terminal_disconnected))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsPlaceholderScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.navigation_settings)) },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text(stringResource(R.string.common_back))
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
            Text(stringResource(R.string.placeholder_product_name))
            Text(stringResource(R.string.placeholder_product_description))
            Text(stringResource(R.string.placeholder_local_terminal))
            Text(stringResource(localTerminalPlaceholderTextResource()))
        }
    }
}
