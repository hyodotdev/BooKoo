import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source = readFileSync(
  resolve(__dirname, '../../../../src/features/auth/ui.tsx'),
  'utf8',
);

describe('auth async button native-tree contract', () => {
  test('keeps the loader mounted instead of toggling cpk-ui Button children', () => {
    expect(source).toContain('function StableButtonLoadingFrame');
    expect(source).toContain('animating={loading}');
    expect(source).toContain('opacity: loading ? 1 : 0');
    expect(source).toContain(
      '{backgroundColor, borderRadius, opacity: loading ? 1 : 0}',
    );
    expect(source).toContain('collapsable={false}');
    expect(source).toContain('borderRadius={borderRadius}');
    const cpkButtons = source.match(/<Button\b[\s\S]*?\/>/g) ?? [];
    expect(cpkButtons.length).toBeGreaterThan(0);
    expect(cpkButtons.every((button) => !button.includes('loading='))).toBe(
      true,
    );
  });
});
