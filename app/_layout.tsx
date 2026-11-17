import 'react-native-gesture-handler';

import type {ReactElement} from 'react';
import {useEffect} from 'react';
import {Linking, StyleSheet, useWindowDimensions} from 'react-native';
import * as SystemUI from 'expo-system-ui';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {styled, css} from 'kstyled';
import {useMMKVString} from 'react-native-mmkv';
import {Stack, usePathname} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Patch from '@codemagic/react-native-patch';
import {wrapWithObserveRoot} from '../src/features/runtime/observeRoot';
import {CustomPressable, Icon, useCPK} from 'cpk-ui';
import StatusBarBrightness from 'cpk-ui/components/uis/StatusbarBrightness/StatusBarBrightness';

import RootProvider from '../src/components/providers';
import {
  sessionChromeUsesAppearance,
  useSession,
} from '../src/features/auth/session';
import {
  sessionRendersSignedInShell,
  usesAppShellIdentityDialog,
  usesDedicatedOnboardingStack,
} from '../src/features/auth/onboardingNavigation';
import {
  FinishIdentityProfile,
  HandleScreen,
} from '../src/features/auth/screens';
import {COMPONENT_WIDTH, delayPressIn} from '../src/utils/constants';
import {t} from '../src/utils/i18n';
import {isThemePreference, Storage, storage} from '../src/utils/storage';
import {BOOKOO_PALETTE} from '../src/theme/bookooPalette';
import {AppNavigationTheme} from '../src/theme/navigationTheme';
import {ReadyProviders} from '../src/features/runtime/readyProviders';
import {LedgerAccentProvider} from '../src/theme/ledgerAccentProvider';
import {useConnectivity} from '../src/features/runtime/connectivity';
import {BookooRecoveryScreen} from '../src/components/uis/BookooRecoveryScreen';
import {RouteLoadingScreen} from '../src/features/runtime/routeLoading';
import {PendingInviteResume} from '../src/features/invite/pendingInviteResume';
import {NOT_FOUND_OPTIONS} from '../src/features/runtime/navigation';
import {useObserveReadiness} from '../src/features/runtime/observe';
import {useSessionStalled} from '../src/features/runtime/stalledSession';
import {
  shouldConstrainRootContent,
  useTabletLayout,
} from '../src/hooks/useTabletLayout';
import {useLocale} from '../src/hooks/useLocale';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({duration: 250, fade: true});

const Container = styled.View`
  flex: 1;
  align-self: stretch;
  background-color: ${({theme}) => theme.bg.paper};
`;

const Content = styled.View`
  align-self: center;
  width: 100%;
  flex: 1;
  background-color: ${({theme}) => theme.bg.basic};
`;

