# Election Day Rollout Checklist

2026-09-23 · School Council Elections

This is the checklist for everyone on duty for the voting app — the Chief Election Commissioner (superadmin) and every polling officer (teacher) — covering the teacher testing round, real polling day, and what to ignore as "working as intended."

**How an election runs now, in one line:** Dashboard → **Start the Voting Process** (a step-by-step wizard whose last step opens the poll) → **Pause Polling / Re-start Polling** as needed → **End of Voting**. There is no "Open Poll", "Close Poll" or "Reset Poll" button any more.

## Superadmin — One-Time Cleanup Before Any Testing

- [ ] Open the Admin Dashboard → Manage Candidates and check every post/house, for **both** election types (🏫 School Posts / 🏠 House Posts toggle) and **both** branches (Dwarka / AN toggle), for these exact leftover names, deleting any you find: Alex Johnson, Michael Chen, David Williams, Ryan Patel, Sarah Martinez, Emily Davis, Priya Sharma, Jessica Brown, James Wilson, Chris Anderson, Marcus Taylor, Kevin Lee, Daniel Kim, Sophia Garcia, Olivia Rodriguez, Isabella Thompson, Emma White, Mia Jackson, Ava Harris, Lily Martin (school posts), or anything shaped like "[House] House Captain 1" / "[House] Cultural Captain 1" / "[House] Sports Captain 1" (house posts). These were auto-created by an older version of the software the first time it ever ran — they may still be sitting in the live list today, and only a manual check catches them.
- [ ] Confirm the ADMIN_SECRET on the live Cloud Run service is a strong, unique value — not the software's built-in default. Whoever manages the Google Cloud project should verify this directly in the Cloud Run service's environment variables; it can't be checked from inside the app.
- [ ] Decide who besides you will hold the admin secret. Treat it like a master key: anyone who has it can start or end an election, pause polling, change candidates and officer codes, and take over the admin console from whoever currently has it open.

## Superadmin — Before Handing the App to Teachers for Testing

- [ ] Add a handful of clearly-labelled test candidates (e.g. "TEST — Candidate 1") for **every** post (School) or **every** house and post (House), in each branch that will be tested. See "Current limitations" below — an empty post is the one thing that can trip up the start of an election.
- [ ] Give each tester a code, on the Polling Officer Codes tab (pick the branch first with the Dwarka / AN toggle). Either:
  - **📋 Bulk Allot from List** — upload the teacher list as an Excel file; it creates and names a code for every teacher in one go, with a WhatsApp link per teacher to send it; or
  - **Generate** codes, then type each tester's name against their code and click Save.
- [ ] A code only works once it has a name against it — an unnamed code is refused at the booth. A School code only works in a School election, and a House code only for its own house in a House election.
- [ ] **🖨️ Print Dwarka/AN Code List** gives a printable "who has which code" sheet for each branch.
- [ ] Brief every tester to check it, test it, use it, and misuse it — and specifically to look for (a) features that should be there but aren't, and (b) features that are there but aren't needed. Collect this feedback in one shared place (a sheet or form).
- [ ] Each test round is a full election: **Start the Voting Process** → vote → **End of Voting**. Starting the next election of the same type resets its vote counts to zero automatically — there is nothing to clear by hand between rounds.
- [ ] Be aware that every test round leaves a permanent trace:
  - an entry in **Election History** (the in-app Delete button is intentionally hidden, so clearing test entries out needs a developer — ask for that before real polling day), and
  - an election in the **Activity Log**, which can never be edited or deleted by anyone. Give test rounds obvious names (e.g. "TEST — School round 1") so they're easy to tell apart from the real election later.

## Superadmin — Before REAL Polling Day

