import fs from 'node:fs';
import path from 'node:path';

describe('entry location picker navigation', () => {
  const source = fs.readFileSync(
    path.join(
      process.cwd(),
      'src/features/ledger/screens/entryLocationPickerImpl.tsx',
    ),
    'utf8',
  );

  it('returns directly to the editor after storing the selected place', () => {
    expect(source).toContain('selectPlace({ledgerId, place});');
    expect(source).toContain('if (onClose !== undefined)');
    expect(source).toContain('selectPlace({ledgerId, place});');
    expect(source).toContain('close();');
    expect(source).not.toContain('InteractionManager.runAfterInteractions');
  });

  it('keeps the editor and location picker in the same ledger stack', () => {
    const editor = fs.readFileSync(
      path.join(process.cwd(), 'src/features/ledger/screens/entryEditor.tsx'),
      'utf8',
    );
    const layout = fs.readFileSync(
      path.join(process.cwd(), 'app/(app)/ledger/[ledgerId]/_layout.tsx'),
      'utf8',
    );

    expect(editor).toContain('setLocationPickerVisible(true);');
    expect(editor).toContain('<EntryLocationPickerScreen');
    expect(editor).not.toContain(
      "pathname: '/ledger/[ledgerId]/item/location'",
    );
    expect(layout).toMatch(
      /<Stack\.Screen\s+(?:dangerouslySingular\s+)?name="item\/location"/,
    );
  });

  it('never mounts Android Google Maps without its native API key', () => {
    expect(source).toContain(
      'Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY)',
    );
    expect(source).toContain('canRenderMap ? (');
    expect(source).toContain('testID="entry-location-map-unavailable"');
    expect(source).toContain('!canRenderMap ||');
    expect(
      source.match(/LoadingIndicator color=\{activeAccent\.text\}/g),
    ).toHaveLength(2);
  });

  it('keeps Android hardware back inside the entry editor', () => {
    expect(source).toContain('BackHandler.addEventListener(');
    expect(source).toContain("'hardwareBackPress'");
    expect(source).toContain('onClose();');
    expect(source).toContain('return true;');
    expect(source).toContain('subscription.remove()');
  });
});
