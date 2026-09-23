# Testing / Demo / Training Script

A living, scripted walkthrough for testing the app, demonstrating it to staff, or training polling officers — as opposed to [ROLLOUT-CHECKLIST.md](ROLLOUT-CHECKLIST.md), which is the operational checklist for an actual real polling day. Anything generated while running this script (candidates, codes, votes, Election History entries) is test data and must be cleaned up via ROLLOUT-CHECKLIST.md's steps before real polling day.

Keep adding to this file as new scenarios come up.

## Part 1 — Core script

1. Log in to the super admin from one device, then log in to the super admin from another device. The second login shows an "already open on another device" prompt with a **Take Over** option — confirm it, and the super admin should get logged out from the first device. (Just entering the secret from a second device does NOT automatically evict the first — you must accept the takeover prompt.)
2. Dummy candidates have already been added to various school posts and all house posts (later on, for both branches). In some cases pictures have also been added against candidates' dummy names.
3. Create one code for School Elections, and one code for each house for House Elections (from the Polling Officer Codes tab), **and give each one an officer name** — an un-named code cannot be used to activate a ballot at all (a separate, earlier-priority check from the two in step 4). Open **Dashboard → 🗳️ Start the Election Process**, pick School on the wizard's first step (this takes effect immediately), then click **Abort** to leave it there without opening the poll.
4. Use a House Elections code to Activate Ballot in the voting console. The app should show, in order as you fix each one: (a) voting is closed, then (b) the code is for House Elections, not School Elections. Take the necessary steps — reopen **Start the Election Process**, go through it to the final "Open the Poll" step (this both starts the election run and opens the poll together), then use a code generated for School Elections to unlock the ballot.
5. Cast a vote for a school post. There must be a loud beep, and the vote count at that kiosk should be displayed. Explore what else is shown to the voter after the vote has been cast.
6. For the 2nd vote: change the choice of candidate before reaching the summary. For the 3rd vote: change the choice of candidate from the summary shown just before casting the vote.
7. Show the total vote count from the tab being used as the control panel (super admin account).
8. Give one teacher their code. Ask them to vote using their mobile as the device, and show the Live Results on screen.
9. Ask all teachers present to access the webapp on their mobiles. Give everyone the same School Elections code. Let them vote together for any candidate decided unanimously. Physically count the people voting, and show the count change by that number.
10. Create a summary of the results and store it in Election History ("📋 Save to Election History" on the Dashboard tab — this does not affect any votes or close anything).
11. **End the election process** for School Elections (Dashboard → "End the Election Process") — this saves the final result to Election History, resets votes to zero, and closes the poll; officer codes and their allotments are kept. Switching election type is blocked with a "close it before switching" error while a recording is still active, so this step cannot be skipped.
12. Open **Start the Election Process** again and pick House — then try a School Elections code — show the error message.
13. Share a code for any one house. Show that the ballot only opens for that house.
14. Follow the same procedure as above to cast votes for the house, show live results, and create an Election History entry.
15. After ending the House election too, confirm the Dashboard's "Download Dwarka/AN Report" buttons still work and now show House's final result (they fall back to the most recently closed election once nothing is currently active, so they never go permanently dark).

## Part 2 — Additional scenarios worth adding

Grouped by what they exercise; continue the numbering from Part 1 if you fold these into one script.

### Admin session & access
16. Log in as super admin, then leave the tab minimized or in the background (switch to another app) for several minutes without touching it. Come back and confirm you're still logged in — this is the behavior fixed on 2026-09-23 (previously a quiet/backgrounded tab could get silently logged out well before anyone logged in elsewhere).
17. Use the Logout button, then log back in immediately from the same device — confirm there's no "session already active" conflict (Logout should free the slot right away).
18. Enter the wrong admin secret a few times in a row — confirm each attempt gives a clear "incorrect secret" message.

### Candidate management guardrails
19. With the poll open, try to add, edit, or delete a candidate from Manage Candidates — confirm the app blocks it and explains why, rather than silently allowing a change mid-vote. (Verified 2026-09-24: all three are correctly blocked with the same message.)
20. Temporarily delete every candidate from one post, then try Open Poll — confirm it's blocked with a message naming the empty post; add a candidate back and confirm the poll now opens. (Verified 2026-09-24.)
21. Check a candidate that has no photo uploaded — confirm the voting screen shows a sensible placeholder rather than a broken image.