- [ ] Delete every test/demo candidate. Add only the real, confirmed candidates for every post (and every house, for house elections), in both branches.
- [ ] Sort out the officer codes. Codes carry forward from one election to the next — they are not wiped at End of Voting. Delete test codes you don't need; a code that has votes recorded against it can't be deleted until the next election of that type starts, so **Close** it instead (it then can't activate a ballot). Make sure every real polling officer has a named code, and print each branch's code list.
- [ ] Have every test/junk snapshot from the testing round cleared out of Election History (ask a developer, since the in-app Delete button is hidden — see above) so the real election's record isn't buried among them.
- [ ] Do a final read-through of Manage Candidates: correct names, correct spelling, correct photos, correct branch. **Candidates are locked from the moment the election starts until End of Voting**, so this is the last chance.
- [ ] Freeze all code changes: do not push anything to the `main` branch on election day (see "One Hard Rule" below).
- [ ] Confirm the physical setup at every booth: one device per station, browser already open to the kiosk welcome screen — not the admin dashboard.

## Superadmin — Starting the Election

- [ ] Dashboard → **🗳️ Start the Voting Process (School / House)**. The wizard walks through: choose School or House → vote counts will reset to zero → are the officer codes ready (it shows how many exist per branch, and how many are still unnamed) → have they been allotted → candidates will be locked → name this election → **Open the Poll — Start Voting**.
- [ ] The name you give ("School Elections — Term 1 2026") is how this election appears in Election History and the Activity Log.
- [ ] Once started, the Dashboard shows a green **ELECTION IN PROGRESS** banner, and every admin action from then until End of Voting is recorded in the Activity Log.

## Superadmin — During Real Polling

- [ ] Optionally keep the Live Results tab open on a projector/monitor ("🖥️ Present Full Screen") for a live count. Set the School/House and Dwarka/AN toggles first — they're hidden in full-screen view.
- [ ] **⏸ Pause Polling** stops all voting (e.g. a lunch break); **▶ Re-start Polling** resumes it. Votes already cast are unaffected, but any ballot a voter is in the middle of when you pause is cancelled — the officer will need to activate again for that voter. Pausing does **not** end the election: candidates stay locked.
- [ ] Candidates can't be added, edited or deleted at any point during the election, including a pause — the app blocks this on purpose, since it can strand a ballot that's mid-vote.
- [ ] If a teacher reports an error right after Submit Ballot, do not assume the vote was lost. Check two things before doing anything else: (1) the **Storage** card on the Dashboard tab (and the red banner at the top, if it appears) — if it says "Not Saving", saves are currently failing and you should stop and get IT/developer help immediately, without restarting anything; if it says "Storage OK", saves are working normally; and (2) that station's "Votes Cast" count under Polling Officer Codes, to confirm this specific vote was captured. The message the teacher and voter see specifically tells them not to vote again until you've checked both.
- [ ] A teacher can close their own booth for the day via "Close polling at this booth" on their device. You can also close (or reopen) any booth yourself from the Polling Officer Codes tab with the **Close** / **Reopen** button next to the code.
- [ ] Only one device can have the admin dashboard open at a time. Logging in from a second device offers "Take Over This Terminal", which signs the first device out — and, during an election, the takeover is recorded in the Activity Log.

## Superadmin — After Polling Closes

- [ ] Dashboard → **⏹ End of Voting**, and confirm. This saves the final result to Election History under the election's name, closes the poll, and stops the Activity Log recording for this election.
- [ ] The final vote counts stay visible (Live Results, the Codes tab's "Votes Cast") after End of Voting — they only reset when the next election of the same type is started.
- [ ] Print the results: Dashboard → **🖨️ Download Dwarka Report** / **🖨️ Download AN Report**. These are results-only and, once voting has ended, show the most recently finished election.
- [ ] For the officer/station turnout: Election History → **View/Print Dwarka** or **View/Print AN** on the election's row, then tick **"Include polling officer turnout"** before printing. (The "Print Officer Turnout" button on the Codes tab is only available while an election is under way.)
- [ ] To run the other election next (e.g. House after School), just start the wizard again and choose the other type. The finished election stays safely in Election History.
- [ ] Check Election History to confirm the entry is there, with the right name and vote total, before telling anyone the results are final.

## Polling Officer (Teacher) — Setup at Your Booth

- [ ] Confirm your device shows the kiosk welcome screen ("Welcome to the Polling Booth"), not the admin dashboard.
- [ ] Know your personal 6-character officer code and keep it private — anyone who has it can activate a ballot at your station. Codes are lowercase letters and numbers; typing it in capitals also works.
- [ ] For House elections, your code is tied to one house, so the ballot opens straight into that house — there's no house to pick.
- [ ] It's fine to speed things up by using more than one device on the same code at once (your own phone, laptop, a co-teacher's phone, etc.) — the app supports this cleanly. Just know the running vote count shown after each vote is the combined total across all devices on that code, not just the one in front of you, so it won't match "just my phone's" tally. If you ever need to know afterward which specific device or teacher handled a given vote (not just which station), use a separate code per device instead — one shared code only tracks at the station level.

## Polling Officer (Teacher) — For Each Voter

1. Confirm the voter's identity against your physical voter list first — the app does not check who the voter is; it only trusts you.
2. Tap "Officer Activation," enter your code, tap "Unlock Ballot," and hand the device to the voter.
3. The voter picks one candidate per post, reviews every choice on one screen, then submits.
4. After "Vote Recorded" appears, check the running vote count shown against your physical voter list, then tap Finish before the next voter.
5. Mark the voter off your physical list. This is the only thing that stops someone voting twice — the app cannot do this for you.

## Polling Officer (Teacher) — If Something Goes Wrong

- [ ] If the screen suddenly asks you to activate again mid-voting, that can happen when the administrator pauses polling, or rarely after a server restart — no vote is lost, since nothing is recorded until Submit Ballot is pressed. Once voting is running again, reactivate and start that voter's ballot again.
- [ ] If a voter sees an error immediately after Submit Ballot, read the on-screen message carefully — it will say whether it's safe to try again or whether to check with the administrator first. When in doubt, ask the administrator before letting the same voter vote again.
- [ ] Once you're done for the day, use "Close polling at this booth" (the small link at the bottom of the welcome screen). This disables your code, and cannot be undone from your device — only the administrator can reopen it.
- [ ] Report anything confusing, broken, or missing to the administrator — even if you're not sure it's a real problem.

## Normal Behaviour — Not Bugs

Please don't spend testing time reporting these; they're intentional:

- A ballot session (after "Officer Activation") times out after 5 minutes, with an on-screen warning in the last 90 seconds.
- The app cannot stop the same physical voter from voting twice — that's controlled entirely by your physical voter list, by design, not by the software.
- Refreshing or closing the browser mid-vote loses that ballot's in-progress selections, because nothing was submitted yet. Just reactivate and start again.
- Pausing polling cancels any ballot that was in progress at that moment. Reactivate once polling restarts.
- A code with no officer name, a closed code, or a code for the other election type is refused at the booth, with a message saying why.
- Pause Polling and End of Voting both ask for confirmation before doing anything — that's on purpose.

## Current Limitations — Work Around These Until Fixed

Found in the 2026-09-23 walkthrough; fixes are pending.

- **Fill every post before starting the election.** If any post (or, for House, any house/post) has no candidate, the wizard's last step starts the election but then fails to open the poll — and because candidates are locked once an election has started, the only way out is End of Voting, which leaves an empty entry in Election History and the Activity Log. Check Manage Candidates first.
- **AN must have its own candidates for every post before AN codes are used.** The "every post has a candidate" check currently looks at both branches together, so the poll can open with AN completely empty — an AN voter would then see a ballot with no one to vote for.
- **Don't abandon the wizard after choosing School/House unless you mean to start that election soon.** Choosing the type takes effect immediately; after an Abort, "Download Report" shows that type's live figures instead of the last finished election.

## One Hard Rule for Everyone

No one pushes code changes to the `main` branch while a real poll is open. Every push auto-deploys to the live server and restarts it, which silently logs out any officer who is mid-activation. Save all code changes for before polling hours start or well after they end.
