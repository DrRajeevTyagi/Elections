# Testing / Demo / Training Script

A living, scripted walkthrough for testing the app, demonstrating it to staff, or training polling officers — as opposed to [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md), which is the operational checklist for an actual real polling day. Anything generated while running this script (candidates, codes, votes, Election History entries) is test data and must be cleaned up via ROLLOUT-CHECKLIST.md's steps before real polling day.

**How this file is organised**

| Part | What it is | When to use it |
| --- | --- | --- |
| **Part 0** | Prep done *before* staff walk in | Half an hour before the session |
| **Part 1** | The live demo, in running order | With staff in the room |
| **Part 2** | Regression checklist | Re-run before every real polling day |
| **Part 3** | Behaviours that look like bugs but aren't | Read once, so nobody is caught out |

Refer to items by their **title**, not their number — numbers shift whenever the script is edited.

Keep adding to this file as new scenarios come up.

---

## Part 0 — Before staff arrive

The single biggest thing that makes a demo drag is doing setup work in front of an audience. Get all of this done first, so Part 1 opens on a clean, ready system.

1. **Candidates entered for both branches.** Manage Candidates → add at least 2 dummy candidates for every School post (HB, HG, SSC, SRC, SCC) and every House post (HC, HCC, HSC) in every house — **once under the Dwarka sub-tab and once under the AN sub-tab**. Put a photo on a few of them and deliberately leave others without one, so the placeholder can be shown.
2. **Officer codes generated and allotted.** Polling Officer Codes tab → generate at least: one School code for Dwarka, one School code for AN, and one code per house. **Give every code an officer name** — an un-named code cannot activate a ballot at all. Use "Print Code Allotment List" to have the slips ready to hand out.
3. **Nothing left running.** Dashboard should show no active election, poll closed, no banner at the top. If an old recording is still active, End the Election Process first.
4. **Devices.** Have the admin dashboard on the projector, one teacher's phone ready for the single-voter demo, and everyone else's phones on the school wifi with the URL already open.
5. **Keep one code back.** Hold one named, unused School code aside — you'll need it for the "wrong code type" demo in Part 1 and it must not have been handed out.

> **You will not need "Reset Poll" anywhere in this demo.** It exists only for clearing stray test votes before an election has ever been started, and is now blocked (with a clear message) for as long as the green "ELECTION IN PROGRESS" box is showing, even during a Pause Polling break. **End the Election Process** is the correct way to finish any election, every time. (See Part 3.)

---

## Part 1 — The live demo

Each step has a one-line **Say:** cue — the point staff should take away — so the narration doesn't have to be improvised.

### Act 1 — Only one person controls the election

1. **Single-terminal lock.** Log in to the super admin from one device, then log in again from a second device. The second login shows an "already open on another device" prompt with a **Take Over** option — confirm it, and the first device is logged out. Entering the secret on a second device does **not** silently evict the first; someone has to deliberately take over.
   **Say:** *Only one terminal can control the election at a time, and taking control from someone else is a deliberate act that gets recorded in the log.*
2. Log back in on the main device and carry on from there.

### Act 2 — Setting up an election

3. **Show the prep already in place.** Walk through Manage Candidates, and use the **School / House toggle** at the top of the tab to switch between the two sets of candidates, and the **Dwarka / AN** sub-tab to switch branches. Four combinations, one screen.
   **Say:** *Candidates and officer codes are prep work. They're entered once and stay put — they are not wiped when an election ends.*
4. **Start the Election Process.** Dashboard → **🗳️ Start the Election Process**. On the wizard's first step pick **School**. Note the indicator now showing "🏫 School Election chosen" on every step of the wizard. Then click **Abort** to back out without opening the poll.
   **Say:** *Picking the type takes effect straight away, but nothing can be voted on until the poll is actually opened — notice there's still no banner at the top of the screen.*
5. **Un-named codes can't vote.** If you have an un-named code to hand, try it at Activate Ballot — it's refused with "has not yet been allotted to a polling officer", before any other check.
   **Say:** *A code is useless until it's been allotted to a named person. That's the audit trail.*

### Act 3 — Guardrails, demonstrated as they come up

6. **Wrong code type, poll closed.** Use a **House** code at Activate Ballot now. The app reports, in order as you fix each problem: (a) voting is currently closed, then later (b) this code is for House Elections. Leave it at (a) for the moment.
7. **Empty post blocks opening.** *(Optional, if you have a spare minute.)* Delete every candidate from one post, reopen **Start the Election Process**, and try to reach "Open the Poll" — it's blocked with a message naming the empty post. Add a candidate back and continue.
   **Say:** *The app will not let you open a poll that a voter could get stuck in.*
