#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/.local/migration/auth"
REPORTS="$ROOT/.local/migration/reports"
PROJECT="${FIREBASE_PROJECT:-}"
WRITE=false
for arg in "$@"; do
  case "$arg" in
    --write) WRITE=true ;;
    *) printf 'unknown argument\n' >&2; exit 2 ;;
  esac
done
if [[ -z "$PROJECT" ]]; then printf 'FIREBASE_PROJECT is required\n' >&2; exit 2; fi
if [[ "$WRITE" != true ]]; then printf 'dry-run: would export Auth and immediately destroy password material\n'; exit 0; fi
mkdir -p "$OUT" "$REPORTS"
UNSAFE="$OUT/auth-users.unsafe.json"
SAFE="$OUT/auth-users.safe.json"
cleanup_unsafe() {
  [[ -f "$UNSAFE" ]] || return 0
  if command -v shred >/dev/null 2>&1; then
    shred -u "$UNSAFE"
  else
    rm -P "$UNSAFE" 2>/dev/null || rm -f "$UNSAFE"
  fi
}
trap cleanup_unsafe EXIT
bun x firebase-tools@15.13.0 auth:export "$UNSAFE" --format=json --project "$PROJECT" --non-interactive
bun -e 'const p=process.argv[1],o=process.argv[2]; const x=await Bun.file(p).json(); for(const u of x.users??[]){delete u.passwordHash;delete u.salt} await Bun.write(o,JSON.stringify(x)+"\n")' "$UNSAFE" "$SAFE"
chmod 600 "$SAFE"
cleanup_unsafe
trap - EXIT
bun -e 'const x=await Bun.file(process.argv[1]).json(); const u=x.users??[]; const providers=v=>(v.providerUserInfo??[]).map(p=>p.providerId).sort(); const report={total:u.length,noEmail:u.filter(v=>!v.email).length,facebookAny:u.filter(v=>providers(v).includes("facebook.com")).length,facebookOnly:u.filter(v=>JSON.stringify(providers(v))==="[\"facebook.com\"]"&&!v.email).length,disabled:u.filter(v=>v.disabled===true).length}; await Bun.write(process.argv[2],JSON.stringify(report,null,2)+"\n")' "$SAFE" "$REPORTS/auth-triage.json"
printf 'Auth safe export completed; credential hashes destroyed\n'
