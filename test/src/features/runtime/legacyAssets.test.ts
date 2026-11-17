import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const EXPECTED_TRACKED_ASSET_DIGEST =
  '56f8de3458c656ff2855b258001f3409e73453158b8e91014e6546a9b06b3548';

const scaleNames = (base: string): readonly string[] => [
  `${base}.png`,
  `${base}@2x.png`,
  `${base}@3x.png`,
];

describe('Legacy visual assets', () => {
  it('keeps the tracked PNG set stable without requiring the ignored source', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ...scaleNames('logo').map(
        (name) =>
          [`assets/brand/${name}`, `BooKooLegacy/assets/imgs/${name}`] as const,
      ),
      ...[1, 2, 3].flatMap((number) =>
        scaleNames(`tutorial${number}`).map(
          (name) =>
            [
              `assets/tutorial/${name}`,
              `BooKooLegacy/assets/imgs/${name}`,
            ] as const,
        ),
      ),
      ...[1, 2, 3, 4].flatMap((number) =>
        ['n', 's'].flatMap((state) =>
          scaleNames(`ic_tab${number}_${state}`).map(
            (name) =>
              [
                `assets/tabs/${name}`,
                `BooKooLegacy/assets/icons/${name}`,
              ] as const,
          ),
        ),
      ),
      ...['red', 'orange', 'yellow', 'green', 'blue', 'purple'].flatMap(
        (color) =>
          scaleNames(`ic_${color}`).map(
            (name) =>
              [
                `assets/ledgers/${name}`,
                `BooKooLegacy/assets/icons/${name}`,
              ] as const,
          ),
      ),
      ...scaleNames('icNoLedger').map(
        (name) =>
          [`assets/empty/${name}`, `BooKooLegacy/assets/imgs/${name}`] as const,
      ),
      ...scaleNames('btnMenu').map(
        (name) =>
          [
            `assets/navigation/${name}`,
            `BooKooLegacy/assets/icons/${name}`,
          ] as const,
      ),
      ...scaleNames('close').map(
        (name) =>
          [
            `assets/navigation/${name}`,
            `BooKooLegacy/assets/icons/${name}`,
          ] as const,
      ),
      ...scaleNames('mask').map(
        (name) =>
          [
            `assets/profile/${name}`,
            `BooKooLegacy/assets/imgs/${name}`,
          ] as const,
      ),
    ];

    const digest = createHash('sha256');
    for (const copy of pairs.map(([copy]) => copy).toSorted()) {
      const bytes = readFileSync(join(root, copy));
      expect(bytes.byteLength).toBeGreaterThan(0);
      digest.update(copy);
      digest.update('\0');
      digest.update(bytes);
    }
    expect(digest.digest('hex')).toBe(EXPECTED_TRACKED_ASSET_DIGEST);

    for (const [copy, source] of pairs) {
      const sourcePath = join(root, source);
      if (existsSync(sourcePath))
        expect(readFileSync(join(root, copy))).toEqual(
          readFileSync(sourcePath),
        );
    }
  });
});
