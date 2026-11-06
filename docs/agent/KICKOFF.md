# Kickoff — one-time setup of the autonomous agent

Done on 12 October 2026 and kept for the record. Do not run it again: the
schedule and the run prompt have since changed (see `docs/AGENT.md`).

Orel starts a new Claude Code session with the repo `SuyfooS/conceptapp-v2`
attached and sends one line:

> Read docs/agent/KICKOFF.md and do it.

Everything below is for that session. Write to Orel in Hebrew; he may be on
his phone, so keep replies short and give links.

## Steps

1. **Read** `docs/AGENT.md` and `CLAUDE.md` completely.
2. **Check access.** You need to push branches, open and merge pull requests,
   and create issues, labels and comments in `SuyfooS/conceptapp-v2`
   (`gh api repos/SuyfooS/conceptapp-v2` should show `permissions.push: true`).
   If anything is missing, stop and tell Orel exactly what to enable.
3. **Check CI.** Look at the latest workflow run on `main`. If it is red, say
   so; fixing it becomes the first run's chunk.
4. **Labels.** Create any that are missing: `question` (the agent asks Orel),
   `orel` (an instruction from Orel), `urgent` (needs Orel now).
5. **Log issue.** If no issue titled `יומן הסוכן` exists, create it with a
   short Hebrew body: what it is (one comment per daily run, a longer one on
   Sundays) and how to reach the agent (open an issue or answer a `question`
   issue). Pin it (GraphQL `pinIssue`); if pinning fails, carry on and say so.
6. **Questions.** Open the three questions from "Questions already known" in
   `docs/AGENT.md`, unless an open `question` issue already covers one. One
   issue each, label `question`, in Hebrew: the question, the options, the
   default, and the deadline 48 hours from now in Israel time
   ("אם לא תענה עד <date>, אני ממשיך עם …").
7. **Schedule.** List the existing scheduled tasks first and do not create a
   duplicate. Create one recurring scheduled task:
   - name: `ConceptApp agent — daily run`
   - cron: `CRON_TZ=Asia/Jerusalem 50 9 * * *`
   - prompt: the text below the horizontal rule in `docs/agent/RUN_PROMPT.md`,
     verbatim
   - notifications: push and email
   - cloud only (it must not need Orel's computer), in this session's
     environment so every run has the repo
   - leave the approval setting to the server and report what it chose. If
     runs will stop to ask for approval, tell Orel to switch the task to
     "Automatically approve" in its settings: nobody will be there to approve.
8. **First run.** Fire the scheduled task once now, so the first run goes
   through the same path as every later one, then confirm from the task list
   that it started. Do not also do a run in this session; two agents would
   race on the same chunk.
9. **Report.** Add a first comment to `יומן הסוכן` ("הסוכן הוגדר", the run
   time, what happens next) and reply to Orel in Hebrew with: links to the log
   issue and the three questions, the schedule, the approval setting, and
   anything he still has to do. Tell him how to talk to the agent live: the
   Claude app, **Code** tab, this session or a new one with
   `conceptapp-v2` (see "Live chat" in the brief). At most ten lines.

## Never

The "Never" list in `docs/AGENT.md` applies here too. In particular: do not
create accounts, do not touch secrets, and do not change `main` except through
a pull request.