function Navigator(): ReactElement | null {
  const {theme} = useCPK();
  useLocale();
  const {isAuthenticated, onboardingStep, stage} = useSession();
  const pathname = usePathname();
  const showsAppShell = sessionRendersSignedInShell(
    stage,
    onboardingStep,
    isAuthenticated,
  );
  const connectivity = useConnectivity();
  // `loading` has two sinks with no timer of their own (an unresolved profile
  // query, and app lock never becoming ready), and the recovery screen below
  // was reachable only while signed *out* — which is not the state a stuck
  // sign-in is in. Give the stall an exit.
  const sessionStalled = useSessionStalled(stage === 'loading');
  useObserveReadiness(stage);
  const tabletLayout = useTabletLayout();
  const {height, width} = useWindowDimensions();
  const constrainToPhoneWidth = shouldConstrainRootContent({
    height,
    tabletLayout,
    width,
  });
  const usesAppearance = sessionChromeUsesAppearance(stage, pathname);
  const chromeBackground = usesAppearance
    ? theme.bg.basic
    : BOOKOO_PALETTE.brandNavy;
  const paperBackground = usesAppearance
    ? theme.bg.paper
    : BOOKOO_PALETTE.brandNavy;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(chromeBackground);
  }, [chromeBackground]);

  const statusBar = (
    <StatusBarBrightness
      type={usesAppearance ? undefined : 'light-content'}
    />
  );

  // Keep a branded loading surface while auth, profile, or app-lock settle.
  // Mounting the signed-in shell during that window previously felt like a
  // laggy half-ready launch and could briefly expose ledger UI before lock.
  if (stage === 'loading')
    return (
      <>
        {statusBar}
        {(!isAuthenticated && connectivity.showOffline) || sessionStalled ? (
          <BookooRecoveryScreen
            body={t('error.network')}
            code="BooKoo"
            icon="WifiSlash"
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void Patch.restartApp().catch(() => undefined),
            }}
            secondaryAction={{
              label: t('permission.openSettings'),
              onPress: () => void Linking.openSettings(),
            }}
            testID="session-offline-recovery"
            title={t('error.offline')}
          />
        ) : (
          // Auth/lock may still be settling with isAuthenticated=false; never leave a blank frame.
          <RouteLoadingScreen />
        )}
      </>
    );
  if (stage === 'profile-missing') return statusBar;

  const navigator = (
    <Container style={{backgroundColor: paperBackground}}>
      <PendingInviteResume />
      <Content
        testID="root-responsive-content"
        style={[
          constrainToPhoneWidth ? styles.phoneContent : styles.fullWidthContent,
          {backgroundColor: chromeBackground},
        ]}
      >
        <Stack
          screenOptions={({navigation}) => ({
            contentStyle: {backgroundColor: chromeBackground},
            headerStyle: {backgroundColor: theme.bg.basic},
            headerTintColor: theme.text.label,
            headerTitleStyle: {fontWeight: 'bold', color: theme.text.basic},
            headerLeft: ({canGoBack}) =>
              canGoBack ? (
                <CustomPressable
                  accessibilityLabel={t('a11y.back')}
                  delayHoverIn={delayPressIn}
                  hitSlop={{top: 8, left: 8, right: 8, bottom: 8}}
                  onPress={() => navigation.goBack()}
                  style={css`
                    width: 56px;
                    height: 56px;
                    align-items: center;
                    justify-content: center;
                    border-radius: 28px;
                    overflow: hidden;
                  `}
                >
                  <Icon color={theme.text.basic} name="CaretLeft" size={24} />
                </CustomPressable>
              ) : null,
          })}
        >
          <Stack.Protected guard={stage === 'signed-out'}>
            <Stack.Screen name="(auth)" options={{headerShown: false}} />
          </Stack.Protected>
          <Stack.Protected
            guard={
              stage === 'onboarding' &&
              usesDedicatedOnboardingStack(onboardingStep)
            }
          >
            <Stack.Screen name="(onboarding)" options={{headerShown: false}} />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'suspended'}>
            <Stack.Screen
              name="account/suspended"
              options={{gestureEnabled: false, headerShown: false}}
            />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'pending-deletion'}>
            <Stack.Screen
              name="account/deleted"
              options={{gestureEnabled: false, headerShown: false}}
            />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'locked'}>
            <Stack.Screen
              name="lock"
              options={{gestureEnabled: false, headerShown: false}}
            />
          </Stack.Protected>
          <Stack.Protected guard={showsAppShell}>
            <Stack.Screen name="(app)" options={{headerShown: false}} />
          </Stack.Protected>
          <Stack.Screen
            name="apple-callback"
            options={{animation: 'none', headerShown: false}}
          />
          <Stack.Screen name="+not-found" options={NOT_FOUND_OPTIONS} />
          <Stack.Screen
            name="invite/[code]"
            options={{presentation: 'card', title: t('common.invite')}}
          />
          <Stack.Screen
            name="invite/code"
            options={{presentation: 'modal', title: t('member.inviteLink')}}
          />
          <Stack.Screen
            name="u/[handle]"
            options={{
              presentation: 'card',
              title: t('settings.profileSection'),
            }}
          />
        </Stack>
        {usesAppShellIdentityDialog(onboardingStep) ? <HandleScreen /> : null}
        {onboardingStep === 'profile' ? <FinishIdentityProfile /> : null}
      </Content>
    </Container>
  );
  const framed = (
    <>
      {statusBar}
      <AppNavigationTheme background={paperBackground}>
        {stage === 'ready' ? (
          <ReadyProviders>{navigator}</ReadyProviders>
        ) : showsAppShell ? (
          <LedgerAccentProvider>{navigator}</LedgerAccentProvider>
        ) : (
          navigator
        )}
      </AppNavigationTheme>
    </>
  );
  return framed;
}

const styles = StyleSheet.create({
  fullWidthContent: {alignSelf: 'stretch', maxWidth: '100%'},
  phoneContent: {maxWidth: COMPONENT_WIDTH},
});

export function RootLayout(): ReactElement {
  const [storedThemePreference] = useMMKVString(Storage.ThemeType, storage);
  const themePreference = isThemePreference(storedThemePreference)
    ? storedThemePreference
    : 'system';
  const initialThemeType =
    themePreference === 'system' ? undefined : themePreference;

  return (
    <GestureHandlerRootView
      style={css`
        flex: 1;
      `}
    >
      <RootProvider initialThemeType={initialThemeType}>
        <Navigator />
      </RootProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithObserveRoot(RootLayout);
