#!/usr/bin/env bash
# Register a Claude Code MCP server from stdin JSON — Phase 2 Task 5 (ج14-4).
#
# Why: `claude mcp add <name> --env KEY=VALUE ...` puts tokens on the command
# line (visible in `ps`, shell history, process logs). Since Claude Code
# 2.1.327 the supported form is `claude mcp add-json <name> -`, which reads
# the server definition (command/args/env) from stdin, so no secret ever
# appears in argv.
#
# Usage:
#   cat server.json | ./scripts/mcp_register_stdin.sh <name>
#   printf '%s' '{"command":"npx","args":["-y","@scope/server"],"env":{"TOKEN":"..."}}' \
#     | ./scripts/mcp_register_stdin.sh my-server
#
# Notes:
# - The JSON is validated before anything is invoked; invalid JSON exits 1
#   and `claude` is never called.
# - Nothing is echoed: the definition (which may contain secrets) is piped,
#   never printed, never logged.
# - `claude mcp add-json` is NOT available inside a Claude Code session
#   (run it from a plain shell).
# - Claude Code is not installed on this machine (no `claude` binary, no
#   ~/.claude); the live registration runs on a machine where it is.
#   This repo's own MCP servers (linear, notion) are remote `serverUrl`
#   entries in ~/.gemini/config/mcp_config.json — no tokens in argv there.
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: $0 <server-name> < server.json" >&2
  exit 2
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "mcp_register_stdin: 'claude' CLI not found (needs Claude Code >= 2.1.327)" >&2
  exit 3
fi

JSON="$(cat)"
if [ -z "$JSON" ]; then
  echo "mcp_register_stdin: empty stdin — expected a JSON server definition" >&2
  exit 2
fi
# Validate JSON without printing it.
printf '%s' "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d,dict), 'definition must be a JSON object'" 2>/dev/null \
  || { echo "mcp_register_stdin: invalid JSON on stdin" >&2; exit 2; }

printf '%s' "$JSON" | claude mcp add-json "$NAME" -
