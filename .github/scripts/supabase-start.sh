#!/usr/bin/env bash
# Usage: supabase-start.sh reserve
#        supabase-start.sh <supabase arguments>    ("db start", or "start -x …")
#
# Starts the local Supabase stack in CI and gets it past a host port that is
# taken. CI only: it uses sudo, Docker and the runner's kernel settings.
#
# Why a port is taken on a fresh runner. Nine jobs failed this way from 9 to
# 18 November 2026, each on "failed to bind host port 0.0.0.0:54322/tcp:
# address already in use" at the stack's very first start, seconds after its
# images were pulled; each one rerun, on another runner, passed. The stack's
# own containers were not the holder: there were none before, the CLI removes
# them when a start fails ("Stopping containers..." before its error), and the
# four that started again 15 seconds later failed the same way. The likeliest
# holder: the stack's host ports (supabase/config.toml, 54320 to 54329) lie
# inside Linux's ephemeral range (32768 to 60999), the ports the kernel gives
# outgoing connections as their own, and the pull makes many short
# connections, each kept up to 60 seconds in TIME_WAIT once closed. While any
# socket has the port as its own, open or in TIME_WAIT, Docker cannot bind it.
# If it happens again, the start prints who held the port.
#
# reserve: keeps the config's ports out of the ephemeral range
#   (net.ipv4.ip_local_reserved_ports, which covers IPv6 too), so no
#   connection made after it takes one. Run it first in the job, before the
#   downloads.
# otherwise: runs `supabase <arguments>`. When it fails on a taken port, prints
#   who holds it (ss, docker ps -a), removes what is left of this project's
#   stack, ends a docker-proxy left on the port, drops closed connections still
#   in TIME_WAIT on it, waits until nothing uses it (90 seconds at most) and
#   tries again after a pause that doubles, four attempts in all. Any other
#   failure, or a taken port on the last attempt, fails with ::error::.
set -euo pipefail
shopt -s inherit_errexit

cd "$(dirname "$0")/../.."
config=supabase/config.toml
project=$(sed -nE 's/^project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$config")
attempts=4
wait_max=90

# The host ports the config gives the stack: its `port =` and `shadow_port =`
# lines, commented ones left out.
config_ports() {
  sed -nE 's/^[[:space:]]*(port|shadow_port)[[:space:]]*=[[:space:]]*([0-9]+).*/\2/p' "$config" | sort -un
}

ephemeral_range() {
  sysctl -n net.ipv4.ip_local_port_range | awk '{ print $1 "-" $2 }'
}

reserve() {
  local ports current
  ports=$(config_ports | paste -sd, -)
  current=$(sysctl -n net.ipv4.ip_local_reserved_ports)
  sudo sysctl -q -w "net.ipv4.ip_local_reserved_ports=${current:+$current,}$ports"
  echo "Kept out of the ephemeral range $(ephemeral_range): $(sysctl -n net.ipv4.ip_local_reserved_ports)"
}

# The ports a failed start's output names as taken, one per line: Docker's
# "failed to bind host port 0.0.0.0:54322/tcp: address already in use", the
# older "listen tcp4 0.0.0.0:54322: bind: address already in use" and
# "Bind for 0.0.0.0:54322 failed: port is already allocated". A taken port the
# output does not name stands for every port of the config.
taken_ports() {
  local lines
  lines=$(grep -E 'address already in use|port is already allocated' "$1" || true)
  [ -n "$lines" ] || return 0
  grep -oE '([0-9]{1,3}(\.[0-9]{1,3}){3}|\[[0-9a-fA-F:]*\]):[0-9]{1,5}' <<< "$lines" \
    | sed -E 's/.*://' | sort -un | grep . || config_ports
}

# Whether any TCP socket, in any state, has the port as its own.
in_use() {
  [ -n "$(ss -Htan sport = :"$1")" ]
}

diagnose() {
  local port=$1
  echo "--- Who holds port $port, $(date -u +%T) UTC (ephemeral range $(ephemeral_range), reserved: $(sysctl -n net.ipv4.ip_local_reserved_ports)) ---"
  echo "Listening on it (sudo ss -ltnp):"
  sudo ss -ltnp sport = :"$port" || true
  echo "Every TCP socket on it, in any state (sudo ss -tanp):"
  sudo ss -tanp sport = :"$port" || true
  echo "docker-proxy processes:"
  pgrep -a docker-proxy || echo "(none)"
  echo "Containers (docker ps -a):"
  docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}' || true
  echo "Networks (docker network ls):"
  docker network ls || true
  echo "---"
}

