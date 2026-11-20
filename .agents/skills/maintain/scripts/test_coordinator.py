"""Behavioral tests: competing processes, separate cwd, crash and inode reuse."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('coordinator.py').resolve()


class CoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.lock = Path(self.temp.name) / 'coordinator.lock'

    def command(self, action, owner='test'):
        return [sys.executable, str(SCRIPT), action, '--owner', owner,
                '--lock-file', str(self.lock)]

    def holder(self, owner='first'):
        proc = subprocess.Popen(self.command('hold', owner), stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True)
        self.addCleanup(self.close_process, proc)
        self.assertTrue(proc.stdout.readline().startswith('ACQUIRED '))
        return proc

    @staticmethod
    def close_process(proc):
        if proc.poll() is None:
            proc.kill()
        proc.communicate(timeout=5)

    def test_competing_checkout_cannot_acquire(self):
        self.holder()
        result = subprocess.run(self.command('hold', 'second'), input='\n',
                                cwd=self.temp.name, capture_output=True,
                                text=True, timeout=5)
        self.assertEqual(result.returncode, 75)
        self.assertIn('BUSY ', result.stdout)
        self.assertIn('first', result.stdout)
        self.assertEqual(self.lock.stat().st_mode & 0o777, 0o600)

    def test_graceful_release_and_reacquire_same_inode(self):
        proc = self.holder()
        inode = self.lock.stat().st_ino
        proc.communicate(input='\n', timeout=5)
        self.assertEqual(proc.returncode, 0)
        next_proc = self.holder('next')
        self.assertIsNone(next_proc.poll())
        self.assertEqual(self.lock.stat().st_ino, inode)

    def test_crash_releases_despite_stale_metadata(self):
        proc = self.holder()
        proc.kill()
        proc.communicate(timeout=5)
        # Even a persisted PID is not evidence of a live coordinator.
        self.assertIn('first', self.lock.read_text())
        result = subprocess.run(self.command('status'), capture_output=True,
                                text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertIn('IDLE', result.stdout)
        self.holder('recovered')

    def test_status_reports_live_lock_and_eof_releases(self):
        proc = self.holder()
        result = subprocess.run(self.command('status'), capture_output=True,
                                text=True, timeout=5)
        self.assertEqual(result.returncode, 75)
        proc.communicate(timeout=5)
        self.assertEqual(proc.returncode, 0)
        result = subprocess.run(self.command('status'), capture_output=True,
                                text=True, timeout=5)
        self.assertEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
