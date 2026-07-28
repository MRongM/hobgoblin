package com.mrongm.hobgoblin.data

import android.content.SharedPreferences
import com.mrongm.hobgoblin.ui.theme.AndroidAppearancePreference
import com.mrongm.hobgoblin.ui.theme.AndroidApplicationTheme
import com.mrongm.hobgoblin.ui.theme.AndroidColorTheme
import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidApplicationThemeStoreTest {
    @Test
    fun `empty preferences use system appearance and macOS colors`() {
        val store = AndroidApplicationThemeStore(InMemorySharedPreferences())

        assertEquals(AndroidApplicationTheme(), store.load())
    }

    @Test
    fun `theme selection round trips through stable persisted values`() {
        val preferences = InMemorySharedPreferences()
        val store = AndroidApplicationThemeStore(preferences)
        val selected = AndroidApplicationTheme(
            appearance = AndroidAppearancePreference.Dark,
            colorTheme = AndroidColorTheme.TokyoNight,
        )

        store.save(selected)

        assertEquals("dark", preferences.getString("appearance", null))
        assertEquals("tokyo-night", preferences.getString("color_theme", null))
        assertEquals(selected, store.load())
    }

    @Test
    fun `unknown persisted values recover to defaults`() {
        val preferences = InMemorySharedPreferences(
            mutableMapOf(
                "appearance" to "sepia",
                "color_theme" to "missing",
            ),
        )

        assertEquals(AndroidApplicationTheme(), AndroidApplicationThemeStore(preferences).load())
    }
}

private class InMemorySharedPreferences(
    private val values: MutableMap<String, Any?> = mutableMapOf(),
) : SharedPreferences {
    override fun getAll(): Map<String, *> = values.toMap()

    override fun getString(key: String?, defValue: String?): String? = values[key] as? String ?: defValue

    override fun getStringSet(key: String?, defValues: Set<String?>?): Set<String?>? =
        @Suppress("UNCHECKED_CAST")
        ((values[key] as? Set<String?>) ?: defValues)

    override fun getInt(key: String?, defValue: Int): Int = values[key] as? Int ?: defValue

    override fun getLong(key: String?, defValue: Long): Long = values[key] as? Long ?: defValue

    override fun getFloat(key: String?, defValue: Float): Float = values[key] as? Float ?: defValue

    override fun getBoolean(key: String?, defValue: Boolean): Boolean = values[key] as? Boolean ?: defValue

    override fun contains(key: String?): Boolean = values.containsKey(key)

    override fun edit(): SharedPreferences.Editor = Editor(values)

    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit

    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit

    private class Editor(
        private val values: MutableMap<String, Any?>,
    ) : SharedPreferences.Editor {
        private val pending = mutableMapOf<String, Any?>()
        private val removed = mutableSetOf<String>()
        private var clearRequested = false

        override fun putString(key: String?, value: String?): SharedPreferences.Editor = stage(key, value)

        override fun putStringSet(key: String?, values: Set<String?>?): SharedPreferences.Editor = stage(key, values)

        override fun putInt(key: String?, value: Int): SharedPreferences.Editor = stage(key, value)

        override fun putLong(key: String?, value: Long): SharedPreferences.Editor = stage(key, value)

        override fun putFloat(key: String?, value: Float): SharedPreferences.Editor = stage(key, value)

        override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor = stage(key, value)

        override fun remove(key: String?): SharedPreferences.Editor = apply {
            if (key != null) removed += key
        }

        override fun clear(): SharedPreferences.Editor = apply {
            clearRequested = true
        }

        override fun commit(): Boolean {
            applyChanges()
            return true
        }

        override fun apply() = applyChanges()

        private fun stage(key: String?, value: Any?): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = value
        }

        private fun applyChanges() {
            if (clearRequested) values.clear()
            removed.forEach(values::remove)
            values.putAll(pending)
        }
    }
}
