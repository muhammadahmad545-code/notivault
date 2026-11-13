package expo.modules.pulselistener

import android.app.Notification
import android.content.pm.PackageManager
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Receives every notification posted on the phone once the user grants notification access. */
class PulseListenerService : NotificationListenerService() {
  private val labels = HashMap<String, String>()
  private var inserts = 0

  private fun appLabel(pkg: String): String = labels.getOrPut(pkg) {
    try {
      val info = packageManager.getApplicationInfo(pkg, 0)
      packageManager.getApplicationLabel(info).toString()
    } catch (e: PackageManager.NameNotFoundException) {
      pkg
    }
  }

  private fun textOf(n: Notification): Pair<String, String> {
    val extras = n.extras
    val title = (extras.getCharSequence(Notification.EXTRA_TITLE_BIG) ?: extras.getCharSequence(Notification.EXTRA_TITLE))?.toString()?.trim() ?: ""
    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
    val text = when {
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT) != null -> extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
      lines != null && lines.isNotEmpty() -> lines.joinToString("\n")
      else -> extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
    }.trim()
    return title to text
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      handle(sbn)
    } catch (e: Exception) {
      // Never let one malformed notification stop the listener.
    }
  }

  private fun handle(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName) return
    val n = sbn.notification ?: return
    val prefs = Pulse.prefs(this)
    if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    if (!prefs.getBoolean("includeOngoing", false) && (sbn.isOngoing || n.flags and Notification.FLAG_FOREGROUND_SERVICE != 0)) return
    val (title, text) = textOf(n)
    if (title.isEmpty() && text.isEmpty()) return

    val app = appLabel(sbn.packageName)
    val rule = Pulse.match(Pulse.rules(this), sbn.packageName, title, text)
    val state = when (rule?.action) {
      "mute" -> "muted"
      "digest" -> "digest"
      else -> "shown"
    }
    val code = if (prefs.getBoolean("codes", true)) Pulse.extractCode(title, text) else null

    val id = PulseDb.get(this).insert(
      PulseDb.Entry(sbn.key, sbn.packageName, app, title, text, n.category, sbn.postTime, state, rule?.name, code)
    )
    if (id < 0) return

    if (state == "muted" || state == "digest") {
      // Take it out of the shade; Pulse keeps the copy.
      cancelNotification(sbn.key)
    }
    if (rule?.action == "alert") Pulse.postAlert(this, app, title, text, rule.name)
    if (code != null) Pulse.postCode(this, app, code)

    if (++inserts % 200 == 0) {
      val days = prefs.getInt("retentionDays", 30)
      if (days > 0) PulseDb.get(this).prune(System.currentTimeMillis() - days * 24L * 60 * 60 * 1000)
    }
    Pulse.emit(PulseDb.get(this).byId(id))
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification, rankingMap: RankingMap, reason: Int) {
    if (sbn.packageName == packageName) return
    val by = when (reason) {
      REASON_CLICK -> "opened"
      REASON_CANCEL, REASON_CANCEL_ALL -> "dismissed"
      REASON_APP_CANCEL, REASON_APP_CANCEL_ALL -> "app"
      REASON_LISTENER_CANCEL -> "pulse"
      REASON_TIMEOUT -> "expired"
      else -> "other"
    }
    try {
      PulseDb.get(this).markRemoved(sbn.key, System.currentTimeMillis(), by)
    } catch (e: Exception) {
      // Ignore.
    }
  }

  override fun onListenerConnected() {
    Pulse.prefs(this).edit().putLong("connectedAt", System.currentTimeMillis()).apply()
  }
}
