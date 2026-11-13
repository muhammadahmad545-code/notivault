package expo.modules.pulselistener

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Local store for captured notifications, with a full-text index over app, title and text. */
class PulseDb private constructor(context: Context) : SQLiteOpenHelper(context, "pulse.db", null, 1) {

  override fun onConfigure(db: SQLiteDatabase) {
    db.enableWriteAheadLogging()
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nkey TEXT NOT NULL,
        package TEXT NOT NULL,
        app TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        category TEXT,
        posted_at INTEGER NOT NULL,
        removed_at INTEGER,
        removed_by TEXT,
        state TEXT NOT NULL,
        rule_name TEXT,
        code TEXT
      )
      """.trimIndent()
    )
    db.execSQL("CREATE INDEX idx_posted ON notifications (posted_at DESC)")
    db.execSQL("CREATE INDEX idx_package ON notifications (package, posted_at DESC)")
    db.execSQL("CREATE INDEX idx_key ON notifications (nkey, posted_at DESC)")
    db.execSQL("CREATE VIRTUAL TABLE notifications_fts USING fts4(content='notifications', app, title, text)")
    db.execSQL("CREATE TRIGGER fts_ai AFTER INSERT ON notifications BEGIN INSERT INTO notifications_fts(docid, app, title, text) VALUES (new.id, new.app, new.title, new.text); END")
    db.execSQL("CREATE TRIGGER fts_bd BEFORE DELETE ON notifications BEGIN DELETE FROM notifications_fts WHERE docid = old.id; END")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  data class Entry(
    val key: String,
    val pkg: String,
    val app: String,
    val title: String,
    val text: String,
    val category: String?,
    val postedAt: Long,
    val state: String,
    val ruleName: String?,
    val code: String?
  )

  /** Returns the new row id, or -1 when this is an unchanged re-post of the latest version. */
  @Synchronized
  fun insert(entry: Entry): Long {
    val db = writableDatabase
    db.rawQuery("SELECT title, text FROM notifications WHERE nkey = ? ORDER BY posted_at DESC LIMIT 1", arrayOf(entry.key)).use { c ->
      if (c.moveToFirst() && c.getString(0) == entry.title && c.getString(1) == entry.text) return -1
    }
    val values = ContentValues().apply {
      put("nkey", entry.key)
      put("package", entry.pkg)
      put("app", entry.app)
      put("title", entry.title)
      put("text", entry.text)
      put("category", entry.category)
      put("posted_at", entry.postedAt)
      put("state", entry.state)
      put("rule_name", entry.ruleName)
      put("code", entry.code)
    }
    return db.insert("notifications", null, values)
  }

  @Synchronized
  fun markRemoved(key: String, at: Long, by: String) {
    writableDatabase.execSQL(
      "UPDATE notifications SET removed_at = ?, removed_by = ? WHERE id = (SELECT id FROM notifications WHERE nkey = ? ORDER BY posted_at DESC LIMIT 1) AND removed_at IS NULL",
      arrayOf<Any>(at, by, key)
    )
  }

  @Synchronized
  fun prune(olderThan: Long) {
    writableDatabase.delete("notifications", "posted_at < ?", arrayOf(olderThan.toString()))
  }

  @Synchronized
  fun deleteAll() {
    writableDatabase.delete("notifications", null, null)
    writableDatabase.execSQL("INSERT INTO notifications_fts(notifications_fts) VALUES('rebuild')")
  }

  @Synchronized
  fun delete(id: Long) {
    writableDatabase.delete("notifications", "id = ?", arrayOf(id.toString()))
  }

  private fun rows(cursor: Cursor): List<Map<String, Any?>> = cursor.use { c ->
    val out = mutableListOf<Map<String, Any?>>()
    while (c.moveToNext()) {
      out.add(mapOf(
        "id" to c.getLong(0).toDouble(),
        "key" to c.getString(1),
        "package" to c.getString(2),
        "app" to c.getString(3),
        "title" to c.getString(4),
        "text" to c.getString(5),
        "category" to c.getString(6),
        "postedAt" to c.getLong(7).toDouble(),
        "removedAt" to if (c.isNull(8)) null else c.getLong(8).toDouble(),
        "removedBy" to c.getString(9),
        "state" to c.getString(10),
        "ruleName" to c.getString(11),
        "code" to c.getString(12),
        "versions" to c.getInt(13)
      ))
    }
    out
  }

  private val columns = "n.id, n.nkey, n.package, n.app, n.title, n.text, n.category, n.posted_at, n.removed_at, n.removed_by, n.state, n.rule_name, n.code, " +
    "(SELECT COUNT(*) FROM notifications v WHERE v.nkey = n.nkey)"

  /** Builds an FTS query that matches every word as a prefix: "inv pay" -> "inv* pay*". */
  private fun ftsQuery(search: String): String? {
    val words = search.split(Regex("\\s+")).map { it.replace(Regex("[^\\p{L}\\p{N}]"), "") }.filter { it.isNotEmpty() }
    return if (words.isEmpty()) null else words.joinToString(" ") { "$it*" }
  }

  fun query(search: String?, pkg: String?, state: String?, before: Long?, limit: Int): List<Map<String, Any?>> {
    val where = mutableListOf<String>()
    val args = mutableListOf<String>()
    val fts = search?.let(::ftsQuery)
    if (fts != null) {
      where.add("n.id IN (SELECT docid FROM notifications_fts WHERE notifications_fts MATCH ?)")
      args.add(fts)
    }
    if (!pkg.isNullOrEmpty()) { where.add("n.package = ?"); args.add(pkg) }
    if (!state.isNullOrEmpty()) { where.add("n.state = ?"); args.add(state) }
    if (before != null) { where.add("n.posted_at < ?"); args.add(before.toString()) }
    val clause = if (where.isEmpty()) "" else "WHERE " + where.joinToString(" AND ")
    val sql = "SELECT $columns FROM notifications n $clause ORDER BY n.posted_at DESC LIMIT ${limit.coerceIn(1, 500)}"
    return rows(readableDatabase.rawQuery(sql, args.toTypedArray()))
  }

  fun versions(key: String): List<Map<String, Any?>> =
    rows(readableDatabase.rawQuery("SELECT $columns FROM notifications n WHERE n.nkey = ? ORDER BY n.posted_at ASC", arrayOf(key)))

  fun byId(id: Long): Map<String, Any?>? =
    rows(readableDatabase.rawQuery("SELECT $columns FROM notifications n WHERE n.id = ?", arrayOf(id.toString()))).firstOrNull()

  fun apps(): List<Map<String, Any?>> = readableDatabase.rawQuery(
    "SELECT package, app, COUNT(*), MAX(posted_at) FROM notifications GROUP BY package ORDER BY COUNT(*) DESC", null
  ).use { c ->
    val out = mutableListOf<Map<String, Any?>>()
    while (c.moveToNext()) out.add(mapOf("package" to c.getString(0), "app" to c.getString(1), "count" to c.getInt(2), "lastAt" to c.getLong(3).toDouble()))
    out
  }

  fun countState(state: String, since: Long): Int = readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM notifications WHERE state = ? AND posted_at > ?", arrayOf(state, since.toString())
  ).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }

  fun appsInState(state: String, since: Long): Int = readableDatabase.rawQuery(
    "SELECT COUNT(DISTINCT package) FROM notifications WHERE state = ? AND posted_at > ?", arrayOf(state, since.toString())
  ).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }

  /** Notification counts per app, per hour of day and per day, since a timestamp. */
  fun stats(since: Long): Map<String, Any?> {
    val db = readableDatabase
    val perApp = db.rawQuery(
      "SELECT package, app, COUNT(*) FROM notifications WHERE posted_at > ? GROUP BY package ORDER BY COUNT(*) DESC LIMIT 12", arrayOf(since.toString())
    ).use { c ->
      val out = mutableListOf<Map<String, Any?>>()
      while (c.moveToNext()) out.add(mapOf("package" to c.getString(0), "app" to c.getString(1), "count" to c.getInt(2)))
      out
    }
    val hours = IntArray(24)
    val days = mutableMapOf<String, Int>()
    var total = 0
    var quieted = 0
    db.rawQuery(
      "SELECT strftime('%H', posted_at / 1000, 'unixepoch', 'localtime'), strftime('%Y-%m-%d', posted_at / 1000, 'unixepoch', 'localtime'), state FROM notifications WHERE posted_at > ?",
      arrayOf(since.toString())
    ).use { c ->
      while (c.moveToNext()) {
        c.getString(0)?.toIntOrNull()?.let { if (it in 0..23) hours[it]++ }
        val day = c.getString(1) ?: continue
        days[day] = (days[day] ?: 0) + 1
        total++
        if (c.getString(2) != "shown") quieted++
      }
    }
    return mapOf("total" to total, "quieted" to quieted, "perApp" to perApp, "perHour" to hours.toList(), "perDay" to days)
  }

  companion object {
    @Volatile private var instance: PulseDb? = null
    fun get(context: Context): PulseDb = instance ?: synchronized(this) {
      instance ?: PulseDb(context.applicationContext).also { instance = it }
    }
  }
}
