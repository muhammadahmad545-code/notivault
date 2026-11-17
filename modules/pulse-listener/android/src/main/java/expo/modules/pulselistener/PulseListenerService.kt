package expo.modules.pulselistener

import android.app.Notification
import android.content.ComponentName
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors

/**
 * Receives every notification posted on the phone once the user grants notification access.
 * Callbacks arrive on the main thread, so all work is handed to one background thread.
 */
class PulseListenerService : NotificationListenerService() {
  private val worker = Executors.newSingleThreadExecutor()
  private val labels = HashMap<String, String>()
  private var inserts = 0

  private data class Content(val title: String, val text: String, val latest: String)

  private fun appLabel(pkg: String): String = labels.getOrPut(pkg) {
    try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
      pkg
    }
  }

  /**
   * Chat apps use MessagingStyle, where EXTRA_TEXT may only say "3 new messages". Read the newest
   * message (with its sender in group chats) so search, rules and code detection see real content.
   */
  private fun contentOf(n: Notification): Content {
    val extras = n.extras
    val style = try {
      NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
    } catch (e: Exception) {
      null
    }
    val newest = style?.messages?.lastOrNull()
    if (style != null && newest?.text != null) {
      val sender = newest.person?.name?.toString()
      val group = style.isGroupConversation
      val conversation = style.conversationTitle?.toString()
      val title = (conversation ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: sender ?: "").trim()
      val body = newest.text.toString().trim()
      val text = if (group && sender != null) "$sender: $body" else body
      return Content(title, text, text)
    }
    val title = (extras.getCharSequence(Notification.EXTRA_TITLE_BIG) ?: extras.getCharSequence(Notification.EXTRA_TITLE))?.toString()?.trim() ?: ""
    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
    val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
    val plain = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
    val text = when {
      big != null -> big
      lines != null && lines.isNotEmpty() -> lines.joinToString("\n")
      else -> plain ?: ""
    }.trim()
    // Rules match only the newest line, so one "urgent" in an inbox-style thread does not match every update.
    val latest = (lines?.lastOrNull()?.toString() ?: plain ?: text).trim()
    return Content(title, text, latest)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    worker.execute {
      try {
        handle(sbn)
      } catch (e: Exception) {
        // Never let one malformed notification stop the listener.
      }
    }
  }

  private fun handle(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName) return
    val n = sbn.notification ?: return
    val prefs = Pulse.prefs(this)
    if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    if (!prefs.getBoolean("includeOngoing", false) && (sbn.isOngoing || n.flags and Notification.FLAG_FOREGROUND_SERVICE != 0)) return
    val content = contentOf(n)
    if (content.title.isEmpty() && content.text.isEmpty()) return

    val app = appLabel(sbn.packageName)
    val rule = Pulse.match(Pulse.rules(this), sbn.packageName, content.title, content.latest)
    val code = if (prefs.getBoolean("codes", true)) Pulse.extractCode(content.title, content.latest) else null
    // Quiet hours hold everything for the digest, except priority-alert rules and verification codes.
    val quiet = rule?.action != "alert" && code == null && Pulse.inQuietHours(this)
    val state = when {
      rule?.action == "mute" -> "muted"
      rule?.action == "digest" || quiet -> "digest"
      else -> "shown"
    }
    val ruleName = rule?.name ?: if (quiet) "Quiet hours" else null

    val id = PulseDb.get(this).insert(
      PulseDb.Entry(sbn.key, sbn.packageName, app, content.title, content.text, n.category, sbn.postTime, state, ruleName, code)
    )

    // Rules apply even to an unchanged re-post, otherwise a quieted notification would reappear.
    if (state == "muted" || state == "digest") {
      cancelNotification(sbn.key)
      cancelOrphanSummary(sbn)
    }
    if (id < 0) return
    if (rule?.action == "alert") Pulse.postAlert(this, sbn.key, app, content.title, content.latest, rule.name)
    if (code != null) Pulse.postCode(this, app, code)

    if (++inserts % 200 == 0) {
      val days = prefs.getInt("retentionDays", 30)
      if (days > 0) PulseDb.get(this).prune(System.currentTimeMillis() - days * 24L * 60 * 60 * 1000)
    }
    Pulse.emit(PulseDb.get(this).byId(id))
  }

  /** When every child of a group has been removed, the app's own summary would linger: remove it too. */
  private fun cancelOrphanSummary(sbn: StatusBarNotification) {
    val group = sbn.groupKey ?: return
    val active = try { activeNotifications } catch (e: Exception) { null } ?: return
    val sameGroup = active.filter { it.groupKey == group && it.key != sbn.key }
    if (sameGroup.isNotEmpty() && sameGroup.all { it.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0 }) {
      sameGroup.forEach { cancelNotification(it.key) }
    }
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
    val key = sbn.key
    worker.execute {
      try {
        PulseDb.get(this).markRemoved(key, System.currentTimeMillis(), by)
        // A priority alert goes away with the notification it was raised for.
        if (by != "pulse") Pulse.cancelAlert(this, key)
      } catch (e: Exception) {
        // Ignore.
      }
    }
  }

  /** Capture what was posted while the listener was disconnected. Duplicates are skipped by the store. */
  override fun onListenerConnected() {
    Pulse.prefs(this).edit().putLong("connectedAt", System.currentTimeMillis()).apply()
    val active = try { activeNotifications } catch (e: Exception) { null } ?: return
    active.forEach { sbn -> worker.execute { runCatching { handle(sbn) } } }
  }

  override fun onListenerDisconnected() {
    try {
      requestRebind(ComponentName(this, PulseListenerService::class.java))
    } catch (e: Exception) {
      // The system will rebind when it can.
    }
  }

  override fun onDestroy() {
    worker.shutdown()
    super.onDestroy()
  }
}
