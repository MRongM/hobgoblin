package dev.hobgoblin.android.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.nio.charset.StandardCharsets
import java.util.Base64

sealed interface ManualItemOrderScope {
    data object Hosts : ManualItemOrderScope
    data object Projects : ManualItemOrderScope
    data object Terminals : ManualItemOrderScope
    data class Worktrees(val repositoryId: String) : ManualItemOrderScope
}

internal val ManualItemOrderScope.storageKey: String
    get() = when (this) {
        ManualItemOrderScope.Hosts -> "hosts"
        ManualItemOrderScope.Projects -> "projects"
        ManualItemOrderScope.Terminals -> "terminals"
        is ManualItemOrderScope.Worktrees -> "worktrees:${repositoryId.encodeOrderField()}"
    }

object ManualItemOrderPolicy {
    fun <T> apply(
        items: List<T>,
        savedIds: List<String>,
        idOf: (T) -> String,
    ): List<T> {
        val itemById = items.associateBy(idOf)
        val orderedIds = savedIds.distinct().filter(itemById::containsKey)
        val orderedIdSet = orderedIds.toSet()
        return orderedIds.mapNotNull(itemById::get) + items.filter { idOf(it) !in orderedIdSet }
    }

    fun move(
        ids: List<String>,
        draggedId: String,
        targetId: String,
    ): List<String> {
        if (draggedId == targetId) return ids
        val draggedIndex = ids.indexOf(draggedId)
        val targetIndex = ids.indexOf(targetId)
        if (draggedIndex < 0 || targetIndex < 0) return ids
        return ids.toMutableList().apply {
            removeAt(draggedIndex)
            add(targetIndex.coerceAtMost(size), draggedId)
        }
    }
}

class ManualItemOrderStore private constructor(
    private val preferences: SharedPreferences,
) {
    fun load(scope: ManualItemOrderScope): List<String> =
        ManualItemOrderCodec.decode(preferences.getString(scope.storageKey, "").orEmpty())

    fun save(scope: ManualItemOrderScope, ids: List<String>) {
        preferences.edit {
            putString(scope.storageKey, ManualItemOrderCodec.encode(ids.distinct()))
        }
    }

    companion object {
        private const val PreferencesName = "hobgoblin-manual-item-order"

        fun create(context: Context): ManualItemOrderStore =
            ManualItemOrderStore(context.getSharedPreferences(PreferencesName, Context.MODE_PRIVATE))
    }
}

internal object ManualItemOrderCodec {
    private const val RecordSeparator = "\n"

    fun encode(ids: List<String>): String = ids.joinToString(RecordSeparator, transform = String::encodeOrderField)

    fun decode(payload: String): List<String> =
        payload.lineSequence()
            .filter(String::isNotBlank)
            .mapNotNull { encoded -> runCatching { encoded.decodeOrderField() }.getOrNull() }
            .distinct()
            .toList()
}

private fun String.encodeOrderField(): String =
    Base64.getUrlEncoder().withoutPadding().encodeToString(toByteArray(StandardCharsets.UTF_8))

private fun String.decodeOrderField(): String =
    String(Base64.getUrlDecoder().decode(this), StandardCharsets.UTF_8)
