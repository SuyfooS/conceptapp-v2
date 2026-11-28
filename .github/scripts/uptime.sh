#!/usr/bin/env bash
# The uptime check, which .github/workflows/uptime.yml runs four times an
# hour (closing the pilot, PR 11; docs/production.md, "בדיקה שהאתר באוויר").
# It asks the site's /health (the server answers) and /health/db (the
# database answers too), and keeps one open issue labelled `uptime` while
# either gets no answer:
#
#   none open, something fails      it opens one, assigned to the
#                                   repository's owner, with what got no
#                                   answer and when (the label made first if
#                                   the repository has none)
#   open, the same fails            nothing: the issue says it already
#   open, something else fails      a comment with what fails now
#   open, everything answers        a comment with what answers, and it
#                                   closes (every open one)
#   none open, everything answers   nothing
#
# Assigned, because the GitHub app on a phone pushes an issue assigned to
# you, never a new issue in a repository you watch. What the issue said last
# is read from the workflow's own words alone: the repository is public, and
# anyone can comment. A run by hand on another site (`site`) says nothing of
# the real one: it opens an issue only when none is open, and leaves an open
# one as it is.
#
# An answer is 200, within 10 seconds a try, in three tries at most (curl
# -fsS --max-time 10 --retry 2, every error retried, not only a timeout or a
# 5xx). A redirect is no answer: curl doesn't follow it. The repository is
# public, so what it writes is the addresses and the time, Israel's, and the
# log has each address and the status it got, never a body. It ends 0 when
# it did its work, whether the site answered or not, since the issue is the
# alarm and GitHub mails a failed run to whoever last changed the schedule;
# so a failed run means the check itself broke. It ends 2, asking nothing,
# for an address it won't take.
#
# The run's `site` input is a site to check instead of the real one, to see
# the issue open: an https:// address with a host and nothing more (one / at
# its end is dropped, and capitals, as a phone's keyboard starts it, made
# lower case: a host is the same in either), or nothing is asked, and this
# script prints nothing of what was typed. It is read from the run's event
# (GITHUB_EVENT_PATH, with jq), never from the step's environment, which the
# runner prints at the top of the step's log, public in a public repository;
# a scheduled run's event has no input. An address it takes is in the log,
# the step summary and the issue, all public: an address alone, never a
# token or a password. GH_TOKEN and
# GH_REPO are the run's own, for `gh`; GITHUB_SERVER_URL and
# GITHUB_REPOSITORY_OWNER the runner sets on every run. The words call it
# "the check that the site is up", never "בדיקת הזמינות": in the app,
# "זמינות" is the staff's availability. tooling/uptime.test.ts runs this with
# curl and gh stood in for.
set -euo pipefail

REAL_SITE="https://www.conceptapp.co.il"
PATHS=(/health /health/db)
LABEL="uptime"
LABEL_COLOR="B60205"
LABEL_ABOUT="הבדיקה שהאתר באוויר לא קיבלה ממנו תשובה (.github/workflows/uptime.yml)"
TITLE="האתר לא עונה"
NO_ANSWER="הבדיקה שהאתר באוויר לא קיבלה תשובה מ:"
ANSWERS="הבדיקה שהאתר באוויר מקבלת שוב תשובה מ:"
# The section of docs/production.md, as GitHub names its heading, so the
# pointer opens it in one tap.
SECTION="בדיקה-שהאתר-באוויר-issue-כשהאתר-לא-עונה"
WHAT_TO_DO="מה עושים: [docs/production.md, בדיקה שהאתר באוויר]($GITHUB_SERVER_URL/$GH_REPO/blob/main/docs/production.md#$SECTION)."
OWNER=$GITHUB_REPOSITORY_OWNER
HOST_PATTERN='^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'

# Spaces around what was typed are dropped, empty is the real site, and
# capitals are made lower case ("Https://…" from a phone's keyboard).
site=""
if [ -n "${GITHUB_EVENT_PATH:-}" ]; then
  site=$(jq -r '.inputs.site // ""' "$GITHUB_EVENT_PATH")
