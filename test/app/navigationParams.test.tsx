import {Text} from 'react-native';
import Stack from 'expo-router/stack';
import {renderRouter, testRouter} from 'expo-router/testing-library';

import PhotoRoute from '../../app/(app)/photo/[itemId]';
import CategoryStatsRoute from '../../app/(app)/stats/category/[categoryKey]';

jest.unmock('expo-router');
jest.unmock('react-native/Libraries/EventEmitter/NativeEventEmitter');
// Not used by these native-stack routes; the package is ESM-only in Jest.
jest.mock('standard-navigation', () => ({}));

// These stateful domain fixtures reproduce the viewer's initial page and the
// chart's locally selected month. The real route wrappers must reset them when
// navigate changes their query context, without stacking another route.
jest.mock('~/features/media/screens', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {Text: Label} = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  const {useLocalSearchParams} = jest.requireActual<
    typeof import('expo-router')
  >('expo-router');
  return {
    PhotoViewerScreen: function PhotoFixture() {
      const params = useLocalSearchParams();
      const [selection] = React.useState(
        () => `${params.commentId ?? 'entry'}:${params.index ?? '0'}`,
      );
      return <Label>{`Photo ${selection}`}</Label>;
    },
  };
});

jest.mock('~/features/ledger/screens/categoryStats', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {Text: Label} = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  return {
    CategoryStatsScreen: function StatsFixture({
      initialMonthKey,
    }: {
      initialMonthKey?: number;
    }) {
      const [month] = React.useState(initialMonthKey);
      return <Label>{`Month ${month}`}</Label>;
    },
  };
});

describe('reused route query context', () => {
  it('opens the requested photo and comment with one Back to its caller', () => {
    const app = renderRouter(
      {
        _layout: () => (
          <Stack>
            <Stack.Screen name="index" dangerouslySingular />
            <Stack.Screen name="photo/[itemId]" dangerouslySingular />
          </Stack>
        ),
        index: () => <Text>Home fixture</Text>,
        'photo/[itemId]': PhotoRoute,
      },
      {initialUrl: '/'},
    );
    testRouter.navigate('/photo/fixture-a?index=0');
    expect(app.getByText('Photo entry:0')).toBeVisible();
    testRouter.navigate('/photo/fixture-a?index=2');
    expect(app.getByText('Photo entry:2')).toBeVisible();
    testRouter.navigate('/photo/fixture-a?commentId=comment-b&index=1');
    expect(app.getByText('Photo comment-b:1')).toBeVisible();
    testRouter.navigate('/photo/fixture-a?index=0');
    expect(app.getByText('Photo entry:0')).toBeVisible();
    testRouter.back('/');
  });

  it('opens the requested month when a category destination is reused', () => {
    const app = renderRouter(
      {
        _layout: () => (
          <Stack>
            <Stack.Screen name="index" dangerouslySingular />
            <Stack.Screen
              name="stats/category/[categoryKey]"
              dangerouslySingular
            />
          </Stack>
        ),
        index: () => <Text>Home fixture</Text>,
        'stats/category/[categoryKey]': CategoryStatsRoute,
      },
      {initialUrl: '/'},
    );
    testRouter.navigate('/stats/category/meal?monthKey=202609');
    expect(app.getByText('Month 202609')).toBeVisible();
    testRouter.navigate('/stats/category/meal?monthKey=202608');
    expect(app.getByText('Month 202608')).toBeVisible();
    testRouter.back('/');
  });
});
