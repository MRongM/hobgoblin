package com.mrongm.hobgoblin.ui.text

import com.mrongm.hobgoblin.R
import org.junit.Assert.assertEquals
import org.junit.Test

class LocalizedTextTest {
    @Test
    fun `resource text keeps its resource id and ordered format arguments`() {
        val text = LocalizedText(
            resourceId = R.string.ports_duplicate,
            formatArgs = listOf("127.0.0.1", 8080),
        )

        assertEquals(R.string.ports_duplicate, text.resourceId)
        assertEquals(listOf("127.0.0.1", 8080), text.formatArgs)
    }
}
