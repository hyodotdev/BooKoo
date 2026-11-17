import {
  bootWaitsWithBrandedLoading,
  compareSemver,
  parseSemver,
  shouldRequireNativeUpdate,
} from '~/features/runtime/boot';

describe('boot and native update gate', () => {
  it('parses and compares strict semantic versions', () => {
    expect(parseSemver('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
    expect(parseSemver('01.2.3')).toBeNull();
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('1.2.3-beta.1', '1.2.3')).toBe(-1);
  });

  it('blocks only builds below the platform minimum', () => {
    const base = {
      minSupportedIosBuild: 10,
      minSupportedAndroidBuild: 20,
    };
    expect(
      shouldRequireNativeUpdate({
        ...base,
        platform: 'ios',
        nativeBuildVersion: '9',
      }),
    ).toBe(true);
    expect(
      shouldRequireNativeUpdate({
        ...base,
        platform: 'ios',
        nativeBuildVersion: '10',
      }),
    ).toBe(false);
    expect(
      shouldRequireNativeUpdate({
        ...base,
        platform: 'android',
        nativeBuildVersion: '19',
      }),
    ).toBe(true);
    expect(
      shouldRequireNativeUpdate({
        ...base,
        platform: 'android',
        nativeBuildVersion: null,
      }),
    ).toBe(false);
    for (const nativeBuildVersion of ['0', '-1', '1.5', 'not-a-build'])
      expect(
        shouldRequireNativeUpdate({
          ...base,
          platform: 'android',
          nativeBuildVersion,
        }),
      ).toBe(false);
  });

  it('holds branded loading until config settles or the wait times out', () => {
    expect(bootWaitsWithBrandedLoading(undefined, false)).toBe(true);
    expect(bootWaitsWithBrandedLoading(undefined, true)).toBe(false);
    expect(bootWaitsWithBrandedLoading({maintenanceMode: false}, false)).toBe(
      false,
    );
    expect(bootWaitsWithBrandedLoading(null, false)).toBe(false);
  });
});
