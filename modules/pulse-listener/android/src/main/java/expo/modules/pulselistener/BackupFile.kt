package expo.modules.pulselistener

import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.SecureRandom
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * The backup file format. A plain backup is readable JSON. With a password, the JSON is gzipped and
 * sealed with AES-256-GCM under a PBKDF2-SHA256 key, so a wrong password or a damaged file is detected.
 */
object BackupFile {
  const val FORMAT = "notivault-backup"
  const val VERSION = 1
  private const val ITERATIONS = 210_000

  class NeedsPassword : Exception("This backup is protected with a password.")
  class WrongPassword : Exception("That password is not right for this backup.")
  class Invalid(message: String) : Exception(message)

  fun seal(plain: JSONObject, password: String?): ByteArray {
    if (password.isNullOrEmpty()) return plain.toString().toByteArray(Charsets.UTF_8)
    val random = SecureRandom()
    val salt = ByteArray(16).also(random::nextBytes)
    val iv = ByteArray(12).also(random::nextBytes)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key(password, salt, ITERATIONS), GCMParameterSpec(128, iv))
    val data = cipher.doFinal(gzip(plain.toString().toByteArray(Charsets.UTF_8)))
    return JSONObject()
      .put("format", FORMAT)
      .put("version", VERSION)
      .put("encrypted", true)
      .put("kdf", "PBKDF2WithHmacSHA256")
      .put("iterations", ITERATIONS)
      .put("salt", b64(salt))
      .put("iv", b64(iv))
      .put("data", b64(data))
      .toString()
      .toByteArray(Charsets.UTF_8)
  }

  fun open(bytes: ByteArray, password: String?): JSONObject {
    val outer = try {
      JSONObject(String(bytes, Charsets.UTF_8))
    } catch (e: Exception) {
      throw Invalid("This is not a Notivault backup file.")
    }
    if (outer.optString("format") != FORMAT) throw Invalid("This is not a Notivault backup file.")
    if (outer.optInt("version", 0) > VERSION) throw Invalid("This backup was made by a newer Notivault. Update the app, then try again.")
    if (!outer.optBoolean("encrypted", false)) return outer
    if (password.isNullOrEmpty()) throw NeedsPassword()
    val plain = try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      val salt = unb64(outer.getString("salt"))
      cipher.init(Cipher.DECRYPT_MODE, key(password, salt, outer.optInt("iterations", ITERATIONS)), GCMParameterSpec(128, unb64(outer.getString("iv"))))
      gunzip(cipher.doFinal(unb64(outer.getString("data"))))
    } catch (e: AEADBadTagException) {
      throw WrongPassword()
    } catch (e: Exception) {
      throw Invalid("This backup file is damaged.")
    }
    val inner = JSONObject(String(plain, Charsets.UTF_8))
    if (inner.optString("format") != FORMAT) throw Invalid("This backup file is damaged.")
    return inner
  }

  private fun key(password: String, salt: ByteArray, iterations: Int): SecretKeySpec {
    val spec = PBEKeySpec(password.toCharArray(), salt, iterations, 256)
    val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    spec.clearPassword()
    return SecretKeySpec(bytes, "AES")
  }

  private fun gzip(bytes: ByteArray): ByteArray = ByteArrayOutputStream().also { out -> GZIPOutputStream(out).use { it.write(bytes) } }.toByteArray()
  private fun gunzip(bytes: ByteArray): ByteArray = GZIPInputStream(ByteArrayInputStream(bytes)).use { it.readBytes() }
  private fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
  private fun unb64(text: String): ByteArray = Base64.decode(text, Base64.NO_WRAP)
}
