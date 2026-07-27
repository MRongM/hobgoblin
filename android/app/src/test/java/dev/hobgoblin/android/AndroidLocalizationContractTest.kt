package dev.hobgoblin.android

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidLocalizationContractTest {
    @Test
    fun `localized catalogs contain the complete default resource key set`() {
        val resources = File(androidProjectRoot(), "app/src/main/res")
        val defaultKeys = resourceEntries(File(resources, "values/strings.xml"))
            .filterNot(ResourceEntry::untranslatable)
            .map(ResourceEntry::key)
            .toSet()

        listOf("values-b+zh+Hans", "values-ja", "values-ko").forEach { directory ->
            assertEquals(
                "Resource keys differ for $directory",
                defaultKeys,
                resourceEntries(File(resources, "$directory/strings.xml")).map(ResourceEntry::key).toSet(),
            )
        }
    }

    @Test
    fun `English is the fallback and Android generates per-app locale config`() {
        val projectRoot = androidProjectRoot()
        val resourceProperties = File(projectRoot, "app/src/main/res/resources.properties").readText()
        val appBuild = File(projectRoot, "app/build.gradle.kts").readText()

        assertTrue(resourceProperties.lineSequence().any { it.trim() == "unqualifiedResLocale=en" })
        assertTrue(appBuild.contains("generateLocaleConfig = true"))
    }

    private fun resourceEntries(file: File): List<ResourceEntry> {
        assertTrue("Missing resource catalog: ${file.path}", file.isFile)
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val root = document.documentElement
        return (0 until root.childNodes.length)
            .map(root.childNodes::item)
            .filter { it.nodeType == org.w3c.dom.Node.ELEMENT_NODE }
            .map { node ->
                ResourceEntry(
                    key = "${node.nodeName}:${node.attributes.getNamedItem("name").nodeValue}",
                    untranslatable = node.attributes.getNamedItem("translatable")?.nodeValue == "false",
                )
            }
    }

    private fun androidProjectRoot(): File {
        return listOf(File("."), File(".."), File("android"))
            .firstOrNull { File(it, "settings.gradle.kts").isFile && File(it, "app").isDirectory }
            ?: error("Android project root not found from ${File(".").absolutePath}")
    }

    private data class ResourceEntry(
        val key: String,
        val untranslatable: Boolean,
    )
}
