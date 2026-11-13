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

  private val trigger = Regex("(?i)(?:^|[^a-z])(code|otp|one[- ]time|verification|verify|passcode|pin|token)(?![a-z])")
  private val titleTrigger = Regex("(?i)(otp|verification|one[- ]time|passcode|security code)")
  private val postal = Regex("(?i)\\bpin\\s*code\\b")
  private val candidate = Regex("([0-9]{4,8}|[0-9]{3}[- ][0-9]{3})")
  private val moneyBefore = Regex("(?i)(rs\\.?|pkr|usd|\\$|amount|amt|of rs\\.?)\\s*$")

  /** Same rules as src/lib/otp.ts, which is the tested reference. Keep the two in step. */
  fun extractCode(title: String, text: String): String? {
    val body = postal.replace(text) { " ".repeat(8) }
    val triggers = trigger.findAll(body).map { it.range.first + it.value.length / 2.0 }.toList()
    if (triggers.isEmpty() && !titleTrigger.containsMatchIn(title)) return null
    data class Candidate(val code: String, val start: Int, val end: Int)
    val candidates = candidate.findAll(body).mapNotNull { m ->
      val start = m.range.first
      val end = m.range.last + 1
      val before = body.substring(maxOf(0, start - 2), start)
      val after = body.substring(end, minOf(body.length, end + 2))
      if (Regex("[0-9][- ]?$").containsMatchIn(before) || Regex("^[- ]?[0-9]").containsMatchIn(after)) return@mapNotNull null
      if (moneyBefore.containsMatchIn(body.substring(maxOf(0, start - 8), start))) return@mapNotNull null
      if (Regex("^[.,][0-9]").containsMatchIn(after)) return@mapNotNull null
      Candidate(m.value.replace(Regex("[- ]"), ""), start, end)
    }.toList()
    val nonYears = candidates.filter { !(it.code.length == 4 && it.code.toInt() in 1900..2099) }
    val pool = if (nonYears.isNotEmpty()) nonYears else candidates
    if (pool.isEmpty()) return null
    if (triggers.isEmpty()) return pool.first().code
    fun distance(c: Candidate) = triggers.minOf { t -> minOf(Math.abs(t - c.start), Math.abs(t - c.end)) }
    return pool.minByOrNull { distance(it) }?.code
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
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(
        NotificationCompat.Builder(context, CHANNEL_CODES)
          .setSmallIcon(context.applicationInfo.icon)
          .setContentTitle("Verification code received")
          .setContentText("Unlock to view")
          .build()
      )
      .build()
    try {
      NotificationManagerCompat.from(context).notify(CopyCodeReceiver.NOTIFICATION_ID, notification)
    } catch (e: SecurityException) {
      // Notifications were revoked between the check and the post.
    }
  }

  /** Stable id per source notification, so updates replace the alert instead of stacking. */
  fun alertId(key: String): Int = ("alert:" + key).hashCode()

  fun cancelAlert(context: Context, key: String) {
    NotificationManagerCompat.from(context).cancel(alertId(key))
  }

  fun postAlert(context: Context, key: String, app: String, title: String, text: String, ruleName: String) {
    if (!canNotify(context)) return
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title.ifEmpty { app })
      .setContentText(text)
      .setSubText("$app · $ruleName")
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setOnlyAlertOnce(true)
      .setAutoCancel(true)
      .apply { openApp(context, "", 7303)?.let { setContentIntent(it) } }
      .build()
    try {
      NotificationManagerCompat.from(context).notify(alertId(key), notification)
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

  /** True when a digest time passed since the last delivered digest (e.g. the phone was off). */
  fun digestOverdue(context: Context): Boolean {
    val last = prefs(context).getLong("lastDigestAt", 0)
    if (last == 0L) return false
    val now = System.currentTimeMillis()
    return digestTimes(context).any { minutes ->
      (0..1).any { back ->
        val at = Calendar.getInstance().apply {
          timeInMillis = now
          add(Calendar.DAY_OF_YEAR, -back)
          set(Calendar.HOUR_OF_DAY, minutes / 60)
          set(Calendar.MINUTE, minutes % 60)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        at in (last + 1)..now
      }
    }
  }

  fun deliverDigest(context: Context) {
    val prefs = prefs(context)
    val since = prefs.getLong("lastDigestAt", 0)
    val db = PulseDb.get(context)
    val count = db.countState("digest", since)
    val apps = db.appsInState("digest", since)
    if (count == 0) {
      prefs.edit().putLong("lastDigestAt", System.currentTimeMillis()).apply()
      return
    }
    // Only mark the digest delivered once it can actually be shown; otherwise keep counting.
    if (!canNotify(context)) return
    prefs.edit().putLong("lastDigestAt", System.currentTimeMillis()).apply()
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

  // ---- remind me later ---------------------------------------------------------------------------

  /** Pending reminders are kept in prefs so they can be re-armed after a reboot. */
  @Synchronized
  private fun saveReminders(context: Context, list: JSONArray) {
    prefs(context).edit().putString("reminders", list.toString()).apply()
  }

  @Synchronized
  fun pendingReminders(context: Context): JSONArray = try { JSONArray(prefs(context).getString("reminders", "[]")) } catch (e: Exception) { JSONArray() }

  fun addReminder(context: Context, id: Long, at: Long, app: String, title: String, text: String) {
    val list = pendingReminders(context)
    val next = JSONArray()
    for (i in 0 until list.length()) list.optJSONObject(i)?.let { if (it.optLong("id") != id) next.put(it) }
    next.put(JSONObject().put("id", id).put("at", at).put("app", app).put("title", title).put("text", text))
    saveReminders(context, next)
    scheduleReminder(context, id, at, app, title, text)
  }

  fun removeReminder(context: Context, id: Long) {
    val list = pendingReminders(context)
    val next = JSONArray()
    for (i in 0 until list.length()) list.optJSONObject(i)?.let { if (it.optLong("id") != id) next.put(it) }
    saveReminders(context, next)
  }

  fun rearmReminders(context: Context) {
    val now = System.currentTimeMillis()
    val list = pendingReminders(context)
    for (i in 0 until list.length()) {
      val r = list.optJSONObject(i) ?: continue
      // Overdue ones (phone was off) fire right away.
      scheduleReminder(context, r.optLong("id"), maxOf(r.optLong("at"), now + 2000), r.optString("app"), r.optString("title"), r.optString("text"))
    }
  }

  fun scheduleReminder(context: Context, id: Long, at: Long, app: String, title: String, text: String) {
    val intent = Intent(context, ReminderReceiver::class.java)
      .putExtra("id", id).putExtra("app", app).putExtra("title", title).putExtra("text", text)
    val pending = PendingIntent.getBroadcast(context, ("remind:$id").hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val alarms = context.getSystemService(AlarmManager::class.java)
    if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
    else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
  }

  fun postReminder(context: Context, id: Long, app: String, title: String, text: String) {
    if (!canNotify(context)) return
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Reminder: ${title.ifEmpty { app }}")
      .setContentText(text)
      .setSubText(app)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .apply { openApp(context, "n/$id", ("open:$id").hashCode())?.let { setContentIntent(it) } }
      .build()
    try {
      NotificationManagerCompat.from(context).notify(("remind:$id").hashCode(), notification)
    } catch (e: SecurityException) {
      // Ignore.
    }
  }

  fun emit(row: Map<String, Any?>?) {
    if (row != null) listener?.invoke(row)
  }
}
