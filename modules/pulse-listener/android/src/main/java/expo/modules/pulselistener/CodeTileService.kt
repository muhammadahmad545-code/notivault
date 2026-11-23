package expo.modules.pulselistener

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

/**
 * Quick Settings tile: copies the newest one-time code Notivault captured in the last 15 minutes,
 * so a code can be pasted without opening the app or the notification.
 */
class CodeTileService : TileService() {
  private fun recent(): Pair<String, String>? =
    runCatching { PulseDb.get(this).latestCode(System.currentTimeMillis() - WINDOW_MS) }.getOrNull()

  override fun onStartListening() {
    val tile = qsTile ?: return
    val code = recent()
    tile.label = "Copy code"
    tile.state = if (code != null) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    if (Build.VERSION.SDK_INT >= 29) tile.subtitle = code?.let { "From ${it.second}" } ?: "No recent code"
    tile.updateTile()
  }

  override fun onClick() {
    val code = recent()
    if (code == null) {
      Toast.makeText(this, "No code in the last 15 minutes", Toast.LENGTH_SHORT).show()
    } else {
      CopyCodeReceiver.copySensitive(this, code.first)
      Toast.makeText(this, "Code from ${code.second} copied", Toast.LENGTH_SHORT).show()
    }
    onStartListening()
  }

  companion object {
    private const val WINDOW_MS = 15 * 60 * 1000L
  }
}