8. **Open the poll.** Reopen **Start the Election Process**, go through to the final **Open the Poll** step (this starts the election run and opens the poll together). The **"Election for School Posts" banner now appears** at the top of every screen, admin and voter alike.
   **Say:** *The banner is the single signal that voting is genuinely live.*
9. **Now retry the House code** — this time the message is (b), "this code is for House Elections and cannot be used while School Elections are active."
10. **Mistyped code.** Enter any nonsense code — "Incorrect officer code", no crash, no blank screen.

### Act 4 — Voting

11. **First vote, on the projector.** Use a School code for **Dwarka** to activate a ballot and cast a vote. There must be a loud beep, and the station's vote count is shown. Explore what else the voter sees after casting.
12. **Changing your mind.** Cast a 2nd vote, changing the candidate *before* reaching the summary. Cast a 3rd, changing the candidate *from the summary screen* just before submitting.
    **Say:** *A voter can change their mind right up until they submit — and not after.*
13. **Candidate with no photo.** Point out the placeholder on the candidate you deliberately left photo-less.
14. **One teacher, one phone.** Give one teacher their own code and have them vote from their mobile while the **Live Results** tab is on screen.
15. **Everyone at once.** Have all teachers present open the app on their phones. Give them all the same **Dwarka School** code, and have them vote together for one candidate agreed unanimously. **Physically count the people voting**, and show the count move by exactly that number.
    **Say:** *One code can serve a whole queue — it doesn't get used up. What gets used up is each individual ballot.*
16. **Now the other branch.** Hand two or three teachers the **AN** School code instead, and have them vote. Then on the Dashboard switch the branch selector from **Dwarka** to **AN** and back.
    **Say:** *The two branches are counted entirely separately. A Dwarka code can only ever produce a Dwarka vote, and it can only ever see Dwarka candidates — the server enforces that, not the phone.*

### Act 5 — Results and reports

17. **Live results.** Live Results tab → show the totals, the branch selector, and the School/House toggle (you can look at House while School is the one actually running, without disturbing anything).
18. **Download the live report, per branch.** Dashboard → **🖨️ Download Dwarka Report** and **🖨️ Download AN Report**. Check the "total votes cast" on each report against the number of people you physically counted in steps 15–16.
    **Say:** *These two buttons always show the current position — during the election that's live, and after it closes it's the final result. They never stop working.*
19. **Save a checkpoint.** **📋 Save to Election History** on the Dashboard. This files a permanent record and changes nothing — the poll stays open and no votes are touched. Show the new entry in the Election History tab.

### Act 6 — Finishing the School election

20. **Try to switch type first.** Open Start the Election Process and try to pick House. It's refused — "a recording is currently active, close it before switching election type."
    **Say:** *You can't accidentally start the next election on top of one that's still running.*
21. **End the Election Process.** Dashboard → **End the Election Process**. This saves the final result to Election History, resets the votes to zero, and closes the poll. The banner disappears. Officer codes and their teacher allotments are kept.
22. **Confirm nothing was lost.** Polling Officer Codes tab — every code and every officer name is still there, and any booth that had been closed is usable again. Election History — the School election's final record is there, and did **not** get duplicated by the checkpoint you saved in step 19.
23. **Reports still work.** Hit **Download Dwarka Report** again now that nothing is running — it shows the School election's final result.

### Act 7 — The House election (shorter; show only what differs)

24. **Start House.** Start the Election Process → House → through to Open the Poll.
25. **School code is now refused.** Try the School code — "this code is for School Elections."
26. **A house code opens only its own house.** Activate with, say, the Prem code and show that only Prem's candidates appear. The house comes from the code itself; the officer never picks it.
    **Say:** *Nobody has to remember which house they're running. The code knows.*
27. **Vote, and show Live Results grouped by house.**
28. **Close a booth.** Have an officer use "Close Polling at This Booth" on their code, then try to activate with it again — refused. Reopen it from the admin Codes tab and show it works again.
    **Say:** *That's how an officer signs off at the end of the day, and how you undo it if it was a mistake.*
29. **End the Election Process** for House.

### Act 8 — After everything is closed

30. **Reports survive.** With nothing running at all, **Download Dwarka Report** / **Download AN Report** still work and show the House election's final result — the most recently closed election. They never go permanently dark.
31. **Election History.** Show **View/Print Dwarka** and **View/Print AN** on a past entry. Point out that the vote totals on these match what was counted on the day. Show renaming an entry, and the confirmation prompt on deleting one.
32. **Officer turnout.** On an Election History report, untick **"Include polling officer turnout"** for a results-only copy to hand out; it's ticked by default.
33. **Storage indicator.** Point at the green "Storage: OK" on the Dashboard once, so whoever is on duty would recognise the red warning banner if storage ever failed for real.
    **Say:** *If this is ever red on polling day, stop and call me.*

