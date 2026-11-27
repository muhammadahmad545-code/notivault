<p align="center"><img src="assets/icon.png" width="112" alt="Notivault logo: a vault door with a bell at its centre"></p>

# Notivault

*Renamed from **Pulse** in 1.2.2, so it is not confused with Clocked (formerly AppPulse), the suite's screen-time tracker.*

A private, searchable inbox for every notification on your Android phone, with rules that decide what is allowed to interrupt you.

**[Download the latest APK](https://github.com/muhammadahmad545-code/notivault/releases/latest)**

Pick the file ending in **`-arm64-v8a.apk`**: that is the right one for almost every phone from the last several years. `-armeabi-v7a.apk` is for older 32-bit phones and `-x86_64.apk` for emulators and Chromebooks. Installed apps update themselves to the matching file.

## What's new in 1.4

- **Backup and restore for a new phone:** Settings → *Back up to a file* saves every notification, your rules and your settings into one file, through Android's own "Save to" screen (Downloads, Drive, a USB stick…). On the new phone, install Notivault and use *Restore from a backup*.
- **Optional password:** the backup can be sealed with AES-256-GCM under a key derived from your password (PBKDF2-SHA256, 210,000 rounds). A wrong password or a damaged file is detected, never half-imported. Without a password the file is readable JSON.
- **Safe to repeat:** restoring adds to what is already on the phone. Notifications already there are skipped, rules are merged, and history is never shortened by an import.

## What's new in 1.3

- **A real logo:** a vault door with a bell at its centre.
- **Money:** spending and income read from your bank and wallet alerts (Meezan, HBL, JazzCash, Easypaisa, cards…). Totals per currency, the merchant or sender, this month / last month / 90 days, and CSV export. It is conservative: an alert needs an amount with a currency and a clear debited/spent/sent or credited/received word; promotions, bills that are only *due*, declined payments and one-time-code messages are ignored. No SMS permission and no bank login: it reads the notifications Notivault already keeps.
- **Copy-code tile:** a Quick Settings tile that copies the newest one-time code from the last 15 minutes, marked sensitive so it stays out of clipboard previews.
- **Export history as CSV** (last 30 days) through Android's share sheet. One-time codes are left out of the file.

## What's new in 1.2

- **Calmer, cleaner design:** plain surfaces, a docked tab bar, clear type and no distracting motion.
- **Quiet hours:** during the hours you choose, notifications are held for your digest; priority rules and verification codes still come through.
- **Tested end to end on every build:** an Android emulator runs the app like a user before any release.

## What's new in 1.1

- **Redesigned** with tab navigation (Inbox, Digest, Insights, Settings), live counts for today, day-grouped history and a first-run introduction.
- **Starred notifications** are kept forever, whatever the retention setting. **Remind me later** brings any notification back at a time you pick, and survives reboots.
- **App pages:** per-app notifications per day, peak hour, recent notifications and one-tap Quiet / Digest / Priority rules. **Rule templates** for urgent messages, sales and social noise.
- **Chat apps are read message by message**, so a group chat shows who said what and search finds the actual words.
- **Fixes:** listener work moved off the main thread; quieted notifications stay quiet on re-post; leftover group summaries removed; priority alerts update in place; codes are hidden on the lock screen; code detection picks the right number and ignores amounts; search handles punctuation; no skipped rows when paging.

## What it does

- **Full history.** Every notification is kept, searchable by word prefix across app, title and text (“inv pay” finds “Invoice payment due”).
- **Nothing lost to deletions or edits.** Apps update a notification as a chat grows or when a message is edited or deleted; Notivault keeps every version and marks notifications the app itself removed.
- **Rules.** Match by app, by keywords, or both. The first matching rule decides:
  - **Quiet**: removed from the shade, kept in Notivault.
  - **Hold for digest**: removed now, summarised at the times you choose (8:00, 13:00 and 20:00 by default).
  - **Priority alert**: repeated as a high-priority alert, so “urgent” from family gets through even when that app is muted.
  - The editor shows how many of your last 300 notifications the rule would have caught, before you save it.
- **One-time code helper.** Verification codes are detected and offered with a Copy button; the copied code is marked sensitive so it does not appear in clipboard previews.
- **Insights.** Notifications per day, top apps, the hour you are interrupted most, and how much your rules quiet.
- **App lock** with fingerprint or the phone's screen lock, re-locking after 30 seconds in the background.
- **Retention** of 7, 30, 90 or 365 days, or forever. **Self-updating** from this repository's releases.

## How it works

```
Android ──▶ PulseListenerService (NotificationListenerService, Kotlin)
              ├─ extract title / big text / message lines
              ├─ match rules ─▶ cancel from shade · repost as alert
              ├─ detect codes ─▶ "Copy" notification
              └─ SQLite + FTS4 full-text index ◀── React Native UI (query, stats)
DigestReceiver (exact alarm) ─▶ summary notification at digest times
```

- The listener runs as part of Android's notification system, so it works whether or not the app is open. Rules, digest times and options are mirrored into native storage for that reason.
- Re-posts of an identical notification are de-duplicated per notification key, so a chat that updates its notification ten times is stored once per actual change.
- Code detection only considers messages that talk about codes, and ignores years and digits that are part of longer numbers. The TypeScript version is the tested reference; the Kotlin version mirrors it.

**A limit stated plainly:** Android lets other apps read notifications but not silence them before they alert. “Quiet” removes a notification immediately, but the original app's sound may already have played. For full silence, turn that app's notification sound off in Android settings and let Notivault decide what to surface.

## Privacy

Notifications contain your messages, so they are treated accordingly: stored only in the app's private storage, excluded from Android's automatic cloud backups, never uploaded (a backup file only leaves the phone if you save it somewhere yourself), and optionally behind a biometric lock. The only network request Notivault makes is the update check against GitHub.

## Setup

Notivault needs **notification access**. On Android 13 and later, apps installed outside the Play Store are blocked from it until you open App info, tap ⋮ and choose **Allow restricted settings**. The app walks you through both steps.

## Built with

- React Native 0.88 + Expo SDK 58, TypeScript, Expo Router
- Kotlin Expo module: `NotificationListenerService`, `SQLiteOpenHelper` with an FTS4 external-content index, alarms and broadcast receivers
- [Basalt Core](https://github.com/muhammadahmad545-code/basalt-core) for the shared theme, UI kit, settings and updater
- Tests for code detection and rule matching

## Development

```bash
npm install
npm test
npm run typecheck
npm run prebuild
npx expo run:android
```

Pushing a tag `vX.Y.Z` that matches `package.json` builds a signed APK in GitHub Actions and publishes it as a release.

## License

MIT
