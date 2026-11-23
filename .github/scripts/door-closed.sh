#!/usr/bin/env bash
# Usage: door-closed.sh
#
# Serves the build in .next as the site of real businesses has it, with the
# demo door closed (DEMO_DOOR=off, as the check job built it) and no Supabase
# settings, so everyone is signed out, and asks what that site must answer:
#   - GET /health is 200 and never kept (no-store), and HEAD /health is 200;
#   - /enter goes on to /sign-in: no demo people there;
#   - /home goes to /sign-in, straight, in one hop;
#   - /sign-in is real sign-in, with no link to the demo.
# CI only, in the check job after its build. The e2e jobs build the door open
# and test it there (e2e/enter.spec.ts, e2e/sign-in.spec.ts).
set -euo pipefail
shopt -s inherit_errexit

port=3200
origin="http://127.0.0.1:$port"
log="${RUNNER_TEMP:-/tmp}/door-closed.log"
body=$(mktemp)

# The binary itself, not through pnpm, so stopping it stops the server.
env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -u SUPABASE_SECRET_KEY DEMO_DOOR=off \
  node_modules/.bin/next start --port "$port" --hostname 127.0.0.1 \
  > "$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -f "$body"' EXIT

fail() {
  echo "::error::$1"
  echo "::group::next start"
  cat "$log"
  echo "::endgroup::"
  exit 1
}

# The headers of one answer, no redirect followed, line ends made plain; its
# body goes to $body. Any further arguments go to curl.
answer() {
  local path=$1
  shift
  curl -sS --max-time 20 -o "$body" -D - "$@" "$origin$path" | tr -d '\r'
}

status_of() { printf '%s\n' "$1" | head -n 1 | cut -d ' ' -f 2; }

# A header's value (the first of its name), or nothing.
header_of() {
  printf '%s\n' "$2" | grep -i "^$1:" | head -n 1 | cut -d ' ' -f 2- || true
}

# Where a redirect goes, as a path: Next.js may write the whole address.
path_of() { printf '%s\n' "$1" | sed -E 's#^https?://[^/]+##'; }

up=""
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 -o /dev/null "$origin/health" 2> /dev/null; then
    up=yes
    break
  fi
  kill -0 "$server" 2> /dev/null || fail "The server stopped before it answered"
  sleep 1
done
[ -n "$up" ] || fail "The server didn't answer /health within 60 seconds"

headers=$(answer /health) || fail "GET /health didn't answer"
[ "$(status_of "$headers")" = 200 ] || fail "GET /health answered $(status_of "$headers"), not 200"
header_of cache-control "$headers" | grep -q no-store ||
  fail "GET /health may be kept: Cache-Control is '$(header_of cache-control "$headers")'"
[ "$(cat "$body")" = '{"status":"ok"}' ] || fail "GET /health said more than its status"

headers=$(curl -sS --max-time 20 -I "$origin/health" | tr -d '\r') ||
  fail "HEAD /health didn't answer"
[ "$(status_of "$headers")" = 200 ] || fail "HEAD /health answered $(status_of "$headers"), not 200"

for path in /enter /home; do
  headers=$(answer "$path") || fail "$path didn't answer"
  status=$(status_of "$headers")
  to=$(path_of "$(header_of location "$headers")")
  [ "$status" = 307 ] && [ "$to" = /sign-in ] ||
    fail "$path answered $status to '$to', not 307 to /sign-in"
done

headers=$(answer /sign-in) || fail "/sign-in didn't answer"
[ "$(status_of "$headers")" = 200 ] || fail "/sign-in answered $(status_of "$headers"), not 200"
grep -q 'value="send"' "$body" || fail "/sign-in has no way to send a code"
if grep -q 'href="/enter"' "$body"; then
  fail "/sign-in links to the demo door, which is closed here"
fi

echo "The closed door holds"
