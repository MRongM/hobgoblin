package com.mrongm.hobgoblin.ui.text

import android.content.Context
import android.content.res.Resources
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.res.stringResource

@Immutable
data class LocalizedText(
    @param:StringRes val resourceId: Int,
    val formatArgs: List<Any> = emptyList(),
)

@Composable
fun LocalizedText.resolve(): String {
    val resolvedArgs = mutableListOf<Any>()
    for (argument in formatArgs) {
        resolvedArgs += if (argument is LocalizedText) argument.resolve() else argument
    }
    return stringResource(resourceId, *resolvedArgs.toTypedArray())
}

fun Resources.resolve(text: LocalizedText): String {
    val resolvedArgs = text.formatArgs.map { argument ->
        if (argument is LocalizedText) resolve(argument) else argument
    }
    return getString(text.resourceId, *resolvedArgs.toTypedArray())
}

fun Context.resolve(text: LocalizedText): String = resources.resolve(text)
