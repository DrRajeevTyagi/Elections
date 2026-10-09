# Election Day Rollout Checklist

2026-10-09 · School Council Elections

This is the checklist for everyone on duty for the voting app — the Chief Election Commissioner (superadmin) and every polling officer (teacher) — covering the teacher testing round, real polling day, and what to ignore as "working as intended."

**How an election runs now, in one line:** Polling Officer Codes (choose the election and branch at the top) → step **1. Before the election**: **Reset Colours to White** (or **Remove All Codes** for a completely clean list) → **Upload Teacher List** and **Send Codes** → Dashboard → **Start the Voting Process** (a step-by-step wizard whose last step opens the poll) → **Pause Polling / Re-start Polling** as needed → each booth closes and is **🔒 Verified & Sealed** against its Paper List (or re-polled) → **End of Voting**. There is no "Open Poll", "Close Poll" or "Reset Poll" button any more.

**The Polling Officer Codes tab** has the **Election (School / House)** and **Branch (Dwarka / AN)** choices at the top, then three steps: **1. Before the election** (upload, send, print, start fresh, edit names), **2. Election day** (close, seal, re-poll) and **More** (blank codes by hand, clearing code lockouts). It opens on Election day while that election is running.

**Code colours:** ⚪ not sent · 🟡 sent, not entered yet · 🟢 ready (teacher entered it on a kiosk) · 🔴 polling closed, waiting for the Paper List check · ⚪🔒 sealed · grey: re-polled (replaced by a new code). The colour counts above each list are buttons: tap one to see just those codes.

## Superadmin — One-Time Cleanup Before Any Testing

- [ ] Open the Admin Dashboard → Manage Candidates and check every post/house, for **both** election types (🏫 School Posts / 🏠 House Posts toggle) and **both** branches (Dwarka / AN toggle), for these exact leftover names, deleting any you find: Alex Johnson, Michael Chen, David Williams, Ryan Patel, Sarah Martinez, Emily Davis, Priya Sharma, Jessica Brown, James Wilson, Chris Anderson, Marcus Taylor, Kevin Lee, Daniel Kim, Sophia Garcia, Olivia Rodriguez, Isabella Thompson, Emma White, Mia Jackson, Ava Harris, Lily Martin (school posts), or anything shaped like "[House] House Captain 1" / "[House] Cultural Captain 1" / "[House] Sports Captain 1" (house posts). These were auto-created by an older version of the software the first time it ever ran — they may still be sitting in the live list today, and only a manual check catches them.
- [ ] Confirm the ADMIN_SECRET on the live Cloud Run service is a strong, unique value — not the software's built-in default. Whoever manages the Google Cloud project should verify this directly in the Cloud Run service's environment variables; it can't be checked from inside the app.
- [ ] Decide who besides you will hold the admin secret. Treat it like a master key: anyone who has it can start or end an election, pause polling, change candidates and officer codes, and ask for control of the admin console from whoever currently has it open.

## Superadmin — Before Handing the App to Teachers for Testing

- [ ] Add a handful of clearly-labelled test candidates (e.g. "TEST — Candidate 1") for **every** post (School) or **every** house and post (House), in each branch that will be tested. See "Current limitations" below — an empty post is the one thing that can trip up the start of an election.
- [ ] On the Polling Officer Codes tab, choose the election (School / House) at the top, and on step **1. Before the election** use the **"Starting a new election?"** box:
  - **Reset Colours to White** keeps the same codes and teachers: all of that election's codes (both branches) turn white and usable. **Codes left over from an earlier election stay red — and can't be used to vote — until you do this** (or until that election is started).
  - **Remove All Codes** deletes every code of that election, Dwarka and AN together (type CONFIRM), for a completely clean list before uploading a new teacher list. Only when that election isn't running.
- [ ] Give each tester a code (pick the branch at the top first). Either:
  - **Upload Teacher List** — upload the teacher list as an Excel file; it creates and names a code for every teacher in one go and saves their WhatsApp numbers; or
  - **More → Make blank codes by hand**, then on step 1 press **Edit** next to each code, type the tester's name and Save.
