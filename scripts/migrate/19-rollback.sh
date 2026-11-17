#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUPS="$ROOT/.local/migration/backups"
MODE="${1:-}"
shift || true
WRITE=false
CONFIRM=""
PROD=false
DEPLOYMENT=""
SNAPSHOT_RESTORED=false
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write) WRITE=true; shift ;;
    --prod) PROD=true; shift ;;
    --deployment) DEPLOYMENT="${2:-}"; shift 2 ;;
    --confirm-snapshot|--confirm-restore|--confirm-delete-receipts|--confirm-thaw) CONFIRM="$1"; shift ;;
    --snapshot-restored) SNAPSHOT_RESTORED=true; shift ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [[ "$WRITE" != true ]]; then
  printf 'dry-run rollback: would execute %s after explicit confirmation\n' "${MODE:-nothing}"
  exit 0
fi
TARGET=()
if [[ "$PROD" == true && -n "$DEPLOYMENT" ]]; then
  printf -- '--prod and --deployment are mutually exclusive\n' >&2
  exit 2
fi
if [[ "$PROD" == true ]]; then TARGET+=(--prod); fi
if [[ -n "$DEPLOYMENT" ]]; then TARGET+=(--deployment "$DEPLOYMENT"); fi

case "$MODE" in
  snapshot)
    [[ "$CONFIRM" == "--confirm-snapshot" ]] || { printf 'snapshot confirmation is required\n' >&2; exit 2; }
    LABEL="${POSITIONAL[0]:-}"
    [[ "$LABEL" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'invalid snapshot label\n' >&2; exit 2; }
    mkdir -p "$BACKUPS"
    STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
    bun x convex export --include-file-storage --path "$BACKUPS/$LABEL-$STAMP.zip" "${TARGET[@]}"
    chmod 600 "$BACKUPS/$LABEL-$STAMP.zip"
    printf 'Convex snapshot completed\n'
    ;;
  restore)
    [[ "$CONFIRM" == "--confirm-restore" ]] || { printf 'restore confirmation is required\n' >&2; exit 2; }
    ARCHIVE="${POSITIONAL[0]:-}"
    [[ -n "$ARCHIVE" ]] || { printf 'snapshot path is required\n' >&2; exit 2; }
    RESOLVED="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
    case "$RESOLVED" in "$BACKUPS"/*) ;; *) printf 'restore path must be under .local/migration/backups\n' >&2; exit 2 ;; esac
    [[ -f "$RESOLVED" ]] || { printf 'snapshot does not exist\n' >&2; exit 2; }
    bun x convex import "$RESOLVED" --replace-all --yes "${TARGET[@]}"
    printf 'Convex snapshot restored\n'
    ;;
  delete-run)
    [[ "$CONFIRM" == "--confirm-delete-receipts" && "$SNAPSHOT_RESTORED" == true ]] || { printf 'receipt cleanup requires confirmed snapshot restoration\n' >&2; exit 2; }
    RUN="${POSITIONAL[0]:-}"
    [[ "$RUN" =~ ^[A-Za-z0-9:._-]+$ ]] || { printf 'invalid run id\n' >&2; exit 2; }
    RUN_ID_TO_CLEAR="$RUN" bun -e 'import {ConvexHttpClient} from "convex/browser";import {makeFunctionReference} from "convex/server";const url=process.env.CONVEX_URL,secret=process.env.MIGRATION_SECRET,runId=process.env.RUN_ID_TO_CLEAR;if(!url||!secret||!runId)throw new Error("migration credentials are required");const c=new ConvexHttpClient(url);if(process.env.CONVEX_DEPLOY_KEY)c.setAdminAuth(process.env.CONVEX_DEPLOY_KEY);const f=makeFunctionReference("migrate/rollback:deleteRun");let done=false,total=0;while(!done){const r=await c.mutation(f,{secret,runId,snapshotRestored:true});total+=r.deleted;done=r.done}process.stdout.write(`cleared ${total} restored-run receipts\n`);'
    ;;
  thaw-firebase)
    [[ "$CONFIRM" == "--confirm-thaw" ]] || { printf 'thaw confirmation is required\n' >&2; exit 2; }
    "$ROOT/scripts/migrate/01-freeze-legacy.sh" --thaw --write --confirm-thaw
    ;;
  *)
    printf 'mode must be snapshot, restore, delete-run, or thaw-firebase\n' >&2
    exit 2
    ;;
esac
