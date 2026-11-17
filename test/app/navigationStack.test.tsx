import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {useState} from 'react';
import {Text, TextInput} from 'react-native';
import Stack from 'expo-router/stack';
import {router} from 'expo-router';
import {fireEvent, renderRouter, testRouter} from 'expo-router/testing-library';
import {act, waitFor} from '@testing-library/react-native';

import AppIndex from '../../app/(app)/index';
import {navigateToNotification} from '../../src/features/push/provider';

jest.unmock('expo-router');
// Native stacks use RN Animated subscriptions. Keep the real JS emitter so
// navigation/unmount exercises listener cleanup, not an undefined auto-mock.
jest.unmock('react-native/Libraries/EventEmitter/NativeEventEmitter');
jest.mock('standard-navigation', () => ({}));
jest.mock('~/features/runtime/routeLoading', () => ({
  RouteLoadingScreen: () => null,
}));

function fixtureRoutes(app: ReturnType<typeof renderRouter>) {
  // renderRouter wraps an explicit layout in the synthetic __root route.
  return app.getRouterState()?.routes.find((route) => route.name === '__root')
    ?.state?.routes;
}

function EditorFixture() {
  const [draft, setDraft] = useState('');
  return (
    <TextInput
      accessibilityLabel="Draft"
      value={draft}
      onChangeText={setDraft}
    />
  );
}

describe('Expo Router forward stack behavior', () => {
  it('returns home from an archive notification without a duplicate shell', async () => {
    const app = renderRouter(
      {
        '(app)/_layout': () => (
          <Stack>
            <Stack.Screen name="index" dangerouslySingular />
            <Stack.Screen name="(tabs)" dangerouslySingular />
            <Stack.Screen name="settings" dangerouslySingular />
          </Stack>
        ),
        '(app)/index': AppIndex,
        '(app)/(tabs)/_layout': () => <Stack />,
        '(app)/(tabs)/(root)/index': () => <Text>Home shell</Text>,
        '(app)/settings': () => <Text>Settings fixture</Text>,
      },
      {initialUrl: '/(app)/(tabs)/(root)'},
    );
    testRouter.navigate('/settings');
    act(() => navigateToNotification(router, {kind: 'LEDGER_ARCHIVED'}));
    await waitFor(() => expect(app.getByText('Home shell')).toBeVisible());
    const appRoutes = fixtureRoutes(app)?.find(
      route => route.name === '(app)',
    )?.state?.routes;
    expect(appRoutes?.map(route => route.name)).toEqual(['settings', '(tabs)']);
    testRouter.back('/settings');
    expect(testRouter.canGoBack()).toBe(false);
  });

  it('reuses repeated navigation and returns with one Back', () => {
    const app = renderRouter(
      {
        index: () => <Text>Home fixture</Text>,
        settings: () => <Text>Settings fixture</Text>,
        'profile/me': () => <Text>Profile fixture</Text>,
      },
      {initialUrl: '/'},
    );
    testRouter.navigate('/settings');
    testRouter.navigate('/settings');
    testRouter.navigate('/settings');
    expect(app.getPathname()).toBe('/settings');
    testRouter.back('/');
    expect(app.getPathname()).toBe('/');
  });

  it('keeps one instance when returning through another screen', () => {
    const app = renderRouter(
      {
        _layout: () => (
          <Stack>
            <Stack.Screen name="index" dangerouslySingular />
            <Stack.Screen name="settings" dangerouslySingular />
            <Stack.Screen name="profile/me" dangerouslySingular />
          </Stack>
        ),
        index: () => <Text>Home fixture</Text>,
        settings: () => <Text>Settings fixture</Text>,
        'profile/me': () => <Text>Profile fixture</Text>,
      },
      {initialUrl: '/'},
    );
    testRouter.navigate('/settings');
    testRouter.navigate('/profile/me');
    testRouter.navigate('/settings');
    const routes = fixtureRoutes(app);
    expect(routes?.filter((route) => route.name === 'settings')).toHaveLength(
      1,
    );
    testRouter.back('/profile/me');
    testRouter.back('/');
  });

  it('preserves different entry identities while reusing the same entry', () => {
    const app = renderRouter(
      {
        _layout: () => (
          <Stack>
            <Stack.Screen name="index" dangerouslySingular />
            <Stack.Screen name="entry/[itemId]" dangerouslySingular />
          </Stack>
        ),
        index: () => <Text>Home fixture</Text>,
        'entry/[itemId]': () => <Text>Entry fixture</Text>,
      },
      {initialUrl: '/'},
    );
    testRouter.navigate('/entry/fixture-a');
    testRouter.navigate('/entry/fixture-b');
    testRouter.navigate('/entry/fixture-a');
    expect(
      fixtureRoutes(app)?.filter((route) => route.name === 'entry/[itemId]'),
    ).toHaveLength(2);
    expect(app.getSearchParams().itemId).toBe('fixture-a');
    testRouter.back('/entry/fixture-b');
    testRouter.back('/');
  });

  it('closes a repeatedly opened sheet once and preserves its editor draft', () => {
    const app = renderRouter(
      {
        _layout: () => (
          <Stack>
            <Stack.Screen name="index" dangerouslySingular />
            <Stack.Screen name="entry/new" dangerouslySingular />
            <Stack.Screen
              name="entry/category"
              dangerouslySingular
              options={{presentation: 'formSheet'}}
            />
          </Stack>
        ),
        index: () => <Text>Home fixture</Text>,
        'entry/new': EditorFixture,
        'entry/category': () => <Text>Category fixture</Text>,
      },
      {initialUrl: '/'},
    );
    testRouter.navigate('/entry/new');
    fireEvent.changeText(app.getByLabelText('Draft'), '12.50');
    testRouter.navigate('/entry/category');
    testRouter.navigate('/entry/category');
    testRouter.back('/entry/new');
    expect(app.getByDisplayValue('12.50')).toBeVisible();
    testRouter.back('/');
  });
});

describe('profile modal titles', () => {
  it('names each modal apart from the field it contains', () => {
    const layout = readFileSync(
      join(process.cwd(), 'app/(app)/_layout.tsx'),
      'utf8',
    );
    // "ID" over an "ID" field and "Name" over a profile form with a "Name" field.
    expect(layout).toMatch(
      /name="profile\/handle"[\s\S]{0,120}title: t\('auth\.usernameHeading'\)/,
    );
    expect(layout).toMatch(
      /name="profile\/edit"[\s\S]{0,120}title: t\('settings\.profileEdit'\)/,
    );
  });
});