clean_up() {
  local ids nets port pids
  pnpm exec supabase stop --no-backup || true
  ids=$({
    docker ps -aq --filter "label=com.supabase.cli.project=$project" || true
    docker ps -aq --filter "name=supabase_.*_$project" || true
  } | sort -u)
  if [ -n "$ids" ]; then
    echo "Removing leftover containers:" $ids
    docker rm -f $ids || true
  fi
  nets=$({
    docker network ls -q --filter "label=com.supabase.cli.project=$project" || true
    docker network ls -q --filter "name=supabase_network_$project" || true
  } | sort -u)
  if [ -n "$nets" ]; then
    echo "Removing leftover networks:" $nets
    docker network rm $nets || true
  fi
  for port in "$@"; do
    # A docker-proxy still publishing the port with no container behind it.
    pids=$(pgrep -f "docker-proxy .*-host-port $port( |\$)" || true)
    if [ -n "$pids" ] && [ -z "$(docker ps -q --filter "publish=$port" || true)" ]; then
      echo "Ending a docker-proxy left on port $port:" $pids
      sudo kill $pids || true
      sleep 1
      sudo kill -9 $pids 2> /dev/null || true
    fi
    # Connections already closed but held in TIME_WAIT on the port: nothing
    # uses them, so they are dropped where the kernel allows it.
    sudo ss -K -t state time-wait sport = :"$port" > /dev/null 2>&1 || true
  done
}

wait_until_free() {
  local port=$1 waited=0
  while in_use "$port"; do
    if [ "$waited" -ge "$wait_max" ]; then
      echo "Port $port is still in use after ${waited}s:"
      sudo ss -tanp sport = :"$port" || true
      return 1
    fi
    sleep 3
    waited=$((waited + 3))
  done
  echo "Port $port is free (waited ${waited}s)."
}

start() {
  local attempt log ports="" named port
  reserve
  for attempt in $(seq "$attempts"); do
    log="${RUNNER_TEMP:-/tmp}/supabase-start-$attempt.log"
    echo "supabase $* (attempt $attempt of $attempts, $(date -u +%T) UTC)"
    if pnpm exec supabase "$@" 2>&1 | tee "$log"; then
      [ "$attempt" -eq 1 ] || echo "Started on attempt $attempt of $attempts."
      return 0
    fi
    ports=$(taken_ports "$log")
    if [ -z "$ports" ]; then
      echo "::error::supabase $* failed, and not on a taken port: its output is above."
      return 1
    fi
    named=$(paste -sd, - <<< "$ports")
    for port in $ports; do diagnose "$port"; done
    [ "$attempt" -lt "$attempts" ] || break
    echo "::warning::A port the local stack needs was taken ($named) on attempt $attempt of $attempts; who held it is printed above. Cleaning up, waiting for it to be free and trying again."
    clean_up $ports
    for port in $ports; do wait_until_free "$port" || true; done
    sleep $((5 * 2 ** (attempt - 1)))
  done
  echo "::error::A port the local stack needs stayed taken ($named) through $attempts attempts of supabase $*; who held it each time is printed above (ss, docker ps -a)."
  return 1
}

if [ "${1:-}" = reserve ]; then
  reserve
elif [ "$#" -gt 0 ]; then
  start "$@"
else
  echo "Usage: $0 reserve | $0 <supabase arguments>" >&2
  exit 2
fi
