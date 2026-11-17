import {AppState} from 'react-native';
import {render, waitFor} from '@testing-library/react-native';
import {readIpCountryCode} from '~/features/runtime/ipCountry';

import {PresenceProvider} from '~/features/runtime/presence';

const mockTouch = jest.fn(() => Promise.resolve(null));
let mockId = 'dev.hyo.bookoo';
let mockCountryEnabled = false;
jest.mock('~/features/auth/currentUser', () => ({
  useCurrentUser: () => ({countryAnalyticsEnabled: mockCountryEnabled}),
}));
jest.mock('~/features/runtime/ipCountry', () => ({
  readIpCountryCode: jest.fn(async () => 'VN'),
}));
jest.mock('convex/react', () => ({useMutation: () => mockTouch}));
jest.mock('expo-application', () => ({
  get applicationId() {
    return mockId;
  },
  nativeBuildVersion: '55',
  nativeApplicationVersion: '1.3.1',
}));
jest.mock('~/hooks/useLocale', () => ({useLocale: () => ({locale: 'en'})}));

const originalDev = __DEV__;
afterEach(() => {
  mockTouch.mockClear();
  jest.mocked(readIpCountryCode).mockClear();
  mockId = 'dev.hyo.bookoo';
  mockCountryEnabled = false;
  Object.defineProperty(globalThis, '__DEV__', {value: originalDev});
});
it('does not record a debug production-package run as operational activity', () => {
  Object.defineProperty(globalThis, '__DEV__', {value: true});
  render(<PresenceProvider />);
  expect(mockTouch).not.toHaveBeenCalled();
  expect(readIpCountryCode).not.toHaveBeenCalled();
});
it('does not record a release-mode QA binary even when it reaches production', () => {
  Object.defineProperty(globalThis, '__DEV__', {value: false});
  mockId = 'dev.hyo.bookoo.qa';
  mockCountryEnabled = true;
  render(<PresenceProvider />);
  expect(mockTouch).not.toHaveBeenCalled();
  expect(readIpCountryCode).not.toHaveBeenCalled();
});
it('preserves the existing production heartbeat payload', () => {
  Object.defineProperty(globalThis, '__DEV__', {value: false});
  render(<PresenceProvider />);
  expect(mockTouch).toHaveBeenCalledWith({
    platform: 'ios',
    appVersion: '1.3.1',
    buildNumber: 55,
    locale: 'en',
  });
});

it('adds a country only after the optional choice is enabled', async () => {
  Object.defineProperty(globalThis, '__DEV__', {value: false});
  mockCountryEnabled = true;
  render(<PresenceProvider />);
  await waitFor(() =>
    expect(mockTouch).toHaveBeenCalledWith(
      expect.objectContaining({ipCountryCode: 'VN'}),
    ),
  );
  expect(readIpCountryCode).toHaveBeenCalledTimes(1);
});

it('still writes ordinary presence when optional country lookup fails', async () => {
  Object.defineProperty(globalThis, '__DEV__', {value: false});
  mockCountryEnabled = true;
  jest.mocked(readIpCountryCode).mockResolvedValueOnce(undefined);
  render(<PresenceProvider />);
  await waitFor(() => expect(mockTouch).toHaveBeenCalled());
  expect(mockTouch.mock.calls[0]).toEqual([
    expect.not.objectContaining({ipCountryCode: expect.anything()}),
  ]);
});
it('does not deliver a late country after the provider is unmounted', async () => {
  Object.defineProperty(globalThis, '__DEV__', {value: false});
  mockCountryEnabled = true;
  let finish: (value: string) => void = () => undefined;
  jest.mocked(readIpCountryCode).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const screen = render(<PresenceProvider />);
  await Promise.resolve();
  expect(mockTouch).toHaveBeenCalledTimes(1);
  screen.unmount();
  finish('VN');
  await Promise.resolve();
  expect(mockTouch).toHaveBeenCalledTimes(1);
  expect(mockTouch).not.toHaveBeenCalledWith(
    expect.objectContaining({ipCountryCode: expect.anything()}),
  );
});

it('records foreground before an optional lookup that never completes', async () => {
  Object.defineProperty(globalThis, '__DEV__', {value: false});
  mockCountryEnabled = true;
  jest
    .mocked(readIpCountryCode)
    .mockImplementationOnce(() => new Promise(() => undefined));
  const screen = render(<PresenceProvider />);
  expect(mockTouch).toHaveBeenCalledTimes(1);
  expect(mockTouch).toHaveBeenCalledWith(
    expect.not.objectContaining({ipCountryCode: expect.anything()}),
  );
  screen.unmount();
});

it('does not mark a background app active when its remote country preference changes', () => {
  Object.defineProperty(globalThis, '__DEV__', {value: false});
  mockCountryEnabled = true;
  const previous = AppState.currentState;
  try {
    Object.defineProperty(AppState, 'currentState', {
      value: 'background',
      configurable: true,
      writable: true,
    });
    render(<PresenceProvider />);
    expect(mockTouch).not.toHaveBeenCalled();
    expect(readIpCountryCode).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(AppState, 'currentState', {
      value: previous,
      configurable: true,
      writable: true,
    });
  }
});
