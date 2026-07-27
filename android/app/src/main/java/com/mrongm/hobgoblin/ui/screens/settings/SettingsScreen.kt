package com.mrongm.hobgoblin.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.terminals.MaxTerminalHeartbeatIntervalSeconds
import com.mrongm.hobgoblin.terminals.MaxTerminalHeartbeatFailureThreshold
import com.mrongm.hobgoblin.terminals.MinTerminalHeartbeatIntervalSeconds
import com.mrongm.hobgoblin.terminals.MinTerminalHeartbeatFailureThreshold
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    initialKeepAliveIntervalSeconds: Long,
    initialHeartbeatFailureThreshold: Int,
    onBack: () -> Unit,
    onSave: (Long, Int) -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    var keepAliveText by remember(initialKeepAliveIntervalSeconds) {
        mutableStateOf(initialKeepAliveIntervalSeconds.toString())
    }
    var heartbeatFailureThresholdText by remember(initialHeartbeatFailureThreshold) {
        mutableStateOf(initialHeartbeatFailureThreshold.toString())
    }
    val parsedKeepAlive = keepAliveText.toLongOrNull()
    val parsedHeartbeatFailureThreshold = heartbeatFailureThresholdText.toIntOrNull()

    val keepAliveError = when {
        keepAliveText.isBlank() -> stringResource(R.string.settings_enter_value)
        parsedKeepAlive == null -> stringResource(R.string.settings_numbers_only)
        parsedKeepAlive !in MinTerminalHeartbeatIntervalSeconds..MaxTerminalHeartbeatIntervalSeconds -> {
            stringResource(
                R.string.settings_interval_error,
                MinTerminalHeartbeatIntervalSeconds,
                MaxTerminalHeartbeatIntervalSeconds,
            )
        }
        else -> null
    }

    val heartbeatFailureThresholdError = when {
        heartbeatFailureThresholdText.isBlank() -> stringResource(R.string.settings_enter_value)
        parsedHeartbeatFailureThreshold == null -> stringResource(R.string.settings_numbers_only)
        parsedHeartbeatFailureThreshold !in MinTerminalHeartbeatFailureThreshold..MaxTerminalHeartbeatFailureThreshold -> {
            stringResource(
                R.string.settings_failure_threshold_error,
                MinTerminalHeartbeatFailureThreshold,
                MaxTerminalHeartbeatFailureThreshold,
            )
        }
        else -> null
    }

    val canSave = parsedKeepAlive != null &&
        parsedHeartbeatFailureThreshold != null &&
        keepAliveError == null &&
        heartbeatFailureThresholdError == null &&
        (parsedKeepAlive != initialKeepAliveIntervalSeconds || parsedHeartbeatFailureThreshold != initialHeartbeatFailureThreshold)

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
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            Text(stringResource(R.string.settings_keepalive_heading))
            OutlinedTextField(
                value = keepAliveText,
                onValueChange = { keepAliveText = it.filter(Char::isDigit).take(6) },
                label = { Text(stringResource(R.string.settings_interval_seconds)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = keepAliveError != null,
                supportingText = {
                    if (keepAliveError != null) {
                        Text(keepAliveError)
                    } else {
                        Text(
                            stringResource(
                                R.string.settings_interval_range,
                                MinTerminalHeartbeatIntervalSeconds,
                                MaxTerminalHeartbeatIntervalSeconds,
                            ),
                        )
                    }
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(stringResource(R.string.settings_failure_threshold_heading))
            OutlinedTextField(
                value = heartbeatFailureThresholdText,
                onValueChange = { heartbeatFailureThresholdText = it.filter(Char::isDigit).take(3) },
                label = { Text(stringResource(R.string.settings_failed_checks_before_close)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = heartbeatFailureThresholdError != null,
                supportingText = {
                    if (heartbeatFailureThresholdError != null) {
                        Text(heartbeatFailureThresholdError)
                    } else {
                        Text(
                            stringResource(
                                R.string.settings_failure_threshold_range,
                                MinTerminalHeartbeatFailureThreshold,
                                MaxTerminalHeartbeatFailureThreshold,
                            ),
                        )
                    }
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    val keepAlive = parsedKeepAlive ?: return@Button
                    val heartbeatFailureThreshold = parsedHeartbeatFailureThreshold ?: return@Button
                    onSave(keepAlive, heartbeatFailureThreshold)
                },
                enabled = canSave,
            ) {
                Text(stringResource(R.string.common_save))
            }
            Text(stringResource(R.string.settings_keepalive_strategy))
            TextButton(onClick = { uriHandler.openUri(PrivacyPolicy.url) }) {
                Text(stringResource(R.string.settings_privacy_policy))
            }
        }
    }
}
