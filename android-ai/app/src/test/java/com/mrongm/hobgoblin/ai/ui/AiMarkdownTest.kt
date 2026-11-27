package com.mrongm.hobgoblin.ai.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.font.FontWeight
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.node.FencedCodeBlock
import org.junit.Assert.assertEquals
import org.junit.Test

class AiMarkdownTest {
    @Test
    fun rendersAlignedTableCellsWithEscapedPipesAndLinks() {
        val markdown = """
            | Item | Link | Value |
            | :--- | :--: | ----: |
            | A\|B | [Guide](https://example.com/guide) | **42** |
            | Spare |
        """.trimIndent()
        val table = parseAiMarkdown(markdown).firstChild as TableBlock
        val rows = table.markdownRows()

        assertEquals(
            listOf(listOf("Item", "Link", "Value"), listOf("A|B", "Guide", "42"), listOf("Spare", "", "")),
            rows.map { row -> row.map { formatAiMarkdownInline(it).text } },
        )
        assertEquals(
            listOf(TableCell.Alignment.LEFT, TableCell.Alignment.CENTER, TableCell.Alignment.RIGHT),
            rows[1].map { it.alignment },
        )
        assertEquals(listOf("Guide" to "https://example.com/guide"), formatAiMarkdownInline(rows[1][1]).links())
        assertEquals(FontWeight.Bold, formatAiMarkdownInline(rows[1][2]).spanStyles.single().item.fontWeight)
    }

    @Test
    fun rendersNamedReferenceAndBareLinks() {
        val markdown = """
            [**Guide**][docs], https://example.org/help, and <team@example.org>.

            [docs]: https://example.com/guide_(intro)
        """.trimIndent()
        val text = formatAiMarkdownInline(parseAiMarkdown(markdown).firstChild)

        assertEquals("Guide, https://example.org/help, and team@example.org.", text.text)
        assertEquals(
            listOf(
                "Guide" to "https://example.com/guide_(intro)",
                "https://example.org/help" to "https://example.org/help",
                "team@example.org" to "mailto:team@example.org",
            ),
            text.links(),
        )
    }

    @Test
    fun keepsCodeAndUnsupportedDestinationsAsText() {
        val markdown = """
            [Script](javascript:alert(1)) [Relative](./guide) `https://example.com/code`

            ```text
            | Item | Link |
            | ---- | ---- |
            | Code | https://example.com |
            ```
        """.trimIndent()
        val paragraph = parseAiMarkdown(markdown).firstChild
        val text = formatAiMarkdownInline(paragraph)

        assertEquals("Script Relative https://example.com/code", text.text)
        assertEquals(emptyList<Pair<String, String>>(), text.links())
        val code = paragraph.next as FencedCodeBlock
        assertEquals("| Item | Link |\n| ---- | ---- |\n| Code | https://example.com |\n", code.literal)
    }

    private fun AnnotatedString.links() = getLinkAnnotations(0, length).map { annotation ->
        text.substring(annotation.start, annotation.end) to (annotation.item as LinkAnnotation.Url).url
    }
}
