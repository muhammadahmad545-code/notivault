# Pulse end-to-end: grant notification access, post real notifications, and check capture,
# code detection, search, and a quiet rule. Sourced by smoke.sh (helpers come from there).

adb shell cmd notification allow_listener dev.basalt.pulse/expo.modules.pulselistener.PulseListenerService
sleep 5
adb shell cmd notification post -t "HBL Bank" otp1 "Your OTP for login is 482913. Do not share it." >/dev/null
adb shell cmd notification post -t "Ali" chat1 "Lunch at 2 tomorrow?" >/dev/null
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
adb shell cmd notification post -t "Daraz" sale1 "Mega sale today: 50% off everything" >/dev/null
sleep 6
if adb shell dumpsys notification --noredact | grep -q "Mega sale today"; then fail "quiet rule removes the sale from the shade"; else pass "quiet rule removes the sale from the shade"; fi
adb shell input keyevent KEYCODE_BACK; sleep 2
tap_text "Inbox"; sleep 4
expect "Mega sale today" 10 "quieted notification is still kept in Pulse"
tap_text "Quieted"; sleep 4
expect "Mega sale today" 10 "the Quieted filter shows it"
expect_not "HBL Bank" 2 "the Quieted filter hides normal notifications"
shot e2e-quieted
