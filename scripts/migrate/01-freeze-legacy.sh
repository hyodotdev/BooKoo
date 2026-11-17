#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL="$ROOT/.local/migration"
PROJECT="${FIREBASE_PROJECT:-}"
RUN="${RUN_ID:-}"
MODE="freeze"
WRITE=false
CONFIRM=""

for arg in "$@"; do
  case "$arg" in
    --thaw) MODE="thaw" ;;
    --write) WRITE=true ;;
    --confirm-freeze|--confirm-thaw) CONFIRM="$arg" ;;
    *) printf 'unknown argument\n' >&2; exit 2 ;;
  esac
done

if [[ -z "$PROJECT" ]]; then printf 'FIREBASE_PROJECT is required\n' >&2; exit 2; fi
if [[ "$MODE" == "freeze" && -z "$RUN" ]]; then printf 'RUN_ID is required\n' >&2; exit 2; fi

if [[ "$WRITE" != true ]]; then
  printf 'dry-run: would %s Firebase database and storage writes\n' "$MODE"
  exit 0
fi
if [[ "$MODE" == "freeze" && "$CONFIRM" != "--confirm-freeze" ]]; then
  printf -- '--write requires --confirm-freeze\n' >&2
  exit 2
fi
if [[ "$MODE" == "thaw" && "$CONFIRM" != "--confirm-thaw" ]]; then
  printf -- '--write requires --confirm-thaw\n' >&2
  exit 2
fi

if [[ "$MODE" == "thaw" ]]; then
  (
    cd "$ROOT/BooKooLegacy"
    bun x firebase-tools@15.13.0 deploy --only database,storage --project "$PROJECT" --non-interactive
  )
  printf 'legacy Firebase write rules restored\n'
  exit 0
fi

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/bookoo-freeze.XXXXXX")"
trap 'rm -rf "$SCRATCH"' EXIT
printf '%s\n' '{"database":{"rules":"database.rules.json"},"storage":{"rules":"storage.rules"}}' > "$SCRATCH/firebase.json"
printf '%s\n' '{"rules":{".read":"auth != null",".write":false}}' > "$SCRATCH/database.rules.json"
printf '%s\n' 'rules_version = "2";' 'service firebase.storage {' '  match /b/{bucket}/o {' '    match /{allPaths=**} {' '      allow read: if request.auth != null;' '      allow write: if false;' '    }' '  }' '}' > "$SCRATCH/storage.rules"
bun x firebase-tools@15.13.0 deploy --config "$SCRATCH/firebase.json" --only database,storage --project "$PROJECT" --non-interactive
mkdir -p "$LOCAL"
FROZEN_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FROZEN_AT="$FROZEN_AT" RUN_ID="$RUN" FIREBASE_PROJECT="$PROJECT" bun -e 'await Bun.write(process.argv[1], JSON.stringify({frozenAt:process.env.FROZEN_AT,runId:process.env.RUN_ID,project:process.env.FIREBASE_PROJECT},null,2)+"\n")' "$LOCAL/MANIFEST.json"
chmod 600 "$LOCAL/MANIFEST.json"
printf 'legacy Firebase writes frozen; manifest recorded locally\n'