- [ ] Send the codes with **Send Codes** — any time, e.g. the evening before. Press **Send Next**: WhatsApp opens on the computer with the message ready; press Enter in WhatsApp, come back, repeat. Each one is ticked as sent (yellow), so you can stop and carry on later. The first time, the browser asks to open WhatsApp — tick "Always allow". If nothing opens, switch to "WhatsApp Web" on that screen. Teachers without a valid number are listed at the bottom: type their number there, or give them a printed slip.
- [ ] A code only works once it has a name against it — an unnamed code is refused at the booth. A School code only works in a School election, and a House code only for its own house in a House election.
- [ ] **Print Dwarka/AN Code List** (step 1) gives a printable "who has which code" sheet for each branch.
- [ ] Brief every tester to check it, test it, use it, and misuse it — and specifically to look for (a) features that should be there but aren't, and (b) features that are there but aren't needed. Collect this feedback in one shared place (a sheet or form).
- [ ] Each test round is a full election: **Start the Voting Process** → vote → close each booth → **🔒 Verify & Seal** every booth (even one with no votes) and delete unallotted codes → **End of Voting**. End of Voting is refused until that's done. Starting the next election of the same type resets its vote counts to zero automatically — there is nothing to clear by hand between rounds.
- [ ] Be aware that every test round leaves a permanent trace:
  - an entry in **Election History** (the in-app Delete button is intentionally hidden, so clearing test entries out needs a developer — ask for that before real polling day), and
  - an election in the **Activity Log**, which can never be edited or deleted by anyone. Give test rounds obvious names (e.g. "TEST — School round 1") so they're easy to tell apart from the real election later.

## Superadmin — Before REAL Polling Day

- [ ] Delete every test/demo candidate. Add only the real, confirmed candidates for every post (and every house, for house elections), in both branches.
- [ ] Sort out the officer codes. Codes carry forward from one election to the next — they are not wiped at End of Voting, but they all turn red then. The simplest clean start: **Remove All Codes** for the real election (once the last test round is ended), then **Upload Teacher List** for each branch. Or keep them and press **Reset Colours to White**, so every code starts white with no leftover "sent" or "ready" marks from testing, and delete the test codes you don't need. **Between elections any code can be deleted** — even one with votes, a seal or a re-poll from a test round. Make sure every real polling officer has a named code, send them, and print each branch's code list as a backup.
- [ ] Make sure every booth has its printed **Paper List** of voters — it's what each booth's count is checked against before it can be sealed.
- [ ] Have every test/junk snapshot from the testing round cleared out of Election History (ask a developer, since the in-app Delete button is hidden — see above) so the real election's record isn't buried among them.
- [ ] Do a final read-through of Manage Candidates: correct names, correct spelling, correct photos, correct branch. **Candidates are locked from the moment the election starts until End of Voting**, so this is the last chance.
- [ ] Freeze all code changes: do not push anything to the `main` branch on election day (see "One Hard Rule" below).
- [ ] Confirm the physical setup at every booth: one device per station, browser already open to the kiosk welcome screen — not the admin dashboard.

## Superadmin — Starting the Election

- [ ] Dashboard → **🗳️ Start the Voting Process (School / House)**. The wizard walks through: choose School or House → vote counts will reset to zero → are the officer codes ready (it shows how many exist per branch, and how many are still unnamed) → have they been allotted → candidates will be locked → name this election → **Open the Poll — Start Voting**.
- [ ] The name you give ("School Elections — Term 1 2026") is how this election appears in Election History and the Activity Log.
- [ ] Once started, the Dashboard shows a green **ELECTION IN PROGRESS** banner, and every admin action from then until End of Voting is recorded in the Activity Log.
- [ ] **Check who is ready.** Ask every teacher to enter their code on their kiosk as soon as they reach their booth — even before voting opens. They'll see a green "✓ Your code is correct and you are marked as ready", and their code turns 🟢 green on the Polling Officer Codes tab within a few seconds. On step 1, tap the **"Sent, not ready"** count to see who to phone (🟡 sent but not entered), or **"Not sent"** (⚪ never sent).

## Superadmin — During Real Polling

- [ ] Optionally keep the Live Results tab open on a projector/monitor ("🖥️ Present Full Screen") for a live count. Set the School/House and Dwarka/AN toggles first — they're hidden in full-screen view.
- [ ] **⏸ Pause Polling** stops all voting (e.g. a lunch break); **▶ Re-start Polling** resumes it. Votes already cast are unaffected, but any ballot a voter is in the middle of when you pause is cancelled — the officer will need to activate again for that voter. Pausing does **not** end the election: candidates stay locked.
- [ ] Candidates can't be added, edited or deleted at any point during the election, including a pause — the app blocks this on purpose, since it can strand a ballot that's mid-vote.
- [ ] If a teacher reports an error right after Submit Ballot, do not assume the vote was lost. Check two things before doing anything else: (1) the **Storage** card on the Dashboard tab (and the red banner at the top, if it appears) — if it says "Not Saving", saves are currently failing and you should stop and get IT/developer help immediately, without restarting anything; if it says "Storage OK", saves are working normally; and (2) that booth's "Votes" count on Polling Officer Codes → Election day, to confirm this specific vote was captured. The message the teacher and voter see specifically tells them not to vote again until you've checked both.
- [ ] **Keep the admin dashboard tab in front on your device.** Only one device can control the election at a time. If someone logs in on a second device, they can only press **Ask for Control** — your device then shows an Allow / Deny popup with a sound, naming their device:
  - **Allow** hands control over and signs your device out within seconds.
  - **Deny** keeps you in control. If you don't recognise the device, deny it — someone else knows the admin password.
  - No answer within 1 minute counts as Deny. Browsers slow down background tabs, so a popup in a hidden tab can arrive late.
  - If your device is switched off or closed for 3+ minutes, someone with the password can log in without asking.
  - During an election, every request and answer is recorded in the Activity Log.
