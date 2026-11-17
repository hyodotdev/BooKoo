import type {ReactElement} from 'react';
import {Image, StyleSheet, View, type ImageSourcePropType} from 'react-native';
import {Tabs} from 'expo-router/js-tabs';
import {Typography, useCPK} from 'cpk-ui';

import {FreeTabBannerFooter} from '~/features/ads/banner';
import {LedgerTabBar} from '~/features/ledger/tabBar';
import {useActiveLedger} from '~/features/ledger/useActiveLedger';
import {ShellLoadingOverlay} from '~/features/runtime/shellLoadingOverlay';
import {useTabletLayout} from '~/hooks/useTabletLayout';
import {useLocale} from '~/hooks/useLocale';
import {useLedgerAccent} from '~/theme/ledgerAccentProvider';
import {MOBILE_TAB_BAR_BASE_HEIGHT} from '~/theme/layout';
import {t} from '~/utils/i18n';

export default function TabLayout(): ReactElement {
  useLocale();
  const {theme} = useCPK();
  const activeAccent = useLedgerAccent();
  const {activeLedger} = useActiveLedger();
  const hideTabs = activeLedger == null;
  const useSideTabs = useTabletLayout();
  const tabIcon = (
    normal: ImageSourcePropType,
    selected: ImageSourcePropType,
    accessibilityLabel: string,
    testID: string,
  ) => {
    function TabIcon({focused}: {focused: boolean}): ReactElement {
      return (
        <Image
          accessibilityLabel={accessibilityLabel}
          resizeMode="contain"
          source={focused ? selected : normal}
          style={[
            styles.tabImage,
            {
              tintColor: focused ? activeAccent.text : theme.text.placeholder,
            },
          ]}
          testID={testID}
        />
      );
    }
    return TabIcon;
  };
  const tabLabel = (label: string) =>
    function TabLabel({focused}: {focused: boolean}): ReactElement {
      return (
        <Typography.Body4
          $fontWeight={focused ? 'bold' : 'normal'}
          maxFontSizeMultiplier={1.25}
          numberOfLines={1}
          style={[
            styles.tabLabel,
            {
              color: focused ? activeAccent.text : theme.text.placeholder,
            },
          ]}
        >
          {label}
        </Typography.Body4>
      );
    };
  return (
    <View style={styles.shell} testID="authenticated-tab-shell">
      <Tabs
        safeAreaInsets={{bottom: 0}}
        tabBar={(props) => (
          <LedgerTabBar
            {...props}
            accentColor={activeAccent.subtle}
            backgroundColor={theme.bg.chrome}
            hidden={hideTabs}
            side={useSideTabs}
          />
        )}
        screenOptions={{
          headerShown: false,
          tabBarActiveBackgroundColor: useSideTabs
            ? activeAccent.subtle
            : 'transparent',
          // Every tab screen paints `theme.bg.paper`. Left unset, the scene
          // shows React Navigation's own light gray for the frames before the
          // first screen has painted, a flash between the loader and content
          // that is brightest in dark mode.
          sceneStyle: {backgroundColor: theme.bg.paper},
          tabBarActiveTintColor: activeAccent.text,
          tabBarInactiveTintColor: theme.text.placeholder,
          tabBarItemStyle: useSideTabs ? styles.sideTabItem : styles.tabItem,
          tabBarLabelPosition: 'below-icon',
          tabBarShowLabel: true,
          tabBarPosition: useSideTabs ? 'left' : 'bottom',
          tabBarVariant: useSideTabs ? 'material' : 'uikit',
          tabBarStyle: hideTabs
            ? styles.hiddenTabBar
            : {
                backgroundColor: theme.bg.chrome,
                borderColor: theme.role.border,
                ...(useSideTabs
                  ? {minWidth: 104, width: 104}
                  : {
                      backgroundColor: theme.bg.chrome,
                      height: MOBILE_TAB_BAR_BASE_HEIGHT,
                      paddingBottom: 0,
                    }),
              },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarAccessibilityLabel: t('tabs.monthly'),
            tabBarIcon: tabIcon(
              require('../../../../assets/tabs/ic_tab1_n.png'),
              require('../../../../assets/tabs/ic_tab1_s.png'),
              t('tabs.monthly'),
              'tab-monthly',
            ),
            tabBarLabel: tabLabel(t('tabs.monthly')),
            title: t('tabs.monthly'),
          }}
        />
        <Tabs.Screen
          name="timeline"
          options={{
            tabBarAccessibilityLabel: t('tabs.list'),
            tabBarIcon: tabIcon(
              require('../../../../assets/tabs/ic_tab2_n.png'),
              require('../../../../assets/tabs/ic_tab2_s.png'),
              t('tabs.list'),
              'tab-timeline',
            ),
            tabBarLabel: tabLabel(t('tabs.list')),
            title: t('tabs.list'),
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            tabBarAccessibilityLabel: t('tabs.graph'),
            tabBarIcon: tabIcon(
              require('../../../../assets/tabs/ic_tab3_n.png'),
              require('../../../../assets/tabs/ic_tab3_s.png'),
              t('tabs.graph'),
              'tab-stats',
            ),
            tabBarLabel: tabLabel(t('tabs.graph')),
            title: t('tabs.graph'),
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            tabBarAccessibilityLabel: t('tabs.extra'),
            tabBarIcon: tabIcon(
              require('../../../../assets/tabs/ic_tab4_n.png'),
              require('../../../../assets/tabs/ic_tab4_s.png'),
              t('tabs.extra'),
              'tab-more',
            ),
            tabBarLabel: tabLabel(t('tabs.extra')),
            title: t('tabs.extra'),
          }}
        />
      </Tabs>
      <FreeTabBannerFooter hidden={hideTabs} />
      <ShellLoadingOverlay visible={activeLedger === undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Out of layout entirely. The side rail is sized by width, and the tab bar
  // gives it paddingStart/paddingEnd, which Yoga keeps even at width 0; each
  // partial collapse left an empty white column on tablets.
  hiddenTabBar: {
    borderRightWidth: 0,
    borderTopWidth: 0,
    display: 'none',
    height: 0,
    minWidth: 0,
    opacity: 0,
    overflow: 'hidden',
    paddingBottom: 0,
    paddingEnd: 0,
    paddingStart: 0,
    paddingTop: 0,
    width: 0,
  },
  shell: {flex: 1},
  sideTabItem: {
    borderRadius: 14,
    marginHorizontal: 6,
    marginVertical: 4,
    overflow: 'hidden',
  },
  tabImage: {height: 22, width: 22},
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MOBILE_TAB_BAR_BASE_HEIGHT,
    paddingBottom: 0,
    paddingTop: 0,
  },
  tabLabel: {lineHeight: 16},
});
