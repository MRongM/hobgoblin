package com.mrongm.hobgoblin.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.mrongm.hobgoblin.R

internal data class ManualReorderItemBounds(
    val key: String,
    val top: Float,
    val bottom: Float,
) {
    val centerY: Float = (top + bottom) / 2f
}

internal object ManualReorderGesturePolicy {
    fun targetKey(
        draggedKey: String,
        draggedCenterY: Float,
        originalCenterY: Float,
        bounds: List<ManualReorderItemBounds>,
    ): String? {
        if (bounds.none { it.key == draggedKey } || draggedCenterY == originalCenterY) return null
        val candidates = bounds.filterNot { it.key == draggedKey }
        return if (draggedCenterY > originalCenterY) {
            candidates
                .filter { it.centerY > originalCenterY && it.centerY <= draggedCenterY }
                .maxByOrNull(ManualReorderItemBounds::centerY)
                ?.key
        } else {
            candidates
                .filter { it.centerY < originalCenterY && it.centerY >= draggedCenterY }
                .minByOrNull(ManualReorderItemBounds::centerY)
                ?.key
        }
    }
}

@Stable
class ManualReorderState internal constructor(
    private val onMove: (draggedKey: String, targetKey: String) -> Unit,
    private val onFinished: () -> Unit,
) {
    private val boundsByKey = mutableStateMapOf<String, ManualReorderItemBounds>()
    private var draggedCenterY by mutableFloatStateOf(0f)
    private var moved = false

    var draggedKey by mutableStateOf<String?>(null)
        private set

    internal fun register(key: String, top: Float, bottom: Float) {
        val next = ManualReorderItemBounds(key = key, top = top, bottom = bottom)
        if (boundsByKey[key] != next) boundsByKey[key] = next
    }

    internal fun unregister(key: String) {
        boundsByKey.remove(key)
        if (draggedKey == key) finish()
    }

    fun start(key: String) {
        val bounds = boundsByKey[key] ?: return
        draggedKey = key
        draggedCenterY = bounds.centerY
        moved = false
    }

    fun dragBy(deltaY: Float) {
        val key = draggedKey ?: return
        val previousCenterY = draggedCenterY
        draggedCenterY += deltaY
        val targetKey = ManualReorderGesturePolicy.targetKey(
            draggedKey = key,
            draggedCenterY = draggedCenterY,
            originalCenterY = previousCenterY,
            bounds = boundsByKey.values.toList(),
        ) ?: return
        moved = true
        onMove(key, targetKey)
    }

    fun finish() {
        if (draggedKey == null) return
        draggedKey = null
        if (moved) onFinished()
        moved = false
    }

    internal fun translationY(key: String): Float {
        if (draggedKey != key) return 0f
        return draggedCenterY - (boundsByKey[key]?.centerY ?: draggedCenterY)
    }
}

@Composable
fun rememberManualReorderState(
    onMove: (draggedKey: String, targetKey: String) -> Unit,
    onFinished: () -> Unit,
): ManualReorderState {
    val currentOnMove by rememberUpdatedState(onMove)
    val currentOnFinished by rememberUpdatedState(onFinished)
    return remember {
        ManualReorderState(
            onMove = { draggedKey, targetKey -> currentOnMove(draggedKey, targetKey) },
            onFinished = { currentOnFinished() },
        )
    }
}

@Composable
fun Modifier.manualReorderItem(
    state: ManualReorderState,
    itemKey: String,
): Modifier {
    DisposableEffect(state, itemKey) {
        onDispose { state.unregister(itemKey) }
    }
    return this
        .onGloballyPositioned { coordinates ->
            val bounds = coordinates.boundsInParent()
            state.register(itemKey, top = bounds.top, bottom = bounds.bottom)
        }
        .graphicsLayer {
            translationY = state.translationY(itemKey)
        }
        .zIndex(if (state.draggedKey == itemKey) 1f else 0f)
}

@Composable
fun ManualReorderHandle(
    state: ManualReorderState,
    itemKey: String,
    itemLabel: String,
    modifier: Modifier = Modifier,
) {
    val dotColor = MaterialTheme.colorScheme.onSurfaceVariant
    val reorderDescription = stringResource(R.string.accessibility_reorder_item, itemLabel)
    Box(
        modifier = modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClick = {})
            .semantics {
                contentDescription = reorderDescription
            }
            .pointerInput(state, itemKey) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { state.start(itemKey) },
                    onDragEnd = state::finish,
                    onDragCancel = state::finish,
                    onDrag = { change, dragAmount ->
                        change.consume()
                        state.dragBy(dragAmount.y)
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(
            modifier = Modifier
                .size(width = 18.dp, height = 22.dp)
                .alpha(if (state.draggedKey == itemKey) 1f else 0.72f),
        ) {
            val radius = 1.7.dp.toPx()
            val left = size.width * 0.3f
            val right = size.width * 0.7f
            listOf(size.height * 0.22f, size.height * 0.5f, size.height * 0.78f).forEach { y ->
                drawCircle(color = dotColor, radius = radius, center = androidx.compose.ui.geometry.Offset(left, y))
                drawCircle(color = dotColor, radius = radius, center = androidx.compose.ui.geometry.Offset(right, y))
            }
        }
    }
}
