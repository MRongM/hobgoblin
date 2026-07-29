package com.mrongm.hobgoblin.ui.text

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale

enum class AndroidApplicationLanguagePreference(
    val languageTags: String,
) {
    FollowSystem(""),
    English("en"),
    SimplifiedChinese("zh-Hans"),
    Japanese("ja"),
    Korean("ko"),
}

data class AndroidApplicationLanguageSetting(
    val preference: AndroidApplicationLanguagePreference,
    val languageTags: String,
)

fun applicationLanguagePreference(languageTags: String): AndroidApplicationLanguagePreference {
    val firstLanguageTag = languageTags
        .substringBefore(',')
        .trim()
    if (firstLanguageTag.isEmpty()) return AndroidApplicationLanguagePreference.FollowSystem

    val locale = Locale.forLanguageTag(firstLanguageTag)
    return when {
        locale.language == "en" -> AndroidApplicationLanguagePreference.English
        locale.isSimplifiedChinese() -> AndroidApplicationLanguagePreference.SimplifiedChinese
        locale.language == "ja" -> AndroidApplicationLanguagePreference.Japanese
        locale.language == "ko" -> AndroidApplicationLanguagePreference.Korean
        else -> AndroidApplicationLanguagePreference.FollowSystem
    }
}

fun applicationLanguageSetting(languageTags: String): AndroidApplicationLanguageSetting =
    AndroidApplicationLanguageSetting(
        preference = applicationLanguagePreference(languageTags),
        languageTags = languageTags,
    )

fun applicationLanguageChangeRequired(
    currentLanguageTags: String,
    targetPreference: AndroidApplicationLanguagePreference,
): Boolean = currentLanguageTags != targetPreference.languageTags

fun currentAndroidApplicationLanguageSetting(): AndroidApplicationLanguageSetting =
    applicationLanguageSetting(AppCompatDelegate.getApplicationLocales().toLanguageTags())

fun setAndroidApplicationLanguagePreference(preference: AndroidApplicationLanguagePreference) {
    val currentLanguageTags = AppCompatDelegate.getApplicationLocales().toLanguageTags()
    if (!applicationLanguageChangeRequired(currentLanguageTags, preference)) return
    AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(preference.languageTags))
}

private fun Locale.isSimplifiedChinese(): Boolean {
    if (language != "zh" || script.equals("Hant", ignoreCase = true)) return false
    return country.uppercase(Locale.ROOT) !in TraditionalChineseRegions
}

private val TraditionalChineseRegions = setOf("TW", "HK", "MO")
