#!/usr/bin/env bash
# Start/stop/restart/check the Vite dev server as a tracked background
# process, so you don't end up with several stale `npm run dev` processes
# serving old code from before a fix (the state that caused a "Loading…"
# hang here: an old dev server kept answering requests with a bundle from
# before the fix, and HMR silently never caught up).
#
# Usage:
#   scripts/dev-server.sh start   [port]   # default port: 5173
#   scripts/dev-server.sh stop    [port]
#   scripts/dev-server.sh restart [port]
#   scripts/dev-server.sh status  [port]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
DEFAULT_PORT=5173
PORT="${2:-$DEFAULT_PORT}"
PID_FILE="$RUN_DIR/dev-server.$PORT.pid"
URL_FILE="$RUN_DIR/dev-server.$PORT.url"
LOG_FILE="$RUN_DIR/dev-server.$PORT.log"

mkdir -p "$RUN_DIR"

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

listening_pids() {
  lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

kill_port() {
  local pids
  pids="$(listening_pids)"
  if [[ -n "$pids" ]]; then
    echo "Killing existing process(es) listening on port $PORT: $pids"
    kill -9 $pids 2>/dev/null || true
  fi

  # Wait for the OS to actually release the port. Without this, Vite can
  # find the port still bound (killed process not reaped yet) and silently
  # fall back to the *next* port instead of the one we asked for/tracked.
  for _ in $(seq 1 20); do
    [[ -z "$(listening_pids)" ]] && return 0
    sleep 0.2
  done
  echo "Warning: port $PORT still appears in use after waiting; start may land on a different port." >&2
}

start() {
  if is_running; then
    echo "Dev server already running (pid $(cat "$PID_FILE")) at $(cat "$URL_FILE" 2>/dev/null || echo "http://localhost:$PORT/")"
    echo "Use 'restart' if you want to pick up newer code/config."
    exit 0
  fi

  # Belt-and-suspenders: clear anything already bound to the port (e.g. an
  # orphaned/stale dev server from a previous session) so 'start' always
  # gets a fresh process serving current source, never a silent stale one.
  kill_port

  echo "Starting dev server on port $PORT..."
  cd "$ROOT_DIR"
  nohup npm run dev -- --port "$PORT" > "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  for _ in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Dev server exited unexpectedly. Last log lines:"
      tail -n 20 "$LOG_FILE"
      rm -f "$PID_FILE"
      exit 1
    fi
    local url
    url="$(grep "Local:" "$LOG_FILE" 2>/dev/null | grep -Eo 'http://[^[:space:]]+' | head -n1 || true)"
    if [[ -n "$url" ]]; then
      echo "$url" > "$URL_FILE"
      if [[ "$url" != *":$PORT/"* ]]; then
        echo "Warning: requested port $PORT was unavailable; Vite is actually running at $url" >&2
      else
        echo "Dev server ready: $url"
      fi
      echo "Logs: $LOG_FILE"
      exit 0
    fi
    sleep 0.5
  done

  echo "Dev server started (pid $pid) but did not confirm readiness in time; check $LOG_FILE"
}

stop() {
  local stopped=0
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping dev server (pid $pid)..."
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
      done
      kill -9 "$pid" 2>/dev/null || true
      stopped=1
    fi
    rm -f "$PID_FILE" "$URL_FILE"
  fi

  # Also sweep the port directly: catches orphaned children (vite runs as
  # a child of the `npm run dev` process we spawned) and any untracked
  # dev server a previous session left running on this port.
  local remaining
  remaining="$(listening_pids)"
  if [[ -n "$remaining" ]]; then
    kill_port
    stopped=1
  fi

  if [[ "$stopped" -eq 1 ]]; then
    echo "Dev server stopped."
  else
    echo "No dev server was running on port $PORT."
  fi
}

status() {
  if is_running; then
    echo "Tracked dev server running (pid $(cat "$PID_FILE")) at $(cat "$URL_FILE" 2>/dev/null || echo "http://localhost:$PORT/")"
  else
    echo "No tracked dev server running on port $PORT."
  fi

  local pids
  pids="$(listening_pids)"
  if [[ -n "$pids" ]]; then
    local tracked_pid=""
    [[ -f "$PID_FILE" ]] && tracked_pid="$(cat "$PID_FILE")"
    for p in $pids; do
      # `npm run dev` execs a `vite` child with its own pid, so the
      # process actually bound to the port is usually a *descendant* of
      # the pid we tracked, not the tracked pid itself. Walk up parents
      # before calling something "untracked".
      local is_descendant=0
      local walk="$p"
      for _ in 1 2 3 4 5; do
        [[ -z "$walk" || "$walk" == "1" ]] && break
        if [[ "$walk" == "$tracked_pid" ]]; then
          is_descendant=1
          break
        fi
        walk="$(ps -o ppid= -p "$walk" 2>/dev/null | tr -d ' ')"
      done
      if [[ "$is_descendant" -eq 0 ]]; then
        echo "Warning: untracked process $p is also listening on port $PORT (started outside this script)."
      fi
    done
  fi
}

restart() {
  stop
  start
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status} [port]  (default port: $DEFAULT_PORT)"
    exit 1
    ;;
esac
