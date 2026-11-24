#!/usr/bin/env bash
# Executor smoke test — Phase 2 Task 5 (ج19-3) + post-auto-update verification
# procedure (ج18-1).
#
# Run after ANY executor update: a Claude Code upgrade, a managed plugin
# marketplace auto-update (default on/after 30 Nov 2026 unless
# "autoUpdate": false), or an Antigravity CLI update. Exit 0 = all green,
# 1 = something failed — do not resume executor work until it is green
# (rollback rule: reinstall the previous pinned version, see §8 of
# docs/PHASE2-T5-OPS.md).
#
# What it checks (each prints PASS/FAIL):
#   1. Executor present: `agy --version` responds (Antigravity CLI, the
#      executor on this machine).
#   2. Executor daemon alive: `systemctl is-active agy-daemon` (systemd
#      service; a VM replacement wipes /etc, so a dead unit means the
#      installer in ~/workspace/antigravity-workspace/ must re-run).
#   3. Repo gate: full `npm run check` (lint + strict build + i18n + 413+
#      unit tests + live authz 78/78) — the same gate CI enforces.
#   4. Linear reachable + write-then-verify works: `linear_verify.py
#      verify 3A-709 --status "In Progress" --labels "Phase 2" --estimate`
#      (read-only check; proves the CLI + connector + re-read path).
#   5. Working tree clean: no uncommitted leftovers from the update.
#
# Usage: ./scripts/executor_smoke.sh [--skip-check]  (skip-check runs only
# the fast probes; the full gate is the default and the required one
# after an update).
set -uo pipefail

FAIL=0
say() { printf '[smoke] %s: %s\n' "$1" "$2"; }
pass() { say PASS "$1"; }
fail() { say FAIL "$1"; FAIL=1; }

SKIP_CHECK=0
[ "${1:-}" = "--skip-check" ] && SKIP_CHECK=1

# 1. Executor present (full path first: ~/.local/bin is not on every PATH)
AGY_BIN="$(command -v agy || true)"
[ -z "$AGY_BIN" ] && [ -x "$HOME/.local/bin/agy" ] && AGY_BIN="$HOME/.local/bin/agy"
if [ -n "$AGY_BIN" ] && AGY_OUT="$("$AGY_BIN" --version 2>&1)"; then pass "agy present ($AGY_OUT)"; else fail "agy --version failed"; fi

# 2. Daemon alive (systemd system service; skip gracefully if systemctl absent)
if command -v systemctl >/dev/null 2>&1; then
  if [ "$(systemctl is-active agy-daemon 2>/dev/null)" = "active" ]; then pass "agy-daemon active"; else fail "agy-daemon not active"; fi
else
  fail "systemctl not found"
fi

# 3. Full repo gate (the slow one — required after an update)
if [ "$SKIP_CHECK" = 1 ]; then
  say SKIP "npm run check (--skip-check)"
else
  if npm run check >/tmp/executor_smoke_check.log 2>&1; then pass "npm run check green"; else fail "npm run check failed (see /tmp/executor_smoke_check.log)"; fi
fi

# 4. Linear reachable + write-then-verify path works (read-only verify).
#    No --status expectation: 3A-709 will close after this task merges, and
#    the probe must stay valid afterwards; labels + estimate still prove
#    the re-read path end to end.
if python3 scripts/linear_verify.py verify 3A-709 --labels "Phase 2" --estimate >/tmp/executor_smoke_linear.log 2>&1; then
  pass "linear_verify on 3A-709 green"
else
  fail "linear_verify on 3A-709 failed (see /tmp/executor_smoke_linear.log)"
fi

# 5. Working tree clean
if [ -z "$(git status --porcelain)" ]; then pass "working tree clean"; else fail "working tree has uncommitted changes"; fi

if [ "$FAIL" = 0 ]; then echo "[smoke] ALL GREEN"; exit 0; else echo "[smoke] FAILED — do not resume executor work; roll back per docs/PHASE2-T5-OPS.md §8"; exit 1; fi
