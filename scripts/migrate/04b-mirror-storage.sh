#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUCKET="${FIREBASE_STORAGE_BUCKET:-}"
WRITE=false
for arg in "$@"; do
  case "$arg" in
    --write) WRITE=true ;;
    *) printf 'unknown argument\n' >&2; exit 2 ;;
  esac
done
if [[ -z "$BUCKET" ]]; then printf 'FIREBASE_STORAGE_BUCKET is required\n' >&2; exit 2; fi
if [[ "$WRITE" != true ]]; then printf 'dry-run: would mirror Storage into .local/migration\n'; exit 0; fi
mkdir -p "$ROOT/.local/migration/storage/blobs"
mkdir -p "$ROOT/.local/migration/reports"
LOG="$ROOT/.local/migration/reports/storage-mirror.log"
if ! gcloud storage rsync --recursive "gs://$BUCKET" "$ROOT/.local/migration/storage/blobs" >"$LOG" 2>&1; then
  printf 'Storage mirror failed; inspect the private local report\n' >&2
  exit 1
fi
chmod 600 "$LOG"
chmod -R go-rwx "$ROOT/.local/migration/storage/blobs"
printf 'Storage mirror completed\n'
