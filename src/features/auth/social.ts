import {useCallback, useMemo, useRef, useState} from 'react';
import {Linking, Platform} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {
  login as kakaoLogin,
  logout as kakaoLogout,
  unlink as kakaoUnlink,
} from '@react-native-seoul/kakao-login';
import NaverLogin from '@react-native-seoul/naver-login';
import {useAuthActions} from '@convex-dev/auth/react';

import {
  APPLE_APP_CALLBACK,
  isAppleCallbackUrl,
  parseAppleCallbackParams,
  parseAppleWebName,
} from '@shared/apple';

export const SOCIAL_PROVIDERS = ['apple', 'google', 'kakao', 'naver'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export type SocialSignInPhase = 'provider' | 'session' | null;

type SocialCredentials = {
  idToken?: string;
  accessToken?: string;
  nonce?: string;
  authorizationCode?: string;
  name?: string;
};

const googleWebClientId = configuredClientEnv(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
);
const googleIosClientId = configuredClientEnv(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
);
const naverClientId = configuredClientEnv(
  process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
);
const naverClientSecret = configuredClientEnv(
  process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET,
);
const kakaoAppKey = configuredClientEnv(process.env.EXPO_PUBLIC_KAKAO_APP_KEY);
const appleServiceId = configuredClientEnv(
  process.env.EXPO_PUBLIC_APPLE_SERVICE_ID,
);
const convexSiteUrl = configuredClientEnv(
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
);

const APPLE_CALLBACK_PATH = '/auth/apple/callback';

export function configuredClientEnv(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

async function captureAppleWebCallback(authorizeUrl: string): Promise<string> {
  let delivered: string | null = null;
  const waiters: ((url: string) => void)[] = [];
  const take = (url: string): void => {
    if (delivered !== null || !isAppleCallbackUrl(url)) return;
    delivered = url;
    for (const waiter of waiters) waiter(url);
  };
  const subscription = Linking.addEventListener('url', (event) => {
    take(event.url);
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl,
      APPLE_APP_CALLBACK,
    );
    if (result.type === 'success') take(result.url);
    if (delivered !== null) return delivered;
    const latest = await Linking.getInitialURL();
    if (latest !== null) take(latest);
    if (delivered !== null) return delivered;
    return await new Promise<string>((resolve, reject) => {
      waiters.push(resolve);
      setTimeout(() => reject(new Error('Apple Sign-In cancelled')), 2500);
    });
  } finally {
    subscription.remove();
  }
}

export function appleAuthorizeUrl({
  clientId,
  nonce,
  redirectUri,
  state,
}: {
  clientId: string;
  nonce: string;
  redirectUri: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: clientId,
    nonce,
    redirect_uri: redirectUri,
    response_mode: 'form_post',
    response_type: 'code id_token',
    scope: 'name email',
    state,
  })
    .toString()
    .replace(/\+/g, '%20');
  return `https://appleid.apple.com/auth/authorize?${query}`;
}

let googleConfigured = false;
let naverConfigured = false;

function configureGoogle(): void {
  if (googleConfigured) return;
  if (googleWebClientId === undefined)
    throw new Error('Google Sign-In is not configured');
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    ...(googleIosClientId === undefined
      ? {}
      : {iosClientId: googleIosClientId}),
  });
  googleConfigured = true;
}

function configureNaver(): void {
  if (naverConfigured) return;
  if (naverClientId === undefined || naverClientSecret === undefined)
    throw new Error('Naver Sign-In is not configured');
  NaverLogin.initialize({
    appName: 'BooKoo',
    consumerKey: naverClientId,
    consumerSecret: naverClientSecret,
    serviceUrlSchemeIOS: 'bookoonaver',
  });
  naverConfigured = true;
}

export function isSocialSignInAvailable(provider: SocialProvider): boolean {
  if (Platform.OS === 'web') return false;
  if (provider === 'apple')
    return (
      Platform.OS === 'ios' ||
      (Platform.OS === 'android' &&
        appleServiceId !== undefined &&
        convexSiteUrl !== undefined)
    );
  if (provider === 'google') return googleWebClientId !== undefined;
  if (provider === 'kakao') return kakaoAppKey !== undefined;
  return naverClientId !== undefined && naverClientSecret !== undefined;
}

