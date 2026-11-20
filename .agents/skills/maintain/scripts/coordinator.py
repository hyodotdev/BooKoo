#!/usr/bin/env python3
"""Hold one host-wide BooKoo coordinator lock; stdin controls its lifetime.

The file must never be unlinked: locks attach to inodes. Kernel ownership,
not persisted metadata, decides whether the coordinator is busy.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone


LOCK_PATH = Path.home() / '.local/state/bookoo-maintain/coordinator.lock'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('hold', 'status'))
    parser.add_argument('--owner', default='manual')
    # Tests use their own inode; production callers always use the default.
    parser.add_argument('--lock-file', type=Path, default=LOCK_PATH,
                        help=argparse.SUPPRESS)
    args = parser.parse_args()
    args.lock_file.parent.mkdir(parents=True, exist_ok=True)
    with args.lock_file.open('a+', encoding='utf-8') as lock:
        os.chmod(args.lock_file, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            # The writer can be between truncate and flush: metadata is advisory.
            lock.seek(0)
            print('BUSY ' + (lock.read(4096).strip() or 'owner metadata pending'),
                  flush=True)
            return 75
        if args.action == 'status':
            print('IDLE (no live kernel lock)', flush=True)
            return 0
        owner = {'repository': 'hyodotdev/BooKoo', 'owner': args.owner,
                 'pid': os.getpid(),
                 'startedAt': datetime.now(timezone.utc).isoformat()}
        lock.seek(0)
        lock.truncate()
        json.dump(owner, lock)
        lock.flush()
        print('ACQUIRED ' + json.dumps(owner), flush=True)
        # No daemon or recursive Codex process. EOF/newline closes the lock.
        sys.stdin.readline()
        print('RELEASED', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
