let mockNativeVersion: string | null = '1.1.0';
let mockManifestVersion: string | undefined = '1.1.1';
let mockExecutionEnvironment = 'standalone';

jest.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mockNativeVersion;
  },
}));
jest.mock('expo-constants', () => ({
  ExecutionEnvironment: {StoreClient: 'storeClient'},
  get executionEnvironment() {
    return mockExecutionEnvironment;
  },
  get expoConfig() {
    return {version: mockManifestVersion};
  },
}));

function installedVersion(): string {
  let version = '';
  jest.isolateModules(() => {
    version = jest.requireActual<typeof import('../config')>('../config').appVersion;
  });
  return version;
}

describe('installed app version', () => {
  beforeEach(() => {
    mockNativeVersion = '1.1.0';
    mockManifestVersion = '1.1.1';
    mockExecutionEnvironment = 'standalone';
  });
  it('reports a 1.1.0 binary accurately after a compatible 1.1.1 OTA', () => {
    mockNativeVersion = '1.1.0';
    mockManifestVersion = '1.1.1';
    expect(installedVersion()).toBe('1.1.0');
  });

  it('reports the new binary version when 1.1.1 is installed', () => {
    mockNativeVersion = '1.1.1';
    expect(installedVersion()).toBe('1.1.1');
  });

  it('uses the manifest version on web without a native version', () => {
    mockNativeVersion = null;
    mockManifestVersion = '1.1.1';
    expect(installedVersion()).toBe('1.1.1');
  });

  it('reports the project version rather than the Expo Go host version', () => {
    mockNativeVersion = '57.0.0';
    mockExecutionEnvironment = 'storeClient';
    expect(installedVersion()).toBe('1.1.1');
  });

  it('keeps the existing unknown-version fallback', () => {
    mockNativeVersion = null;
    mockManifestVersion = undefined;
    expect(installedVersion()).toBe('0.0.0');
  });
});
