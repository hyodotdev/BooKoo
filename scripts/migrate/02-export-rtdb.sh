#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/.local/migration/rtdb"
PROJECT="${FIREBASE_PROJECT:-}"
INSTANCE="${FIREBASE_DATABASE_INSTANCE:-$PROJECT}"
SHARDED=false
WRITE=false

for arg in "$@"; do
  case "$arg" in
    --sharded) SHARDED=true ;;
    --write) WRITE=true ;;
    *) printf 'unknown argument\n' >&2; exit 2 ;;
  esac
done
if [[ -z "$PROJECT" || -z "$INSTANCE" ]]; then printf 'Firebase project and instance are required\n' >&2; exit 2; fi
if [[ "$WRITE" != true ]]; then printf 'dry-run: would export the RTDB tree into .local/migration\n'; exit 0; fi
mkdir -p "$OUT"

if [[ "$SHARDED" != true ]]; then
  if bun x firebase-tools@15.13.0 database:get /bookoo --instance "$INSTANCE" --project "$PROJECT" --export --output "$OUT/bookoo-full.json" --non-interactive; then
    bun -e 'const x=await Bun.file(process.argv[1]).json(); const k=Object.keys(x).sort(); if(JSON.stringify(k)!==JSON.stringify(["invites","ledgers","opinions","users"])) throw new Error("unexpected RTDB roots")' "$OUT/bookoo-full.json"
    chmod 600 "$OUT/bookoo-full.json"
    printf 'RTDB export completed and root inventory verified\n'
    exit 0
  fi
fi

for node in users invites opinions; do
  bun x firebase-tools@15.13.0 database:get "/bookoo/$node" --instance "$INSTANCE" --project "$PROJECT" --output "$OUT/$node.json" --non-interactive
  chmod 600 "$OUT/$node.json"
done
bun x firebase-tools@15.13.0 database:get /bookoo/ledgers --shallow --instance "$INSTANCE" --project "$PROJECT" --output "$OUT/ledger-keys.json" --non-interactive
mkdir -p "$OUT/ledgers"
bun -e 'const x=await Bun.file(process.argv[1]).json(); await Bun.write(process.argv[2],Object.keys(x).sort().join("\n")+"\n")' "$OUT/ledger-keys.json" "$OUT/ledger-keys.txt"
while IFS= read -r ledger_key; do
  [[ -z "$ledger_key" ]] && continue
  bun x firebase-tools@15.13.0 database:get "/bookoo/ledgers/$ledger_key" --instance "$INSTANCE" --project "$PROJECT" --output "$OUT/ledgers/$ledger_key.json" --non-interactive >/dev/null
  chmod 600 "$OUT/ledgers/$ledger_key.json"
done < "$OUT/ledger-keys.txt"
rm -f "$OUT/ledger-keys.json" "$OUT/ledger-keys.txt"
printf 'sharded RTDB export completed\n'
