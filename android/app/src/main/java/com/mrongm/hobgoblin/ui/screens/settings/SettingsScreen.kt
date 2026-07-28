package com.mrongm.hobgoblin.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import com.mrongm.hobgoblin.ui.theme.AndroidAppearancePreference
import com.mrongm.hobgoblin.ui.theme.AndroidApplicationTheme
import com.mrongm.hobgoblin.ui.theme.AndroidColorTheme
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing
import com.mrongm.hobgoblin.ui.text.AndroidApplicationLanguagePreference
import com.mrongm.hobgoblin.ui.text.AndroidApplicationLanguageSetting
import com.mrongm.hobgoblin.ui.text.applicationLanguageChangeRequired

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    initialKeepAliveIntervalSeconds: Long,
    initialHeartbeatFailureThreshold: Int,
    initialApplicationLanguage: AndroidApplicationLanguageSetting,
    initialApplicationTheme: AndroidApplicationTheme,
    onBack: () -> Unit,
    onSave: (Long, Int, AndroidApplicationLanguagePreference, AndroidApplicationTheme) -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    var keepAliveText by remember(initialKeepAliveIntervalSeconds) {
        mutableStateOf(initialKeepAliveIntervalSeconds.toString())
    }
    var heartbeatFailureThresholdText by remember(initialHeartbeatFailureThreshold) {
        mutableStateOf(initialHeartbeatFailureThreshold.toString())
    }
    var selectedApplicationLanguage by remember(initialApplicationLanguage) {
        mutableStateOf(initialApplicationLanguage.preference)
    }
    var selectedAppearance by remember(initialApplicationTheme) {
        mutableStateOf(initialApplicationTheme.appearance)
    }
    var selectedColorTheme by remember(initialApplicationTheme) {
        mutableStateOf(initialApplicationTheme.colorTheme)
    }
    var themeMenuExpanded by remember { mutableStateOf(false) }
    var appearanceMenuExpanded by remember { mutableStateOf(false) }
    var languageMenuExpanded by remember { mutableStateOf(false) }
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

    val hasChanges = parsedKeepAlive != initialKeepAliveIntervalSeconds ||
        parsedHeartbeatFailureThreshold != initialHeartbeatFailureThreshold ||
        selectedAppearance != initialApplicationTheme.appearance ||
        selectedColorTheme != initialApplicationTheme.colorTheme ||
        applicationLanguageChangeRequired(
            currentLanguageTags = initialApplicationLanguage.languageTags,
            targetPreference = selectedApplicationLanguage,
        )
    val canSave = parsedKeepAlive != null &&
        parsedHeartbeatFailureThreshold != null &&
        keepAliveError == null &&
        heartbeatFailureThresholdError == null &&
        hasChanges

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
                .verticalScroll(rememberScrollState())
                .padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            ExposedDropdownMenuBox(
                expanded = themeMenuExpanded,
                onExpandedChange = { themeMenuExpanded = it },
            ) {
                OutlinedTextField(
                    value = stringResource(selectedColorTheme.labelResourceId),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.settings_theme)) },
                    trailingIcon = {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = themeMenuExpanded)
                    },
                    singleLine = true,
                    modifier = Modifier
                        .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = themeMenuExpanded,
                    onDismissRequest = { themeMenuExpanded = false },
                ) {
                    AndroidColorTheme.entries.forEach { colorTheme ->
                        DropdownMenuItem(
                            text = { Text(stringResource(colorTheme.labelResourceId)) },
                            onClick = {
                                selectedColorTheme = colorTheme
                                themeMenuExpanded = false
                            },
                            contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                        )
                    }
                }
            }
            ExposedDropdownMenuBox(
                expanded = appearanceMenuExpanded,
                onExpandedChange = { appearanceMenuExpanded = it },
            ) {
                OutlinedTextField(
                    value = stringResource(selectedAppearance.labelResourceId),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.settings_appearance)) },
                    trailingIcon = {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = appearanceMenuExpanded)
                    },
                    singleLine = true,
                    modifier = Modifier
                        .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = appearanceMenuExpanded,
                    onDismissRequest = { appearanceMenuExpanded = false },
                ) {
                    AndroidAppearancePreference.entries.forEach { appearance ->
                        DropdownMenuItem(
                            text = { Text(stringResource(appearance.labelResourceId)) },
                            onClick = {
                                selectedAppearance = appearance
                                appearanceMenuExpanded = false
                            },
                            contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                        )
                    }
                }
            }
            ExposedDropdownMenuBox(
                expanded = languageMenuExpanded,
                onExpandedChange = { languageMenuExpanded = it },
            ) {
                OutlinedTextField(
                    value = stringResource(selectedApplicationLanguage.labelResourceId),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.settings_language)) },
                    trailingIcon = {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = languageMenuExpanded)
                    },
                    singleLine = true,
                    modifier = Modifier
                        .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = languageMenuExpanded,
                    onDismissRequest = { languageMenuExpanded = false },
                ) {
                    AndroidApplicationLanguagePreference.entries.forEach { language ->
                        DropdownMenuItem(
                            text = { Text(stringResource(language.labelResourceId)) },
                            onClick = {
                                selectedApplicationLanguage = language
                                languageMenuExpanded = false
                            },
                            contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                        )
                    }
                }
            }
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
                    onSave(
                        keepAlive,
                        heartbeatFailureThreshold,
                        selectedApplicationLanguage,
                        AndroidApplicationTheme(
                            appearance = selectedAppearance,
                            colorTheme = selectedColorTheme,
                        ),
                    )
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

private val AndroidAppearancePreference.labelResourceId: Int
    get() = when (this) {
        AndroidAppearancePreference.System -> R.string.settings_appearance_system
        AndroidAppearancePreference.Light -> R.string.settings_appearance_light
        AndroidAppearancePreference.Dark -> R.string.settings_appearance_dark
    }

private val AndroidColorTheme.labelResourceId: Int
    get() = when (this) {
        AndroidColorTheme.Macos -> R.string.settings_theme_macos
        AndroidColorTheme.Mono -> R.string.settings_theme_mono
        AndroidColorTheme.Github -> R.string.settings_theme_github
        AndroidColorTheme.Claude -> R.string.settings_theme_claude
        AndroidColorTheme.Cursor -> R.string.settings_theme_cursor
        AndroidColorTheme.Airbnb -> R.string.settings_theme_airbnb
        AndroidColorTheme.Bmw -> R.string.settings_theme_bmw
        AndroidColorTheme.Signal -> R.string.settings_theme_signal
        AndroidColorTheme.Forge -> R.string.settings_theme_forge
        AndroidColorTheme.Catppuccin -> R.string.settings_theme_catppuccin
        AndroidColorTheme.Solarized -> R.string.settings_theme_solarized
        AndroidColorTheme.TokyoNight -> R.string.settings_theme_tokyo_night
    }

private val AndroidApplicationLanguagePreference.labelResourceId: Int
    get() = when (this) {
        AndroidApplicationLanguagePreference.FollowSystem -> R.string.settings_language_follow_system
        AndroidApplicationLanguagePreference.English -> R.string.settings_language_english
        AndroidApplicationLanguagePreference.SimplifiedChinese -> R.string.settings_language_simplified_chinese
        AndroidApplicationLanguagePreference.Japanese -> R.string.settings_language_japanese
        AndroidApplicationLanguagePreference.Korean -> R.string.settings_language_korean
    }
