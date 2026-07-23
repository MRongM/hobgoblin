package dev.hobgoblin.android

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidIdentityContractTest {
    @Test
    fun `project identity consistently uses the Hobgoblin name`() {
        val projectRoot = androidProjectRoot()
        val settings = File(projectRoot, "settings.gradle.kts").readText()
        val appBuild = File(projectRoot, "app/build.gradle.kts").readText()
        val manifest = File(projectRoot, "app/src/main/AndroidManifest.xml").readText()

        assertTrue(settings.contains("""rootProject.name = "HobgoblinAndroid""""))
        assertTrue(appBuild.contains("""namespace = "dev.hobgoblin.android""""))
        assertTrue(appBuild.contains("""applicationId = "dev.hobgoblin.android""""))
        assertTrue(manifest.contains("""android:label="Hobgoblin""""))
    }

    @Test
    fun `maintained files contain no duplicated Hobgoblin prefix`() {
        val projectRoot = androidProjectRoot()
        val duplicatedPrefix = "Hob" + "hobgoblin"
        val maintainedRoots = listOf(
            File(projectRoot, "settings.gradle.kts"),
            File(projectRoot, "app/build.gradle.kts"),
            File(projectRoot, "app/src/main/AndroidManifest.xml"),
            File(projectRoot, "app/src/main/java"),
            File(projectRoot, "app/src/test/java"),
            File(projectRoot, "docs"),
        )
        val offenders = maintainedRoots
            .asSequence()
            .flatMap { root -> if (root.isDirectory) root.walkTopDown().asSequence() else sequenceOf(root) }
            .filter(File::isFile)
            .filter { it.extension in setOf("kt", "kts", "xml", "md") }
            .filter { it.readText().contains(duplicatedPrefix) }
            .map { it.relativeTo(projectRoot).invariantSeparatorsPath }
            .toList()

        assertTrue("Duplicated Hobgoblin prefix found in: $offenders", offenders.isEmpty())
    }

    private fun androidProjectRoot(): File {
        return listOf(File("."), File(".."), File("android"))
            .firstOrNull { File(it, "settings.gradle.kts").isFile && File(it, "app").isDirectory }
            ?: error("Android project root not found from ${File(".").absolutePath}")
    }
}
