package expo.modules.pulselistener

import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PersistableBundle
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat

class CopyCodeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val code = intent.getStringExtra("code") ?: return
    copySensitive(context, code)
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    Toast.makeText(context, "Code copied", Toast.LENGTH_SHORT).show()
  }

  companion object {
    const val NOTIFICATION_ID = 7305

    /** Copy a code, marked sensitive so the keyboard and clipboard preview do not show it (Android 13+). */
    fun copySensitive(context: Context, code: String) {
      val clipboard = context.getSystemService(ClipboardManager::class.java)
      val clip = ClipData.newPlainText("Code", code)
      if (Build.VERSION.SDK_INT >= 24) {
        clip.description.extras = PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
      }
      clipboard.setPrimaryClip(clip)
    }
  }
}

class DigestReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    try {
      Pulse.deliverDigest(context.applicationContext)
      Pulse.scheduleDigest(context.applicationContext)
    } finally {
      pending.finish()
    }
  }
}

class PulseBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val app = context.applicationContext
    // A digest time that passed while the phone was off is delivered now instead of being skipped.
    if (Pulse.digestOverdue(app)) Pulse.deliverDigest(app)
    Pulse.scheduleDigest(app)
    Pulse.rearmReminders(app)
  }
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Pulse.removeReminder(context.applicationContext, intent.getLongExtra("id", 0))
    Pulse.postReminder(
      context.applicationContext,
      intent.getLongExtra("id", 0),
      intent.getStringExtra("app") ?: "",
      intent.getStringExtra("title") ?: "",
      intent.getStringExtra("text") ?: ""
    )
  }
}
