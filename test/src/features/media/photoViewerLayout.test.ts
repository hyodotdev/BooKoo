import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source = readFileSync(
  resolve(__dirname, '../../../../src/features/media/screens.tsx'),
  'utf8',
);
const cpkPinchZoom = readFileSync(
  resolve(
    __dirname,
    '../../../../node_modules/cpk-ui/components/uis/PinchZoom/PinchZoom.js',
  ),
  'utf8',
);

describe('photo viewer Safe Area contract', () => {
  it('reserves the status bar once and keeps the controls in a 52-point row', () => {
    const viewer = source.slice(
      source.indexOf('export function PhotoViewerScreen'),
      source.indexOf('export function LedgerPhotosScreen'),
    );

    expect(viewer).toContain('statusBarBackgroundColor="#000000"');
    expect(viewer).toContain('bottomInsetColor="#000000"');
    expect(viewer).toContain('<View style={styles.photoHeader}>');
    expect(viewer).not.toContain('minHeight: insets.top + 52');
    expect(viewer).not.toContain('paddingTop: insets.top');
    expect(source).toMatch(/photoHeader:\s*\{[\s\S]*?minHeight: 52,/);
  });

  it('gives the pager horizontal swipes while the active photo is unzoomed', () => {
    const viewer = source.slice(
      source.indexOf('export function PhotoViewerScreen'),
      source.indexOf('export function LedgerPhotosScreen'),
    );

    expect(viewer).not.toContain('panEnabled=');
    expect(viewer).toContain('onInteractionStart={() =>');
    expect(viewer).toContain('scrollEnabled={pagingEnabled}');
    expect(cpkPinchZoom).toContain(
      'if (scale.get() > lowerScale + 0.001 && onInteractionStart)',
    );
  });
});
