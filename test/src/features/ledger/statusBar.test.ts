import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {statusBarStyleForTheme} from '~/features/ledger/ui';

const themedScreenSources = [
  'src/components/uis/BookooRecoveryScreen.tsx',
  'src/features/runtime/routeLoading.tsx',
  'src/features/ledger/ledgerForm.tsx',
  'src/features/ledger/screens/calendar.tsx',
  'src/features/ledger/screens/timeline.tsx',
  'src/features/ledger/screens/stats.tsx',
  'src/features/ledger/screens/ledgerAdmin.tsx',
].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'));

describe('themed status bar contrast', () => {
  it('uses dark items throughout light mode', () => {
    expect(statusBarStyleForTheme('light')).toBe('dark-content');
    expect(statusBarStyleForTheme('unspecified')).toBe('dark-content');
  });

  it('uses light items throughout dark mode', () => {
    expect(statusBarStyleForTheme('dark')).toBe('light-content');
  });

  it('keeps theme-derived screens on the shared contrast policy', () => {
    for (const source of themedScreenSources) {
      expect(source).toContain('statusBarStyleForTheme');
      expect(source).not.toContain('statusBarStyle="light-content"');
    }
  });
});
