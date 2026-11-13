package expo.modules.pulselistener

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** Settings, rules, one-time-code detection, digests and Pulse's own notifications. */
object Pulse {
  private const val PREFS = "pulse"
  const val CHANNEL_ALERTS = "pulse_alerts"
  const val CHANNEL_CODES = "pulse_codes"
  const val CHANNEL_DIGEST = "pulse_digest"
  private const val DIGEST_REQUEST = 7301
  private const val DIGEST_NOTIFICATION = 7302

  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  data class Rule(val id: String, val name: String, val apps: Set<String>, val keywords: List<String>, val action: String)

  fun rules(context: Context): List<Rule> {
    val array = try { JSONArray(prefs(context).getString("rules", "[]")) } catch (e: Exception) { return emptyList() }
    val out = mutableListOf<Rule>()
    for (i in 0 until array.length()) {
      val o = array.optJSONObject(i) ?: continue
      if (!o.optBoolean("enabled", true)) continue
      val apps = o.optJSONArray("apps")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
      val keywords = o.optJSONArray("keywords")?.let { a -> (0 until a.length()).map { a.optString(it).trim().lowercase() }.filter { it.isNotEmpty() } } ?: emptyList()
      out.add(Rule(o.optString("id"), o.optString("name", "Rule"), apps, keywords, o.optString("action", "mute")))
    }
    return out
  }

  /** First enabled rule whose apps and keywords both match. Empty lists match anything. */
  fun match(rules: List<Rule>, pkg: String, title: String, text: String): Rule? {
    val haystack = "$title\n$text".lowercase()
    return rules.firstOrNull { rule ->
      (rule.apps.isEmpty() || pkg in rule.apps) && (rule.keywords.isEmpty() || rule.keywords.any { haystack.contains(it) })
    }
  }

  private val codeContext = Regex("(?i)\\b(code|otp|one[- ]time|verification|verify|passcode|password|pin|token|login)\\b")
  private val codePattern = Regex("(?<!\\d)(?<!\\d[- ])(\\d{4,8}|\\d{3}[- ]\\d{3})(?!\\d)(?![- ]\\d)")

  /** Same rules as src/lib/otp.ts, which is the tested reference. */
  fun extractCode(title: String, text: String): String? {
    val body = "$title $text"
    if (!codeContext.containsMatchIn(body)) return null
    val candidates = codePattern.findAll(body).map { it.value.replace(Regex("[- ]"), "") }
      .filter { candidate -> !(candidate.length == 4 && candidate.toInt() in 1900..2099) }
      .toList()
    return candidates.firstOrNull()
  }

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL_ALERTS) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_ALERTS, "Priority alerts", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Notifications your Pulse rules mark as important"
      })
    }
    if (nm.getNotificationChannel(CHANNEL_CODES) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_CODES, "One-time codes", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Copy verification codes with one tap"
      })
    }
    if (nm.getNotificationChannel(CHANNEL_DIGEST) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_DIGEST, "Digests", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Summaries of notifications held back by your rules"
      })
    }
  }

  private fun openApp(context: Context, route: String, request: Int): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.data = android.net.Uri.parse("pulse://$route")
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, request, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun canNotify(context: Context) = NotificationManagerCompat.from(context).areNotificationsEnabled()

  fun postCode(context: Context, app: String, code: String) {
    if (!canNotify(context)) return
    ensureChannels(context)
    val copy = PendingIntent.getBroadcast(
      context, code.hashCode(),
      Intent(context, CopyCodeReceiver::class.java).putExtra("code", code),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val notification = NotificationCompat.Builder(context, CHANNEL_CODES)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Code $code")
      .setContentText("From $app · tap Copy")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setTimeoutAfter(10 * 60 * 1000L)
      .setAutoCancel(true)
      .addAction(0, "Copy", copy)
      .build()
    try {
      NotificationManagerCompat.from(context).notify(CopyCodeReceiver.NOTIFICATION_ID, notification)
    } catch (e: SecurityException) {
      // Notifications were revoked between the check and the post.
    }
  }

  fun postAlert(context: Context, app: String, title: String, text: String, ruleName: String) {
    if (!canNotify(context)) return
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title.ifEmpty { app })
      .setContentText(text)
      .setSubText("$app · $ruleName")
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .apply { openApp(context, "", 7303)?.let { setContentIntent(it) } }
      .build()
    try {
      NotificationManagerCompat.from(context).notify((System.nanoTime() % Int.MAX_VALUE).toInt(), notification)
    } catch (e: SecurityException) {
      // Ignore: the user turned notifications off.
    }
  }

  // ---- digests ----------------------------------------------------------------------------------

  fun digestTimes(context: Context): List<Int> {
    val array = try { JSONArray(prefs(context).getString("digestTimes", "[480,780,1200]")) } catch (e: Exception) { JSONArray() }
    return (0 until array.length()).map { array.optInt(it) }.filter { it in 0 until 24 * 60 }.sorted()
  }

  fun scheduleDigest(context: Context) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    val pending = PendingIntent.getBroadcast(context, DIGEST_REQUEST, Intent(context, DigestReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    alarms.cancel(pending)
    val times = digestTimes(context)
    if (times.isEmpty()) return
    val now = System.currentTimeMillis()
    val next = (0..1).flatMap { dayOffset ->
      times.map { minutes ->
        Calendar.getInstance().apply {
          timeInMillis = now
          add(Calendar.DAY_OF_YEAR, dayOffset)
          set(Calendar.HOUR_OF_DAY, minutes / 60)
          set(Calendar.MINUTE, minutes % 60)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }.timeInMillis
      }
    }.filter { it > now }.minOrNull() ?: return
    if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
  }

  fun deliverDigest(context: Context) {
    val prefs = prefs(context)
    val since = prefs.getLong("lastDigestAt", 0)
    val db = PulseDb.get(context)
    val count = db.countState("digest", since)
    val apps = db.appsInState("digest", since)
    prefs.edit().putLong("lastDigestAt", System.currentTimeMillis()).apply()
    if (count == 0 || !canNotify(context)) return
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_DIGEST)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Your digest")
      .setContentText("$count notification${if (count == 1) "" else "s"} from $apps app${if (apps == 1) "" else "s"} held for later")
      .setAutoCancel(true)
      .apply { openApp(context, "digest", 7304)?.let { setContentIntent(it) } }
      .build()
    try {
      NotificationManagerCompat.from(context).notify(DIGEST_NOTIFICATION, notification)
    } catch (e: SecurityException) {
      // Ignore.
    }
  }

  fun emit(row: Map<String, Any?>?) {
    if (row != null) listener?.invoke(row)
  }
}
