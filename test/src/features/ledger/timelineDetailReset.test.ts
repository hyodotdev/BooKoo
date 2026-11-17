import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * On a tablet the timeline keeps the detail pane mounted beside the list and
 * swaps `itemId` when the user picks a different entry. `LedgerItemDetailScreen`
 * holds the comment draft, the pending attachments and the comment request id
 * in component-local `useState`/`useRef`, none of which is derived from
 * `itemId` — so without a key React reuses the instance and a draft typed
 * against one entry is sent to the next.
 *
 * Resetting from inside the component is not available here: this repo's lint
 * rules forbid both a synchronous `setState` in an effect body and reading a
 * ref during render, which are the two shapes that pattern takes. Keying the
 * mount is React's own answer and the one the codebase can express, so this
 * asserts the key is present rather than re-testing React's reconciliation.
 */

const source = readFileSync(
  join(__dirname, '../../../../src/features/ledger/screens/timeline.tsx'),
  'utf8',
);

describe('the tablet timeline detail pane', () => {
  it('remounts the detail screen for each selected entry', () => {
    const mount = source.match(
      /<LedgerItemDetailScreen[\s\S]*?\/>/,
    )?.[0];
    expect(mount).toBeDefined();
    expect(mount).toContain('key={selected.id}');
    expect(mount).toContain('itemId={selected.id}');
  });

  it('is the only place the detail screen is embedded', () => {
    // A second unkeyed embed would reintroduce the same leak.
    expect(source.match(/<LedgerItemDetailScreen/g)).toHaveLength(1);
  });
});