- [ ] A teacher closes their own booth when their voters are done, via "Close polling at this booth" on their device. You can also close (or reopen) any booth yourself on Polling Officer Codes → **2. Election day**, with **Close Booth** / **Reopen** next to the booth. A closed booth turns 🔴 red and its next step becomes **Verify & Seal**. The checklist at the top shows how many booths are left, across both branches.
- [ ] **Check each closed booth against its Paper List.** Count the voters on that booth's printed Paper List, press **🔒 Verify & Seal** next to the booth, and type the number in. The window shows the app's count for that booth beside it:
  - **Counts match** → press Verify & Seal. The booth turns ⚪ white with 🔒 Sealed and is final: it can't be reopened or re-polled (or deleted, until the election has ended), and no further vote can be recorded there.
  - **Counts don't match** → count the Paper List again. If it still doesn't match, press **Order Re-poll** (offered right there).
  - A booth that received no votes (e.g. an absent teacher) is closed and sealed the same way, with a Paper List of **0**.
  - A code that was never allotted to anyone (no name) can't be sealed — it shows **Delete Unused Code** instead.
- [ ] **Re-poll** (only while the election is running, and before the booth is sealed) — for an irregularity, a physical disruption, or a count that doesn't match the Paper List. Use the **Re-poll** button next to the booth (or from the Verify & Seal window). The window names the branch, booth, house and teacher — **check it's the right branch** — and lists exactly what will be taken off each candidate. Pick a reason, add a note, and type CONFIRM.
  - All votes from that booth are taken off every candidate's count (they're kept on record, never deleted). The old code stops working for good. Live Results then carries a note saying a re-poll was ordered and how many votes it cancelled.
  - A **new code** is issued with the same details (School/House, branch, house) — choose the same teacher (keeps their WhatsApp number) or a different one. Send it from **Send Codes**, or give it to the teacher directly. The "Re-poll ordered" message appears only on that booth's own branch.
  - The new code goes white → yellow (sent) → green (entered) like any other. When its re-poll is over, close that booth and Verify & Seal it in the same way.
  - Everyone who voted at that booth must vote again — the app can't tell who they were, since votes are secret.

## Superadmin — After Polling Closes

- [ ] **One rule before End of Voting: every code of this election, in Dwarka and AN, is either deleted or 🔒 sealed.** The **"Before End of Voting"** box on the Dashboard, just above the button, shows what's left:
  - **Booths still polling** → close them (the teacher, or you with **Close**), then Verify & Seal.
  - **Closed booths waiting for Verify & Seal** → check each against its Paper List and seal it.
  - **Unallotted codes** → delete them.
  When everything is done it says "✓ Every booth is closed and sealed — ready for End of Voting". This is on purpose: once End of Voting is pressed, the election can't be reopened, so it can't be pressed while any booth is still polling.