---

## Part 2 — Regression checklist

Re-run before every real polling day. Everything below is verified working as described unless noted.

### Admin session & access
- **Backgrounded tab stays logged in.** Leave the admin tab minimised for several minutes, come back, confirm you're still logged in (fixed 2026-09-23 — a quiet tab used to get silently logged out).
- **Logout frees the slot immediately.** Log out, log straight back in from the same device — no "session already active" conflict. *(Verified 2026-09-24.)*
- **Wrong secret.** A few wrong attempts in a row each give a clear "incorrect secret" message. *(Verified 2026-09-24.)*
- **Takeover requires consent.** A second device is refused with a 409 until it explicitly takes over. *(Verified 2026-09-24.)*

### Candidate management guardrails
- **No edits while voting is open.** Add / edit / delete from Manage Candidates are all blocked with the same explanation. *(Verified 2026-09-24.)*
- **Empty post blocks Open Poll.** Blocked with a message naming the post; add a candidate back and it opens. *(Verified 2026-09-24.)*
- **Missing photo.** The voting screen shows a sensible placeholder, not a broken image.

### Officer codes
- **Mistyped code** → "incorrect officer code", no crash. *(Verified 2026-09-24.)*
- **Un-named code** cannot activate a ballot, and this check fires *before* the poll-closed and wrong-type checks. *(Verified 2026-09-24.)*
- **Closed booth** refuses activation; admin Reopen makes it usable again. *(Verified 2026-09-24.)*
- **Deleted code** → "incorrect officer code". Note a code that has *ever* been named cannot be deleted at all (close the booth instead) — deliberate, so an officer can't be quietly erased from the record. *(Verified 2026-09-24.)*
- **Codes survive an election.** End an election with a code allotted and its booth closed, start a new election of the same type — the code, officer name and allotment are all still there and the booth is usable again. *(Verified 2026-09-24.)* The code's *vote count* does reset to zero, because the votes themselves were archived and cleared; that election's turnout lives in its Election History entry.

### Voting session edge cases
- **5-minute timeout.** Activate a ballot and leave it untouched for over 5 minutes — the session is reported as expired (changed from 10 to 5 minutes on 2026-09-24). **Still needs a real timed run-through in a browser.**
- **Refresh mid-ballot (F5).** The voter lands back on Welcome with no error, and the officer can activate a fresh ballot with the same code. The in-progress ballot lives only in the tab's memory — never a cookie or local storage — so a refresh can never leave a stuck screen.
- **Refresh after "Vote Recorded".** Also just returns to Welcome, with no way to resubmit. The vote is recorded and the activation invalidated server-side the moment Submit succeeds, before the confirmation even renders. *(Verified 2026-09-24: a second submit on the same token is refused with "This ballot has already been submitted.")*
- **Back button** cannot un-confirm a vote or reopen the ballot — the confirmation is in-app state, not browser history. Refresh is the meaningful test, not Back.

