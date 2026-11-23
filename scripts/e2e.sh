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
adb shell monkey -p dev.basalt.pulse -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 3
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