### Officer codes — negative cases
22. Enter a wrong/mistyped officer code at Activate Ballot — confirm a clear "incorrect officer code" message rather than a crash or blank screen.
23. Use "Close Polling at This Booth" on a code, then try to activate with that same code again — confirm it's refused. Then Reopen it from the admin Codes tab and confirm it works again. (Verified 2026-09-24.)
24. Delete an officer's code entirely from the Codes tab, then try to activate with it — confirm "incorrect officer code."
25. **New (2026-09-24):** end an election with a code still allotted and closed, then start a new election of the same type — confirm the code, its officer name, and its allotment are all still there, and the booth is usable again (no longer showing as closed). Officer codes are prep work now, carried forward from election to election same as candidates — Close Recording no longer wipes them.

### Voting session edge cases
26. Activate a ballot but leave it untouched for more than 5 minutes before voting — confirm the app reports the session as expired instead of letting a stale ballot through (changed from 10 to 5 minutes on 2026-09-24 — 10 was judged too long).
27. Refresh the page (F5) partway through a ballot, before submitting — confirm the voter is simply bounced back to the Welcome screen with no error, and that the officer can activate a fresh ballot with the same code for that voter. (Checked in code: the ballot's in-progress state lives only in the browser tab's memory, never in a cookie or local storage, so a refresh always wipes it and returns to Welcome — there is no scenario where a refresh mid-ballot leaves the voter on a stuck or broken screen.)
28. Refresh the page (F5) right after a vote is confirmed ("Vote Recorded" screen) — confirm this also just returns to Welcome, with no error and no way to resubmit. (The already-cast vote is unaffected either way — the vote is recorded and the activation is invalidated server-side the moment Submit succeeds, before the confirmation screen even renders.)
29. Note: the browser **Back** button does *not* provide a way to return to a submittable ballot screen after voting — the confirmation screen is driven by in-app state, not by the browser's page history, so Back cannot un-confirm a vote or reopen the ballot form. Refresh (above) is the meaningful test here, not Back.

### Poll lifecycle
30. With votes already cast, use "Save to Election History," then immediately Reset Poll — confirm this does NOT create a second, duplicate history entry for the same election.
31. **Corrected 2026-09-24 — this used to claim Reset Poll is blocked while the poll is open; verified it is NOT.** Try Reset Poll while the poll is still open — it succeeds and closes the poll as part of resetting (no separate "close it first" step is required). If you actually want Reset blocked while open, that's a real product decision to make, not something the current code does — flag it rather than assume either way.
32. Close the poll mid-voting (i.e. with a code already activated but not yet voted) — confirm no *new* ballot can be activated afterward, and any votes already fully cast beforehand are unaffected. **Note (verified 2026-09-24):** the in-progress (activated-but-not-yet-submitted) session itself is invalidated the moment the poll closes — that voter's half-finished ballot cannot be submitted afterward (fails with "Invalid kiosk session token"), so plan for that if a real voter is ever mid-ballot when Close Poll is clicked.

### Reports & history
33. Open "Download Dwarka/AN Report" (Dashboard tab) and "Print Officer Turnout" for both School and House elections — confirm the totals match the Live Results tab and the layout is print-ready. **Verified 2026-09-24:** these now keep working even after an election is closed, showing that election's final result (no more going permanently disabled once nothing is currently active).
34. Rename an Election History entry and confirm the new name is saved.
35. Delete a junk/test Election History entry and confirm a confirmation prompt appears before it's actually removed.
36. From an Election History entry, try the "Include polling officer turnout" checkbox on its report page — confirm unchecking it hides the turnout table for a results-only copy, and it's checked by default so existing behavior is unchanged if you don't touch it.

### Devices & resilience
37. Repeat the mobile-voting steps (8–9) across a genuine mix of devices/browsers you expect on polling day (Android Chrome, iPhone Safari, older phones, etc.) — voters will use whatever they personally have.
38. Note what the Storage status indicator on the Dashboard tab normally looks like (green "Storage: OK") at least once during testing, so whoever is on duty on polling day would immediately recognize the red warning banner if storage ever failed for real.

## Suggestions for you to decide on

- Whether to formally split Part 2 into its own "regression tests" section that gets re-run every time before a real polling day, versus a one-time "have we ever tried this" list.
- Whether Reset Poll should actually be blocked while the poll is open (see item 31) — flagged, not decided.
- This script still doesn't exercise the Dwarka/AN branch dimension at all (every step above implicitly runs against Dwarka, the only branch with real candidates set up so far) — matches this year's live rollout plan of Dwarka-only before AN has real data (see ROADMAP.md), but once AN's real candidate list is entered, this script should be re-run once per branch, plus one pass specifically checking that a Dwarka code never surfaces AN candidates (or votes) and vice versa.
