package com.mrongm.hobgoblin.ai.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import org.commonmark.ext.autolink.AutolinkExtension
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.BlockQuote
import org.commonmark.node.Code
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.HtmlBlock
import org.commonmark.node.HtmlInline
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListBlock
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text as MarkdownText
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser
import java.net.URI
import java.net.URISyntaxException

private val markdownParser = Parser.builder()
    .extensions(listOf(TablesExtension.create(), AutolinkExtension.create()))
    .maxOpenBlockParsers(32)
    .build()

private val markdownLinkStyles = TextLinkStyles(
    style = SpanStyle(color = AiAccent, textDecoration = TextDecoration.Underline),
)

internal fun parseAiMarkdown(content: String): Node = markdownParser.parse(content)

@Composable
internal fun AiMarkdown(content: String) {
    val document = remember(content) { parseAiMarkdown(content) }
    AiMarkdownBlocks(document)
}

@Composable
private fun AiMarkdownBlocks(parent: Node, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val style = MaterialTheme.typography.bodyMedium
        for (block in parent.children()) {
            when (block) {
                is Paragraph -> Text(remember(block) { formatAiMarkdownInline(block) }, style = style)
                is Heading -> Text(
                    remember(block) { formatAiMarkdownInline(block) },
                    style = style,
                    fontWeight = FontWeight.Bold,
                )
                is FencedCodeBlock -> Text(block.literal.trimEnd('\n'), style = style, fontFamily = FontFamily.Monospace)
                is IndentedCodeBlock -> Text(block.literal.trimEnd('\n'), style = style, fontFamily = FontFamily.Monospace)
                is TableBlock -> AiMarkdownTable(block)
                is ListBlock -> AiMarkdownList(block)
                is BlockQuote -> AiMarkdownBlocks(block, Modifier.padding(start = 12.dp))
                is ThematicBreak -> HorizontalDivider(color = AiLine)
                is HtmlBlock -> Text(block.literal.trimEnd('\n'), style = style)
            }
        }
    }
}

@Composable
private fun AiMarkdownList(list: ListBlock) {
    val firstNumber = (list as? OrderedList)?.markerStartNumber
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        list.children().forEachIndexed { index, item ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (firstNumber == null) "•" else "${firstNumber + index}.", style = MaterialTheme.typography.bodyMedium)
                AiMarkdownBlocks(item, Modifier.weight(1f, fill = false))
            }
        }
    }
}

internal fun TableBlock.markdownRows(): List<List<TableCell>> = children()
    .flatMap { section -> section.children() }
    .map { row -> row.children().filterIsInstance<TableCell>().toList() }
    .toList()

@Composable
private fun AiMarkdownTable(table: TableBlock) {
    val rows = remember(table) { table.markdownRows() }
    val columnCount = rows.firstOrNull()?.size ?: return
    val shape = RoundedCornerShape(8.dp)

    BoxWithConstraints {
        val dividersWidth = (columnCount - 1).dp
        val cellWidth = ((maxWidth - dividersWidth) / columnCount).coerceIn(112.dp, 248.dp)
        Column(
            Modifier.clip(shape).border(1.dp, AiLine, shape)
                .horizontalScroll(rememberScrollState()).width(cellWidth * columnCount + dividersWidth),
        ) {
            rows.forEachIndexed { rowIndex, cells ->
                if (rowIndex > 0) HorizontalDivider(thickness = 1.dp, color = AiLine)
                val header = rowIndex == 0
                val background = if (header) AiAccentSoft else MaterialTheme.colorScheme.surface
                Row(Modifier.height(IntrinsicSize.Min).background(background)) {
                    cells.forEachIndexed { columnIndex, cell ->
                        if (columnIndex > 0) VerticalDivider(Modifier.fillMaxHeight(), thickness = 1.dp, color = AiLine)
                        Text(
                            remember(cell) { formatAiMarkdownInline(cell) },
                            modifier = Modifier.width(cellWidth).padding(horizontal = 10.dp, vertical = 7.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (header) FontWeight.SemiBold else null,
                            textAlign = when (cell.alignment) {
                                TableCell.Alignment.LEFT -> TextAlign.Left
                                TableCell.Alignment.CENTER -> TextAlign.Center
                                TableCell.Alignment.RIGHT -> TextAlign.Right
                                null -> TextAlign.Start
                            },
                        )
                    }
                }
            }
        }
    }
}

private fun Node.children(): Sequence<Node> = generateSequence(firstChild) { it.next }

internal fun formatAiMarkdownInline(parent: Node): AnnotatedString = buildAnnotatedString {
    appendMarkdownChildren(parent)
}

private fun AnnotatedString.Builder.appendMarkdownChildren(parent: Node) {
    for (node in parent.children()) {
        when (node) {
            is MarkdownText -> append(node.literal)
            is SoftLineBreak, is HardLineBreak -> append('\n')
            is Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(node.literal) }
            is StrongEmphasis -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { appendMarkdownChildren(node) }
            is Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { appendMarkdownChildren(node) }
            is Link -> {
                val url = openableMarkdownUrl(node.destination)
                if (url == null) appendMarkdownChildren(node)
                else withLink(LinkAnnotation.Url(url, markdownLinkStyles)) { appendMarkdownChildren(node) }
            }
            is HtmlInline -> append(node.literal)
            else -> appendMarkdownChildren(node)
        }
    }
}

private fun openableMarkdownUrl(destination: String): String? {
    val uri = try {
        URI(destination)
    } catch (_: URISyntaxException) {
        return null
    }
    return when (uri.scheme?.lowercase()) {
        "http", "https" -> destination.takeIf { !uri.rawAuthority.isNullOrBlank() }
        "mailto" -> destination.takeIf { !uri.rawSchemeSpecificPart.isNullOrBlank() }
        else -> null
    }
}
