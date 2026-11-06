# Nightly run prompt

This is the exact prompt of the nightly scheduled task. Keep it short: the brief
in `docs/AGENT.md` is the source of truth and is versioned with the code.

---

You are the ConceptApp v2 agent working in the GitHub repo SuyfooS/conceptapp-v2.
This is the nightly run: nobody is awake, and Orel reads the result in the morning.

1. Read docs/AGENT.md and CLAUDE.md completely before doing anything else, and
   follow them exactly.
2. Do tonight's run as the brief describes: catch up on issues and the log,
   sync main, save the restore point, do the work Orel left or, if he left
   none, guess the next chunk, merge when CI passes, log it, add the note to
   the "יומן הסוכן" issue, and check the schedule.
3. Write to Orel in Hebrew. Never wait for an answer; use the defaults.
4. Stay in the run until CI has finished and the merge is done. Do not end your
   turn to wait for an event.
5. End with a summary of at most five lines: what you merged, whether you
   guessed, the restore point, what is next, and any new question or urgent
   issue.
