# Notivault end-to-end: grant notification access, post real notifications, and check capture,
# code detection, search, and a quiet rule. Sourced by smoke.sh (helpers come from there).

adb shell cmd notification allow_listener dev.basalt.pulse/expo.modules.pulselistener.PulseListenerService
sleep 5
adb shell "cmd notification post -t 'HBL Bank' otp1 'Your OTP for login is 482913. Do not share it.'" >/dev/null
adb shell "cmd notification post -t 'Ali' chat1 'Lunch at 2 tomorrow?'" >/dev/null
sleep 6

# Return to the inbox and check both arrived, with the code recognised.
adb shell monkey -p dev.basalt.pulse -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 6
expect "HBL Bank" 20 "notification captured in the inbox"
expect "Lunch at 2 tomorrow" 10 "second notification captured"
expect "482913" 10 "one-time code detected on the notification"
if adb shell dumpsys notification --noredact | grep -q "Code 482913"; then pass "copy-code notification posted"; else fail "copy-code notification posted"; fi
shot e2e-inbox

# Search narrows the list.
tap_text "Search every notification"; sleep 1
type_text "lunch"; sleep 4
expect "Lunch at 2 tomorrow" 10 "search finds the matching notification"
expect_not "HBL Bank" 2 "search hides non-matching notifications"
shot e2e-search
adb shell input keyevent KEYCODE_BACK; sleep 1
tap_text "Clear search"; sleep 2

# Add the "Quiet sales and offers" template, then post a sale: it must leave the shade.
tap_text "Settings"; sleep 3
tap_text "Rules"; sleep 3
expect "Quiet sales and offers" 10 "rules screen shows templates"
tap_text "Quiet sales and offers"; sleep 3
adb shell "cmd notification post -t 'Daraz' sale1 'Mega sale today: 50% off everything'" >/dev/null
sleep 6
if adb shell dumpsys notification --noredact | grep -q "Mega sale today"; then fail "quiet rule removes the sale from the shade"; else pass "quiet rule removes the sale from the shade"; fi
adb shell input keyevent KEYCODE_BACK; sleep 2
tap_text "Inbox"; sleep 4
expect "Mega sale today" 10 "quieted notification is still kept in Notivault"
tap_text "Quieted"; sleep 4
expect "Mega sale today" 10 "the Quieted filter shows it"
expect_not "HBL Bank" 2 "the Quieted filter hides normal notifications"
shot e2e-quieted

# The app is called Notivault everywhere a user can see.
tap_text "Settings"; sleep 3
expect "Notivault" 10 "Settings uses the new name"

# Money: bank and wallet alerts are read into spending and income.
adb shell "cmd notification post -t 'Meezan Bank' bank1 'PKR 1,500.00 debited from your A/C **1234 on 23-Nov at DARAZ ONLINE.'" >/dev/null
adb shell "cmd notification post -t 'Easypaisa' bank2 'You have received Rs 2,000 from Sara Khan in your Easypaisa account.'" >/dev/null
sleep 6
# Start fresh so the tab bar is showing (earlier steps can leave a detail page open).
adb shell am force-stop dev.basalt.pulse; sleep 1
adb shell monkey -p dev.basalt.pulse -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 6
tap_text "Insights"; sleep 3
scroll_top
tap_text "Money"; sleep 5
expect "Rs 1,500" 15 "money screen totals what was spent"
expect "Rs 2,000" 5 "money screen totals what was received"
expect "DARAZ ONLINE" 5 "the merchant is read from the alert"
expect "Sara Khan" 5 "the sender is read from the alert"
shot e2e-money
tap_text "Export as CSV"; sleep 5
if adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | grep -qiE "chooser|resolver|intentresolver"; then pass "money CSV reached the share sheet"; else fail "money CSV reached the share sheet"; fi
shot e2e-money-share
adb shell input keyevent KEYCODE_BACK; sleep 2
adb shell input keyevent KEYCODE_BACK; sleep 2

# The Copy-code tile copies the newest code without opening the app.
TILE=dev.basalt.pulse/expo.modules.pulselistener.CodeTileService
adb shell "cmd notification post -t 'Bank' otp2 'Your verification code is 556677'" >/dev/null
sleep 4
adb shell cmd statusbar add-tile $TILE >/dev/null 2>&1
adb logcat -c
adb shell cmd statusbar click-tile $TILE >/dev/null 2>&1; sleep 3
adb shell cmd statusbar collapse >/dev/null 2>&1
if adb logcat -d | grep -q "FATAL EXCEPTION"; then fail "Copy-code tile runs without crashing"; else pass "Copy-code tile runs without crashing"; fi

# Backup and restore: save a password-protected backup with Android's "Save to" screen, wipe the
# history, then restore it from the file picker (wrong password first) and check it all came back.
tap_alert() { tap_text "$1" || tap_text "$(echo "$1" | tr '[:lower:]' '[:upper:]')"; }
adb shell "find /sdcard/Download -name 'notivault-backup-*' -delete" >/dev/null 2>&1
adb shell am force-stop dev.basalt.pulse; sleep 1
adb shell monkey -p dev.basalt.pulse -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 6
tap_text "Settings"; sleep 3
scroll_to "Back up to a file" >/dev/null
tap_text "Back up to a file"; sleep 2
expect "Protect this backup?" 10 "backup asks about a password"
tap_text "Password"; sleep 1; type_text "secret123"; sleep 1
tap_text "Repeat password"; sleep 1; type_text "secret123"; sleep 1
hide_keyboard() { adb shell dumpsys input_method | grep -q "mInputShown=true" && adb shell input keyevent KEYCODE_BACK; sleep 1; }
hide_keyboard
tap_text "Save with password"; sleep 5
shot e2e-backup-save-screen
tap_alert "Save"; sleep 2
expect "are in the file" 15 "backup saved through Android's Save screen"
tap_alert "OK"; sleep 1
BACKUP=$(adb shell "find /sdcard/Download -name 'notivault-backup-*.json'" 2>/dev/null | tr -d '\r' | head -1)
if [ -n "$BACKUP" ]; then pass "backup file written ($BACKUP)"; else fail "backup file written to Downloads"; fi
if [ -n "$BACKUP" ] && adb shell cat "$BACKUP" | grep -q '"encrypted":true'; then pass "backup file is encrypted"; else fail "backup file is encrypted"; fi
if [ -n "$BACKUP" ] && adb shell cat "$BACKUP" | grep -q "HBL Bank"; then fail "notification text is not readable in the encrypted file"; else pass "notification text is not readable in the encrypted file"; fi

