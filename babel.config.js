module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-kstyled', {debug: false, strict: true}],
      // Reanimated v4 moved its Babel plugin into react-native-worklets.
      // Must stay last.
      'react-native-worklets/plugin',
    ],
  };
};