fi
site=${site#"${site%%[![:space:]]*}"}
site=${site%"${site##*[![:space:]]}"}
site=${site:-$REAL_SITE}
site=${site%/}
site=${site,,}
if [[ ! $site =~ $HOST_PATTERN ]]; then
  echo "::error::The site to check is an https:// address with a host and nothing more, such as $REAL_SITE. Nothing was asked."
  exit 2
fi

when="$(TZ=Asia/Jerusalem date '+%d.%m.%Y %H:%M') (שעון ישראל)"
summary=${GITHUB_STEP_SUMMARY:-/dev/null}
echo "### $site, $when" >> "$summary"

failing=()
answered=()
for path in "${PATHS[@]}"; do
  url="$site$path"
  status=$(curl -fsS --max-time 10 --retry 2 --retry-all-errors \
    -o /dev/null -w '%{http_code}' "$url") || true
  status=${status: -3}
  status=${status:-000}
  if [ "$status" = 200 ]; then
    answered+=("$url")
    echo "$url: 200"
  else
    failing+=("$url")
    echo "::warning::$url: no answer ($status)"
  fi
  echo "- $url: $status" >> "$summary"
done

# The addresses, one line each, as the issue lists them.
list() {
  local url
  for url in "$@"; do
    printf -- '- %s\n' "$url"
  done
}

# The addresses that got no answer by what the issue said last: the list
# under the last "no answer" line of its body and the workflow's comments,
# or none after a later "answers again" (it closed, and was opened again).
last_said() {
  awk -v head="$NO_ANSWER" -v ok="$ANSWERS" '
    { sub(/\r$/, "") }
    $0 == head { said = ""; reading = 1; next }
    $0 == ok { said = ""; reading = 0; next }
    reading && /^- https:\/\// { said = said $0 "\n"; next }
    { reading = 0 }
    END { printf "%s", said }
  ' <<< "$1"
}

# The label first: with none, no issue has it, and none is asked for.
labels=$(gh label list --search "$LABEL" --limit 100 --json name --jq '.[].name')
open=""
if grep -Fqx "$LABEL" <<< "$labels"; then
  open=$(gh issue list --label "$LABEL" --state open --limit 50 \
    --json number --jq '.[].number')
fi

# Another site's answers say nothing of the real one's: an open issue is left
# as it is.
if [ "$site" != "$REAL_SITE" ] && [ -n "$open" ]; then
  echo "#${open%%$'\n'*} is left as it is: this run asked $site, not $REAL_SITE"
  exit 0
fi

if [ ${#failing[@]} -eq 0 ]; then
  for number in $open; do
    gh issue close "$number" --comment "$(printf '%s\n%s\n\nמתי: %s.' \
      "$ANSWERS" "$(list "${answered[@]}")" "$when")"
    echo "Closed #$number: every address answers again"
  done
  exit 0
fi

now_failing=$(list "${failing[@]}")

if [ -z "$open" ]; then
  if ! grep -Fqx "$LABEL" <<< "$labels"; then
    gh label create "$LABEL" --color "$LABEL_COLOR" --description "$LABEL_ABOUT"
  fi
  gh issue create --title "$TITLE" --label "$LABEL" --assignee "$OWNER" --body "$(printf \
    '%s\n%s\n\nמתי: %s.\n\n%s' "$NO_ANSWER" "$now_failing" "$when" "$WHAT_TO_DO")"
  echo "Opened an issue: no answer from ${failing[*]}"
  exit 0
fi

# gh lists the newest first. Its body, which only its author (the workflow)
# and the repository's own people can change, and the workflow's comments,
# never anyone else's.
newest=${open%%$'\n'*}
own='.body, (.comments[] | select(.author.login == "github-actions" or .author.login == "github-actions[bot]") | .body)'
said=$(gh issue view "$newest" --json body,comments --jq "$own")
if [ "$(last_said "$said")" = "$now_failing" ]; then
  echo "#$newest already says no answer from ${failing[*]}"
  exit 0
fi
gh issue comment "$newest" --body "$(printf '%s\n%s\n\nמתי: %s.' \
  "$NO_ANSWER" "$now_failing" "$when")"
echo "Commented on #$newest: no answer now from ${failing[*]}"
