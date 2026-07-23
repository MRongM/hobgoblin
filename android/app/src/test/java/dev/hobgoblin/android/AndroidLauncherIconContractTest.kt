package dev.hobgoblin.android

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidLauncherIconContractTest {
    @Test
    fun `application uses adaptive launcher icons`() {
        val projectRoot = androidProjectRoot()
        val manifest = File(projectRoot, "app/src/main/AndroidManifest.xml").readText()

        assertTrue(manifest.contains("""android:icon="@mipmap/ic_launcher"""))
        assertTrue(manifest.contains("""android:roundIcon="@mipmap/ic_launcher_round"""))
    }

    @Test
    fun `adaptive launcher icons use the Hobgoblin brand layers`() {
        val projectRoot = androidProjectRoot()
        val resources = File(projectRoot, "app/src/main/res")
        val launcher = File(resources, "mipmap-anydpi-v26/ic_launcher.xml").readText()
        val roundLauncher = File(resources, "mipmap-anydpi-v26/ic_launcher_round.xml").readText()
        val background = File(resources, "drawable/ic_launcher_background.xml").readText()
        val foreground = File(resources, "drawable/ic_launcher_foreground.xml").readText()

        listOf(launcher, roundLauncher).forEach { adaptiveIcon ->
            assertTrue(adaptiveIcon.contains("""android:drawable="@drawable/ic_launcher_background"""))
            assertTrue(adaptiveIcon.contains("""android:drawable="@drawable/ic_launcher_foreground"""))
        }
        assertTrue(background.contains("#FF111827"))
        assertTrue(background.contains("#FF020617"))
        assertTrue(foreground.contains("M148,332l274,274l-274,274"))
        assertTrue(foreground.contains("#FF38BDF8"))
        assertTrue(foreground.contains("#FF22C55E"))
    }

    @Test
    fun `foreground mark is visually centered with margin inside adaptive icon masks`() {
        val projectRoot = androidProjectRoot()
        val foreground = File(
            projectRoot,
            "app/src/main/res/drawable/ic_launcher_foreground.xml",
        ).readText()

        assertTrue(foreground.contains("""android:scaleX="0.50"""))
        assertTrue(foreground.contains("""android:scaleY="0.50"""))
        assertTrue(foreground.contains("""android:translateX="-4"""))
        assertTrue(foreground.contains("""android:translateY="-8"""))
    }

    private fun androidProjectRoot(): File {
        return listOf(File("."), File(".."), File("android"))
            .firstOrNull { File(it, "settings.gradle.kts").isFile && File(it, "app").isDirectory }
            ?: error("Android project root not found from ${File(".").absolutePath}")
    }
}
