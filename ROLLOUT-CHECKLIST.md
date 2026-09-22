# Election Day Rollout Checklist

2026-09-22 · School Council Elections

This is the checklist for everyone on duty for the voting app — the Chief Election Commissioner (superadmin) and every polling officer (teacher) — covering the teacher testing round, real polling day, and what to ignore as "working as intended."

## Superadmin — One-Time Cleanup Before Any Testing

- [ ] Open the Admin Dashboard → Manage Candidates and check every post/house for these exact leftover names, deleting any you find: Alex Johnson, Michael Chen, David Williams, Ryan Patel, Sarah Martinez, Emily Davis, Priya Sharma, Jessica Brown, James Wilson, Chris Anderson, Marcus Taylor, Kevin Lee, Daniel Kim, Sophia Garcia, Olivia Rodriguez, Isabella Thompson, Emma White, Mia Jackson, Ava Harris, Lily Martin (school posts), or anything shaped like "[House] House Captain 1" / "[House] Cultural Captain 1" / "[House] Sports Captain 1" (house posts). These were auto-created by an older version of the software the first time it ever ran, before every post always had real candidates — they may still be sitting in the live list today, and only a manual check catches them.
- [ ] Confirm the ADMIN_SECRET on the live Cloud Run service is a strong, unique value — not the software's built-in default. Whoever manages the Google Cloud project should verify this directly in the Cloud Run service's environment variables; it can't be checked from inside the app.
- [ ] Decide who besides you will hold the admin secret. Treat it like a master key: anyone who has it can reset votes, close the poll, or delete candidates.

## Superadmin — Before Handing the App to Teachers for Testing

- [ ] Set the Election Type (School or House) you want tested first.
- [ ] Add a handful of clearly-labelled test candidates (e.g. "TEST — Candidate 1") for every post/house so the poll is allowed to open.
- [ ] Generate one officer code per tester (Polling Officer Codes tab → Generate) and hand out one code per person/station.
- [ ] Brief every tester to check it, test it, use it, and misuse it — and specifically to look for (a) features that should be there but aren't, and (b) features that are there but aren't needed. Collect this feedback in one shared place (a sheet or form).
- [ ] Between rounds of testing, use Reset Poll to clear test votes. Note: every Reset also saves a permanent snapshot to Election History, so test rounds will leave clutter there — before real polling day, go to the Election History tab and click **Delete** on each test entry to clear it out (no developer needed).

## Superadmin — Before REAL Polling Day

- [ ] Delete every test/demo candidate. Add only the real, confirmed candidates for every post (and every house, for house elections).
- [ ] Delete all test officer codes. Generate fresh codes only for the real polling officers on duty, and record which teacher holds which code.
- [ ] Go to Election History and Delete every test/junk snapshot from the testing round, so the real election's record isn't buried among them.
- [ ] Do a final read-through of Manage Candidates: correct names, correct spelling, correct photos.
- [ ] Freeze all code changes: do not push anything to the `main` branch on election day (see "One Hard Rule" below).
- [ ] Confirm the physical setup at every booth: one device per station, browser already open to the kiosk welcome screen — not the admin dashboard.

## Superadmin — During Real Polling

- [ ] Set the correct Election Type, then click Open Poll.
- [ ] Optionally keep the Live Results tab open on a projector/monitor ("Present Full Screen") for a live count.
- [ ] Do not add, edit, or delete candidates while the poll is open — the app blocks this on purpose, since it can strand a ballot that's mid-vote.
- [ ] If a teacher reports an error right after Submit Ballot, do not assume the vote was lost. Check two things before doing anything else: (1) the Storage status line/banner at the top of the Dashboard tab — if it's red, saves are currently failing and you should stop and get IT/developer help immediately, without restarting anything; if it's the green "Storage: OK" line, saves are working normally; and (2) that station's vote count under Polling Officer Codes, to confirm this specific vote was captured. The message the teacher and voter see specifically tells them not to vote again until you've checked both.
- [ ] A teacher can close their own booth for the day via "Close Polling at This Booth" on their device — you don't need to do this for them.

## Superadmin — After Polling Closes

- [ ] Click Close Poll.
- [ ] Download or print the results report (Dashboard → Download Report) before doing anything else — this one shows candidate results only. For officer/station turnout on its own, use "Print Officer Turnout" on the Polling Officer Codes tab instead.
- [ ] Only use Reset Poll if you intend to run another election next (e.g. House after School) — it archives the current results automatically, then clears votes. You'll be prompted to give the election a meaningful name (e.g. "School Council — Term 1 2026") for Election History — fine to skip and add one later if you're in a hurry.
- [ ] Check Election History to confirm the snapshot is there before telling anyone the results are final.

## Polling Officer (Teacher) — Setup at Your Booth

- [ ] Confirm your device shows the kiosk welcome screen, not the admin dashboard.
- [ ] Know your personal 6-character officer code and keep it private — anyone who has it can activate a ballot at your station.
- [ ] For House elections, your code is usually already tied to one house, so you won't be asked to pick one. If the app does ask, your choice is remembered for every voter afterwards at that station.
- [ ] It's fine to speed things up by using more than one device on the same code at once (your own phone, laptop, a co-teacher's phone, etc.) — the app supports this cleanly. Just know the running vote count shown after each vote is the combined total across all devices on that code, not just the one in front of you, so it won't match "just my phone's" tally. If you ever need to know afterward which specific device or teacher handled a given vote (not just which station), use a separate code per device instead — one shared code only tracks at the station level.

## Polling Officer (Teacher) — For Each Voter

1. Confirm the voter's identity against your physical voter list first — the app does not check who the voter is; it only trusts you.
2. Tap "Officer Activation," enter your code, and hand the device to the voter.
3. The voter picks one candidate per post, reviews every choice on one screen, then submits.
4. After "Vote Recorded" appears, check the running vote count shown against your physical voter list, then tap Finish before the next voter.
5. Mark the voter off your physical list. This is the only thing that stops someone voting twice — the app cannot do this for you.

## Polling Officer (Teacher) — If Something Goes Wrong

- [ ] If the screen suddenly asks you to activate again mid-voting, that can happen rarely (e.g. a server restart) — no vote is lost, since nothing is recorded until Submit Ballot is pressed. Just reactivate and start that voter's ballot again.
- [ ] If a voter sees an error immediately after Submit Ballot, read the on-screen message carefully — it will say whether it's safe to try again or whether to check with the administrator first. When in doubt, ask the administrator before letting the same voter vote again.
- [ ] Once you're done for the day, use "Close Polling at This Booth" from the welcome screen. This permanently disables your code and cannot be undone from your device.
- [ ] Report anything confusing, broken, or missing to the administrator — even if you're not sure it's a real problem.

## Normal Behaviour — Not Bugs

Please don't spend testing time reporting these; they're intentional:

- A ballot session (after "Officer Activation") times out after 10 minutes of inactivity, with an on-screen warning in the last 90 seconds.
- The app cannot stop the same physical voter from voting twice — that's controlled entirely by your physical voter list, by design, not by the software.
- Refreshing or closing the browser mid-vote loses that ballot's in-progress selections, because nothing was submitted yet. Just reactivate and start again.
- Close Poll and Reset Poll both ask for confirmation before doing anything — that's on purpose.

## One Hard Rule for Everyone

No one pushes code changes to the `main` branch while a real poll is open. Every push auto-deploys to the live server and restarts it, which silently logs out any officer who is mid-activation. Save all code changes for before polling hours start or well after they end.