scroll_to "Delete all history" >/dev/null
tap_text "Delete all history"; sleep 2
tap_alert "Delete all"; sleep 4
tap_text "Inbox"; sleep 4
expect_not "HBL Bank" 3 "history wiped before the restore"

tap_text "Settings"; sleep 3
scroll_to "Restore from a backup" >/dev/null
tap_text "Restore from a backup"; sleep 5
shot e2e-restore-picker
NAME=$(basename "${BACKUP:-notivault-backup.json}")
if ! has_text "$NAME"; then tap_text "Downloads" || tap_text "Download"; sleep 3; fi
tap_text "$NAME"; sleep 5
expect "Backup password" 15 "a protected backup asks for its password"
type_text "wrongpass"; sleep 1
tap_text "Open backup"; sleep 8
expect "That password is not right" 15 "a wrong password is refused"
adb shell input keyevent KEYCODE_MOVE_END
for i in $(seq 1 12); do adb shell input keyevent KEYCODE_DEL; done
type_text "secret123"; sleep 1
tap_text "Open backup"; sleep 8
expect "Restore this backup?" 15 "the right password opens the backup"
shot e2e-restore-confirm
tap_alert "Restore"; sleep 2
expect "Restore finished" 15 "restore reports what it brought back"
shot e2e-restore-done
tap_alert "OK"; sleep 1
tap_text "Inbox"; sleep 4
expect "HBL Bank" 15 "restored notifications are back in the inbox"
expect "Lunch at 2 tomorrow" 10 "every restored notification is back"
shot e2e-restored

# Restoring the same file again adds nothing new.
tap_text "Settings"; sleep 3
scroll_to "Restore from a backup" >/dev/null
tap_text "Restore from a backup"; sleep 5
if ! has_text "$NAME"; then tap_text "Downloads" || tap_text "Download"; sleep 3; fi
tap_text "$NAME"; sleep 5
type_text "secret123"; sleep 1
tap_text "Open backup"; sleep 8
tap_alert "Restore"; sleep 2
expect "0 notifications added" 15 "restoring the same backup twice adds no duplicates"
tap_alert "OK"; sleep 1

# Appearance: change accent, font, background, depth and navigation; the screen previews the draft,
# Apply uses it everywhere, and it is still there after the app restarts.
reach_row() { scroll_to "$1" >/dev/null; adb shell input swipe 160 420 160 270 300; sleep 1; }
selected_desc() { dump; python3 - "$1" <<'PY'
import re, sys
xml = open('/tmp/ui.xml', encoding='utf-8', errors='ignore').read()
want = sys.argv[1]
for m in re.finditer(r'<node [^>]*>', xml):
    n = m.group(0)
    if f'content-desc="{want}"' in n:
        sys.exit(0 if 'selected="true"' in n or 'checked="true"' in n else 1)
sys.exit(1)
PY
}
adb shell am force-stop dev.basalt.pulse; sleep 1
adb shell monkey -p dev.basalt.pulse -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 6
tap_text "Settings"; sleep 3
reach_row "Appearance"
tap_text "Appearance"; sleep 3
expect "your way" 15 "Appearance screen opens with a live preview"
shot e2e-appearance-default
tap_text "Teal accent"; sleep 1
reach_row "Manrope font"; tap_text "Manrope font"; sleep 2
reach_row "Warm background"; tap_text "Warm background"; sleep 1
reach_row "Glass"; tap_text "Glass"; sleep 1
reach_row "Floating"; tap_text "Floating"; sleep 1
shot e2e-appearance-draft
expect "Apply" 5 "changes wait for Apply"
tap_text "Apply"; sleep 2
expect_not "Discard" 2 "Apply saves the draft"
adb shell input keyevent KEYCODE_BACK; sleep 2
tap_text "Inbox"; sleep 3
shot e2e-appearance-applied-inbox
adb shell am force-stop dev.basalt.pulse; sleep 1
adb shell monkey -p dev.basalt.pulse -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 6
tap_text "Settings"; sleep 3
reach_row "Appearance"; tap_text "Appearance"; sleep 3
if selected_desc "Teal accent"; then pass "accent choice survives a restart"; else fail "accent choice survives a restart"; fi
reach_row "Manrope font"
if selected_desc "Manrope font"; then pass "font choice survives a restart"; else fail "font choice survives a restart"; fi
# Dark mode with the same choices, for the screenshots.
scroll_top
tap_text "Dark"; sleep 1; tap_text "Apply"; sleep 2
shot e2e-appearance-dark
reach_row "Reset to default"; tap_text "Reset to default"; sleep 1; tap_text "Apply"; sleep 2
if selected_desc "Notivault accent"; then pass "Reset to default returns to the app colour"; else fail "Reset to default returns to the app colour"; fi
adb shell input keyevent KEYCODE_BACK; sleep 1
