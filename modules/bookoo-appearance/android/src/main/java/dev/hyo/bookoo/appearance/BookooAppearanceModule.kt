package dev.hyo.bookoo.appearance

import android.app.UiModeManager
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** App-only appearance for native ComponentActivities, including RevenueCat. */
class BookooAppearanceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BookooAppearance")

    AsyncFunction("setColorSchemeAsync") { scheme: String ->
      val mode = when (scheme) {
        "dark" -> UiModeManager.MODE_NIGHT_YES
        "light" -> UiModeManager.MODE_NIGHT_NO
        // AUTO clears the package night qualifier, inheriting the system again.
        "unspecified" -> UiModeManager.MODE_NIGHT_AUTO
        else -> throw IllegalArgumentException("Unsupported appearance: $scheme")
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
        context.getSystemService(UiModeManager::class.java).setApplicationNightMode(mode)
      }
    }.runOnQueue(Queues.MAIN)
  }
}
