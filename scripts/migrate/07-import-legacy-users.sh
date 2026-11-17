#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FILE="$ROOT/.local/migration/convex/legacyUsers.jsonl"
WRITE=false
TARGET=""
DEPLOYMENT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write) WRITE=true; shift ;;
    --dev) TARGET="dev"; shift ;;
    --prod) TARGET="prod"; shift ;;
    --deployment) TARGET="deployment"; DEPLOYMENT="${2:-}"; shift 2 ;;
    *) printf 'unknown argument\n' >&2; exit 2 ;;
  esac
done
if [[ ! -f "$FILE" ]]; then printf 'normalized legacyUsers file is missing\n' >&2; exit 2; fi
COUNT="$(bun -e 'const t=await Bun.file(process.argv[1]).text();const l=t.split(/\r?\n/).filter(Boolean);for(const x of l)JSON.parse(x);process.stdout.write(String(l.length))' "$FILE")"
if [[ "$WRITE" != true ]]; then printf 'dry-run legacyUsers: %s rows parseable\n' "$COUNT"; exit 0; fi
if [[ -z "$TARGET" ]]; then printf -- '--write requires --dev, --prod, or --deployment\n' >&2; exit 2; fi
if [[ "$TARGET" == "deployment" && -z "$DEPLOYMENT" ]]; then printf 'deployment selector is required\n' >&2; exit 2; fi
ARGS=(import --table legacyUsers "$FILE" --replace --yes)
if [[ "$TARGET" == "prod" ]]; then ARGS+=(--prod); fi
if [[ "$TARGET" == "deployment" ]]; then ARGS+=(--deployment "$DEPLOYMENT"); fi
bun x convex "${ARGS[@]}"
printf 'legacyUsers import completed: %s rows\n' "$COUNT"
