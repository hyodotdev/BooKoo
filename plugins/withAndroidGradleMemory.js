const {withGradleProperties} = require('@expo/config-plugins');

const GRADLE_JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

module.exports = function withAndroidGradleMemory(config) {
  return withGradleProperties(config, (modConfig) => {
    const existing = modConfig.modResults.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs',
    );

    if (existing) {
      existing.value = GRADLE_JVM_ARGS;
    } else {
      modConfig.modResults.push({
        type: 'property',
        key: 'org.gradle.jvmargs',
        value: GRADLE_JVM_ARGS,
      });
    }

    return modConfig;
  });
};
