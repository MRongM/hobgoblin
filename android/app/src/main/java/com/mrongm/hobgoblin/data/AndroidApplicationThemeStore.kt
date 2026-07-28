package com.mrongm.hobgoblin.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.mrongm.hobgoblin.ui.theme.AndroidApplicationTheme
import com.mrongm.hobgoblin.ui.theme.androidAppearancePreference
import com.mrongm.hobgoblin.ui.theme.androidColorTheme

class AndroidApplicationThemeStore internal constructor(
    private val preferences: SharedPreferences,
) {
    fun load(): AndroidApplicationTheme = AndroidApplicationTheme(
        appearance = androidAppearancePreference(preferences.getString(KeyAppearance, null)),
        colorTheme = androidColorTheme(preferences.getString(KeyColorTheme, null)),
    )

    fun save(theme: AndroidApplicationTheme) {
        preferences.edit {
            putString(KeyAppearance, theme.appearance.storedValue)
            putString(KeyColorTheme, theme.colorTheme.storedValue)
        }
    }

    companion object {
        private const val PreferencesName = "hobgoblin-application-theme"
        private const val KeyAppearance = "appearance"
        private const val KeyColorTheme = "color_theme"

        fun create(context: Context): AndroidApplicationThemeStore = AndroidApplicationThemeStore(
            context.getSharedPreferences(PreferencesName, Context.MODE_PRIVATE),
        )
    }
}
