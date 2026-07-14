#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_ENV="$ROOT_DIR/functions/.env"
SORA_CLI="$HOME/.codex/skills/sora/scripts/sora.py"

if [ ! -f "$FUNCTIONS_ENV" ]; then
  echo "Missing $FUNCTIONS_ENV" >&2
  echo "Create functions/.env with OPENAI_API_KEY before running Sora." >&2
  exit 1
fi

set -a
source "$FUNCTIONS_ENV"
set +a

dry_run="false"
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    dry_run="true"
    break
  fi
done

if [ -z "${OPENAI_API_KEY:-}" ] && [ "$dry_run" != "true" ]; then
  echo "OPENAI_API_KEY is not set in $FUNCTIONS_ENV" >&2
  exit 1
fi

if [ -d "/tmp/openai-py" ]; then
  export PYTHONPATH="/tmp/openai-py${PYTHONPATH:+:$PYTHONPATH}"
fi

exec python3 "$SORA_CLI" "$@"
