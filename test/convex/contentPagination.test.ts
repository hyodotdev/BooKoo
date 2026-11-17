import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const source = (...parts: string[]): string =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('settings content pagination', () => {
  it('keeps the Convex content list cursor-paginated and scan-bounded', () => {
    const query = source('convex', 'content', 'queries.ts');

    expect(query).toContain('paginationOpts: paginationOptsValidator');
    expect(query).toContain('.paginate({');
    expect(query).toContain('maximumRowsRead: APP_CONTENT_PAGE_SCAN_LIMIT');
    expect(query).not.toContain('.collect()');
  });

  it('loads FAQ and announcements page by page on the client', () => {
    const screen = source('src', 'features', 'release', 'screens.tsx');
    const contentScreen = screen.slice(
      screen.indexOf('export function ContentScreen('),
      screen.indexOf('export function NotificationInboxScreen('),
    );

    expect(contentScreen).toContain(
      'usePaginatedQuery(\n    api.content.queries.list',
    );
    expect(contentScreen).toContain('onEndReached={loadNextVisiblePage}');
    // Native rendering tests cover empty filtered pages, in-flight guards and
    // exhaustion. This source check only pins the query/list integration.
    expect(contentScreen).toContain('<SettingsSectionList<ContentRow>');
  });
});