- [ ] Dashboard → **⏹ End of Voting**, and confirm. This saves the final result to Election History under the election's name, closes the poll, turns every remaining code of that election 🔴 red, and stops the Activity Log recording for this election.
- [ ] The final vote counts stay visible (Live Results, the Codes tab's "Votes Cast") after End of Voting — they only reset when the next election of the same type is started.
- [ ] Print the results: Dashboard → **🖨️ Download Dwarka Report** / **🖨️ Download AN Report**. These are results-only and, once voting has ended, show the most recently finished election.
- [ ] For the full record: Election History → **📜 Election Record** on the election's row. One printable page with a summary, the winners and every candidate's count (branch by branch), every booth (teacher, votes, Paper List, sealed, re-polls and what they took off each candidate), and everything that happened in plain sentences. Choose Both branches, Dwarka or AN at the top. While an election is running, **📜 Election Record (not final yet)** shows the same, live.
- [ ] To run the other election next (e.g. House after School), just start the wizard again and choose the other type. The finished election stays safely in Election History.
- [ ] Check Election History to confirm the entry is there, with the right name and vote total, before telling anyone the results are final.
- [ ] Before the next election, you can clear the codes: on Polling Officer Codes any code can now be deleted once its election has ended, or use **Remove All Codes**. (Nothing is recorded in the Activity Log between elections; the ended election's record is already saved.)

## Polling Officer (Teacher) — Setup at Your Booth

- [ ] Confirm your device shows the kiosk welcome screen ("Welcome to the Polling Booth"), not the admin dashboard.
- [ ] Know your personal 6-character officer code and keep it private — anyone who has it can activate a ballot at your station. It comes to you on WhatsApp (or as a printed slip). Codes are lowercase letters and numbers; typing it in capitals also works.
- [ ] **Check in as soon as you reach your booth:** tap "Officer Activation", enter your code and tap "Unlock Ballot". Before voting opens you'll see a green **"✓ Your code is correct and you are marked as ready. Voting has not started yet"** — that's good news, not an error: the administrator can now see you're ready. Try again once voting has started.
- [ ] Keep your booth's printed **Paper List** of voters with you — the administrator checks your booth's count against it after you close polling.
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
- [ ] Once your voters are done, use "Close polling at this booth" (the small link at the bottom of the welcome screen). This disables your code, and cannot be undone from your device — only the administrator can reopen it. Then take your Paper List to the administrator: they compare its count with the app's and seal your booth.
- [ ] If the administrator orders a **re-poll** at your booth, your old code stops working (it says a re-poll was ordered) and everyone who voted at your booth must vote again. You — or another teacher — will be sent a **new code**; use that one for the re-poll, then close the booth again when done.
- [ ] Report anything confusing, broken, or missing to the administrator — even if you're not sure it's a real problem.

## Normal Behaviour — Not Bugs

Please don't spend testing time reporting these; they're intentional:

- A ballot session (after "Officer Activation") times out after 5 minutes, with an on-screen warning in the last 90 seconds.
- The app cannot stop the same physical voter from voting twice — that's controlled entirely by your physical voter list, by design, not by the software.
- Refreshing or closing the browser mid-vote loses that ballot's in-progress selections, because nothing was submitted yet. Just reactivate and start again.
- Pausing polling cancels any ballot that was in progress at that moment. Reactivate once polling restarts.
- A code with no officer name, a closed code, a code replaced by a re-poll, or a code for the other election type is refused at the booth, with a message saying why.
- Entering a correct code before voting opens shows "✓ … you are marked as ready. Voting has not started yet" instead of opening a ballot. That's the check-in, not a fault.
- Codes from an earlier election are 🔴 red and refused ("polling duty for it is over") until **Reset Colours to White** is pressed, or that election is started.
- End of Voting is refused while any code of the election is still polling, closed but not sealed, or unallotted — the message lists them. Every booth, even one with no votes, has to be sealed.
- A sealed booth has no Close / Reopen / Re-poll buttons (and no Delete while its election runs), and a ballot opened there just before sealing is refused on Submit. Sealing is final, on purpose.
- Teacher names are changed with **Edit** on step 1, not on the Election day step. That's on purpose, so a name can't be changed by accident during voting.
- Verify & Seal stays greyed out until the Paper List number matches the app's count.
- A re-polled booth's "Votes" shows 0 with "N votes cancelled" under it — the votes are kept, just not counted. They're cleared when the next election of that type is started (or the code is deleted); the Election Record keeps their count, reason and per-candidate breakdown.
- Pause Polling, End of Voting, Re-poll, Reset Colours to White and Remove All Codes all ask for confirmation before doing anything — that's on purpose.

## Current Limitations — Work Around These Until Fixed

Found in the 2026-09-23 walkthrough; fixes are pending.

- **Fill every post before starting the election.** If any post (or, for House, any house/post) has no candidate, the wizard's last step starts the election but then fails to open the poll — and because candidates are locked once an election has started, the only way out is End of Voting, which leaves an empty entry in Election History and the Activity Log. Check Manage Candidates first.
- **AN must have its own candidates for every post before AN codes are used.** The "every post has a candidate" check currently looks at both branches together, so the poll can open with AN completely empty — an AN voter would then see a ballot with no one to vote for.
- **Don't abandon the wizard after choosing School/House unless you mean to start that election soon.** Choosing the type takes effect immediately; after an Abort, "Download Report" shows that type's live figures instead of the last finished election.

## One Hard Rule for Everyone

No one pushes code changes to the `main` branch while a real poll is open. Every push auto-deploys to the live server and restarts it, which silently logs out any officer who is mid-activation. Save all code changes for before polling hours start or well after they end.
