/** @jest-environment node */
import {createRequire} from 'node:module';
import type {AndroidConfig} from '@expo/config-plugins';

const loadPlugin = createRequire(__filename);

const {
  optimizeReleaseRules,
  resourceKeepXml,
}: {
  optimizeReleaseRules: (text: string) => string;
  resourceKeepXml: string;
} = loadPlugin('../../plugins/withAndroidReleaseOptimizations');
const {
  configureResizableActivities,
}: {
  configureResizableActivities: (
    manifest: AndroidConfig.Manifest.AndroidManifest,
  ) => AndroidConfig.Manifest.AndroidManifest;
} = loadPlugin('../../plugins/withAndroidResizableActivities');

describe('Android release optimization', () => {
  it('preserves only Kakao resources looked up dynamically at native startup', () => {
    // res/values/strings.xml defines kakao_app_key and nothing else that native
    // code resolves by getIdentifier. Keeping a name this project never defines
    // would pin an invariant that can never fail.
    expect(resourceKeepXml).toContain('tools:keep="@string/kakao_app_key"');
    expect(resourceKeepXml).not.toContain('@string/*');
  });
  it.each(['"', "'"])(
    'replaces the no-optimization default using %s quotes',
    (quote) => {
      const rules = `proguardFiles getDefaultProguardFile(${quote}proguard-android.txt${quote}), "proguard-rules.pro"`;
      expect(optimizeReleaseRules(rules)).toBe(
        'proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"',
      );
    },
  );

  it('is idempotent and fails loudly on an unknown Expo template', () => {
    const rules =
      'proguardFiles getDefaultProguardFile("proguard-android-optimize.txt")';
    expect(optimizeReleaseRules(rules)).toBe(rules);
    expect(() => optimizeReleaseRules('android {}')).toThrow(
      'template changed',
    );
  });
});

describe('Android resizable activities', () => {
  const customTab =
    'com.navercorp.nid.oauth.activity.NidOAuthCustomTabActivity';
  const fixture = (): AndroidConfig.Manifest.AndroidManifest => ({
    manifest: {
      $: {'xmlns:android': 'http://schemas.android.com/apk/res/android'},
      queries: [],
      application: [
        {
          $: {'android:name': '.MainApplication'},
          activity: [
            {
              $: {
                'android:name': '.MainActivity',
                'android:screenOrientation': 'unspecified',
              },
            },
            {
              $: {
                'android:name': customTab,
                'android:screenOrientation': 'behind',
                'android:exported': 'false',
                'tools:remove': 'android:maxAspectRatio',
              },
            },
            {$: {'android:name': '.NaverCallback', 'android:exported': 'true'}},
          ],
        },
      ],
    },
  });

  it('removes only the inherited custom-tab lock and preserves callback/security attributes', () => {
    const manifest = configureResizableActivities(fixture());
    const application = manifest.manifest.application?.[0];
    expect(application?.$['android:resizeableActivity']).toBe('true');
    const activities = application?.activity ?? [];
    expect(activities[0].$['android:resizeableActivity']).toBe('true');
    expect(activities[1].$['android:screenOrientation']).toBeUndefined();
    expect(activities[1].$['android:exported']).toBe('false');
    expect(activities[1].$['tools:remove']).toBe(
      'android:maxAspectRatio,android:screenOrientation',
    );
    expect(activities[2].$).toEqual({
      'android:name': '.NaverCallback',
      'android:exported': 'true',
    });
    expect(configureResizableActivities(manifest)).toEqual(manifest);
    expect(activities).toHaveLength(3);
  });

  it('tolerates a manifest root xml2js parsed without an attribute bag', () => {
    const manifest = fixture();
    // xml2js omits `$` for an element declared with no attributes at all.
    delete (manifest.manifest as {$?: unknown}).$;
    expect(() => configureResizableActivities(manifest)).not.toThrow();
    expect(manifest.manifest.$?.['xmlns:tools']).toBe(
      'http://schemas.android.com/tools',
    );
    expect(
      manifest.manifest.application?.[0]?.$['android:resizeableActivity'],
    ).toBe('true');
  });

  it('adds an idempotent manifest-merger removal for an AAR-only activity', () => {
    const manifest = fixture();
    const application = manifest.manifest.application?.[0];
    if (!application) throw new Error('Missing fixture application');
    application.activity = application.activity?.filter(
      (item) => item.$['android:name'] !== customTab,
    );
    configureResizableActivities(manifest);
    configureResizableActivities(manifest);
    const overrides = application.activity?.filter(
      (item) => item.$['android:name'] === customTab,
    );
    expect(overrides).toHaveLength(1);
    expect(overrides?.[0].$).toEqual({
      'android:name': customTab,
      'tools:remove': 'android:screenOrientation',
    });
  });
});
