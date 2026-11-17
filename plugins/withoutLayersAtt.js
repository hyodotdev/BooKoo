const {withInfoPlist} = require('@expo/config-plugins');

/**
 * Drop the App Tracking Transparency key `@layers/expo` writes unconditionally.
 *
 * The Layers config plugin sets `NSUserTrackingUsageDescription` on every
 * prebuild with no option to suppress it — see its `withInfoPlist` mod, which
 * assigns `ios.attUsageDescription ?? "This app uses data for personalized ads
 * and to measure ad performance."` before reading any other flag.
 *
 * BooKoo does not track. `expo-tracking-transparency` is not installed, the
 * provider mounts with `requestTracking={false}`, no IDFA is ever read, and
 * SKAdNetwork is switched off in the plugin options. Shipping a tracking usage
 * string anyway would put a permission BooKoo never requests in front of App
 * Review and make App Store Connect's App Privacy answers wrong.
 *
 * Must be listed BEFORE '@layers/expo' in `plugins`, which reads backwards.
 * `withMod` makes each newly registered mod the entry point and calls the
 * previously registered one after itself, so Info.plist mods execute in the
 * REVERSE of array order: the last plugin listed runs first. Listing this after
 * '@layers/expo' deletes a key that has not been written yet and the SDK's
 * value survives — verified with `expo config --type introspect`, which is how
 * to check it again after any plugin reshuffle.
 */
module.exports = function withoutLayersAtt(config) {
  return withInfoPlist(config, (modConfig) => {
    delete modConfig.modResults.NSUserTrackingUsageDescription;

    return modConfig;
  });
};
