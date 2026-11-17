import type {ReactElement} from 'react';
import {useWindowDimensions} from 'react-native';
import {Drawer, type DrawerContentComponentProps} from 'expo-router/drawer';
import {useCPK} from 'cpk-ui';

import {LedgerDrawerContent} from '~/features/ledger/drawer';
import {useLocale} from '~/hooks/useLocale';
import {t} from '~/utils/i18n';

function renderDrawerContent({
  navigation,
}: DrawerContentComponentProps): ReactElement {
  return <LedgerDrawerContent onClose={() => navigation.closeDrawer()} />;
}

export default function LedgerDrawerLayout(): ReactElement {
  useLocale();
  const {width} = useWindowDimensions();
  const {theme} = useCPK();
  const drawerWidth = Math.min(width * 0.84, 360);
  return (
    <Drawer
      drawerContent={renderDrawerContent}
      screenOptions={{
        drawerStyle: {
          backgroundColor: theme.bg.sheet,
          borderRadius: 0,
          borderBottomRightRadius: 0,
          borderTopRightRadius: 0,
          width: drawerWidth,
        },
        drawerType: 'slide',
        headerShown: false,
        keyboardDismissMode: 'on-drag',
        overlayAccessibilityLabel: t('a11y.close'),
        overlayColor: theme.bg.scrim,
        sceneStyle: {backgroundColor: theme.bg.basic},
        swipeEdgeWidth: 56,
        swipeEnabled: true,
      }}
    >
      <Drawer.Screen name="(root)" />
    </Drawer>
  );
}
