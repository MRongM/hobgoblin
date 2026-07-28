package com.mrongm.hobgoblin

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
    fun `tmux main tab copy covers host selection and every scan feedback state`() {
        val keys = resourceEntries(
            File(androidProjectRoot(), "app/src/main/res/values/strings.xml"),
        ).map(ResourceEntry::key).toSet()

        assertTrue(
            keys.containsAll(
                setOf(
                    "string:navigation_tmux",
                    "string:tmux_scan_host",
                    "string:tmux_no_hosts_title",
                    "string:tmux_no_hosts_description",
                    "string:tmux_selected_host_label",
                    "string:tmux_change_host",
                    "string:tmux_scanning_host",
                    "string:tmux_empty_title",
                    "string:tmux_empty_description",
                    "string:tmux_stale",
                    "string:tmux_scan_failed",
                ),
            ),
        )
    }

    @Test
    fun `main list count copy is pluralized`() {
        val keys = resourceEntries(
            File(androidProjectRoot(), "app/src/main/res/values/strings.xml"),
        ).map(ResourceEntry::key).toSet()

        assertTrue(keys.contains("plurals:hosts_project_count"))
        assertTrue(keys.contains("plurals:projects_terminal_count"))
    }

    @Test
    fun `English is the fallback and Android generates per-app locale config`() {
        val projectRoot = androidProjectRoot()
        val resourceProperties = File(projectRoot, "app/src/main/res/resources.properties").readText()
        val appBuild = File(projectRoot, "app/build.gradle.kts").readText()

        assertTrue(resourceProperties.lineSequence().any { it.trim() == "unqualifiedResLocale=en" })
        assertTrue(appBuild.contains("generateLocaleConfig = true"))
    }

    @Test
    fun `in-app language picker uses AppCompat locale storage across Android versions`() {
        val projectRoot = androidProjectRoot()
        val versionCatalog = File(projectRoot, "gradle/libs.versions.toml").readText()
        val appBuild = File(projectRoot, "app/build.gradle.kts").readText()
        val manifest = File(projectRoot, "app/src/main/AndroidManifest.xml").readText()
        val styles = File(projectRoot, "app/src/main/res/values/styles.xml").readText()
        val mainActivity = File(
            projectRoot,
            "app/src/main/java/com/mrongm/hobgoblin/MainActivity.kt",
        ).readText()

        assertTrue(versionCatalog.contains("appcompat = \"1.7.1\""))
        assertTrue(versionCatalog.contains("androidx-appcompat = { module = \"androidx.appcompat:appcompat\""))
        assertTrue(appBuild.contains("implementation(libs.androidx.appcompat)"))
        assertTrue(manifest.contains("androidx.appcompat.app.AppLocalesMetadataHolderService"))
        assertTrue(manifest.contains("android:name=\"autoStoreLocales\""))
        assertTrue(manifest.contains("android:value=\"true\""))
        assertTrue(styles.contains("Theme.AppCompat.DayNight.NoActionBar"))
        assertTrue(mainActivity.contains("class MainActivity : AppCompatActivity()"))
    }

    @Test
    fun `settings screen stages and saves the Android application language`() {
        val projectRoot = androidProjectRoot()
        val settingsScreen = File(
            projectRoot,
            "app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt",
        ).readText()
        val application = File(
            projectRoot,
            "app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
        ).readText()
        val resourceKeys = resourceEntries(File(projectRoot, "app/src/main/res/values/strings.xml"))
            .map(ResourceEntry::key)
            .toSet()

        assertTrue(
            resourceKeys.containsAll(
                setOf(
                    "string:settings_language",
                    "string:settings_language_follow_system",
                    "string:settings_language_english",
                    "string:settings_language_simplified_chinese",
                    "string:settings_language_japanese",
                    "string:settings_language_korean",
                ),
            ),
        )
        assertTrue(settingsScreen.contains("initialApplicationLanguage: AndroidApplicationLanguageSetting"))
        assertTrue(
            settingsScreen.contains(
                "onSave: (Long, Int, AndroidApplicationLanguagePreference, AndroidApplicationTheme) -> Unit",
            ),
        )
        assertTrue(settingsScreen.contains("ExposedDropdownMenuBox("))
        assertTrue(settingsScreen.contains("selectedApplicationLanguage"))
        assertTrue(settingsScreen.contains("verticalScroll(rememberScrollState())"))
        assertTrue(application.contains("currentAndroidApplicationLanguageSetting()"))
        assertTrue(application.contains("setAndroidApplicationLanguagePreference(applicationLanguage)"))
    }

    @Test
    fun `foreground terminal notifications resolve from the Android application language`() {
        val service = File(
            androidProjectRoot(),
            "app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalForegroundService.kt",
        ).readText()

        assertTrue(service.contains("import androidx.core.content.ContextCompat"))
        assertTrue(service.contains("ContextCompat.getContextForLanguage(this)"))
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
