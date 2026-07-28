package com.mrongm.hobgoblin

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidApplicationThemeContractTest {
    @Test
    fun `activity restores and applies the device-local theme at the Compose root`() {
        val source = sourceFile("MainActivity.kt")

        assertTrue(source.contains("AndroidApplicationThemeStore.create(this)"))
        assertTrue(source.contains("applicationThemeStore.load()"))
        assertTrue(source.contains("HobgoblinTheme(applicationTheme = applicationTheme)"))
        assertTrue(source.contains("applicationThemeStore.save(theme)"))
        assertTrue(source.contains("applicationTheme = theme"))
    }

    @Test
    fun `settings save projects the selected theme back to the root owner`() {
        val source = sourceFile("HobgoblinAndroidApp.kt")

        assertTrue(source.contains("applicationTheme: AndroidApplicationTheme"))
        assertTrue(source.contains("onApplicationThemeChange: (AndroidApplicationTheme) -> Unit"))
        assertTrue(source.contains("initialApplicationTheme = applicationTheme"))
        assertTrue(source.contains("onApplicationThemeChange(updatedApplicationTheme)"))
    }

    private fun sourceFile(name: String): String {
        val candidates = listOf(
            File("src/main/java/com/mrongm/hobgoblin/$name"),
            File("app/src/main/java/com/mrongm/hobgoblin/$name"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/$name"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("$name not found from ${File(".").absolutePath}")
    }
}