### Poll lifecycle
- **No duplicate history entry.** "Save to Election History" followed by End the Election Process produces one record, not two. *(Verified 2026-09-24.)*
- **Reset Poll is blocked while the poll is open** (403, "Close the poll before resetting"). *(Fixed 2026-09-24: previously only the admin UI disabled the button, with no server-side guard — a direct API call could have reset live votes out from under a voter mid-ballot.)*
- **Reset Poll is blocked for as long as an election is in progress — including during a Pause Polling break**, not just while polling is actively open (403, "An election is currently in progress. Use 'End the Election Process' to finish it"). *(Fixed 2026-09-24: Pause Polling stops new votes but does not end the election, so the first guard above alone still left a window — pause for a lunch break, then Reset Poll would silently wipe that election's votes while it was still under way. Verified: blocked immediately after Pause Polling, works again immediately after End the Election Process, on both the button and the API directly.)*
- **Close the poll mid-voting.** No new ballot can be activated afterwards, and votes already fully cast are unaffected. **Note:** an already-activated but not-yet-submitted ballot *is* invalidated the instant the poll closes — that voter cannot submit ("Invalid kiosk session token"). Plan for that if a real voter is mid-ballot when Close Poll is clicked. *(Verified 2026-09-24.)*
- **Switching election type is blocked while a recording is active.** *(Verified 2026-09-24.)*

### Branch separation (Dwarka / AN)
- **A booth can only vote for its own branch.** An AN-coded ballot submitting a Dwarka candidate's id is rejected outright by the server, even though that candidate genuinely exists for the post. The candidate list the voter sees is a display convenience; the kiosk session's branch is the trust boundary. *(Verified 2026-09-24.)*
- **A house booth can only vote for its own house.** Same mechanism. *(Verified 2026-09-24.)*
- **Per-branch report totals.** A branch report's "total votes cast" matches the number of people who actually voted in that branch, and the two branches add up to the combined figure. *(Fixed 2026-09-24 — see the change log below.)*
- **Run the whole of Part 1 once per branch** once AN's real candidate list is entered, plus one pass specifically checking that a Dwarka code never surfaces AN candidates or votes, and vice versa.

### Reports & history
- **Download Dwarka/AN Report** work during an election (live figures) *and* after it closes (that election's final result). They do not go permanently disabled. *(Verified 2026-09-24.)*
- **Print Officer Turnout** for both School and House — totals match Live Results, layout is print-ready. **Still needs a real browser check for print layout.**
- **Rename** an Election History entry — the new name is saved. *(Verified 2026-09-24.)*
- **Delete** a junk entry — a confirmation prompt appears first. *(Verified 2026-09-24.)*
- **"Include polling officer turnout"** checkbox on an archived report hides the turnout table when unticked; ticked by default.

### Devices & resilience
- **Repeat the mobile-voting steps across a genuine mix of devices** — Android Chrome, iPhone Safari, older phones. Voters use whatever they personally own. **Needs a real multi-device session.**
- **Storage status indicator** — note what the green "Storage: OK" normally looks like, so a red banner would be recognised immediately.
- **The beep on vote confirmation** — **needs a real browser/device check**, including on a phone with the ringer silenced.

---

## Part 3 — Behaviours that look like bugs but aren't

Worth knowing before someone reports them as faults.

- **Reset Poll is unavailable (greyed out) whenever an election is in progress**, including during a Pause Polling break — not just while polling is actively open. This is deliberate: it's the button's only job now — clearing stray test votes before an election has ever been started — and it stays that way even mid-pause, so there is no longer a window where it could silently wipe an unfinished election's votes. Use **End the Election Process** to finish an election properly; it saves the final result and clears the votes together.
- **An officer code's vote count goes to zero when an election ends.** Expected: the votes were archived and cleared. That election's turnout is preserved in its Election History entry.
- **The banner disappears the moment an election ends.** Expected: there is no election open to vote in, so there is nothing to announce.
- **No banner while the wizard is open.** Expected: picking a type doesn't mean voting is possible. The wizard shows "🏫 School Election chosen" / "🏠 House Election chosen" on every step so the choice is still visible.
- **A named code cannot be deleted, even with zero votes.** Deliberate (ELECTION-INTEGRITY-AND-TRUST.md item 3) — close the booth instead.
- **`?house=` on the results API doesn't narrow the total-votes figure**, only the per-candidate tallies. The admin UI never sends it, so this is not reachable from the app; noted only so nobody builds on it.

---

## Change log for this script

- **2026-09-24 — per-branch report totals were wrong.** Narrowing a report to one branch recomputed "total votes cast" by summing the filtered candidate totals. Because every ballot fills one selection per post, that counted each ballot once per post: a 4-ballot Dwarka School election reported **20**, and a 3-ballot House election reported **9**. Both Download Report buttons and both Election History View/Print buttons were affected — i.e. every per-branch report anyone actually clicks. The Dashboard's own "Total Votes" was right all along, so the two disagreed. Ballot counts are now captured per branch when the snapshot is taken; archives written before the fix fall back to a per-post derivation rather than the sum-across-posts one.
- **2026-09-24 — archives came back mislabelled after a restart.** On loading saved data, every stored archive had its branch defaulted to "dwarka", even though an archive always covers both branches. After any server restart (routine on Cloud Run), an un-narrowed report header read "Mount Carmel School — Dwarka" while listing both branches' candidates underneath. Only reachable by editing the URL by hand, since the buttons always request one branch — but the stored data now matches what it claims.
- **2026-09-24 — Reset Poll gained its server-side guard** while the poll is open (see Part 2).
- **2026-09-24 — Reset Poll closed for good.** The guard above still left a gap: Pause Polling stops voting but does not end the election, so a routine pause (a lunch break) was enough to make the button active again while an election was still genuinely in progress, wiping its votes with no warning. Reset Poll is now unavailable for as long as the green "ELECTION IN PROGRESS" box is showing, paused or not, and is only ever usable for its one real remaining purpose: clearing stray test votes before an election has been started. Verified against a live server: blocked immediately on Pause Polling, works again immediately after End the Election Process.
- **2026-09-24 — script restructured** into Part 0 (prep) / Part 1 (live demo) / Part 2 (regression) / Part 3 (known behaviours), with the Dwarka/AN branch split folded into the main demo rather than left as a footnote.
