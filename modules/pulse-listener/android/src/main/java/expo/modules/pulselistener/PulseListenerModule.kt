package expo.modules.pulselistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import android.app.Activity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PulseError(message: String) : CodedException("ERR_PULSE", message, null)

class PulseListenerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun db() = PulseDb.get(context)

  private fun start(intent: Intent) {
    try {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }

  private var pendingPick: Promise? = null

  private fun pick(intent: Intent, promise: Promise) {
    val activity = appContext.currentActivity ?: return promise.reject(PulseError("Notivault is not in the foreground."))
    pendingPick?.resolve(null)
    pendingPick = promise
    try {
      activity.startActivityForResult(intent, PICK_REQUEST)
    } catch (e: Exception) {
      pendingPick = null
      promise.reject(PulseError("No file app on this phone can open a backup."))
    }
  }

  private fun readUri(uri: String): ByteArray {
    val stream = context.contentResolver.openInputStream(Uri.parse(uri)) ?: throw PulseError("Could not open that file.")
    return stream.use { input ->
      val out = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val n = input.read(buffer)
        if (n < 0) break
        out.write(buffer, 0, n)
        if (out.size() > MAX_BACKUP_BYTES) throw PulseError("That file is too large to be a Notivault backup.")
      }
      out.toByteArray()
    }
  }

  private fun openBackup(uri: String, password: String?): org.json.JSONObject = try {
    BackupFile.open(readUri(uri), password)
  } catch (e: BackupFile.NeedsPassword) {
    throw CodedException("ERR_NEEDS_PASSWORD", e.message, null)
  } catch (e: BackupFile.WrongPassword) {
    throw CodedException("ERR_WRONG_PASSWORD", e.message, null)
  } catch (e: BackupFile.Invalid) {
    throw PulseError(e.message ?: "This is not a Notivault backup file.")
  }

  override fun definition() = ModuleDefinition {
    Name("PulseListener")

    Events("onNotification")

    OnCreate {
      Pulse.listener = { row -> runCatching { sendEvent("onNotification", row) } }
      runCatching { Pulse.scheduleDigest(context) }
    }

    OnDestroy {
      Pulse.listener = null
    }

    Function("isListenerEnabled") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    Function("openListenerSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 30) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
          Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
          ComponentName(context, PulseListenerService::class.java).flattenToString()
        )
      } else {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      }
      start(intent)
    }

    Function("openAppInfo") {
      start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= 31) start(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
    }

    AsyncFunction("query") { search: String?, pkg: String?, state: String?, beforeAt: Double?, beforeId: Double?, limit: Int ->
      db().query(search, pkg, state, beforeAt?.toLong(), beforeId?.toLong(), limit)
    }

    AsyncFunction("setStarred") { id: Double, starred: Boolean -> db().setStarred(id.toLong(), starred) }

    AsyncFunction("remindLater") { id: Double, at: Double ->
      val row = db().byId(id.toLong()) ?: throw PulseError("This notification no longer exists.")
      Pulse.addReminder(context, id.toLong(), at.toLong(), row["app"] as String, row["title"] as String, row["text"] as String)
    }

    Function("notificationsEnabled") { NotificationManagerCompat.from(context).areNotificationsEnabled() }

    AsyncFunction("versions") { key: String -> db().versions(key) }

    AsyncFunction("byId") { id: Double -> db().byId(id.toLong()) }

    AsyncFunction("apps") { db().apps() }

    AsyncFunction("stats") { since: Double, pkg: String? -> db().stats(since.toLong(), pkg) }

    AsyncFunction("deleteAll") { db().deleteAll() }

    AsyncFunction("deleteOne") { id: Double -> db().delete(id.toLong()) }

    Function("getLastDigestAt") { Pulse.prefs(context).getLong("lastDigestAt", 0).toDouble() }

    Function("setRules") { json: String -> Pulse.prefs(context).edit().putString("rules", json).apply() }

    Function("setDigestTimes") { json: String ->
      Pulse.prefs(context).edit().putString("digestTimes", json).apply()
      Pulse.scheduleDigest(context)
    }

    AsyncFunction("setOptions") { codes: Boolean, includeOngoing: Boolean, retentionDays: Int ->
      Pulse.prefs(context).edit()
        .putBoolean("codes", codes)
        .putBoolean("includeOngoing", includeOngoing)
        .putInt("retentionDays", retentionDays)
        .apply()
      if (retentionDays > 0) db().prune(System.currentTimeMillis() - retentionDays * 24L * 60 * 60 * 1000)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != PICK_REQUEST) return@OnActivityResult
      val promise = pendingPick ?: return@OnActivityResult
      pendingPick = null
      val uri = payload.data?.data
      if (payload.resultCode != Activity.RESULT_OK || uri == null) promise.resolve(null) else promise.resolve(uri.toString())
    }

    /** Android's "Save to" screen (Downloads, Drive, a USB stick...). Resolves to a content URI, or null if cancelled. */
    AsyncFunction("pickBackupDestination") { name: String, promise: Promise ->
      pick(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, name), promise)
    }

    /** Android's file picker for a backup to restore. Resolves to a content URI, or null if cancelled. */
    AsyncFunction("pickBackupFile") { promise: Promise ->
      pick(
        Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
          .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "application/octet-stream", "text/plain")),
        promise
      )
    }

    /** Writes every notification plus the given settings to `uri`. Returns how many notifications were saved. */
    AsyncFunction("exportBackup") { uri: String, settingsJson: String, appVersion: String, password: String? ->
      val rows = db().backupRows()
      val plain = org.json.JSONObject()
        .put("format", BackupFile.FORMAT)
        .put("version", BackupFile.VERSION)
        .put("appVersion", appVersion)
        .put("exportedAt", System.currentTimeMillis())
        .put("settings", org.json.JSONObject(settingsJson))
        .put("notifications", rows)
      val bytes = BackupFile.seal(plain, password)
      val target = Uri.parse(uri)
      // Some providers (cloud drives) reject the truncate mode; a freshly created file is empty anyway.
      val out = runCatching { context.contentResolver.openOutputStream(target, "wt") }.getOrNull()
        ?: context.contentResolver.openOutputStream(target, "w")
        ?: throw PulseError("Could not write to that place.")
      out.use { it.write(bytes) }
      rows.length()
    }

    /** Checks a backup and describes it without changing anything. */
    AsyncFunction("inspectBackup") { uri: String, password: String? ->
      val backup = openBackup(uri, password)
      mapOf(
        "exportedAt" to backup.optLong("exportedAt", 0L).toDouble(),
        "count" to (backup.optJSONArray("notifications")?.length() ?: 0),
        "encrypted" to !password.isNullOrEmpty(),
        "settings" to (backup.optJSONObject("settings")?.toString() ?: "{}")
      )
    }

    /** Adds the backup's notifications to this phone, skipping ones already here. */
    AsyncFunction("importBackupNotifications") { uri: String, password: String? ->
      val backup = openBackup(uri, password)
      val (added, skipped) = db().importRows(backup.optJSONArray("notifications") ?: org.json.JSONArray())
      mapOf("added" to added, "skipped" to skipped)
    }

    Function("sendDigestNow") { Pulse.deliverDigest(context) }

    Function("setQuietHours") { enabled: Boolean, start: Int, end: Int ->
      Pulse.prefs(context).edit().putBoolean("quietEnabled", enabled).putInt("quietStart", start).putInt("quietEnd", end).apply()
    }
  }

  companion object {
    private const val PICK_REQUEST = 0x5B4C
    private const val MAX_BACKUP_BYTES = 200 * 1024 * 1024
  }
}
