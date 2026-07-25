package dev.hobgoblin.android.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ManualReorderStateTest {
    private val bounds = listOf(
        ManualReorderItemBounds(key = "a", top = 0f, bottom = 100f),
        ManualReorderItemBounds(key = "b", top = 110f, bottom = 210f),
        ManualReorderItemBounds(key = "c", top = 220f, bottom = 320f),
    )

    @Test
    fun `dragging down crosses a target midpoint before requesting a move`() {
        assertNull(
            ManualReorderGesturePolicy.targetKey(
                draggedKey = "a",
                draggedCenterY = 150f,
                originalCenterY = 50f,
                bounds = bounds,
            ),
        )
        assertEquals(
            "b",
            ManualReorderGesturePolicy.targetKey(
                draggedKey = "a",
                draggedCenterY = 161f,
                originalCenterY = 50f,
                bounds = bounds,
            ),
        )
    }

    @Test
    fun `dragging up crosses a target midpoint before requesting a move`() {
        assertNull(
            ManualReorderGesturePolicy.targetKey(
                draggedKey = "c",
                draggedCenterY = 170f,
                originalCenterY = 270f,
                bounds = bounds,
            ),
        )
        assertEquals(
            "b",
            ManualReorderGesturePolicy.targetKey(
                draggedKey = "c",
                draggedCenterY = 159f,
                originalCenterY = 270f,
                bounds = bounds,
            ),
        )
    }

    @Test
    fun `unknown dragged key and empty bounds never request a move`() {
        assertNull(
            ManualReorderGesturePolicy.targetKey(
                draggedKey = "missing",
                draggedCenterY = 160f,
                originalCenterY = 50f,
                bounds = bounds,
            ),
        )
        assertNull(
            ManualReorderGesturePolicy.targetKey(
                draggedKey = "a",
                draggedCenterY = 160f,
                originalCenterY = 50f,
                bounds = emptyList(),
            ),
        )
    }
}
