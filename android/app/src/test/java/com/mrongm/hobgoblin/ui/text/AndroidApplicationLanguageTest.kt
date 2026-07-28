package com.mrongm.hobgoblin.ui.text

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidApplicationLanguageTest {
    @Test
    fun `empty application locale follows the system`() {
        assertEquals(
            AndroidApplicationLanguagePreference.FollowSystem,
            applicationLanguagePreference(""),
        )
    }

    @Test
    fun `supported application locale tags map to explicit preferences`() {
        assertEquals(
            AndroidApplicationLanguagePreference.English,
            applicationLanguagePreference("en-US"),
        )
        assertEquals(
            AndroidApplicationLanguagePreference.SimplifiedChinese,
            applicationLanguagePreference("zh-Hans"),
        )
        assertEquals(
            AndroidApplicationLanguagePreference.SimplifiedChinese,
            applicationLanguagePreference("zh-CN"),
        )
        assertEquals(
            AndroidApplicationLanguagePreference.Japanese,
            applicationLanguagePreference("ja"),
        )
        assertEquals(
            AndroidApplicationLanguagePreference.Korean,
            applicationLanguagePreference("ko"),
        )
    }

    @Test
    fun `unsupported application locale safely follows the system`() {
        assertEquals(
            AndroidApplicationLanguagePreference.FollowSystem,
            applicationLanguagePreference("fr"),
        )
    }

    @Test
    fun `traditional Chinese locales do not masquerade as Simplified Chinese`() {
        assertEquals(
            AndroidApplicationLanguagePreference.FollowSystem,
            applicationLanguagePreference("zh-Hant"),
        )
        assertEquals(
            AndroidApplicationLanguagePreference.FollowSystem,
            applicationLanguagePreference("zh-TW"),
        )
    }

    @Test
    fun `raw unsupported locale remains available for clearing`() {
        val setting = applicationLanguageSetting("fr,en")

        assertEquals(AndroidApplicationLanguagePreference.FollowSystem, setting.preference)
        assertEquals("fr,en", setting.languageTags)
        assertTrue(
            applicationLanguageChangeRequired(
                currentLanguageTags = setting.languageTags,
                targetPreference = AndroidApplicationLanguagePreference.FollowSystem,
            ),
        )
        assertFalse(
            applicationLanguageChangeRequired(
                currentLanguageTags = "",
                targetPreference = AndroidApplicationLanguagePreference.FollowSystem,
            ),
        )
    }
}
