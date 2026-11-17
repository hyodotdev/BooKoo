import type {ReactElement} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {useCPK} from 'cpk-ui';

import {BookooLoading} from '~/components/uis/BookooLoading';
import {statusBarStyleForTheme} from '~/theme/statusBar';

/** Keeps internal route settling branded without replaying the native splash. */
export function RouteLoadingScreen(): ReactElement {
  const {theme, themeType} = useCPK();
  return (
    <View
      style={[styles.root, {backgroundColor: theme.bg.basic}]}
      testID="route-loading"
    >
      <StatusBar
        backgroundColor={theme.bg.basic}
        barStyle={statusBarStyleForTheme(themeType)}
        hidden={false}
      />
      <BookooLoading testID="route-loading-brand" variant="screen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
});
