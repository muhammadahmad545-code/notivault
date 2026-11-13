package expo.modules.pulselistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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

    AsyncFunction("query") { search: String?, pkg: String?, state: String?, before: Double?, limit: Int ->
      db().query(search, pkg, state, before?.toLong(), limit)
    }

    AsyncFunction("versions") { key: String -> db().versions(key) }

    AsyncFunction("byId") { id: Double -> db().byId(id.toLong()) }

    AsyncFunction("apps") { db().apps() }

    AsyncFunction("stats") { since: Double -> db().stats(since.toLong()) }

    AsyncFunction("deleteAll") { db().deleteAll() }

    AsyncFunction("deleteOne") { id: Double -> db().delete(id.toLong()) }

    Function("getLastDigestAt") { Pulse.prefs(context).getLong("lastDigestAt", 0).toDouble() }

    Function("setRules") { json: String -> Pulse.prefs(context).edit().putString("rules", json).apply() }

    Function("setDigestTimes") { json: String ->
      Pulse.prefs(context).edit().putString("digestTimes", json).apply()
      Pulse.scheduleDigest(context)
    }

    Function("setOptions") { codes: Boolean, includeOngoing: Boolean, retentionDays: Int ->
      Pulse.prefs(context).edit()
        .putBoolean("codes", codes)
        .putBoolean("includeOngoing", includeOngoing)
        .putInt("retentionDays", retentionDays)
        .apply()
      if (retentionDays > 0) db().prune(System.currentTimeMillis() - retentionDays * 24L * 60 * 60 * 1000)
    }

    Function("sendDigestNow") { Pulse.deliverDigest(context) }
  }
}
