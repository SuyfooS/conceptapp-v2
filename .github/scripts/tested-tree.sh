#!/usr/bin/env bash
# Usage: tested-tree.sh <commit>
#
# Prints the link to the pull_request run of ci.yml that already passed check,
# database and e2e on exactly the tree of <commit>, or prints nothing.
# A run counts only when all of these hold:
#   - check, database and e2e each recorded, as their last step, that they
#     passed on this tree (artifacts passed-<job>-<tree>), all in that run;
#   - the run belongs to this repository (no fork), ran ci.yml for a
#     pull_request event, is completed, and its latest attempt succeeded;
#   - the run was created today in Asia/Jerusalem, so no day, week or month
#     of the real clock the tests read (e2e/db.ts) has turned since.
# Reasons go to stderr. Any API error exits non-zero; callers then run everything.
set -euo pipefail
shopt -s inherit_errexit

commit=$1
repo=$GITHUB_REPOSITORY
repo_id=$REPO_ID
today=$(TZ=Asia/Jerusalem date +%F)

tree=$(gh api "repos/$repo/git/commits/$commit" --jq .tree.sha)
echo "Commit $commit has tree $tree." >&2

# Runs holding a record from each of the three jobs, newest first.
runs=$(
  for job in check database e2e; do
    gh api "repos/$repo/actions/artifacts?name=passed-$job-$tree&per_page=100" \
      --jq ".artifacts[]
        | select((.expired | not)
            and .workflow_run.repository_id == $repo_id
            and .workflow_run.head_repository_id == $repo_id)
        | .workflow_run.id" | sort -u
  done | sort | uniq -c | awk '$1 == 3 { print $2 }' | sort -rn
)
if [ -z "$runs" ]; then
  echo "No run holds records from all three jobs for this tree." >&2
  exit 0
fi

for id in $runs; do
  # A merge can land a few seconds before its run is marked completed.
  for _ in 1 2 3 4 5 6; do
    run=$(gh api "repos/$repo/actions/runs/$id")
    [ "$(jq -r .status <<< "$run")" = completed ] && break
    sleep 10
  done
  created=$(jq -r .created_at <<< "$run")
  if [ "$(TZ=Asia/Jerusalem date -d "$created" +%F)" != "$today" ]; then
    echo "Run $id was created on another day in Israel ($created)." >&2
    continue
  fi
  url=$(jq -r 'if .status == "completed" and .conclusion == "success"
      and .event == "pull_request" and .path == ".github/workflows/ci.yml"
    then .html_url else "" end' <<< "$run")
  if [ -n "$url" ]; then
    echo "$url"
    exit 0
  fi
  echo "Run $id is not a completed, successful pull_request run of ci.yml." >&2
done