export async function getSocialCredentials(
  provider: SocialProvider,
): Promise<SocialCredentials> {
  if (!isSocialSignInAvailable(provider))
    throw new Error(`${provider} Sign-In is not configured`);
  if (provider === 'apple') {
    if (Platform.OS === 'ios') {
      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
      } catch (caught: unknown) {
        if (
          typeof caught === 'object' &&
          caught !== null &&
          'code' in caught &&
          caught.code === 'ERR_REQUEST_CANCELED'
        )
          throw new Error('Apple Sign-In cancelled');
        throw caught;
      }
      if (credential.identityToken === null)
        throw new Error('Apple did not return an identity token');
      const name = [
        credential.fullName?.familyName,
        credential.fullName?.givenName,
      ]
        .filter((part): part is string => part !== null && part !== undefined)
        .join('');
      return {
        idToken: credential.identityToken,
        ...(credential.authorizationCode === null
          ? {}
          : {authorizationCode: credential.authorizationCode}),
        ...(name.length === 0 ? {} : {name}),
      };
    }

    if (appleServiceId === undefined || convexSiteUrl === undefined)
      throw new Error('Apple Sign-In is not configured');
    const state = Crypto.randomUUID();
    const nonce = Crypto.randomUUID();
    const redirectUri = `${convexSiteUrl.replace(/\/$/, '')}${APPLE_CALLBACK_PATH}`;
    const authorizeUrl = appleAuthorizeUrl({
      clientId: appleServiceId,
      nonce,
      redirectUri,
      state,
    });
    const callbackUrl = await captureAppleWebCallback(authorizeUrl);
    const params = parseAppleCallbackParams(callbackUrl);
    if (params.get('error') !== null)
      throw new Error('Apple Sign-In cancelled');
    if (params.get('state') !== state)
      throw new Error('Apple Sign-In state mismatch');
    const idToken = params.get('id_token') ?? undefined;
    if (idToken === undefined)
      throw new Error('Apple did not return an identity token');
    const authorizationCode = params.get('code') ?? undefined;
    const name = parseAppleWebName(params.get('user') ?? undefined);
    return {
      idToken,
      nonce,
      ...(authorizationCode === undefined ? {} : {authorizationCode}),
      ...(name === undefined ? {} : {name}),
    };
  }
  if (provider === 'google') {
    configureGoogle();
    if (Platform.OS === 'android')
      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success' || response.data.idToken === null)
      throw new Error('Google Sign-In was cancelled');
    return {
      idToken: response.data.idToken,
      ...(response.data.user.name === null
        ? {}
        : {name: response.data.user.name}),
    };
  }
  if (provider === 'kakao') {
    const nonce = Crypto.randomUUID();
    const token = await kakaoLogin({nonce});
    if (token.idToken.length === 0)
      throw new Error('Kakao did not return an identity token');
    return {idToken: token.idToken, accessToken: token.accessToken, nonce};
  }
  configureNaver();
  const response = await NaverLogin.login();
  const accessToken = response.successResponse?.accessToken;
  if (!response.isSuccess || accessToken === undefined)
    throw new Error('Naver Sign-In was cancelled');
  return {accessToken};
}

export async function releaseSocialSessions(
  mode: 'logout' | 'unlink' = 'logout',
): Promise<void> {
  if (Platform.OS === 'web') return;
  const releases: Promise<unknown>[] = [];
  if (googleWebClientId !== undefined) {
    try {
      configureGoogle();
      releases.push(
        mode === 'unlink'
          ? GoogleSignin.revokeAccess()
          : GoogleSignin.signOut(),
      );
    } catch {
      // A missing native session must not block the other providers.
    }
  }
  if (kakaoAppKey !== undefined)
    releases.push(mode === 'unlink' ? kakaoUnlink() : kakaoLogout());
  if (naverClientId !== undefined && naverClientSecret !== undefined) {
    try {
      configureNaver();
      releases.push(
        mode === 'unlink' ? NaverLogin.deleteToken() : NaverLogin.logout(),
      );
    } catch {
      // A missing native session must not block the other providers.
    }
  }
  await Promise.allSettled(releases);
}

export function useSocialSignIn() {
  const {signIn} = useAuthActions();
  // State alone cannot reject a second tap before React commits the busy UI.
  const inFlight = useRef(false);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);
  const [phase, setPhase] = useState<SocialSignInPhase>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (provider: SocialProvider): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyProvider(provider);
      setPhase('provider');
      setError(null);
      try {
        const credentials = await getSocialCredentials(provider);
        // The native provider sheet has returned. Show the modal only now so
        // it cannot compete with Apple's or Google's native presentation.
        setPhase('session');
        const result = await signIn(provider, credentials);
        if (!result.signingIn)
          throw new Error(`${provider} Sign-In did not create a session`);
      } catch (caught: unknown) {
        const message =
          caught instanceof Error &&
          caught.message.toLowerCase().includes('cancel')
            ? null
            : 'error';
        setError(message);
      } finally {
        inFlight.current = false;
        setBusyProvider(null);
        setPhase(null);
      }
    },
    [signIn],
  );

  return useMemo(
    () => ({busyProvider, error, phase, start}),
    [busyProvider, error, phase, start],
  );
}
