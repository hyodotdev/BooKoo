import {requireNativeModule} from 'expo';
import {Appearance, Platform} from 'react-native';

import {setNativeColorScheme} from '~/features/runtime/nativeAppearance';

jest.mock('expo', () => ({requireNativeModule: jest.fn()}));

describe('native app appearance', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  const setColorSchemeAsync = jest.fn().mockResolvedValue(undefined);
  let appearanceSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    appearanceSpy = jest
      .spyOn(Appearance, 'setColorScheme')
      .mockImplementation(() => undefined);
    jest.mocked(requireNativeModule).mockReturnValue({setColorSchemeAsync});
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS});
    Object.defineProperty(Platform, 'Version', {value: originalVersion});
    appearanceSpy.mockRestore();
  });

  it.each(['light', 'dark', undefined] as const)(
    'synchronizes the Android package appearance for %s',
    async (preference) => {
      Object.defineProperty(Platform, 'OS', {value: 'android'});
      Object.defineProperty(Platform, 'Version', {value: 37});
      await setNativeColorScheme(preference);
      expect(appearanceSpy).toHaveBeenCalledWith(preference ?? 'unspecified');
      expect(requireNativeModule).toHaveBeenCalledWith('BookooAppearance');
      expect(setColorSchemeAsync).toHaveBeenCalledWith(
        preference ?? 'unspecified',
      );
    },
  );

  it.each([
    ['ios', '26.6'],
    ['web', 0],
    ['android', 30],
  ])('retains the existing appearance path on %s %s', async (os, version) => {
    Object.defineProperty(Platform, 'OS', {value: os});
    Object.defineProperty(Platform, 'Version', {value: version});
    await setNativeColorScheme('dark');
    expect(appearanceSpy).toHaveBeenCalledWith('dark');
    expect(requireNativeModule).not.toHaveBeenCalled();
  });

  it('reports an unavailable native bridge instead of silently passing', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    Object.defineProperty(Platform, 'Version', {value: 37});
    jest.mocked(requireNativeModule).mockImplementationOnce(() => {
      throw new Error('Native build is stale');
    });
    await expect(setNativeColorScheme('dark')).rejects.toThrow(
      'Native build is stale',
    );
  });
});
