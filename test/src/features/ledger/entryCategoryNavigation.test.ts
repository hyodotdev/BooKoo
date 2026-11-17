import {getEntryCategorySheetOptions} from '../../../../src/features/ledger/entryCategoryNavigation';

describe('entry category sheet navigation', () => {
  it('keeps the Android Save footer visible at every allowed detent', () => {
    const options = getEntryCategorySheetOptions('create', 'android');
    expect(options.sheetAllowedDetents).toEqual([0.92]);
    expect(options.sheetInitialDetentIndex).toBe(0);
    expect(options.presentation).toBe('formSheet');
  });

  it('keeps the compact, expandable Android picker', () => {
    expect(
      getEntryCategorySheetOptions('picker', 'android').sheetAllowedDetents,
    ).toEqual([0.62, 0.92]);
  });

  it.each(['picker', 'create'] as const)('preserves the iOS %s sheet', mode => {
    expect(getEntryCategorySheetOptions(mode, 'ios')).toEqual({
      headerShown: false,
      presentation: 'formSheet',
      sheetAllowedDetents: [0.62, 0.92],
      sheetGrabberVisible: true,
      sheetInitialDetentIndex: 0,
    });
  });
});
