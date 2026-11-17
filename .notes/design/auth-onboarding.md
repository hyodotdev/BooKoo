# BooKoo — AUTH + ONBOARDING Subsystem Design

Status: design, ready to implement.
Inputs: `DECISIONS.md`, research notes `02 §15`, `04 §4`, `06 §6.5`, `08` (whole), `09 §12`, `10`, `14 §3`.
Everything below was cross-checked against the actual `@convex-dev/auth@0.0.95` source in
`FightingHows/node_modules/@convex-dev/auth/dist/server/implementation/` — several rules in this document
exist _because_ of what that source does, and those spots are marked **[lib-verified]**.

---

## 0. Invariants

These are the load-bearing rules. Everything else in this document is a consequence of one of them.

| #       | Invariant                                                                                                                                                      | Why                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **I1**  | An account is keyed by `(provider, providerAccountId)` where `providerAccountId` is the provider's `sub`. **Email is never an identity.**                      | Apple private-relay addresses change; `sub` does not.                                                                    |
| **I2**  | `users.email` is set **only** when a provider we trust has asserted the address is verified. An unverified address never touches `users.email` / `userEmails`. | This is the whole anti-takeover argument (§6.3). Diverges from FightingHows, which writes `users.email` unconditionally. |
| **I3**  | Auto-link by email fires only when `emailVerified === true` **and** the provider's token was audience-bound to _our_ app. Naver is permanently excluded.       | §6.3.                                                                                                                    |
| **I4**  | Every user-facing failure is a `ConvexError<{code, messageKey, params?}>`. Never `throw new Error(string)` on a path a client sees.                            | Production Convex redacts non-`ConvexError` messages → "Server Error" on the sign-in screen.                             |
| **I5**  | The server has no locale. It throws i18n **keys**, never Korean sentences. (FightingHows hard-codes Korean; we do not.)                                        | ko/en/ja/zh/id, note 04.                                                                                                 |
| **I6**  | Every read in the auth path is `withIndex` + `.take(CAP)`. No `.collect()`, no `.filter()` on an unbounded table.                                              | Non-negotiable perf rule from `DECISIONS.md §5`.                                                                         |
| **I7**  | `legacyUid` / `legacyKey` exist on day one, on every table that can carry one.                                                                                 | `DECISIONS.md §4`.                                                                                                       |
| **I8**  | `DELETION_GRACE_MS < HANDLE_RELEASE_COOLDOWN_MS`. Asserted by a unit test.                                                                                     | Guarantees a restored account always gets its handle back (§12.5).                                                       |
| **I9**  | The app-lock PIN never leaves the device and is never sent to Convex.                                                                                          | §14.                                                                                                                     |
| **I10** | The root subscription (`api.user.queries.currentUser`) returns a **small, slow-changing** payload. No `lastSeenAt`, no counters.                               | It is subscribed for the whole session; every field in it re-renders the router gate on write.                           |

---

## 1. Package additions on top of note 10's pinned `package.json`

Note 10's package list is historical; `package.json` plus
`scripts/verify-dependencies.ts` is the executable dependency authority. Email delivery uses the
documented hand-written server `fetch` client, so no Resend SDK is installed. The following block records
the packages this design originally added; all are now installed at the compatible pins:

```jsonc
{
  "dependencies": {
    // App lock — biometrics + device passcode. SDK 57 bundled version.
    "expo-local-authentication": "~57.0.2",
    // App-lock PIN KDF (pure JS, zero native). See §14.4 for why scrypt and not PBKDF2.
    "@noble/hashes": "2.3.0",
    // Server-side rate limiting. Convex component; also needs a convex.config.ts entry.
    "@convex-dev/rate-limiter": "0.3.2",
    // Already listed in note 10 §"Convex pagination/validator helpers" but as a maybe — make it a yes.
    "convex-helpers": "0.1.123",
  },
  "devDependencies": {
    // OTP hashing parity with Martie's ResendOTP (used only by the App-Review fixed-OTP override).
    "@oslojs/crypto": "^1.0.1",
    "@oslojs/encoding": "^1.1.0",
  },
}
```

Pin whatever `bun add` resolves and record it; the two `@oslojs/*` packages are transitive deps of `oslo@1.2.1`
but we import them directly, so declare them.

R6 pins `@noble/hashes@2.3.0`, so the only app import is `@noble/hashes/scrypt.js` in
`src/features/lock/kdf.ts`.

**`@convex-dev/auth` goes in `dependencies`, not `devDependencies`.** FightingHows gets away with the
devDependency because it only uses `ConvexCredentials`; BooKoo uses the `Email` provider, whose `@auth/core`
peer is resolved at bundle time.

---

## 2. File map

### Server (`convex/`)

| path                                      | role                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convex/auth.ts`                          | `convexAuth({providers, callbacks, signIn})` — the whole sign-in policy                                                                                                        |
| `convex/auth.config.ts`                   | JWT issuer (3 lines, verbatim from note 08 §2)                                                                                                                                 |
| `convex/http.ts`                          | `auth.addHttpRoutes(http)` + Apple `form_post` callback                                                                                                                        |
| `convex/appleWeb.ts`                      | `appleCallback` httpAction — `APP_REDIRECT_SCHEME = 'bookoo://apple-callback'`                                                                                                 |
| `convex/convex.config.ts`                 | `app.use(rateLimiter)`                                                                                                                                                         |
| `convex/otp/ResendOTP.ts`                 | the five locale-scoped `Email(...)` providers                                                                                                                                  |
| `convex/otp/emailTemplates.ts`            | `{subject, text(code), html(code)}` per locale                                                                                                                                 |
| `convex/otp/resendClient.ts`              | hand-rolled `fetch` to `api.resend.com` (no SDK at runtime)                                                                                                                    |
| `convex/otp/fixedOtp.ts`                  | App-Store/Play reviewer fixed-code override                                                                                                                                    |
| `convex/lib/idToken.ts`                   | **all** token verification (jose/JWKS) + `verifySocialCredentials` boundary                                                                                                    |
| `convex/lib/kakaoIdentity.ts`             | `fetchKakaoProfile`                                                                                                                                                            |
| `convex/lib/naverIdentity.ts`             | `verifyNaverAccessToken`                                                                                                                                                       |
| `convex/lib/appleTokens.ts`               | Apple client-secret JWT (ES256), code→refresh_token, revoke                                                                                                                    |
| `shared/appErrors.ts`                     | the executable `AppErrorCode` / message-key unions and client wire guards                                                                                                      |
| `convex/lib/errors.ts`                    | the one server `appError()` constructor; imports the shared contract                                                                                                           |
| `convex/lib/permissions.ts`               | `getCurrentProfile`, `requireProfile`, `requireActiveProfile`, `requireOnboarded`, `requireAppAdmin`, `requireActionUserId`, `requireProfileOf`                                |
| `convex/lib/userProfiles.ts`              | `newUserProfileDefaults` — the single complete insert shape for `userProfiles`                                                                                                 |
| `convex/lib/constants.ts`                 | provider validators, scan limits, cooldowns, callback path                                                                                                                     |
| `convex/lib/rateLimits.ts`                | named buckets                                                                                                                                                                  |
| `convex/schema.ts` + `convex/schema/*.ts` | tables (§7)                                                                                                                                                                    |
| `convex/user/queries.ts`                  | `currentUser`, `linkedAccounts`, `checkHandleAvailability`, `handleSuggestions`, `publicProfileByHandle`, `myEmails`                                                           |
| `convex/user/mutations.ts`                | `claimHandle`, `changeHandle`, `completeProfileStep`, `completeLedgerStep`, `setLocale`, `setPrimaryEmail`, `unlinkAccount`, `requestAccountDeletion`, `cancelAccountDeletion` |
| `convex/user/actions.ts`                  | `linkAccount`, `startEmailLink`, `confirmEmailLink` + the Apple internals                                                                                                      |
| `convex/user/deletion.ts`                 | `handOffLedgers`, `purgeUser`, `purgeExpiredAccounts` (all internal)                                                                                                           |
| `convex/legacy/queries.ts`                | `myLegacyCandidates`                                                                                                                                                           |
| `convex/legacy/mutations.ts`              | `claimLegacyAccount`, `skipLegacyClaim`                                                                                                                                        |
| `convex/legacy/internal.ts`               | `runClaim`, `reparentBatch`, `forceClaim`                                                                                                                                      |
| `convex/crons.ts`                         | nightly `purgeExpiredAccounts`, nightly `purgeStaleUnverifiedUsers`                                                                                                            |

### Shared (`shared/`) — imported by both `convex/` and `src/`, unit-tested

| path                                                                                         | role                                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `shared/authPolicy.ts`                                                                       | `shouldAutoLinkViaEmail`, `hasMatchingAccountEmails`, `isEmailOtpProvider` |
| `shared/email.ts`                                                                            | `normalizeEmail` — **byte-identical** to `scripts/migrate/lib/email.ts`    |
| `shared/username.ts`                                                                         | normalization, charset, reserved words, suggestions                        |
| `shared/onboarding.ts`                                                                       | `ONBOARDING_STEPS`, `nextOnboardingStep()`                                 |
| `__tests__/authPolicy.test.ts`, `__tests__/username.test.ts`, `__tests__/onboarding.test.ts` |                                                                            |

### Client (`src/`, `app/`)

| path                                                                           | role                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `app/_layout.tsx`                                                              | providers + `Stack.Protected` gate + splash control             |
| `app/(auth)/sign-in.tsx`, `sign-in-code.tsx`, `legacy-help.tsx`                |                                                                 |
| `app/(onboarding)/handle.tsx`, `profile.tsx`, `ledger.tsx`, `legacy-claim.tsx` |                                                                 |
| `app/(app)/…`                                                                  | the real app                                                    |
| `app/account/deleted.tsx`                                                      | grace-period restore screen                                     |
| `app/account/suspended.tsx`                                                    | restricted appeal/help + sign-out screen; no ledger data mounts |
| `app/lock.tsx`                                                                 | app-lock gate                                                   |
| `app/[handle].tsx`                                                             | public profile by handle                                        |
| `src/features/auth/config.ts`                                                  | env gates (`is*Enabled()`)                                      |
| `src/features/auth/useSocialSignIn.ts`                                         | the whole native-SDK layer                                      |
| `src/features/auth/useSession.ts`                                              | `SessionStage` state machine                                    |
| `src/features/lock/*`                                                          | `kdf.ts`, `lockStore.ts`, `useAppLock.ts`                       |
| `plugins/withKakaoProguard.js`                                                 | R8 rules (verbatim from note 08 §11.5)                          |

---

## 3. Provider matrix

Five providers. Four are `ConvexCredentials` (the native SDK does OAuth on-device; the server only ever
receives a token to verify — **there is no server-side OAuth redirect for Google/Kakao/Naver at all**).
The fifth is Convex Auth's `Email` provider.

### 3.0 Summary table

|                               | Google                                             | Apple                                                                    | Kakao                                                                                                        | Naver                                                                     | Email OTP                                      |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Convex provider id            | `google`                                           | `apple`                                                                  | `kakao`                                                                                                      | `naver`                                                                   | `bookoo-otp{,-ko,-ja,-zh,-id}`                 |
| Provider type                 | `credentials`                                      | `credentials`                                                            | `credentials`                                                                                                | `credentials`                                                             | `email`                                        |
| Native package                | `@react-native-google-signin/google-signin@16.1.4` | `expo-apple-authentication@~57.0.1` (iOS) / `expo-web-browser` (Android) | `@react-native-seoul/kakao-login@6.0.4`                                                                      | `@react-native-seoul/naver-login@5.0.1`                                   | none                                           |
| Client → server credential    | `{idToken, name?}`                                 | `{idToken, nonce?, authorizationCode?, name?}`                           | `{idToken, nonce, accessToken?, name?}`                                                                      | `{accessToken, name?}`                                                    | `{email}` then `{email, code}`                 |
| Server verification           | JWKS RS256 + `iss` + `aud`                         | JWKS RS256 + `iss` + `aud` (re-derived) + nonce-if-present               | JWKS + `iss` + `maxTokenAge 10m` + `aud` (hand-checked) + nonce-if-present, then `kapi.kakao.com/v2/user/me` | **none cryptographic** — spend the token on `openapi.naver.com/v1/nid/me` | sha256(code) lookup in `authVerificationCodes` |
| `providerAccountId`           | `payload.sub`                                      | `payload.sub`                                                            | `payload.sub`                                                                                                | `response.id`                                                             | the **normalized** email                       |
| Yields `emailVerified: true`? | **yes**, effectively always                        | **yes**, incl. private relay                                             | only if `accessToken` sent **and** `is_email_valid && is_email_verified`                                     | **never** (hard-coded `false`)                                            | **yes**, after the code verifies               |
| Auto-links by email?          | yes                                                | yes                                                                      | conditionally                                                                                                | **never**                                                                 | yes                                            |

### 3.1 Google

**Flow.** `GoogleSignin.configure({iosClientId, webClientId, scopes:['profile','email']})` once (module-level
`let googleConfigured = false` guard) → `hasPlayServices({showPlayServicesUpdateDialog:true})` → `signIn()` →
`response.data.idToken`. Cancellation: `isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED ||
e.code === statusCodes.IN_PROGRESS)`, plus `response.type === 'cancelled'`.

**Server verification** (`convex/lib/idToken.ts`):

```ts
const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
] as const;
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
// Module scope on purpose: jose caches keys in-memory per isolate and refetches on unknown `kid`.
const googleJwks = createRemoteJWKSet(GOOGLE_JWKS_URL);

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedIdentity> {
  const {payload} = await jwtVerify(idToken, googleJwks, {
    issuer: [...GOOGLE_ISSUERS],
    audience: googleAudiences(), // GOOGLE_IOS_CLIENT_ID ++ ANDROID ++ WEB, comma-split
  });
  if (typeof payload.sub !== 'string') {
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.google.noSub');
  }
  return {
    subject: payload.sub,
    email: asString(payload.email),
    emailVerified: asBoolean(payload.email_verified),
    name: asString(payload.name),
    picture: asString(payload.picture),
  };
}
```

**Profile fields back:** `sub`, `email`, `email_verified`, `name`, `picture`. No nonce check (Google's native
SDK does not expose one). Google is the anchor of the email-linking graph.

**Env / native config.**

- Client: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- Convex: `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID` (mirrors — the ID token's
  `aud` is the **web** client id on every platform, so that one is mandatory everywhere).
- iOS: `CFBundleURLTypes` must contain the _reversed_ iOS client id. Derived in `app.config.ts`, never typed twice:
  ```ts
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleReversedClientId = googleIosClientId
    ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
    : undefined;
  ```
  Plugin: `['@react-native-google-signin/google-signin', {iosUrlScheme: googleReversedClientId}]`, **mounted
  only when `googleReversedClientId` exists** (the plugin rejects a placeholder scheme).
- Android: the Android OAuth client id must be registered with the SHA-1 of both the debug and the EAS
  release signing certs, or `signIn()` returns `DEVELOPER_ERROR` with no useful message.

### 3.2 Apple

Two completely different client flows, one server verification.

**iOS.** `AppleAuthentication.signInAsync({requestedScopes:[FULL_NAME, EMAIL]})` → `{identityToken,
authorizationCode, fullName}`. No nonce is requested, so the token carries no `nonce` claim.
Cancel: `error.code === 'ERR_REQUEST_CANCELED'`.

**Android** (no native SDK; Apple refuses custom-scheme redirects):

```ts
const state = randomUUID(); // expo-crypto
const nonce = randomUUID();
const authorizeUrl =
  'https://appleid.apple.com/auth/authorize?' +
  new URLSearchParams({
    client_id: APPLE_WEB_CONFIG.serviceId, // Services ID, e.g. dev.hyo.bookoo.web
    redirect_uri: APPLE_WEB_CONFIG.redirectUri, // https://<slug>.convex.site/auth/apple/callback
    response_type: 'code id_token', // ID token arrives in the authorize response — no exchange on the critical path
    response_mode: 'form_post', // forced by asking for name/email
    scope: 'name email',
    state,
    nonce,
  }).toString();

const result = await WebBrowser.openAuthSessionAsync(
  authorizeUrl,
  'bookoo://apple-callback',
);
if (result.type !== 'success') throw new CancelledError();
// The callback puts everything in the FRAGMENT — URL.searchParams would be empty.
const params = new URLSearchParams(result.url.split('#')[1] ?? '');
if (params.get('error')) throw new CancelledError();
if (params.get('state') !== state)
  throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.state');
```

`convex/appleWeb.ts` forwards `id_token`, `code`, `state`, `user`, `error` from Apple's `form_post` body to a
**fixed literal** `bookoo://apple-callback` fragment. The target must be a literal — a request-chosen redirect
target would make this an open redirector. Use `URLSearchParams`, not `FormData` (`FormData` is not typed in
the Convex runtime).

**Server verification.**

```ts
const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJwks = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

export async function verifyAppleIdToken(
  idToken: string,
  expectedNonce: string | undefined,
): Promise<VerifiedAppleIdentity> {
  const audiences = appleAudiences(); // splitEnvList(APPLE_BUNDLE_ID) ++ splitEnvList(APPLE_SERVICE_ID)
  if (audiences.length === 0)
    throw appError(
      'PROVIDER_VERIFICATION_FAILED',
      'error.auth.apple.notConfigured',
    );

  const {payload} = await jwtVerify(idToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });
  if (typeof payload.sub !== 'string')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.noSub');

  // jose only proves SOME claimed aud is allowed. Re-derive by intersection so we know WHICH.
  const claimed = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const audience = claimed.find(
    (v): v is string => typeof v === 'string' && audiences.includes(v),
  );
  if (audience === undefined)
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.aud');

  // NONCE RULE: the TOKEN decides, never the argument. Keying on `expectedNonce` would let a
  // replayer skip the check by omitting the argument. iOS sends no nonce -> no claim -> valid.
  const appleNonce = asString(payload.nonce);
  if (appleNonce !== undefined && appleNonce !== expectedNonce) {
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.nonce');
  }

  return {
    subject: payload.sub,
    email: asString(payload.email),
    // Apple sends email_verified as the STRING "true" on some flows.
    emailVerified: asBoolean(payload.email_verified),
    name: undefined, // Apple never puts the name in the token
    audience,
  };
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}
```

**Profile fields back:** `sub`, `email` (possibly `…@privaterelay.appleid.com`), `email_verified`,
and **the full name exactly once, on the very first authorization**, outside the token:

- iOS: `credential.fullName` → Korean order, no separator:
  `[fullName?.familyName, fullName?.givenName].filter(Boolean).join('')`
- Android: the `user` form field, `{"name":{"firstName":…,"lastName":…}}` — JSON-parse it, join in the same
  order, and return `{}` on **any** malformation (a bad blob must never fail a sign-in).

That name is plumbed through the credential as `name` → `fallbackName` → `createAccount`.

**Env / native config.**

- Client: `EXPO_PUBLIC_APPLE_SERVICE_ID`, `EXPO_PUBLIC_CONVEX_SITE_URL`.
- Convex: `APPLE_BUNDLE_ID` (comma-separated list allowed), `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (full `.p8` PEM; literal `\n` accepted and un-escaped with
  `.replace(/\\n/g, '\n')`).
- `app.config.ts`: `ios.usesAppleSignIn: true` (adds the entitlement), plugin `'expo-apple-authentication'`.
- Android: `<data android:scheme="bookoo"/>` on `MainActivity` carries `bookoo://apple-callback`.
- Apple Developer portal: App ID with **Sign in with Apple**; a **Services ID** whose Return URL is exactly
  `https://<slug>.convex.site/auth/apple/callback`, character-for-character; a **Key** with Sign in with Apple
  enabled → the `.p8`.

Refresh-token acquisition and revocation: §12.4.

### 3.3 Kakao

**Flow.** `kakaoLogin({nonce})` with a freshly minted `nonce` per attempt. Requires
`@react-native-seoul/kakao-login >= 6.0.2` (Android) / `>= 6.0.3` (iOS) — **earlier versions drop the `nonce`
on the KakaoTalk app hand-off.** `token.idToken` can be `""` on iOS when OpenID Connect is not enabled on the
Kakao Developers app → treat empty as missing and surface a config error, not a login error.
Forward `accessToken` too, so the backend can ask Kakao about email verification.

**Cancellation is unreliable and that is accepted.** The Kakao bridge rejects _every_ failure with the same
`RNKakaoLogins` code, so the message is the only signal (`/cancel/i.test(error.message)`). On Android the
message comes from `ClientErrorCause.Cancelled`'s `@Description` read by reflection — which is why
`withKakaoProguard` must keep `RuntimeVisibleAnnotations`. On iOS it is missed always (`SdkError` is a bare
`enum: Error` with no `LocalizedError`). Consequence: a cancelled Kakao login sometimes shows a toast. Fine.

**Server verification** — two stages.

```ts
const KAKAO_ISSUER = 'https://kauth.kakao.com';
const kakaoJwks = createRemoteJWKSet(
  new URL('https://kauth.kakao.com/.well-known/jwks.json'),
);
const KAKAO_MAX_TOKEN_AGE_SECONDS = 10 * 60;

export async function verifyKakaoIdToken(
  idToken: string,
  expectedNonce: string | undefined,
): Promise<VerifiedIdentity> {
  // Signature, issuer, and AGE first. maxTokenAge is the ONLY replay bound on the Android
  // KakaoTalk hand-off path, which returns a token carrying no `nonce` at all.
  const {payload} = await jwtVerify(idToken, kakaoJwks, {
    issuer: KAKAO_ISSUER,
    maxTokenAge: KAKAO_MAX_TOKEN_AGE_SECONDS,
  });

  // `aud` checked by hand so the error can name the token's actual app key (masked).
  const allowed = kakaoAudiences(); // KAKAO_NATIVE_APP_KEY ∪ KAKAO_REST_API_KEY
  const claimed = claimedAudiences(payload.aud);
  const audience = claimed.find((v) => allowed.includes(v));
  if (audience === undefined) {
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.aud', {
      token: claimed.map(maskAppKey).join(','),
      server: allowed.map(maskAppKey).join(','),
    });
  }
  if (typeof payload.sub !== 'string')
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.noSub');

  // jose has no nonce option. TOKEN decides, same rule as Apple.
  const nonce = asString(payload.nonce);
  if (nonce !== undefined && nonce !== expectedNonce) {
    throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.kakao.nonce');
  }

  return {
    subject: payload.sub,
    email: asString(payload.email),
    emailVerified: false, // ← Kakao's ID token has NO email_verified claim. Upgrade only via /v2/user/me.
    name: asString(payload.nickname),
    picture: asString(payload.picture),
  };
}

/** maskAppKey('abcd…wxyz') -> 'abcd…wxyz'; <=8 chars -> '(len N)'. Never leaks a full key. */
function maskAppKey(v: string): string {
  return v.length <= 8
    ? `(len ${v.length})`
    : `${v.slice(0, 4)}…${v.slice(-4)}`;
}
```

Then, only if the client also sent `accessToken`:

```
GET https://kapi.kakao.com/v2/user/me
Authorization: Bearer <accessToken>
```

```ts
export async function fetchKakaoProfile(
  accessToken: string,
  expectedSubject: string, // MANDATORY — see below
): Promise<KakaoProfile>;
```

Three details that are all load-bearing:

1. `body.id` is a **JSON number** here but a **string** in the ID token's `sub` → `String(body.id)`.
2. **`expectedSubject` is mandatory.** Kakao's `/v2/user/me` does not report the `app_id` the access token was
   minted for. A foreign app's token resolves to a _different_ `id`, so a mismatch must throw. This is the only
   thing that stops a foreign token from upgrading someone's `emailVerified`.
3. Email verification needs **both** flags:
   `emailVerified = account?.is_email_valid === true && account?.is_email_verified === true`
   (`is_email_valid` goes false once the address is taken over by another Kakao account).

**Profile fields back:** request only verified `email` when offered plus optional `nickname` and
`profile_image_url`. D4 rejects gender, birthday, birth year, phone, friends, and marketing scopes: none is
needed to run a shared ledger. A declined optional item is absent and does not block sign-in.

**Env / native config.**

- Client: `EXPO_PUBLIC_KAKAO_APP_KEY` (native app key), `EXPO_PUBLIC_KAKAO_REST_API_KEY`.
- Convex: `KAKAO_NATIVE_APP_KEY` (**must equal** `EXPO_PUBLIC_KAKAO_APP_KEY` — it is the ID token `aud`),
  `KAKAO_REST_API_KEY`.
- Plugin `['@react-native-seoul/kakao-login', {kakaoAppKey}]`, **gated on the same env var as the JS gate**.
  This is the single most important config lesson from note 08: a placeholder once got baked into
  `Info.plist` at prebuild while the real key landed later in `.env.local`, so the JS gate said "ready" and
  every authorize went out as the placeholder.
- Generated iOS: `KAKAO_APP_KEY` in `Info.plist`, `CFBundleURLSchemes: ["kakao<APPKEY>"]`,
  `LSApplicationQueriesSchemes += ['kakaokompassauth','storykompassauth','kakaolink']`, and an
  `AppDelegate.swift` branch `if kakao_login.RNKakaoLogins.isKakaoTalkLoginUrl(url) { … }`.
- Generated Android: `com.kakao.sdk.auth.AuthCodeHandlerActivity` with
  `<data android:host="oauth" android:scheme="kakao<APPKEY>"/>`, plus `kakao_app_key` in `strings.xml`.
- `expo-build-properties` must add the Kakao maven repo:
  `extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/']`.
- `plugins/withKakaoProguard.js` is **required** with `enableMinifyInReleaseBuilds: true` (Kakao uses Gson
  reflection and Retrofit 2.9, which lacks R8 full-mode rules).
- Kakao Developers console: **OpenID Connect must be toggled ON**; enable only the minimum profile/email
  scopes above; leave gender, birthday, birth year, phone, friends, and marketing disabled. Register the
  Android release key hash and iOS bundle id.

### 3.4 Naver

**Flow.** `NaverLogin.initialize({consumerKey, consumerSecret, appName:'BooKoo', serviceUrlSchemeIOS:'bookoonaver'})`
once → `NaverLogin.login()`. Naver reports failure in the **resolved value**, not a rejection:
`!result.isSuccess && result.failureResponse?.isCancel`. Only `{accessToken}` is sent to the server.

**Server verification — there is none, cryptographically.** Naver has no OIDC ID token. The only way to learn
who owns a bare OAuth access token is to spend it:

```
GET https://openapi.naver.com/v1/nid/me
Authorization: Bearer <accessToken>
```

Success requires `body.resultcode === '00'`. Failure bodies are inconsistent: the documented
`{errorCode, errorMessage}` and also a gateway `{status, error, path}` — fall back to the HTTP status code.
`subject = String(body.response.id)`.

**Copy this comment verbatim into `convex/lib/naverIdentity.ts`:**

> The token is not proven to have been issued to _our_ Naver app. Neither `oauth2.0/authorize`,
> `oauth2.0/token`, nor the profile endpoint reports the `client_id` a token was minted for, so a token from
> somebody else's Naver app is accepted here. Two properties keep that short of account takeover:
>
> 1. `response.id` is documented as unique **per application**, so a foreign app's token yields an id that
>    cannot match one already stored for us.
> 2. **`emailVerified` stays `false`**, which keeps the account resolver from linking this identity into an
>    existing account by email.
>
> **Never flip (2) to true.**

**Profile fields back:** `id`, untrusted `email`, `name ?? nickname`, `profile_image` → `picture`, and
`nickname`. D4 discards gender, birthday, birth year, and mobile even if Naver returns them.

**Env / native config.**

- Client: `EXPO_PUBLIC_NAVER_CLIENT_ID`, `EXPO_PUBLIC_NAVER_CLIENT_SECRET`.
- Convex: **none.** The backend never learns the client id, which is exactly the gap documented above.
- Plugin `['@react-native-seoul/naver-login', {urlScheme: 'bookoonaver'}]`.
- ⚠️ **The Naver URL scheme must be dedicated, never `bookoo`.** The plugin rewrites the generated
  `AppDelegate.application(_:open:options:)` so its branch runs _before_ `RCTLinkingManager`, swallowing
  **every** incoming URL on that scheme. Sharing `bookoo://` would cost every deep link in the app —
  including `bookoo://apple-callback` and the ledger invite links.
- ⚠️ **Naver's "secret" is not a secret.** The native SDK needs it on-device and `EXPO_PUBLIC_*` is inlined
  into the shipped JS bundle. The backend must never treat it as proof of app identity.
- Generated iOS: `LSApplicationQueriesSchemes += ['naversearchapp','naversearchthirdlogin']`,
  `CFBundleURLTypes += {CFBundleURLName:'naver', CFBundleURLSchemes:['bookoonaver']}`.
- Android: no manifest changes (the SDK handles it internally).

### 3.5 Email OTP

Five provider ids, one per supported locale (note 04: `en`, `ko`, `ja`, `zh`, `id`), because
`sendVerificationRequest` receives no locale argument:

```ts
// convex/lib/constants.ts
export const EMAIL_OTP_PROVIDER_IDS = {
  en: 'bookoo-otp',
  ko: 'bookoo-otp-ko',
  ja: 'bookoo-otp-ja',
  zh: 'bookoo-otp-zh',
  id: 'bookoo-otp-id',
} as const satisfies Record<SupportedLocale, string>;

export type EmailOtpProviderId =
  (typeof EMAIL_OTP_PROVIDER_IDS)[SupportedLocale];
```

```ts
// convex/otp/ResendOTP.ts
import {Email} from '@convex-dev/auth/providers/Email';
import type {GenericActionCtxWithAuthConfig} from '@convex-dev/auth/server';
import {alphabet, generateRandomString} from 'oslo/crypto';
import type {DataModel} from '../_generated/dataModel';
import {normalizeEmail} from '../../shared/email';

const OTP_MAX_AGE_SECONDS = 10 * 60; // 10 min. Martie uses 15; 10 is enough and halves the guess window.

const createOtpProvider = (id: EmailOtpProviderId, locale: SupportedLocale) =>
  Email<DataModel>({
    id,
    apiKey: process.env.AUTH_RESEND_KEY,
    maxAge: OTP_MAX_AGE_SECONDS,

    async generateVerificationToken(): Promise<string> {
      return generateRandomString(8, alphabet('0-9')); // 8 numeric digits
    },

    /**
     * Tightened vs. the library default (which only checks
     * `account.providerAccountId === params.email`): we also require the address to be
     * already normalized, so `Hyo@X.com` can never mint a second account row.
     */
    async authorize(params, account): Promise<void> {
      const email = typeof params.email === 'string' ? params.email : undefined;
      if (email === undefined || normalizeEmail(email) !== email) {
        throw appError('INVALID_INPUT', 'error.auth.otp.email');
      }
      if (account.providerAccountId !== email) {
        throw appError('INVALID_INPUT', 'error.auth.otp.mismatch');
      }
    },

    async sendVerificationRequest(
      {identifier: email, provider, token},
      ctx?: GenericActionCtxWithAuthConfig<DataModel>,
    ): Promise<void> {
      if (ctx === undefined)
        throw new Error('OTP provider requires an action ctx');
      // Request-side rate limit — the library only limits FAILED verifications. See §15.
      await ctx.runMutation(internal.otp.limits.consumeOtpRequest, {email});
      if (await tryApplyFixedOtp(ctx, email, token, provider.id)) return;
      const template = emailTemplates[locale];
      await sendResendEmail(provider.apiKey, {
        from: `BooKoo <${fromAddress()}>`,
        to: [email],
        subject: template.subject,
        text: template.text(token),
        html: template.html(token),
      });
    },
  });

export const BooKooOtpEn = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.en, 'en');
export const BooKooOtpKo = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.ko, 'ko');
export const BooKooOtpJa = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.ja, 'ja');
export const BooKooOtpZh = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.zh, 'zh');
export const BooKooOtpId = createOtpProvider(EMAIL_OTP_PROVIDER_IDS.id, 'id');
```

**Client, two steps** (`app/(auth)/sign-in.tsx` → `sign-in-code.tsx`):

```ts
const email = normalizeEmail(raw); // shared/email.ts — MUST run before signIn
if (email === undefined) return setError('signIn.invalidEmail');
await signIn(EMAIL_OTP_PROVIDER_IDS[locale], {email});
router.push({
  pathname: '/(auth)/sign-in-code',
  params: {email, providerId: EMAIL_OTP_PROVIDER_IDS[locale]},
});

// step 2
const {signingIn} = await signIn(providerId, {email, code});
if (!signingIn) setError('signInCode.wrongCode');
```

Input hygiene copied from Martie: `code` is `text.replace(/[^0-9]/g, '')`, submit guarded by an
`isSubmittingRef` **and** a `loading` state, `MAX_CODE_LENGTH = 8` matched before submitting, and on success
`loading` is deliberately left `true` so the auth-state effect owns the navigation.

**Four `@convex-dev/auth` behaviours you must design around [lib-verified]:**

1. **The `users` row and the `authAccounts` row are created at the _request_ step, not at verification.**
   `createVerificationCodeImpl` calls `upsertUserAndAccount` before `sendVerificationRequest` runs.
   Consequences: (a) anyone can create unbounded `users` rows by requesting codes → §15 rate limit + §12.7
   nightly purge; (b) `afterUserCreatedOrUpdated` fires with `type === 'email'` for an _unverified_ address →
   **we must not create a `userProfiles` row in that case** (§6.1).
2. **Email→user linking happens at the request step**, via
   `uniqueUserWithVerifiedEmail(email)` = the library-owned `users.email` index +
   `.filter(neq(emailVerificationTime, undefined))`
   `.take(2)`, returning a row only when **exactly one** verified match exists. Two verified rows with the same
   address permanently disable linking — which is why I2 forbids ever writing an unverified `users.email`, and
   why the manual-merge path clears the loser's email (§6.5).
3. **`emailVerificationTime` is stamped only at verification**, from
   `profile: {email: emailVerified, emailVerified: true}`. That also patches `authAccounts.emailVerified`, so
   _"which account proved this address"_ is queryable — use it, do not recompute it.
4. **`authRateLimits` counts failed verifications only** (default 10/hour/identifier, continuously refilling).
   Set `signIn: {maxFailedAttempsPerHour: 5}` (note the library's typo in the key name). It does **not** limit
   requests; that is ours to add.

**Residual brute-force analysis.** `verifyCodeOnly` looks up the code hash in a **global** index
(`authVerificationCodes.code`, a library-owned index), so in principle a guesser could hit somebody else's live code. But the
`Email` provider's `authorize` then rejects unless `params.email` matches that account, so an attacker must
know the target address — collapsing the attack back to the per-identifier limit. 5 guesses/hour against 10⁸
is negligible. Keep `authorize` non-`undefined`; a magic-link-style `authorize: undefined` would remove
exactly this protection.

**Env.** Convex: `AUTH_RESEND_KEY`, `ENVIRONMENT`, `APP_REVIEW_FIXED_OTP_EMAILS`, and
`APP_REVIEW_FIXED_OTP_CODE`. An exact `ENVIRONMENT=development` enables the local-QA code `68686868`
for every normalized email and skips delivery. `production` can never enter that development path;
its separately allow-listed app-review code remains independent. Sender domain must be verified in
Resend for production; `onboarding@resend.dev` works only for non-production. Convex Auth resolves a
code through the globally unique `authVerificationCodes.code` index, so two outstanding rows cannot
share one fixed hash. Applying a fixed code deletes older rows with that exact fixed hash before
patching the newest request. The newest request therefore wins; E2E must request and verify A before
requesting B. Random OTP rows and unrelated fixed-code hashes are untouched, and collision cleanup
fails closed above the 64-row repair cap.

**`tryApplyFixedOtp` warning.** It reaches into `@convex-dev/auth`'s private `authAccounts` /
`authVerificationCodes` tables to rewrite the stored hash for whitelisted reviewer addresses. It **will break
on an auth-library upgrade**. Guard it: wrap the whole thing in `try/catch`, and if it throws, fall through to
sending a real email rather than failing sign-in. Add a CI check that fails if
`APP_REVIEW_FIXED_OTP_EMAILS` is set while `ENVIRONMENT === 'production'` and the address is not on the
allow-list file. The upgrade check must also confirm that verification still uses a globally unique code
lookup; otherwise remove or redesign the same-hash collision cleanup instead of keeping private-table logic
by inertia.

### 3.6 The single verification boundary

Shared by sign-in **and** account linking, so a credential accepted for linking gets identical
signature/issuer/audience/nonce/profile checks.

```ts
// convex/lib/idToken.ts
export interface VerifiedIdentity {
  subject: string; // provider `sub` — NEVER the email
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  nickname?: string;
}

export interface VerifiedAppleIdentity extends VerifiedIdentity {
  audience: string; // the aud the token was actually minted for
}

export interface VerifiedSocialCredentials {
  identity: VerifiedIdentity;
  fallbackName?: string;
  apple?: {audience: string; authorizationCode?: string};
}

export async function verifySocialCredentials(
  provider: SocialProvider,
  credentials: SocialCredentials,
): Promise<VerifiedSocialCredentials>;
```

Credential keys read (every value arrives as `unknown` and is validated):

| provider | required      | optional                             |
| -------- | ------------- | ------------------------------------ |
| `apple`  | `idToken`     | `nonce`, `authorizationCode`, `name` |
| `google` | `idToken`     | `name`                               |
| `kakao`  | `idToken`     | `nonce`, `accessToken`, `name`       |
| `naver`  | `accessToken` | `name`                               |

Helpers: `requireCredentialString(value, field)`, `optionalCredentialString` (trims; empty → `undefined`),
`splitEnvList` (comma-split, trim, drop empties).

---

## 4. `app.config.ts` — the auth-relevant blocks

```ts
import type {ConfigContext, ExpoConfig} from '@expo/config';
import {version} from './package.json';

const BUNDLE_ID = 'dev.hyo.bookoo';
const APP_DOMAIN = process.env.EXPO_PUBLIC_APP_DOMAIN ?? 'bookoo.hyo.dev';
type ExpoPlugin = NonNullable<ExpoConfig['plugins']>[number];

const kakaoAppKey = process.env.EXPO_PUBLIC_KAKAO_APP_KEY;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleReversedClientId = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

export default ({config}: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'BooKoo',
  slug: 'bookoo',
  scheme: 'bookoo', // deep links + bookoo://apple-callback + invite links
  version,
  userInterfaceStyle: 'automatic', // dark/light, DECISIONS.md §5
  experiments: {typedRoutes: true},
  plugins: [
    'expo-router',
    'expo-asset',
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
        faceIDPermission:
          'BooKoo가 저장된 로그인 정보를 보호하기 위해 Face ID를 사용합니다.',
      },
    ],
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'BooKoo 앱 잠금을 해제하는 데 Face ID를 사용합니다.',
      },
    ],
    'expo-web-browser',
    'expo-apple-authentication',
    './plugins/withKakaoProguard',
    // Gate the PLUGIN on the SAME env var as the JS gate, or they drift and you ship a
    // broken authorize call with a placeholder key baked into the native project.
    ...(kakaoAppKey
      ? ([
          ['@react-native-seoul/kakao-login', {kakaoAppKey}],
        ] satisfies ExpoPlugin[])
      : []),
    ['@react-native-seoul/naver-login', {urlScheme: 'bookoonaver'}], // dedicated, never 'bookoo'
    ...(googleReversedClientId
      ? ([
          [
            '@react-native-google-signin/google-signin',
            {iosUrlScheme: googleReversedClientId},
          ],
        ] satisfies ExpoPlugin[])
      : []),
    [
      'expo-build-properties',
      {
        ios: {deploymentTarget: '16.4', useFrameworks: 'static'},
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          kotlinVersion: '2.1.20',
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          extraMavenRepos: [
            'https://devrepo.kakao.com/nexus/content/groups/public/',
          ], // REQUIRED by Kakao
        },
      },
    ],
  ],
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true, // ← BooKoo needs tablet layouts (FightingHows had this false)
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${APP_DOMAIN}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: ['ko', 'en', 'ja', 'zh-Hans', 'id'],
      UIBackgroundModes: ['remote-notification'],
      ...(googleReversedClientId
        ? {CFBundleURLTypes: [{CFBundleURLSchemes: [googleReversedClientId]}]}
        : {}),
    },
  },
  android: {
    package: BUNDLE_ID,
    userInterfaceStyle: 'automatic',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: {scheme: 'https', host: APP_DOMAIN, pathPrefix: '/invite'},
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  extra: {eas: {projectId: process.env.EAS_PROJECT_ID}},
  runtimeVersion: {policy: 'appVersion'},
});
```

**What prebuild will generate** (predict it, then diff it — if it differs, a plugin version changed):

`ios/BooKoo/Info.plist`

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict><key>CFBundleURLSchemes</key><array><string>com.googleusercontent.apps.NNNN-xxxx</string></array></dict>
  <dict><key>CFBundleURLName</key><string>naver</string>
        <key>CFBundleURLSchemes</key><array><string>bookoonaver</string></array></dict>
  <dict><key>CFBundleURLSchemes</key><array><string>kakao&lt;APPKEY&gt;</string></array></dict>
</array>
<key>KAKAO_APP_KEY</key><string>&lt;APPKEY&gt;</string>
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>naversearchapp</string><string>naversearchthirdlogin</string>
  <string>kakaokompassauth</string><string>storykompassauth</string><string>kakaolink</string>
</array>
<key>NSFaceIDUsageDescription</key><string>BooKoo 앱 잠금을 해제하는 데 Face ID를 사용합니다.</string>
```

`ios/BooKoo/AppDelegate.swift` — note the order; the Naver branch **replaces** the
`super.application(...) || RCTLinkingManager...` line, so it runs before expo-router's linking:

```swift
public override func application(_ app: UIApplication, open url: URL,
                                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
  if kakao_login.RNKakaoLogins.isKakaoTalkLoginUrl(url) { return kakao_login.RNKakaoLogins.handleOpen(url) }
  if (url.scheme == "bookoonaver") {
    return NaverThirdPartyLoginConnection.getSharedInstance().application(app, open: url, options: options)
  }
  return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
}
```

`android/app/src/main/AndroidManifest.xml`

```xml
<activity android:name=".MainActivity" android:launchMode="singleTask">
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="bookoo"/>                    <!-- bookoo://apple-callback + invites -->
  </intent-filter>
</activity>
<activity android:name="com.kakao.sdk.auth.AuthCodeHandlerActivity" android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:host="oauth" android:scheme="kakao&lt;APPKEY&gt;"/>
  </intent-filter>
</activity>
<!-- from expo-local-authentication -->
<uses-permission android:name="android.permission.USE_BIOMETRIC"/>
<!-- from expo-secure-store -->
<application android:fullBackupContent="@xml/secure_store_backup_rules"
             android:dataExtractionRules="@xml/secure_store_data_extraction_rules" />
```

`plugins/withKakaoProguard.js` is copied verbatim from note 08 §11.5. Beyond keeping the Kakao SDK working
under R8, its `-keepattributes Runtime*Annotations` line is what makes Kakao's Android cancel-detection work.

---

## 5. Environment variable inventory

### 5.1 Client (`.env.local`, `EXPO_PUBLIC_*` are inlined into the shipped JS bundle)

| var                                    | what                                                                              | source                                       |
| -------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| `CONVEX_DEPLOYMENT`                    | CLI only, not public                                                              | `bunx convex dev`                            |
| `EXPO_PUBLIC_CONVEX_URL`               | `https://<slug>.convex.cloud`                                                     | `bunx convex dev`                            |
| `EXPO_PUBLIC_CONVEX_SITE_URL`          | `https://<slug>.convex.site` — HTTP actions host; builds the Apple `redirect_uri` | Convex dashboard                             |
| `EXPO_PUBLIC_APP_DOMAIN`               | verified Universal/App Link host; `bookoo.hyo.dev`                                | DNS / app-link hosting                       |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`     | iOS OAuth client id; **also derives the reversed URL scheme**                     | Google Cloud Console → Credentials → iOS     |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Android OAuth client id (needs signing SHA-1)                                     | same, type Android                           |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`     | **the ID token's `aud`** — mandatory on every platform                            | same, type Web                               |
| `EXPO_PUBLIC_KAKAO_APP_KEY`            | Kakao **native** app key; must equal Convex `KAKAO_NATIVE_APP_KEY`                | Kakao Developers → 앱 키 → 네이티브 앱 키    |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY`       | some OIDC paths stamp this as `aud`                                               | same page → REST API 키                      |
| `EXPO_PUBLIC_NAVER_CLIENT_ID`          | Naver Client ID                                                                   | Naver Developers                             |
| `EXPO_PUBLIC_NAVER_CLIENT_SECRET`      | **not actually secret** — ships in the bundle                                     | same                                         |
| `EXPO_PUBLIC_APPLE_SERVICE_ID`         | Services ID for the Android web flow, e.g. `dev.hyo.bookoo.web`                   | Apple Developer → Identifiers → Services IDs |
| `EAS_PROJECT_ID`                       |                                                                                   | `eas init`                                   |

### 5.2 Convex deployment (`bunx convex env set KEY VALUE`)

| var                                                                          | what                                                                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `APPLE_BUNDLE_ID`                                                            | iOS native `aud`, e.g. `dev.hyo.bookoo`. Comma-separated list allowed.                                     |
| `APPLE_SERVICE_ID`                                                           | Services ID = `aud` of every web-flow token. Also decides whether `redirect_uri` is sent on code exchange. |
| `APPLE_TEAM_ID`                                                              | 10-char Team ID; the client-secret JWT's `iss`                                                             |
| `APPLE_KEY_ID`                                                               | Key ID of the Sign in with Apple `.p8`; the JWT header `kid`                                               |
| `APPLE_PRIVATE_KEY`                                                          | full `.p8` PEM; literal `\n` accepted                                                                      |
| `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` / `GOOGLE_WEB_CLIENT_ID` | mirrors of the `EXPO_PUBLIC_*` values                                                                      |
| `KAKAO_NATIVE_APP_KEY` / `KAKAO_REST_API_KEY`                                | mirrors                                                                                                    |
| `AUTH_RESEND_KEY`                                                            | Resend API key                                                                                             |
| `RESEND_FROM_EMAIL`                                                          | e.g. `bookoo@hyo.dev`; falls back to `onboarding@resend.dev` when non-production                           |
| `ENVIRONMENT`                                                                | exact `development` enables the all-email `68686868` QA OTP; `production` disables it                      |
| `APP_REVIEW_FIXED_OTP_EMAILS` / `APP_REVIEW_FIXED_OTP_CODE`                  | store-reviewer bypass                                                                                      |
| `LEGACY_CLAIM_DORMANCY_DAYS`                                                 | optional extra-proof threshold, default `1095` (§11.6)                                                     |
| `CONVEX_SITE_URL`                                                            | provided automatically by Convex                                                                           |
| `JWKS`, `JWT_PRIVATE_KEY`                                                    | generated + set automatically by `bunx @convex-dev/auth`                                                   |

**Naver has no Convex-side env var at all** — the profile call needs only the user's access token, and the
client id/secret never leave the device. That is precisely the gap documented in §3.4.

**Drop from the FightingHows set:** `BOOTSTRAP_ADMIN_EMAILS` and the whole `PENDING`/`ADMIN`/`SUSPENDED`
role machine. BooKoo is a consumer ledger app; roles are **per-ledger** (`ledgerMembers`), not global.

---

## 6. Account model

### 6.1 How Convex Auth keys accounts

`@convex-dev/auth` owns five tables (`authTables`). The two that matter:

```ts
// library-owned, do not redefine
users: defineTable({
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
}).index('email', ['email']).index('phone', ['phone']),

authAccounts: defineTable({
  userId: v.id('users'),
  provider: v.string(),              // 'google' | 'apple' | 'kakao' | 'naver' | 'bookoo-otp*' | 'email-link'
  providerAccountId: v.string(),     // the provider `sub`, or the normalized email for OTP
  secret: v.optional(v.string()),
  emailVerified: v.optional(v.string()),   // the address THIS account proved
  phoneVerified: v.optional(v.string()),
})
  .index('userIdAndProvider', ['userId', 'provider'])
  .index('providerAndAccountId', ['provider', 'providerAccountId']),
```

**The key is `(provider, providerAccountId)`, and `providerAccountId` is always the provider's `sub`.**
Header comment to copy into `convex/auth.ts`:

> Accounts are keyed by the provider `sub` rather than the email — Apple's private relay emails can change,
> but `sub` is stable for the lifetime of the Apple ID ↔ app relationship. Email is a _linking hint_, never an
> identity.

The one exception is the `Email` provider, where `providerAccountId` **is** the email — which is fine,
because that account's whole meaning is "someone proved control of this mailbox".

`convexAuth` callbacks:

```ts
// convex/auth.ts
export const {auth, signIn, signOut, store, isAuthenticated} = convexAuth({
  providers: [
    Apple,
    Google,
    Kakao,
    Naver,
    BooKooOtpEn,
    BooKooOtpKo,
    BooKooOtpJa,
    BooKooOtpZh,
    BooKooOtpId,
  ],
  signIn: {maxFailedAttempsPerHour: 5}, // library key name, typo included
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args): Promise<void> {
      // [lib-verified] `type === 'email'` fires at OTP REQUEST time, before the code is
      // verified. Creating a profile here would let anyone mint a profile row for any
      // address they can type. Wait for `type === 'verification'`.
      if (args.type === 'email' || args.type === 'phone') return;

      const db = typedDb(ctx);
      const userId = args.userId as Id<'users'>;
      const user = await db.get('users', userId);

      const existing = await db
        .query('userProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .first();

      if (existing === null) {
        await db.insert('userProfiles', newUserProfileDefaults(userId, user));
      }

      // Legacy claim probe — only on a provider-verified email. See §11.
      await maybeStartLegacyClaim(
        ctx,
        userId,
        user?.email,
        user?.emailVerificationTime,
      );
    },

    /**
     * A hard-purged account must not be able to open a session.
     * A SOFT-deleted account inside its grace period MAY sign in — that is how the
     * restore screen is reachable. Everything except `/account/deleted` is gated by
     * `requireActiveProfile`.
     */
    async beforeSessionCreation(ctx, {userId}): Promise<void> {
      const profile = await typedDb(ctx)
        .query('userProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId as Id<'users'>))
        .first();

      if (profile?.purgedAt !== undefined) {
        // MUST be a ConvexError: production redacts any other error's message and the
        // sign-in screen would just show "Server Error".
        throw appError('ACCOUNT_DELETED', 'error.auth.accountPurged');
      }
      if (profile?.appRole === 'SUSPENDED') {
        // No authenticated app session is created. The sign-in adapter narrows this payload and
        // opens the public, data-free /account/suspended help surface.
        throw appError('ACCOUNT_SUSPENDED', 'error.account.suspended');
      }
    },
  },
});

/** Auth callbacks receive GenericMutationCtx<AnyDataModel>; narrow once, here. */
function typedDb(ctx: {db: unknown}): MutationCtx['db'] {
  return ctx.db as MutationCtx['db'];
}
```

`newUserProfileDefaults` returns
`Omit<Doc<'userProfiles'>, '_id' | '_creationTime'>` against the authoritative schema in
`SCHEMA.md` §3.1. It owns every required default (`bio`/`phone: ''`, uppercase `appearance`, locale
from the shared `DEFAULT_LOCALE`—currently `'en'`—plus its currency/timezone/week-start fallback,
all notification flags, `appRole`, placeholder/blob-migration state,
and both timestamps). No callback or mutation may spell a second `userProfiles` insert object; adding a
required schema field must therefore become a compile-time failure in this one helper.

### 6.2 The shared account resolver

```ts
type SocialProvider = 'apple' | 'google' | 'kakao' | 'naver';

async function authorizeWithIdentity(
  ctx: AuthorizeCtx,
  provider: SocialProvider,
  identity: VerifiedIdentity,
  fallbackName: string | undefined,
): Promise<{userId: Id<'users'>}> {
  const existing = await retrieveAccount<DataModel>(ctx, {
    provider,
    account: {id: identity.subject},
  }).catch(() => null);

  if (existing !== null) {
    // Existing account: the create/update callback does NOT run, so anything that must be
    // re-applied on every sign-in has to happen here.
    await refreshProviderFields(
      ctx,
      existing.user._id as Id<'users'>,
      identity,
    );
    return {userId: existing.user._id as Id<'users'>};
  }

  const verifiedEmail = shouldAutoLinkViaEmail(identity)
    ? identity.email
    : undefined;
  const displayName =
    fallbackName ??
    identity.name ??
    identity.nickname ??
    verifiedEmail?.split('@')[0] ??
    '';

  const created = await createAccount<DataModel>(ctx, {
    provider,
    account: {id: identity.subject},
    profile: {
      // I2: an UNVERIFIED address never reaches `users.email`. Passing one would create a
      // second `users` row sharing the address, and `uniqueUserWithVerifiedEmail`'s
      // `.take(2)`/`length === 1` rule would then be one bad row away from breaking every
      // future merge for that address.
      ...(verifiedEmail !== undefined
        ? {email: verifiedEmail, emailVerified: true}
        : {}),
      name: displayName === '' ? undefined : displayName,
      image: identity.picture,
    },
    // Safe: we only link when the provider itself asserts the email is verified AND the
    // token was audience-bound to our app, so a second provider cannot claim someone
    // else's account.
    shouldLinkViaEmail: verifiedEmail !== undefined,
  });

  const userId = created.user._id as Id<'users'>;
  await refreshProviderFields(ctx, userId, identity);
  return {userId};
}
```

`refreshProviderFields` is an `internalMutation` call that (a) upserts `userEmails` when
`identity.emailVerified` and (b) fills `userProfiles.displayName` / `avatarUrl` from optional nickname/avatar
**only where they are still empty**. Gender, birthday, birth year, and mobile are discarded even if a
provider unexpectedly returns them; a later provider never overwrites a name the user chose.

Passing `emailVerified: true` (rather than FightingHows' `emailVerificationTime: Date.now()`) is deliberate
[lib-verified]: the library strips `emailVerified` out of the profile, stamps
`users.emailVerificationTime` itself, **and** patches `authAccounts.emailVerified = email`. That last write is
the per-account audit record of which provider proved which address; FightingHows' variant silently skips it.

The four provider definitions are ~10 lines each and byte-identical apart from the id:

```ts
const Google = ConvexCredentials<DataModel>({
  id: 'google',
  authorize: async (credentials, ctx) => {
    const verified = await verifySocialCredentials('google', credentials);
    return authorizeWithIdentity(
      ctx,
      'google',
      verified.identity,
      verified.fallbackName,
    );
  },
});

const Apple = ConvexCredentials<DataModel>({
  id: 'apple',
  authorize: async (credentials, ctx) => {
    const verified = await verifySocialCredentials('apple', credentials);
    const apple = verified.apple;
    if (apple === undefined)
      throw appError('PROVIDER_VERIFICATION_FAILED', 'error.auth.apple.parse');
    const result = await authorizeWithIdentity(
      ctx,
      'apple',
      verified.identity,
      verified.fallbackName,
    );
    // `apple.audience` came out of the VERIFIED token — never a client hint.
    await scheduleAppleCodeExchange(
      ctx,
      result.userId,
      apple.audience,
      apple.authorizationCode,
    );
    return result;
  },
});
```

### 6.3 The exact merge-by-email rule

```ts
// shared/authPolicy.ts
export interface EmailIdentity {
  email?: string;
  emailVerified: boolean;
}

/**
 * The ONLY predicate that may enable an automatic account merge.
 *
 * `emailVerified` is set by the verification layer and means two things at once:
 *   1. the provider asserted the address is verified, AND
 *   2. the assertion arrived inside a token we proved was minted for OUR app
 *      (audience-bound: Google `aud`, Apple `aud`, Kakao `aud` + `expectedSubject`).
 *
 * Naver satisfies neither and is hard-coded to false at the source.
 */
export function shouldAutoLinkViaEmail(identity: EmailIdentity): boolean {
  return identity.emailVerified && (identity.email?.trim().length ?? 0) > 0;
}
```

**Truth table.**

| provider             | source of `emailVerified`                                                                                                             | auto-links?                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Google               | `email_verified` claim in an `aud`-bound ID token                                                                                     | **yes** (effectively always true)          |
| Apple                | `email_verified` claim (may be the string `"true"`) in an `aud`-bound ID token                                                        | **yes**, private relay included            |
| Kakao                | `is_email_valid && is_email_verified` from `/v2/user/me`, **only if** the client sent `accessToken` **and** `expectedSubject` matched | yes when both flags hold, otherwise **no** |
| Naver                | hard-coded `false`                                                                                                                    | **never**                                  |
| Email OTP            | the code verified                                                                                                                     | **yes**                                    |
| `email-link` (§11.4) | our own code verified                                                                                                                 | **yes**                                    |

So Google + Apple + verified-Kakao + OTP on one address collapse into a single `users` row automatically.
Naver and consent-less Kakao always create a fresh row and must be joined manually.

**The attack this prevents.** Suppose auto-link fired on an _unverified_ email. An attacker creates a Naver
account (or a Kakao account with the email consent screen filled in by hand) whose profile email is
`victim@gmail.com`. Naver never checks that the attacker controls that mailbox — nobody does. On sign-in,
`shouldLinkViaEmail` would find the victim's existing `users` row and attach the attacker's
`authAccounts` row to it. The attacker now has a permanent, first-class login credential for the victim's
account and full read/write on every shared ledger the victim belongs to. Requiring provider-asserted
verification means the provider itself proved mailbox control before we will believe the address.

There is a second, quieter attack that I2 closes: **namespace poisoning**. If we wrote unverified addresses to
`users.email`, an attacker could pre-create a `users` row holding `victim@gmail.com`. When the victim later
signs in with Google, `uniqueUserWithVerifiedEmail` filters on `emailVerificationTime !== undefined` so it
would ignore the attacker's row — but the victim's new row now _also_ carries that address, and any later
condition that reads the library-owned `users.email` index without the verification filter (our own code,
a migration script, an
admin tool) sees two rows and has to guess. Never write it.

**Naver's manual path.** A Naver identity is joined to an existing account only through
`api.user.actions.linkAccount` while already signed in as the target user — which proves possession of _both_
identities — and additionally requires `hasMatchingAccountEmails` (§6.5). Two proofs, not one.

### 6.4 Scenario: one person, four providers, one email

Timeline for `user@example.com`:

1. **Google** first. No account. `emailVerified: true` → `createAccount(shouldLinkViaEmail: true)` →
   no existing verified row → **new** `users` row `U1` with `email = user@example.com`,
   `emailVerificationTime = t1`. `authAccounts(google, sub_g) → U1`, `emailVerified = user@example.com`.
   `afterUserCreatedOrUpdated` inserts `userProfiles(U1, onboardingStep: 'handle')`.
2. **Apple** later, same address (user is not using private relay). `retrieveAccount(apple, sub_a)` → null.
   `emailVerified: true` → `uniqueUserWithVerifiedEmail('user@example.com')` returns exactly `U1` →
   `authAccounts(apple, sub_a) → U1`. No new profile: the callback's `existing !== null` branch returns early.
3. **Kakao** with the email consent granted, `accessToken` forwarded, `is_email_valid &&
is_email_verified` → same merge as (2).
   **Kakao without consent** → `emailVerified: false`, `email` absent from the profile entirely →
   **new** `users` row `U2`, new profile, `onboardingStep: 'handle'`. The user now has two accounts and must
   join them from 설정 → 연결된 계정 (§6.5). The sign-in screen shows a hint when a fresh Kakao account is
   created and the device previously held a session: _"이미 다른 방법으로 가입하셨나요? 설정 → 연결된 계정에서
   합칠 수 있어요."_
4. **Naver** → always a fresh `users` row `U3`, always manual.
5. **Email OTP** on the same address → the request step finds `U1` verified and attaches
   `authAccounts('bookoo-otp-ko', 'user@example.com') → U1`; verification stamps
   `authAccounts.emailVerified`.

End state (happy path): one `users` row, one `userProfiles` row, one handle, five `authAccounts` rows.
`linkedAccounts` collapses the five OTP provider ids into one logical `email` method via
`isEmailOtpProvider()`.

### 6.5 Manual linking

```ts
// convex/user/actions.ts
export const linkAccount = action({
  args: {
    provider: socialProviderValidator,
    credentials: v.object({
      idToken: v.optional(v.string()),
      accessToken: v.optional(v.string()),
      nonce: v.optional(v.string()),
      authorizationCode: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  },
  returns: v.object({merged: v.boolean()}),
  handler: async (ctx, args): Promise<{merged: boolean}> => {
    const userId = await requireActionUserId(ctx);

    // Verify FIRST (network), then mutate. On failure: log the real error server-side and
    // throw a generic ConvexError, so provider internals never reach the client.
    const verified = await verifySocialCredentials(
      args.provider,
      args.credentials,
    );

    const result = await ctx.runMutation(
      internal.user.actions.linkVerifiedAccount,
      {
        userId,
        provider: args.provider,
        providerAccountId: verified.identity.subject,
        credentialEmail: verified.identity.emailVerified
          ? verified.identity.email
          : undefined,
      },
    );

    if (result.invalidatedUserId !== null) {
      await invalidateSessions(ctx, {userId: result.invalidatedUserId});
    }
    if (
      args.provider === 'apple' &&
      verified.apple?.authorizationCode !== undefined &&
      appleClientSecretConfig() !== null
    ) {
      await ctx.scheduler.runAfter(0, internal.user.actions.exchangeAppleCode, {
        userId,
        clientId: verified.apple.audience,
        authorizationCode: verified.apple.authorizationCode,
      });
    }
    return {merged: result.merged};
  },
});
```

```ts
export const linkVerifiedAccount = internalMutation({
  args: {
    userId: v.id('users'),
    provider: socialProviderValidator,
    providerAccountId: v.string(),
    credentialEmail: v.optional(v.string()),
  },
  returns: v.object({
    merged: v.boolean(),
    invalidatedUserId: v.union(v.id('users'), v.null()),
  }),
  handler: async (ctx, args) => {
    /* decision tree below */
  },
});
```

Decision tree — order matters:

1. `requireProfileOf(ctx, args.userId)` — re-check the profile still exists and is not soft-deleted. Closes
   the "account deleted while we were waiting on the provider's network" gap.
2. Look up the library-owned `authAccounts.providerAndAccountId(provider, providerAccountId).take(2)`.
3. **Idempotency**: every matching row already belongs to `userId` → `{merged:false, invalidatedUserId:null}`.
   Retrying a verified request must not create a second row.
4. `> 1` other owner → `LINK_AMBIGUOUS`, `error.link.duplicate` (data corruption; needs a human).
5. Exactly one other owner → require **all** of:
   - the other profile exists and `deletedAt === undefined`;
   - `hasMatchingAccountEmails(current.email, other.email, credentialEmail)`;
   - the other account is _disposable_ — `onboardingStep !== 'done'` **and** eleven indexed `.first()` probes
     all return `null`: `ledgerMembers`, `ledgers`(as owner), `ledgerItems`(as author), `itemComments`,
     `itemPhotos`, `ledgerInvites`(as inviter), `pushTokens`, `userHandles`(held), `userEmails`(other than
     the shared one), `appleRefreshTokens`, `legacyUsers`(claimed).

   If disposable → **auto-merge** (`mergeDisposableProfile`). If not → `LINK_CONFLICT`,
   `error.link.bothHaveData` — two accounts with real ledger history are never merged automatically; the user
   must move data or pick one.

6. Otherwise: if the current user already has a row for this provider → `LINK_CONFLICT`,
   `error.link.unlinkFirst`. **One account per provider per user.**
7. `ctx.db.insert('authAccounts', {userId, provider, providerAccountId, emailVerified: credentialEmail})`.

```ts
// shared/authPolicy.ts
/**
 * Linking already proves possession of both provider identities. Email still has to match
 * on both user rows so a provider account owned by somebody else can never be absorbed.
 */
export function hasMatchingAccountEmails(
  currentEmailValue: string | undefined,
  otherEmailValue: string | undefined,
  credentialEmailValue: string | undefined,
): boolean {
  const current = normalizedEmail(currentEmailValue);
  const other = normalizedEmail(otherEmailValue);
  const credential = normalizedEmail(credentialEmailValue);
  return (
    current.length > 0 &&
    current === other &&
    (credential.length === 0 || credential === current)
  );
}
```

`mergeDisposableProfile`:

- `.take(LINKED_ACCOUNT_SCAN_LIMIT)` (= 20) on both users' `authAccounts` via `userIdAndProvider`; hitting the
  cap → refuse rather than half-merge.
- Any provider present in both sets → refuse, naming the provider via `SOCIAL_PROVIDER_LABELS`.
- `ctx.db.patch(account._id, {userId: canonical})` for each disposable account row.
- **Clear the disposable `users` row's email**: `{email: undefined, emailVerificationTime: undefined}`.
  Keeping a second verified `users.email` would make `uniqueUserWithVerifiedEmail`'s `length === 1` rule fail
  and refuse **every** later email-based link for that address [lib-verified].
- Soft-delete the disposable profile and release its handle.
- Return `invalidatedUserId` so the caller can `invalidateSessions` on the absorbed user.

### 6.6 A provider that returns no email

Three distinct sub-cases, one mechanism.

| case                                             | what arrives                                                    | what we do                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple private relay**                          | `email = xxxx@privaterelay.appleid.com`, `emailVerified = true` | Treat it as a **real, verified** address: link on it, store it in `userEmails` with `source:'APPLE'`. It genuinely routes mail. But it will never match a legacy Firebase address, so the legacy claim silently does not fire → §11.4's "다른 이메일 추가" flow.                                            |
| **Apple "이메일 가리기" + relay disabled later** | address changes between sign-ins                                | `sub` is stable, identity unaffected. New address is added to `userEmails`; the primary is **not** changed automatically (§6.7).                                                                                                                                                                            |
| **Kakao without email consent**                  | `email` absent entirely                                         | Nothing is written to `users.email`. The account is standalone. Onboarding still works (handle + display name do not need an email). At the end of onboarding, and again in 설정, we surface a non-blocking card: _"이메일을 등록하면 다른 기기·다른 로그인 수단에서도 같은 계정을 쓸 수 있어요."_ → §11.4. |
| **Naver**                                        | email may be present but is never trusted                       | Same as Kakao-no-consent.                                                                                                                                                                                                                                                                                   |

The invariant that makes this tractable: **an account with no verified email is fully functional but
unmergeable.** Nothing in BooKoo requires an email except (a) merging providers and (b) claiming legacy data.
Both are opt-in flows that ask for one when needed.

### 6.7 An email that changes

`users.email` is the _primary_ address and exists only to drive `uniqueUserWithVerifiedEmail`. The authority
for "which addresses has this user proven" is our own table:

The normative table definition is `SCHEMA.md` §3.1.1. In particular, email-source literals are
uppercase, shared timestamp/soft-delete/legacy fields are present, and the two live-row indexes are
`by_emailNormalized_deletedAt` and `by_userId_deletedAt`. This document owns the flow below, not a
second schema copy.

Rules:

1. **A provider reports a new address for a known `sub`.** Add a `userEmails` row (verified). Do **not**
   touch `users.email`. Changing the primary silently rewires every future `shouldLinkViaEmail` merge and can
   strand the user's other providers; it is an explicit action (`setPrimaryEmail`) with a confirmation.
2. **A provider stops reporting an address.** Do nothing on the first sign-in — providers omit fields for
   consent and transient reasons. Soft-delete the row only when the user removes it in 설정.
3. **The address now belongs to somebody else** (recycled mailbox, the classic Korean case of a dropped
   university address). Detected inside the linking mutation: `by_emailNormalized_deletedAt(email,
undefined).take(2)`. **The most recent verification wins the row**; the previous holder's row is
   soft-deleted, they are notified by push + email, and if it was their primary, their primary is cleared.
   Their `sub`-keyed logins keep working. **Ledgers never move.**
4. **Two users racing to verify the same address.** Impossible: the check-then-write happens in one mutation
   against a narrow index range, so Convex's OCC aborts and re-runs the loser, which then sees the winner's
   row. Identical argument to §10.3.
5. `setPrimaryEmail` additionally patches `users.email` + `users.emailVerificationTime`, because that is what
   the library reads. It refuses if the target row is not `verifiedAt`-stamped and owned by the caller.

---

## 7. Schema

The single normative definitions are in `SCHEMA.md`: `userProfiles` / `userPresence` (§3.1),
`userEmails` (§3.1.1), `userHandles` (§3.2), auth support (§3.3), and migration staging (§3.18).
This document deliberately carries no `defineTable` copy. All auth functions use SCHEMA's exact field
names and its mechanically derivable index grammar:

```
indexName = 'by_' + fields.join('_')
```

That means, for example, `by_userId_releasedAt`, `by_userId_clientId`,
`by_emailNormalized_claimState`, `by_userId_createdAt`, and `by_event_createdAt`. Soft-delete
discriminators remain inside the index; they are never applied with `.filter()`.

### 7.1 Constants

```ts
// convex/lib/constants.ts
export const socialProviderValidator = v.union(
  v.literal('apple'),
  v.literal('google'),
  v.literal('kakao'),
  v.literal('naver'),
);
export type SocialProvider = Infer<typeof socialProviderValidator>;

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  kakao: '카카오',
  naver: '네이버',
};

export const APPLE_CALLBACK_PATH = '/auth/apple/callback';

export const LINKED_ACCOUNT_SCAN_LIMIT = 20;
export const APPLE_TOKEN_SCAN_LIMIT = 8;
export const HANDLE_HISTORY_LIMIT = 50;
export const LEDGER_HANDOFF_BATCH = 25;
export const LEGACY_REPARENT_BATCH = 100;
export const PURGE_BATCH = 20;

export const HANDLE_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const HANDLE_RELEASE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const EMAIL_LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_LINK_MAX_ATTEMPTS = 5;

// I8 — asserted by __tests__/constants.test.ts
export const _assertGraceShorterThanRelease: true = (DELETION_GRACE_MS <
  HANDLE_RELEASE_COOLDOWN_MS) as true;
```

### 7.2 Errors

`shared/appErrors.ts` is the only `AppErrorCode`, message-key, payload, and client wire-guard source.
`error-handling.md` owns the full groups and presentation matrix. The server wrapper is deliberately tiny:

```ts
// convex/lib/errors.ts
import {ConvexError} from 'convex/values';
import type {
  AppErrorCode,
  AppErrorMessageKey,
  AppErrorParam,
  AppErrorPayload,
} from '../../shared/appErrors';

export function appError(
  code: AppErrorCode,
  messageKey: AppErrorMessageKey,
  params?: Readonly<Record<string, AppErrorParam>>,
): ConvexError<AppErrorPayload> {
  return new ConvexError({
    code,
    messageKey,
    ...(params !== undefined ? {params} : {}),
  });
}
```

There is no `authError`. `invalidInput(messageKey, params)` may remain a convenience wrapper only when it
delegates to `appError('INVALID_INPUT', ...)`; money and category paths use their more specific codes.

### 7.3 Permission gates

```ts
// convex/lib/permissions.ts
type Ctx = QueryCtx | MutationCtx;

/** null when signed out, when the profile is missing, or when the account is PURGED. */
export async function getCurrentProfile(
  ctx: Ctx,
): Promise<Doc<'userProfiles'> | null>;

/** Session only. Usable during onboarding and during the deletion grace period. */
export async function requireProfile(ctx: Ctx): Promise<Doc<'userProfiles'>>;

/** requireProfile + rejects `appRole === 'SUSPENDED'` with ACCOUNT_SUSPENDED, then `deletedAt` with
 * ACCOUNT_DELETED. The gate for 99% of functions and the live-session suspension cutoff. */
export async function requireActiveProfile(
  ctx: Ctx,
): Promise<Doc<'userProfiles'>>;

/** requireActiveProfile + rejects onboardingStep !== 'done' with ONBOARDING_REQUIRED. */
export async function requireOnboarded(ctx: Ctx): Promise<Doc<'userProfiles'>>;

/** requireOnboarded + appRole === 'ADMIN'; otherwise FORBIDDEN/error.forbidden. */
export async function requireAppAdmin(ctx: Ctx): Promise<Doc<'userProfiles'>>;

/** The only gate an action can run itself (actions have ctx.auth but no db). */
export async function requireActionUserId(ctx: ActionCtx): Promise<Id<'users'>>;

/** Paired with requireActionUserId inside the mutation the action hands off to. */
export async function requireProfileOf(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'userProfiles'>>;
```

Three rules encoded here, all inherited from note 09 §4.1:

1. **Seven entry points, no free-form checks anywhere else.**
2. **Purged == signed out.** One line in `getCurrentProfile` makes it true across every function.
3. **Codes are a closed union the client narrows on**, so `ACCOUNT_DELETED` and `ONBOARDING_REQUIRED` route to
   two different screens without string matching.

---

## 8. Convex function inventory (complete signatures)

Every function carries a `returns:` validator — 100%, not FightingHows' 41%.

### 8.1 `convex/user/queries.ts`

```ts
/**
 * THE root subscription. Kept deliberately small (I10): every field here re-renders the
 * router gate on write, for the whole session. No counters, no lastSeenAt, no timestamps
 * that tick.
 */
export const currentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id('users'),
      handle: v.union(v.string(), v.null()),
      displayName: v.string(),
      avatar: v.union(v.string(), v.null()), // resolved storage URL or provider URL
      locale: supportedLocaleValidator,
      appearance: appearanceValidator,
      preferredCurrency: v.string(),
      onboardingStep: onboardingStepValidator,
      legacyClaimState: legacyClaimStateValidator,
      /** true only for the restricted router gate; no ledger route may mount. */
      suspended: v.boolean(),
      /** epoch ms; null when not pending deletion. Drives /account/deleted. */
      purgeAfter: v.union(v.number(), v.null()),
      /** true when the user has at least one verified email — drives the "add email" nudge. */
      hasVerifiedEmail: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    /* one by_userId read + one storage URL resolve */
  },
});

export const linkedAccounts = query({
  args: {},
  returns: v.array(
    v.object({
      method: v.union(socialProviderValidator, v.literal('email')),
      /** For 'email': the address. For social: undefined. */
      label: v.optional(v.string()),
      /** false when this is the only usable sign-in method (unlink is then disabled). */
      removable: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    /* userIdAndProvider .take(LINKED_ACCOUNT_SCAN_LIMIT) */
  },
});

export const myEmails = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('userEmails'),
      email: v.string(),
      isPrimary: v.boolean(),
      source: v.union(
        v.literal('OTP'),
        v.literal('GOOGLE'),
        v.literal('APPLE'),
        v.literal('KAKAO'),
        v.literal('LINK'),
      ),
      verifiedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    /* by_userId_deletedAt(userId, undefined).take(10) */
  },
});

export const checkHandleAvailability = query({
  args: {handle: v.string(), now: v.number()},
  returns: v.union(
    v.object({status: v.literal('AVAILABLE')}),
    v.object({status: v.literal('INVALID'), reason: handleRejectionValidator}),
    v.object({status: v.literal('RESERVED')}),
    v.object({status: v.literal('COOLDOWN')}),
    v.object({status: v.literal('TAKEN'), suggestions: v.array(v.string())}),
  ),
  handler: async (ctx, args) => {
    /* §10.4 */
  },
});

export const handleSuggestions = query({
  args: {seed: v.string(), count: v.optional(v.number()), now: v.number()},
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    /* ≤12 indexed .eq() probes, first 5 free */
  },
});

export const publicProfileByHandle = query({
  args: {handle: v.string(), now: v.number()},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id('users'),
      handle: v.string(),
      displayName: v.string(),
      avatar: v.union(v.string(), v.null()),
      /** true when handleUpdatedAt is within RECENT_RENAME_BADGE_MS — anti-impersonation UI. */
      recentlyRenamed: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    /* userProfiles.by_handleKey — ONE indexed read, no join */
  },
});
```

### 8.2 `convex/user/mutations.ts`

```ts
export const claimHandle = mutation({args: {handle: v.string()}, returns: v.null(), handler: /* §10.3 */});
export const changeHandle = mutation({args: {handle: v.string()}, returns: v.null(), handler: /* §10.6 */});

export const completeProfileStep = mutation({
  args: {
    displayName: v.string(),
    avatarStorageId: v.optional(v.id('_storage')),
    locale: supportedLocaleValidator,
    preferredCurrency: v.string(),
  },
  returns: v.object({onboardingStep: onboardingStepValidator}),
  handler: /* §9.4 */,
});

export const completeLedgerStep = mutation({
  args: {skipped: v.boolean()},
  returns: v.object({onboardingStep: onboardingStepValidator}),
  handler: /* §9.4 */,
});

export const setLocale = mutation({args: {locale: supportedLocaleValidator}, returns: v.null()});
export const setAppearance = mutation({args: {appearance: appearanceValidator}, returns: v.null()});

export const setPrimaryEmail = mutation({
  args: {userEmailId: v.id('userEmails')},
  returns: v.null(),
  handler: /* §6.7 rule 5 */,
});

export const removeEmail = mutation({args: {userEmailId: v.id('userEmails')}, returns: v.null()});

export const unlinkAccount = mutation({
  args: {method: v.union(socialProviderValidator, v.literal('email'))},
  returns: v.null(),
  handler: /* §12.2 */,
});

export const requestAccountDeletion = mutation({
  args: {reason: v.optional(v.string())},
  returns: v.object({purgeAfter: v.number()}),
  handler: /* §12.4 */,
});

export const cancelAccountDeletion = mutation({args: {}, returns: v.null(), handler: /* §12.5 */});
```

### 8.3 `convex/user/actions.ts`

```ts
export const linkAccount = action({ /* §6.5 */ });

export const startEmailLink = action({
  args: {email: v.string(), locale: supportedLocaleValidator},
  returns: v.object({expiresAt: v.number()}),
  handler: /* §11.4 */,
});

export const confirmEmailLink = action({
  args: {email: v.string(), code: v.string()},
  returns: v.object({legacyClaimStarted: v.boolean()}),
  handler: /* §11.4 */,
});

// ---- internal ----
export const linkVerifiedAccount = internalMutation({ /* §6.5 */ });
export const refreshProviderFields = internalMutation({
  args: {
    userId: v.id('users'),
    email: v.optional(v.string()),
    emailVerified: v.boolean(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
    nickname: v.optional(v.string()),
  },
  returns: v.null(),
});
export const exchangeAppleCode = internalAction({
  args: {userId: v.id('users'), clientId: v.string(), authorizationCode: v.string()},
  returns: v.null(),
});
export const saveAppleRefreshToken = internalMutation({
  args: {userId: v.id('users'), clientId: v.string(), refreshToken: v.string()},
  returns: v.null(),
});
export const listAppleRefreshTokens = internalQuery({
  args: {userId: v.id('users')},
  returns: v.array(v.object({
    _id: v.id('appleRefreshTokens'), clientId: v.string(), refreshToken: v.string(),
  })),
});
export const dropAppleRefreshTokens = internalMutation({
  args: {ids: v.array(v.id('appleRefreshTokens'))},
  returns: v.null(),
});
export const revokeAppleTokens = internalAction({args: {userId: v.id('users')}, returns: v.null()});
```

### 8.4 `convex/user/deletion.ts` (all internal)

```ts
export const handOffLedgers = internalMutation({
  args: {userId: v.id('users'), cursor: v.optional(v.string())},
  returns: v.null(),
});
export const purgeExpiredAccounts = internalMutation({
  args: {},
  returns: v.null(),
});
export const purgeUser = internalMutation({
  args: {
    userId: v.id('users'),
    cursor: v.optional(v.string()),
    table: v.optional(v.string()),
  },
  returns: v.null(),
});
export const purgeStaleUnverifiedUsers = internalMutation({
  args: {},
  returns: v.null(),
});
```

### 8.5 `convex/legacy/*`

```ts
export const myLegacyCandidates = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('legacyUsers'),
      displayName: v.union(v.string(), v.null()),
      providers: v.array(v.string()),
      /** Month precision only — never reveal another person's exact activity. */
      createdMonth: v.string(), // 'YYYY-MM'
      ledgerCount: v.number(),
    }),
  ),
});

export const claimLegacyAccount = mutation({
  args: {legacyUserIds: v.array(v.id('legacyUsers'))},
  returns: v.object({scheduled: v.number()}),
});

export const skipLegacyClaim = mutation({args: {}, returns: v.null()});

// ---- internal ----
export const runClaim = internalMutation({
  args: {legacyUserId: v.id('legacyUsers'), userId: v.id('users')},
  returns: v.null(),
});
export const reparentBatch = internalMutation({
  args: {
    legacyUserId: v.id('legacyUsers'),
    placeholderUserId: v.id('users'),
    userId: v.id('users'),
    table: v.string(),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
});
export const forceClaim = internalMutation({
  args: {
    legacyUid: v.string(),
    targetUserId: v.id('users'),
    operatorUserId: v.id('users'),
    approverUserId: v.id('users'),
    ticketRef: v.string(),
    approvalRef: v.string(),
  },
  returns: v.null(),
});
```

### 8.6 `convex/crons.ts`

`SCHEMA.md` §6.1 is the only cron registry. Its 20:00 UTC `purge accounts` registration calls the
account-purge handler above, and its 23:00 UTC `purge stale unverified` registration calls the stale-user
handler. Auth must not instantiate a second `cronJobs()` list.

---

## 9. First-run onboarding

### 9.0 The tutorial is not an onboarding state

`legacy-feature-contracts.md` §6 owns the legacy three-slide tutorial. It is a non-blocking
`react-native-pager-view` hero inside `(auth)/index.tsx`: provider/email actions are always reachable,
and there is no tutorial route, `onboardingStep`, MMKV “seen” flag, or server round trip. A returning
signed-out user may view it again. Keeping it out of the state machine prevents device-local chrome from
blocking account recovery or an invite deep link.

The same sign-in route renders three separate D4 rows: affirmative Terms acceptance, Privacy Notice
acknowledgement, and 14+ attestation, with the versioned Terms/Privacy links. Account finalization validates
and records their current hashes in `legalEvents`. Missing production URLs block release. Optional marketing
is never pre-checked or bundled, and push permission remains the contextual post-ledger flow in
`notifications-push.md`, not an auth checkbox.

### 9.1 The state machine

```
                    ┌──────────────────────────────────────────────┐
   cold start ──►   │  loading                                     │
                    │  authIsLoading || (authed && profile===undef) │
                    └──────────────┬───────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │ !isAuthenticated         │ authenticated            │
        ▼                          ▼                          │
   ┌──────────┐            profile === null                    │
   │signed-out│  ──────►   'profile-missing' ──► void signOut()│
   └──────────┘                                                │
                                   │ profile !== null          │
                                   ▼                           │
                        suspended? ───────────yes──► suspended         → /account/suspended
                                   │ no
                                   ▼
                        purgeAfter !== null? ──yes──► pending-deletion  → /account/deleted
                                   │ no
                                   ▼
                        onboardingStep switch:
                          'handle'  → /(onboarding)/handle    (BLOCKING)
                          'profile' → /(onboarding)/profile   (skippable)
                          'ledger'  → /(onboarding)/ledger    (skippable)
                          'legacy'  → /(onboarding)/legacy-claim (only when ambiguous)
                          'done'    → app-lock gate → /(app)
```

```ts
// src/features/auth/useSession.ts
export type SessionStage =
  | 'loading'
  | 'signed-out'
  | 'profile-missing' // session outlived its profile — must NOT fold into 'loading',
  // or the splash never hides
  | 'suspended'
  | 'pending-deletion'
  | 'onboarding'
  | 'locked'
  | 'ready';

export interface Session {
  stage: SessionStage;
  onboardingStep: OnboardingStep | null;
  user: CurrentUser | null;
}

export function useSession(): Session;
```

Order of checks is exactly the order above; `profile-missing` **must** be a distinct stage.

### 9.2 Where the state lives — and why it is not fully derived

`userProfiles.onboardingStep` is **stored**, not derived. The reasoning, step by step:

| step                                  | derivable?                           | verdict                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| handle                                | yes — `profile.handle === undefined` | Store it anyway, but the stored value is _redundant with_ the derived one and a startup assertion checks they agree. Deriving alone would be fine here.                                                                  |
| profile (name/avatar/locale/currency) | **no**                               | A user who deliberately keeps the provider-supplied name would be re-prompted on every launch forever. Needs an explicit "I answered this" fact.                                                                         |
| ledger                                | **no**                               | A user who later leaves every ledger would be dragged back into onboarding. Also, `count(ledgerMembers)` on the root subscription violates I10 — it would invalidate the router gate on every membership write anywhere. |
| legacy                                | **no**                               | Reached only when the claim probe found >1 candidate; that is a server-side discovery, not a client-visible fact.                                                                                                        |

So: **one stored enum, advanced only by server mutations, never by the client's own reckoning.**
`onboardingCompletedAt` is stamped when the step reaches `'done'` and exists for analytics and for the
"welcome back" copy — the router reads `onboardingStep`, not the timestamp.

```ts
// shared/onboarding.ts — pure, unit-tested, imported by both sides
export const ONBOARDING_STEPS = [
  'handle',
  'profile',
  'ledger',
  'legacy',
  'done',
] as const;

export interface OnboardingFacts {
  hasHandle: boolean;
  profileStepDone: boolean;
  ledgerStepDone: boolean;
  legacyClaimState: LegacyClaimState;
}

/** The single source of truth for step ordering. The server calls this after every step mutation. */
export function nextOnboardingStep(facts: OnboardingFacts): OnboardingStep {
  if (!facts.hasHandle) return 'handle';
  if (!facts.profileStepDone) return 'profile';
  if (facts.legacyClaimState === 'ambiguous') return 'legacy';
  if (!facts.ledgerStepDone) return 'ledger';
  return 'done';
}
```

Note the ordering choice: **legacy comes before ledger**. Someone with legacy data does not want to be asked
to create a fresh ledger and then discover their eight-year-old ledgers appearing behind it.

`profileStepDone` / `ledgerStepDone` are not separate columns — they are implied by
`ONBOARDING_STEPS.indexOf(profile.onboardingStep) > ONBOARDING_STEPS.indexOf(step)`. One column, no drift.

### 9.3 Router gating (expo-router, declarative)

`Stack.Protected` exists in expo-router 57 (`ProtectedProps = {guard: boolean; children?: ReactNode}`).
It is strictly better than the imperative `useSegments()` + `router.replace()` pattern for this job: a guarded
screen is **never mounted**, so there is no frame in which the wrong screen paints.

```tsx
// app/_layout.tsx (the gate portion)
function AuthGate(): React.ReactElement | null {
  const {stage, onboardingStep} = useSession();
  const {ready: fontsReady} = useAppFonts();

  useEffect(() => {
    if (stage !== 'loading' && fontsReady) void SplashScreen.hideAsync();
  }, [stage, fontsReady]);

  // Splash is still up. Rendering ANY navigator here is what causes the sign-in flash.
  if (stage === 'loading' || !fontsReady) return null;

  return (
    <Stack screenOptions={rootScreenOptions}>
      {/* Order matters: when a guard flips false, expo-router falls back to the first
          still-mounted screen, so the most-restrictive states are declared first. */}
      <Stack.Protected guard={stage === 'signed-out'}>
        <Stack.Screen name="(auth)" options={{headerShown: false}} />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'suspended'}>
        <Stack.Screen
          name="account/suspended"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'pending-deletion'}>
        <Stack.Screen
          name="account/deleted"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'onboarding'}>
        <Stack.Screen
          name="(onboarding)"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'locked'}>
        <Stack.Screen
          name="lock"
          options={{headerShown: false, gestureEnabled: false}}
        />
      </Stack.Protected>

      <Stack.Protected guard={stage === 'ready'}>
        <Stack.Screen name="(app)" options={{headerShown: false}} />
        <Stack.Screen name="[handle]" options={{presentation: 'card'}} />
      </Stack.Protected>
    </Stack>
  );
}
```

`gestureEnabled: false` on onboarding, lock, and the deletion screen: a swipe-back out of a blocking gate is
exactly the bug the legacy `Lock.tsx` had (`goBack()` from the root route, with nothing to go back to).

Inside `app/(onboarding)/_layout.tsx`, the same mechanism selects the step:

```tsx
export default function OnboardingLayout(): React.ReactElement {
  const {onboardingStep} = useSession();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'fade',
      }}
    >
      <Stack.Protected guard={onboardingStep === 'handle'}>
        <Stack.Screen name="handle" />
      </Stack.Protected>
      <Stack.Protected guard={onboardingStep === 'profile'}>
        <Stack.Screen name="profile" />
      </Stack.Protected>
      <Stack.Protected guard={onboardingStep === 'legacy'}>
        <Stack.Screen name="legacy-claim" />
      </Stack.Protected>
      <Stack.Protected guard={onboardingStep === 'ledger'}>
        <Stack.Screen name="ledger" />
      </Stack.Protected>
    </Stack>
  );
}
```

**Server-side enforcement, because a client gate is decoration.** Every non-onboarding function calls
`requireOnboarded(ctx)`, which throws `ONBOARDING_REQUIRED`. The onboarding mutations themselves call
`requireProfile` (session only) so they work before any other gate opens. There is no code path where a
handle-less account can write a ledger entry.

### 9.4 Surviving app kill mid-flow

The whole design is: **each step commits to the server before the UI advances.**

- `claimHandle` writes `userHandles` + `userProfiles.handle`/`handleKey` **and** advances `onboardingStep`,
  all in one mutation. Kill the app after the mutation commits → the next launch reads `onboardingStep:
'profile'` from the server and resumes there. Kill it before → nothing happened; the handle screen reopens
  with the text field empty.
- `completeProfileStep` and `completeLedgerStep` do the same:

```ts
export const completeLedgerStep = mutation({
  args: {skipped: v.boolean()},
  returns: v.object({onboardingStep: onboardingStepValidator}),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const step = nextOnboardingStep({
      hasHandle: profile.handle !== undefined,
      profileStepDone: true,
      ledgerStepDone: true,
      legacyClaimState: profile.legacyClaimState,
    });
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      onboardingStep: step,
      ...(step === 'done'
        ? {onboardingCompletedAt: profile.onboardingCompletedAt ?? now}
        : {}),
      updatedAt: now,
    });
    if (args.skipped) {
      await ctx.db.insert('authAudit', {
        userId: profile.userId,
        event: 'handle_claimed', // → replace with 'onboarding_ledger_skipped'
        detail: {step: 'ledger'},
        createdAt: now,
      });
    }
    return {onboardingStep: step};
  },
});
```

- The **only** local state is the in-progress text in a `TextInput`, which is deliberately not persisted:
  restoring a half-typed handle after a crash is worse UX than an empty, focused field.
- The `(onboarding)` group is `gestureEnabled: false` and has no back button on `handle`, so there is no
  client state to lose.
- If a step mutation throws (`HANDLE_TAKEN` because someone won the race in the last 300 ms), the screen stays,
  shows the error inline, and repopulates suggestions. No navigation happened, so nothing to unwind.

### 9.5 What each step actually asks

| step      | asks                                                               | pre-filled from                                                                                                                                                       | skippable                                              |
| --------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `handle`  | `@handle`                                                          | `suggestHandles(providerName ?? emailLocalPart)` — first available candidate                                                                                          | **no**                                                 |
| `profile` | display name, avatar, language, default currency                   | provider `name`/`picture`; `expo-localization.getLocales()[0]` → locale; note 04's locale→currency table (`ko`→`KRW`, `ja`→`JPY`, `zh`→`CNY`, `id`→`IDR`, `en`→`USD`) | yes ("나중에") — the profile step is still marked done |
| `legacy`  | "이 계정들이 본인 것인가요?"                                       | `myLegacyCandidates`                                                                                                                                                  | yes → `skipLegacyClaim`                                |
| `ledger`  | create a ledger (name + currency) **or** paste/open an invite link | the display name → `"{name}의 가계부"`                                                                                                                                | yes                                                    |

The `ledger` step is where the deep-link invite lands: opening `bookoo://invite/<token>` while
`onboardingStep === 'ledger'` completes the step by joining, which is exactly the flow `DECISIONS.md §1`
asks for (invite link → immediate join, replacing the legacy `invites`/`requests` double index).

---

## 10. The unique handle system (finalized)

### 10.1 Charset, length, normalization

**BooKoo: 3–20 characters, `[a-z0-9._]`, must start and end alphanumeric, no consecutive separators.**

Compared to the majors: Instagram 1–30 `[a-z0-9._]`; GitHub 1–39 alphanumeric + single hyphens; X 4–15
`[A-Za-z0-9_]`. Reasons for our numbers: 20 fits a mobile list row without truncating; `.` and `_` are the two
conventions Korean users actually type; `-` is excluded so `hyo-1` never reads as a URL slug suffix.

```ts
// shared/username.ts — pure, zero-dependency, imported by convex/ AND src/
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

const HANDLE_BODY = /^[a-z0-9._]+$/;
const HANDLE_EDGE = /^[a-z0-9]$/;
const CONSECUTIVE_SEPARATORS = /[._]{2}/;

export type HandleRejection =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'BAD_CHARSET'
  | 'BAD_EDGE'
  | 'DOUBLE_SEPARATOR'
  | 'RESERVED';

/**
 * The one normalization function. `handleKey` is ALWAYS the output of this.
 *
 * NFKC first: it folds fullwidth/compatibility forms ("ｈｙｏ" -> "hyo", "ⅰ" -> "i") so a
 * visually identical string cannot claim a second slot. Anything still outside the ASCII
 * charset after folding is REJECTED, not transliterated — silent transliteration would let
 * two different inputs map to one key and break the "you typed X, you got Y" contract.
 */
export function normalizeHandle(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function validateHandle(
  raw: string,
): {ok: true; key: string} | {ok: false; reason: HandleRejection} {
  const key = normalizeHandle(raw);
  if (key.length < HANDLE_MIN_LENGTH) return {ok: false, reason: 'TOO_SHORT'};
  if (key.length > HANDLE_MAX_LENGTH) return {ok: false, reason: 'TOO_LONG'};
  if (!HANDLE_BODY.test(key)) return {ok: false, reason: 'BAD_CHARSET'};
  if (!HANDLE_EDGE.test(key[0]!) || !HANDLE_EDGE.test(key[key.length - 1]!)) {
    return {ok: false, reason: 'BAD_EDGE'};
  }
  if (CONSECUTIVE_SEPARATORS.test(key))
    return {ok: false, reason: 'DOUBLE_SEPARATOR'};
  if (isReservedHandle(key)) return {ok: false, reason: 'RESERVED'};
  return {ok: true, key};
}
```

**ASCII-only is a security decision, not a convenience one.** Restricting the _key_ charset removes the entire
Unicode-confusable surface — Cyrillic `а`/`р` in `раypal`, fullwidth `ｈｙｏ`, RTL overrides, zero-width
joiners — in one stroke, and keeps the handle typeable on every keyboard and safe in a URL path segment.
Korean and Japanese identity lives in `displayName`, which is free Unicode and deliberately **not** unique.
That is the same username/name split Instagram uses.

```ts
/**
 * Impersonation-similarity key. NOT a uniqueness key — enforcing uniqueness on this would
 * block legitimate pairs like `jo.hn` / `john`. Used to (a) warn the claimer "this looks
 * like @john", (b) flag the pair in authAudit, (c) surface both in a moderation report.
 */
export function confusableKey(key: string): string {
  return key
    .replace(/[._]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/5/g, 's')
    .replace(/3/g, 'e');
}
```

### 10.2 Reserved words

Three layers, all applied to the already-normalized key.

```ts
/** Layer 1: exact matches. Lowercase, already normalized. */
const RESERVED_EXACT: ReadonlySet<string> = new Set([
  // ── routes & app surface: must never be shadowed by a /@handle deep link ──
  'about',
  'account',
  'admin',
  'api',
  'app',
  'auth',
  'blog',
  'callback',
  'calendar',
  'category',
  'contact',
  'currency',
  'dev',
  'developer',
  'docs',
  'download',
  'edit',
  'entries',
  'entry',
  'explore',
  'faq',
  'feed',
  'help',
  'home',
  'index',
  'invite',
  'invites',
  'join',
  'ledger',
  'ledgers',
  'legal',
  'lock',
  'login',
  'logout',
  'me',
  'members',
  'new',
  'notice',
  'notification',
  'notifications',
  'oauth',
  'onboarding',
  'password',
  'pricing',
  'privacy',
  'profile',
  'register',
  'report',
  'reset',
  'root',
  'search',
  'security',
  'settings',
  'share',
  'signin',
  'signout',
  'signup',
  'stats',
  'static',
  'status',
  'support',
  'system',
  'terms',
  'user',
  'users',
  'verify',
  'webhook',
  'well-known',
  'www',

  // ── brand & staff impersonation ──
  'bookoo',
  'bookooapp',
  'bookoo_official',
  'official',
  'staff',
  'team',
  'mod',
  'moderator',
  'administrator',
  'helpdesk',
  'customer',
  'customerservice',
  'billing',
  'payment',
  'payments',

  // ── Korean romanizations users actually type (a Korean-first product needs these) ──
  'gwanrija',
  'gwanlija',
  'gwanlija', // 관리자 (administrator)
  'unyeongja',
  'unyeongjin',
  'unyoungja', // 운영자/운영진 (operator)
  'gogaeksenteo',
  'gogaekcenter',
  'gogaek', // 고객센터 (customer centre)
  'gongsik',
  'gongsikgyejeong', // 공식 / 공식계정 (official / official account)
  'gagyebu',
  'jangbu',
  'bugoo',
  'bukoo', // 가계부 / 장부 (ledger, account book) + brand typos
  'sagoosil',
  'munuisahang', // 사무실 / 문의사항
  'kongji',
  'gongji', // 공지 (announcement)
  'iyongyakgwan',
  'gaeinjeongbo', // 이용약관 / 개인정보 (terms / personal data)

  // ── financial-authority impersonation: a shared-ledger app makes these dangerous ──
  'bank',
  'nh',
  'nonghyup',
  'kb',
  'kbbank',
  'kbpay',
  'shinhan',
  'woori',
  'hana',
  'ibk',
  'kbank',
  'kakaobank',
  'kakaopay',
  'tossbank',
  'toss',
  'tosspay',
  'naverpay',
  'payco',
  'samsungpay',
  'applepay',
  'saemaul',
  'suhyup',
  'citi',
  'sc',
  'busanbank',
  'daegubank',
  'kyongnambank',
  'fss',
  'fsc',
  'nts',
  'hometax', // 금융감독원 / 금융위 / 국세청 / 홈택스

  // ── platform impersonation ──
  'apple',
  'google',
  'kakao',
  'naver',
  'line',
  'instagram',
  'facebook',
  'meta',
  'x',
  'twitter',
  'youtube',
  'tiktok',
  'coupang',
  'baemin',
  'daangn',

  // ── generic ──
  'null',
  'undefined',
  'true',
  'false',
  'nan',
  'anonymous',
  'deleted',
  'unknown',
  'test',
  'demo',
  'guest',
]);

/** Layer 2: prefixes. Anything starting with these is refused. */
const RESERVED_PREFIXES: readonly string[] = [
  'bookoo',
  'admin',
  'official',
  'support',
  'system',
  'gwanrija',
  'unyeongja',
];

/** Layer 3: a maintained profanity/hate list, loaded from a data file, NOT inlined here. */
import {PROFANITY_KEYS} from './reserved/profanity.generated';

export function isReservedHandle(key: string): boolean {
  if (RESERVED_EXACT.has(key)) return true;
  if (PROFANITY_KEYS.has(confusableKey(key))) return true;
  return RESERVED_PREFIXES.some((p) => key.startsWith(p));
}
```

**Route-collision guard.** `__tests__/username.test.ts` walks the expo-router route manifest and asserts every
static top-level segment is in `RESERVED_EXACT`. Adding `/reports` without reserving `reports` would otherwise
make `@reports` shadow it silently. This test is the reason `RESERVED_EXACT` can be trusted.

### 10.3 The claim mutation, and why check-then-insert is safe

Convex has **no unique constraint** (indexes are `.index(name, fields)` only; 16 fields per index, 32 indexes
per table). Uniqueness is enforced by check-then-insert inside a single mutation, and that is sound because
Convex is ACID with **serializable isolation and optimistic concurrency control**, and a transaction's read
set is tracked as **index ranges**.

Take M1 and M2 both claiming `hyo`:

1. Each runs, in one mutation transaction:
   `userHandles.withIndex('by_handleKey', q => q.eq('handleKey','hyo')).unique()` — this registers an index
   range read over exactly `[hyo, hyo]`.
2. M1 commits first. Its insert produces a document **inside the range M2 read**.
3. At M2's commit, Convex compares M2's read set against writes since M2's start timestamp. The range is no
   longer at the version M2 saw → **write conflict**.
4. Convex aborts M2, rolls back its writes, and **re-runs the whole mutation at a fresh timestamp**. The
   re-run's query now returns M1's row → M2 throws `HANDLE_TAKEN`. A duplicate is impossible.

Three conditions the argument depends on. All three are hard requirements:

- **C1 — the check and the write are in the SAME mutation.** A client calling `checkHandleAvailability`
  (a query) and then `claimHandle` is a textbook TOCTOU: a query's read set is discarded when it returns. The
  availability query is **advisory UX only**; the mutation re-checks and is the only thing that decides.
- **C2 — the check uses `withIndex` with an exact `.eq()` on the normalized key, never `.filter()`.** A
  `.filter()` scan would still be _correct_ (its read set is the whole table, so it conflicts too), but it
  makes **every** write to `userHandles` conflict with **every** in-flight claim — which under load becomes
  repeated retries and eventually surfaced write-conflict errors. The narrow range keeps the conflict set to
  "someone else claiming this exact handle".
- **C3 — the uniqueness key is the normalized field, and normalization is identical on read and write.**
  Store `handleKey` as its own column and index that. Never `.eq('handle', input.toLowerCase())` against a
  non-normalized column.

Use `.unique()`, not `.first()`: it throws if the range somehow holds >1 document, turning pre-existing data
corruption into a loud error instead of a silent pick.

_(Do not copy Martie's `generateUniqueNickname` — `.filter()` full-table scan inside an unbounded
`while(true)`. It violates C2 and C3 and can spin forever inside a mutation.)_

```ts
// convex/user/mutations.ts
export const claimHandle = mutation({
  args: {handle: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // requireProfile, NOT requireOnboarded: onboarding must work before any other gate opens.
    const profile = await requireProfile(ctx);
    if (profile.deletedAt !== undefined)
      throw appError('ACCOUNT_DELETED', 'error.account.deleted');
    if (profile.handle !== undefined)
      throw appError('FORBIDDEN', 'error.handle.alreadySet');

    await rateLimiter.limit(ctx, 'handleClaim', {
      key: profile.userId,
      throws: true,
    });

    const checked = validateHandle(args.handle);
    if (!checked.ok) {
      throw checked.reason === 'RESERVED'
        ? appError('HANDLE_RESERVED', 'error.handle.reserved')
        : appError('HANDLE_INVALID', `error.handle.${checked.reason}`);
    }
    const {key} = checked;

    // ── THE uniqueness check. Narrow index range = minimal OCC conflict set (C2). ──
    const claim = await ctx.db
      .query('userHandles')
      .withIndex('by_handleKey', (q) => q.eq('handleKey', key))
      .unique();

    const now = Date.now();
    const display = args.handle.trim();

    if (claim !== null) {
      if (claim.releasedAt === undefined)
        throw appError('HANDLE_TAKEN', 'error.handle.taken');
      // Released, still inside the impersonation cooldown, and not by us.
      if (
        claim.userId !== profile.userId &&
        now - claim.releasedAt < HANDLE_RELEASE_COOLDOWN_MS
      ) {
        throw appError('HANDLE_COOLDOWN', 'error.handle.cooldown', {
          days: Math.ceil(
            (HANDLE_RELEASE_COOLDOWN_MS - (now - claim.releasedAt)) /
              86_400_000,
          ),
        });
      }
      // Recycling an expired release: rewrite the claim row in place.
      await ctx.db.patch(claim._id, {
        handle: display,
        userId: profile.userId,
        claimedAt: now,
        releasedAt: undefined,
      });
    } else {
      await ctx.db.insert('userHandles', {
        handleKey: key,
        handle: display,
        userId: profile.userId,
        claimedAt: now,
      });
    }

    // Same transaction -> the denormalized copy can never disagree with the authority.
    const step = nextOnboardingStep({
      hasHandle: true,
      profileStepDone: false,
      ledgerStepDone: false,
      legacyClaimState: profile.legacyClaimState,
    });
    await ctx.db.patch(profile._id, {
      handle: display,
      handleKey: key,
      handleUpdatedAt: now,
      onboardingStep: step,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'handle_claimed',
      detail: {handleKey: key},
      createdAt: now,
    });
    return null;
  },
});
```

**Why blocking, and not auto-assign.** Two shapes were considered:

- **(A) blocking screen (chosen).** Every account gets a real, chosen handle; the namespace stays clean.
  Cost: one screen before first value.
- **(B) auto-assign at profile creation, prompt later.** Zero-friction, but the namespace fills with
  `user_a83f21` handles nobody ever changes, and the auth callback would run a uniqueness check on the hot
  sign-in path.

**Chosen: (A), using (B)'s generator as the pre-fill.** If (B) is ever revisited, the retry loop must be
capped at ~8 candidates with a `user_${userId.slice(-8)}` fallback that is collision-free by construction —
never Martie's `while(true)`.

### 10.4 Availability query + debounce

```ts
export const checkHandleAvailability = query({
  args: {handle: v.string(), now: v.number()},
  returns: handleAvailabilityValidator,
  handler: async (ctx, args) => {
    // Authenticated: this is an enumeration oracle, so it is not open to the internet.
    // It never reveals WHO holds a handle — only that it is gone.
    await requireProfile(ctx);

    const checked = validateHandle(args.handle);
    if (!checked.ok) {
      return checked.reason === 'RESERVED'
        ? ({status: 'RESERVED'} as const)
        : ({status: 'INVALID', reason: checked.reason} as const);
    }

    const claim = await ctx.db
      .query('userHandles')
      .withIndex('by_handleKey', (q) => q.eq('handleKey', checked.key))
      .unique();

    if (claim === null) return {status: 'AVAILABLE'} as const;
    if (claim.releasedAt === undefined) {
      return {
        status: 'TAKEN',
        suggestions: await suggestAvailable(ctx, checked.key),
      } as const;
    }
    if (args.now - claim.releasedAt < HANDLE_RELEASE_COOLDOWN_MS) {
      return {status: 'COOLDOWN'} as const;
    }
    return {status: 'AVAILABLE'} as const;
  },
});
```

`suggestAvailable(ctx, base)` walks `suggestHandles(base, …)` candidates doing **one `.eq()` index probe per
candidate, capped at 12 probes**, returning the first 5 free. It is a query, so a stale answer is harmless.

```tsx
// app/(onboarding)/handle.tsx — debounce the ARGUMENT, not the render
const [text, setText] = useState(initialSuggestion);
const [probe, setProbe] = useState<string | null>(null);

// Local, zero-round-trip validation. Typos never reach the server: this is the payoff of
// putting validateHandle in shared/.
const local = useMemo(() => validateHandle(text), [text]);

useEffect(() => {
  if (!local.ok) {
    setProbe(null);
    return;
  }
  const id = setTimeout(() => setProbe(local.key), 350);
  return () => clearTimeout(id);
}, [local]);

const availability = useQuery(
  api.user.queries.checkHandleAvailability,
  probe !== null ? {handle: probe, now: screenOpenedAt} : 'skip', // 'skip', never a dummy argument
);
```

Three details: (1) `validateHandle` runs locally so length/charset/reserved errors render instantly with zero
network; (2) `'skip'` tears the subscription down while typing instead of opening one per keystroke —
a Convex `useQuery` is a _live subscription_; (3) because the answer is live, a handle taken while the user
hesitates flips to `TAKEN` on its own, which a REST app cannot do.

The submit button is **never** gated on the query alone. `claimHandle` can still throw `HANDLE_TAKEN` (C1),
and the screen must handle it by re-running suggestions inline.

### 10.5 Suggestion generator

```ts
/**
 * Deterministic throughout: a member who retries sees the same considered list, tests are stable,
 * and an OCC retry cannot change which exact index ranges the availability query probes.
 */
export function suggestHandles(
  seed: string,
  taken: (key: string) => boolean,
  calendarYear: number,
  count = 5,
): string[] {
  const base =
    normalizeHandle(seed)
      .replace(/[^a-z0-9._]/g, '')
      .replace(/[._]{2,}/g, '_')
      .replace(/^[._]+|[._]+$/g, '')
      .slice(0, HANDLE_MAX_LENGTH - 4) || 'user';

  const year = Math.abs(Math.trunc(calendarYear)) % 100;
  const candidates: string[] = [
    base,
    `${base}${year}`,
    `${base}.${year}`,
    `${base}_`,
    ...Array.from({length: 20}, (_, i) => `${base}${i + 1}`),
    ...Array.from({length: 40}, (_, i) => `${base}${stableSuffix(base, i)}`),
  ];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const check = validateHandle(c);
    if (!check.ok || seen.has(check.key) || taken(check.key)) continue;
    seen.add(check.key);
    out.push(check.key);
    if (out.length >= count) break;
  }
  return out;
}
```

**Seeding order on the onboarding screen:** provider `name` → provider `nickname` → verified email local part
→ legacy `displayName` (if a legacy candidate was found) → `'user'`. Korean names normalize to empty under
the ASCII charset, which is why the email local part matters and why `'user'` must exist as the terminal
fallback. A Korean-only name therefore lands on `user1234`-shaped suggestions — acceptable, because the
screen's headline explains that the handle is the ASCII `@name` and the Korean name goes in the next step.

### 10.6 Rename policy, cooldown, history

```ts
export const changeHandle = mutation({
  args: {handle: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireOnboarded(ctx);
    const previousKey = profile.handleKey;
    if (previousKey === undefined)
      throw appError('FORBIDDEN', 'error.handle.notSet');

    const now = Date.now();
    if (
      profile.handleUpdatedAt !== undefined &&
      now - profile.handleUpdatedAt < HANDLE_RENAME_COOLDOWN_MS
    ) {
      throw appError('HANDLE_COOLDOWN', 'error.handle.renameTooSoon', {
        days: Math.ceil(
          (HANDLE_RENAME_COOLDOWN_MS - (now - profile.handleUpdatedAt)) /
            86_400_000,
        ),
      });
    }
    await rateLimiter.limit(ctx, 'handleRename', {
      key: profile.userId,
      throws: true,
    });

    const checked = validateHandle(args.handle);
    if (!checked.ok) {
      throw checked.reason === 'RESERVED'
        ? appError('HANDLE_RESERVED', 'error.handle.reserved')
        : appError('HANDLE_INVALID', `error.handle.${checked.reason}`);
    }
    const {key} = checked;

    // Case-only edit (hyochan -> HyoChan): the key is unchanged, so this is a pure display
    // patch. Free, no cooldown consumed, no claim-row churn. Early-return BEFORE the
    // uniqueness block.
    if (key === previousKey) {
      await ctx.db.patch(profile._id, {
        handle: args.handle.trim(),
        updatedAt: now,
      });
      const own = await ctx.db
        .query('userHandles')
        .withIndex('by_handleKey', (q) => q.eq('handleKey', key))
        .unique();
      if (own !== null && own.userId === profile.userId) {
        await ctx.db.patch(own._id, {handle: args.handle.trim()});
      }
      return null;
    }

    // ...identical uniqueness + cooldown block as claimHandle...

    // Release the old claim — PATCH, never delete. The row IS the anti-impersonation
    // record: it says who held @hyo, and until when.
    const old = await ctx.db
      .query('userHandles')
      .withIndex('by_handleKey', (q) => q.eq('handleKey', previousKey))
      .unique();
    if (old !== null && old.userId === profile.userId) {
      await ctx.db.patch(old._id, {releasedAt: now});
    }

    await ctx.db.patch(profile._id, {
      handle: args.handle.trim(),
      handleKey: key,
      handleUpdatedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'handle_renamed',
      detail: {from: previousKey, to: key},
      createdAt: now,
    });
    return null;
  },
});
```

| rule                     | value                                              | why                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename cooldown          | **30 days**                                        | Stops "borrow a handle, do damage, drop it" cycling. Costs one `handleUpdatedAt` compare, no extra read.                                                                                                                                             |
| Released-handle cooldown | **90 days** before anyone _else_ can take it       | The impersonation window. A co-member who knows `@hyo` from a shared ledger must not find a stranger there next week. The original owner re-takes their own released handle immediately (`claim.userId === profile.userId` bypass).                  |
| Claim rows               | **never deleted**                                  | The `userHandles` row _is_ the history. `by_userId_claimedAt` `.order('desc').take(HANDLE_HISTORY_LIMIT)` renders "이전 아이디: @oldhyo (2026-05-01까지)" on the security screen.                                                                    |
| Case-only edits          | free, no cooldown                                  | `handleKey` unchanged → pure display patch.                                                                                                                                                                                                          |
| "Recently renamed" badge | **14 days**, driven by `handleUpdatedAt`           | The single most effective anti-impersonation UI; Instagram, X and Discord all ship a variant. Costs one field already on the profile.                                                                                                                |
| History cap              | `HANDLE_HISTORY_LIMIT = 50`                        | The `*_SCAN_LIMIT` discipline. Nobody legitimately renames 50 times.                                                                                                                                                                                 |
| Account deletion         | release (`releasedAt = now`), never delete the row | Same 90-day protection applies to a withdrawn account's handle, and I8 guarantees a restore inside the 30-day grace always gets it back.                                                                                                             |
| Confusable handling      | reservation only                                   | `confusableKey` folds separators and lookalike digits for profanity/reserved checks. `SCHEMA.md` has no stored confusable key or index, and cross-user scans are forbidden, so the earlier similarity-warning proposal is not a shippable read path. |

### 10.7 Handle search (mentions, inviting members)

```ts
const rows = await ctx.db
  .query('userProfiles')
  .withSearchIndex('search_handle', (q) =>
    q.search('handle', term).eq('deletedAt', undefined),
  )
  .take(10);
```

Convex text search gives prefix matching on the final term — exactly typeahead. Limits to respect: 1024
scannable results, ≤16 filter fields, ≤16 search terms, and search indexes share the 32-index-per-table
budget.

### 10.8 Triggers — deliberately not used yet

`convex-helpers/server/triggers` could move the uniqueness check into a table trigger so it cannot be
bypassed, and triggers run inside the same mutation, so the OCC guarantee is identical. The cost is a
`customMutation` wrapper on every mutation in the codebase. **Skip it while there are exactly two write sites
(`claimHandle`, `changeHandle`); adopt it the moment a third appears.**

---

## 11. Legacy account linking

### 11.0 The shape of the problem

Legacy BooKoo had exactly three providers (note 02 §15): **email+password**, **Facebook**
(`expo-facebook`, app id `437626799936821`), and **Google** (`expo-google-app-auth`). Password hashes are
**not migrated and not even exported** (note 14 §3.3): Firebase's SCRYPT is verifiable outside Firebase, but
verification costs ~16 MiB and 300–800 ms inside a Convex mutation's 1-second non-DB compute budget, and
BooKoo ships no password provider at all. So every legacy user re-authenticates through a _new_ provider and
then **claims** their old identity.

Legacy identities land in a staging table, `legacyUsers` (§7). **The migration never writes into
`users`/`authAccounts`.** A `users` row is only ever created by a real, verified sign-in.

**Placeholder users.** Migration pass 1 creates, for every `legacyUser`, a placeholder `users` row with no
`authAccounts` row (so it can never be signed into) and no `userProfiles` row. Ledgers, entries and comments
reference it, so membership lists, avatars and "written by" render correctly from day one. The claim
re-parents everything onto the real row and tombstones the placeholder. The alternative — pointing ledger rows
at `legacyUsers._id` and resolving later — would force a union type into every read path.

### 11.1 Email normalization, shared byte-for-byte

```ts
// shared/email.ts — MUST stay byte-identical to scripts/migrate/lib/email.ts
export function normalizeEmail(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase();
  if (!t.includes('@')) return undefined;
  return t;
  // NOTE: no gmail dot-stripping, no +tag stripping. Firebase treated a.b@gmail.com and
  // ab@gmail.com as distinct accounts; "helpfully" merging them here would merge two real
  // people's ledgers.
}
```

A CI step diffs the two files and fails the build on divergence. This is not paranoia — an asymmetric
normalization is how a migration silently hands one person another person's money records.

### 11.2 The claim probe (automatic, on every verified email)

Runs at the end of `afterUserCreatedOrUpdated`, and again from `confirmEmailLink` (§11.4):

```ts
async function maybeStartLegacyClaim(
  ctx: GenericMutationCtx<AnyDataModel>,
  userId: Id<'users'>,
  rawEmail: string | undefined,
  emailVerificationTime: number | undefined,
): Promise<void> {
  const db = typedDb(ctx);
  const email = normalizeEmail(rawEmail);

  // THE hostile-takeover guard. Without `emailVerificationTime != null`, anyone who can
  // assert an arbitrary unverified address could steal a stranger's ledgers.
  if (email === undefined || emailVerificationTime === undefined) return;

  const profile = await db
    .query('userProfiles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first();
  if (profile === null) return;
  if (
    profile.legacyClaimState === 'claimed' ||
    profile.legacyClaimState === 'skipped'
  )
    return;

  // claimState is INSIDE the index, so this reads only unclaimed rows for one address.
  const candidates = await db
    .query('legacyUsers')
    .withIndex('by_emailNormalized_claimState', (q) =>
      q.eq('emailNormalized', email).eq('claimState', 'unclaimed'),
    )
    .take(3); // 3 is enough to distinguish 0 / 1 / many

  if (candidates.length === 0) return;

  if (candidates.length === 1) {
    const legacy = candidates[0]!;
    await db.patch(legacy._id, {claimState: 'claiming'});
    await db.patch(profile._id, {
      legacyClaimState: 'pending',
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.legacy.internal.runClaim, {
      legacyUserId: legacy._id,
      userId,
    });
    return;
  }

  // >1 legacy account on one address. Never guess between two real people.
  for (const c of candidates) await db.patch(c._id, {claimState: 'ambiguous'});
  await db.patch(profile._id, {
    legacyClaimState: 'ambiguous',
    onboardingStep:
      profile.onboardingStep === 'done' ? 'legacy' : profile.onboardingStep,
    updatedAt: Date.now(),
  });
  await db.insert('authAudit', {
    userId,
    event: 'legacy_ambiguous',
    detail: {email, count: candidates.length},
    createdAt: Date.now(),
  });
}
```

Note it is a `runAfter(0)` **scheduled** internal mutation, not inline: re-parenting touches an unbounded
number of rows and must be batched, and a sign-in must never be held hostage by it.

### 11.3 `runClaim` and the batched re-parent

```
runClaim(legacyUserId, userId):
  legacy = get(legacyUserId)
  if legacy.claimState not in {'unclaimed','claiming'}: return       # idempotent, re-entrant
  patch(legacy, {claimState:'claimed', claimedByUserId:userId, claimedAt:now})
  patch(userProfiles(userId), {
    legacyUid: legacy.legacyUid, legacyClaimState:'claimed', legacyClaimedAt: now,
    # merge ONLY where the new profile is still empty — never overwrite a chosen value
    displayName: profile.displayName || legacy.displayName || '',
    avatarUrl:   profile.avatarUrl   ?? legacy.photoURL,
  })
  audit('legacy_claimed', {legacyUid})
  schedule reparentBatch(table='ledgerMembers')
```

```ts
export const reparentBatch = internalMutation({
  args: {
    legacyUserId: v.id('legacyUsers'),
    placeholderUserId: v.id('users'),
    userId: v.id('users'),
    table: v.string(),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Ordered on purpose: membership first, so the ledger list lights up in the UI within
    // a second or two even while entries are still being re-parented.
    const ORDER = [
      'ledgerMembers',
      'ledgers',
      'ledgerItems',
      'itemComments',
      'itemPhotos',
    ] as const;
    // ...paginate with the canonical table-specific indexes from SCHEMA.md,
    // numItems: LEGACY_REPARENT_BATCH,
    //    patch each row's owner field, then either reschedule with the continueCursor or
    //    advance to the next table in ORDER.
    return null;
  },
});
```

Every table's index for this is `by_<ownerField>_and_deletedAt`, so the pages are never short.
The canonical `ledgers`, `ledgerMembers`, `ledgerItems`, `itemComments`, and `itemPhotos` migration
paths all carry `legacyKey` (I7); use only the indexes declared for those tables in `SCHEMA.md`.

Progress is visible: `userProfiles.legacyClaimState === 'pending'` renders a non-blocking banner
"예전 데이터를 가져오는 중이에요…" that disappears when it flips to `'claimed'`. Because Convex queries are
live subscriptions, no polling is needed.

### 11.4 The "add another email" flow (Apple private relay, Kakao without consent, changed address)

A user whose new sign-in carries `xxxx@privaterelay.appleid.com` will never match a legacy address, and the
claim will silently not fire. Same for Kakao-without-consent and for anyone who has since changed their email.
They need a way to prove control of the _legacy_ address while already signed in.

**Convex Auth cannot do this for us [lib-verified]:** calling `signIn('bookoo-otp-ko', {email})` while
authenticated does **not** attach to the current session's user — `defaultCreateOrUpdateUser` ignores the
session id and resolves purely by `existingAccount?.userId` or `uniqueUserWithVerifiedEmail`. It would either
find a different user or create a new one. So we ship our own minimal OTP, against our own table, and never
touch the library's internals.

```ts
export const startEmailLink = action({
  args: {email: v.string(), locale: supportedLocaleValidator},
  returns: v.object({expiresAt: v.number()}),
  handler: async (ctx, args): Promise<{expiresAt: number}> => {
    const userId = await requireActionUserId(ctx);
    const email = normalizeEmail(args.email);
    if (email === undefined)
      throw appError('INVALID_INPUT', 'error.email.invalid');

    const code = generateRandomString(8, alphabet('0-9'));
    const {expiresAt} = await ctx.runMutation(
      internal.user.actions.storeEmailLinkCode,
      {
        userId,
        email,
        codeHash: sha256Hex(code),
      },
    ); // rate-limits inside: 3/hour/user AND 5/hour/email

    const template = emailTemplates[args.locale];
    await sendResendEmail(process.env.AUTH_RESEND_KEY, {
      from: `BooKoo <${fromAddress()}>`,
      to: [email],
      subject: template.linkSubject,
      text: template.linkText(code),
      html: template.linkHtml(code),
    });
    return {expiresAt};
  },
});

export const confirmEmailLink = action({
  args: {email: v.string(), code: v.string()},
  returns: v.object({legacyClaimStarted: v.boolean()}),
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.user.actions.applyEmailLink, {
      userId,
      email: normalizeEmail(args.email) ?? '',
      code: args.code,
    });
  },
});
```

`applyEmailLink` (internalMutation), in order:

1. `requireProfileOf(ctx, userId)`.
2. Load `emailLinkCodes.by_userId`, take the newest; check `expiresAt > now`, `attemptsLeft > 0`,
   `emailNormalized === email`, `codeHash === sha256Hex(code)`. On mismatch: decrement `attemptsLeft`
   (`EMAIL_LINK_MAX_ATTEMPTS = 5`) and throw `INVALID_INPUT`. Delete the row on success.
3. **Exclusivity check** — `userEmails.by_emailNormalized_deletedAt(email, undefined).take(2)`:
   - 0 rows → free.
   - 1 row owned by `userId` → idempotent no-op.
   - 1 row owned by someone else → **most-recent-verification wins** (§6.7 rule 3): soft-delete their row,
     clear their `users.email` if it was primary, audit `email_reassigned`, schedule a push + email to them.
     This is deliberate: mailbox control is the only proof either party can offer, and the person who has it
     _now_ is the one who can receive mail there. **Ledgers never move** — this only changes which account can
     be _reached_, never who owns what.
   - 2 rows → data corruption → `LINK_AMBIGUOUS`.
4. Insert `userEmails {userId, emailNormalized, emailRaw, verifiedAt: now, source: 'LINK', isPrimary: false}`
   plus the shared timestamp, soft-delete, and legacy defaults from `SCHEMA.md` §3.1.1.
5. Insert `authAccounts {userId, provider: 'email-link', providerAccountId: email, emailVerified: email}` so
   the address is a real, usable sign-in method afterwards.
6. If `users.email` is unset → set `{email, emailVerificationTime: now}` and mark this row primary.
7. Call `maybeStartLegacyClaim(ctx, userId, email, now)` and return `{legacyClaimStarted}`.

Steps 3–5 are one mutation, so the same OCC argument as handles (§10.3) makes the exclusivity check race-free.

Entry points to this flow: the end-of-onboarding card, 설정 → 계정 → 이메일 추가, and a direct link from the
sign-in screen's "예전에 쓰던 계정을 못 찾겠어요" help sheet.

### 11.5 Two legacy accounts sharing one email

Firebase's "one account per email address" setting could be off, so a `password` account and a
`facebook.com` account can both carry `user@example.com`. `claimState` goes `'ambiguous'` on all of them and the
user gets `/(onboarding)/legacy-claim`:

```ts
export const myLegacyCandidates = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('legacyUsers'),
      displayName: v.union(v.string(), v.null()),
      providers: v.array(v.string()),
      createdMonth: v.string(), // 'YYYY-MM' — month precision only
      ledgerCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    /* by_emailNormalized_claimState(myEmails × 'ambiguous').take(5) */
  },
});
```

**What the screen shows, and what it deliberately does not.** Display name, provider list, creation _month_,
and a ledger **count**. Never ledger names, never member names, never amounts. Even though the user proved
control of the mailbox, they may not be the same human who used it three years ago; leaking a stranger's
ledger titles to satisfy a disambiguation UI is not an acceptable trade.

**Default action: "둘 다 내 계정이에요" (claim all).** Rationale: Firebase created both under one mailbox, so
one person almost certainly owned both, and forcing a choice would strand real data. A "하나만 선택" affordance
exists for the rare person who knows better.

```ts
export const claimLegacyAccount = mutation({
  args: {legacyUserIds: v.array(v.id('legacyUsers'))},
  returns: v.object({scheduled: v.number()}),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    if (args.legacyUserIds.length > 5)
      throw appError('INVALID_INPUT', 'error.legacy.tooMany');
    const emails = new Set(
      (
        await ctx.db
          .query('userEmails')
          .withIndex('by_userId_deletedAt', (q) =>
            q.eq('userId', profile.userId).eq('deletedAt', undefined),
          )
          .take(10)
      ).map((r) => r.emailNormalized),
    );
    let scheduled = 0;
    for (const id of args.legacyUserIds) {
      const legacy = await ctx.db.get('legacyUsers', id);
      // Re-verify server-side that this candidate is actually reachable from an address
      // the caller has PROVEN. Never trust the id list.
      if (legacy === null) continue;
      if (
        legacy.emailNormalized === undefined ||
        !emails.has(legacy.emailNormalized)
      ) {
        throw appError('FORBIDDEN', 'error.legacy.notYours');
      }
      if (legacy.claimState === 'claimed')
        throw appError('LEGACY_ALREADY_CLAIMED', 'error.legacy.alreadyClaimed');
      await ctx.db.patch(id, {claimState: 'claiming'});
      await ctx.scheduler.runAfter(0, internal.legacy.internal.runClaim, {
        legacyUserId: id,
        userId: profile.userId,
      });
      scheduled += 1;
    }
    await ctx.db.patch(profile._id, {
      legacyClaimState: 'pending',
      updatedAt: Date.now(),
    });
    return {scheduled};
  },
});
```

Unpicked candidates stay `'ambiguous'` and are reachable later from 설정 → 계정 → 예전 데이터 가져오기.

### 11.6 The recycled-mailbox risk, and the standing safeguard

Every email-based claim — ambiguous or not — carries one irreducible risk: person A used `a@x.ac.kr` in 2019;
the university recycled it; person B holds it now and can claim A's ledgers. Three mitigations, all cheap:

1. **Co-member notification with a dispute window.** When a claim re-parents a ledger membership, every other
   active member of that ledger gets a push + in-app notice: _"OO님이 예전 계정을 복구했어요."_ with a
   7-day "이 사람을 모릅니다" report button that files an `authAudit` row and freezes further re-parenting for
   that legacy uid pending support review. In a _shared_ ledger app the co-members are the best available
   fraud detector, and they are already there.
2. **Dormancy flag.** `LEGACY_CLAIM_DORMANCY_DAYS` (default 1095 ≈ 3 years): if
   `legacyLastSignInAt` is older than that, the claim still runs but is flagged in `authAudit` and the
   co-member notice is escalated to an email as well.
3. **Full audit trail.** `authAudit` rows for `legacy_claimed` / `legacy_force_claimed` carry `legacyUid`,
   the proving email, and the source provider. Every claim is reversible by an operator because nothing is
   deleted — the placeholder row is tombstoned, not destroyed.

### 11.7 Facebook-only legacy users

Facebook is dropped (`DECISIONS.md §3`). Three populations, detected from `providerUserInfo`:

| population                                                                                                                          | detection                                                                    | recovery                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FB + has email** (the majority — the legacy code _refused_ to complete a Facebook sign-in without an email, `authApi.ts:132-135`) | `providerUserInfo` contains `facebook.com` **and** top-level `email != null` | Normal claim. Sign in with **email OTP** to the same address, or with Google/Kakao if that provider asserts it verified. **No support contact needed.**                                         |
| **FB + password**, **FB + Google**                                                                                                  | multiple `providerUserId`s                                                   | Claim via the surviving provider. Unaffected.                                                                                                                                                   |
| **FB-only, no email**                                                                                                               | `providerUserInfo == ["facebook.com"]` **and** `email == null`               | `claimState: 'orphan_no_email'`. **No automatic path exists**: Firebase never held an email, Facebook is gone, and the new app has no Facebook provider from which to re-derive the FB `rawId`. |

The RTDB export contains **434 users without a usable profile email** and 270 with no `info`, correcting
the earlier coarse estimate of ~276. That is a recovery-readiness population, not the exact
`orphan_no_email` cohort: only the password-stripped Firebase Auth export has provider membership.
`auth-triage.json` must freeze that exact count before rehearsal, but the machinery below is required at
launch regardless of the result.

**Concrete plan for `orphan_no_email`:**

1. Their data is **not** deleted. Placeholder users keep authoring entries and comments; shared ledgers keep
   working for every other member.
2. **Ownership rescue.** If an orphan is the **sole member** of a ledger →
   `ledgers.orphanedAt = importedAt`, excluded from listings, with **no `purgeAfter`**. If an orphan owns a
   shared ledger, ownership transfers to the remaining member with minimum `joinedAt`, then lexicographic
   `legacyUid` (all imported joins tie), recorded in `ownershipTransferredFromUserId` /
   `ownershipTransferredAt` / `ownershipRescuedFromLegacyUid` plus an `authAudit` row.
3. **Manual escape hatch and support runbook.** The claimant must already be signed in to the target
   account. A screenshot is supplemental only and never sufficient. Support records two independent
   signals where available: (a) provider-account continuity matching the archived Firebase subject,
   (b) a byte/hash match to an original uploaded photo, or (c) confirmation from an active co-member
   through the signed-in app. A sole-member claimant with neither provider continuity nor matching media
   is refused rather than guessed. Evidence remains in the access-controlled ticket system and is never
   copied into Convex, logs, chat, or source control. One ADMIN operates and a different ADMIN approves.
   `requireActiveAdmin` point-reads `userProfiles.by_userId` and requires live `appRole === 'ADMIN'`;
   `requireActiveClaimTarget` requires a live, non-placeholder, non-suspended target profile:

```ts
export const forceClaim = internalMutation({
  args: {
    legacyUid: v.string(),
    targetUserId: v.id('users'),
    operatorUserId: v.id('users'),
    approverUserId: v.id('users'),
    ticketRef: v.string(),
    approvalRef: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (args.operatorUserId === args.approverUserId) {
      throw appError('FORBIDDEN', 'error.legacy.notYours');
    }
    await requireActiveAdmin(ctx, args.operatorUserId);
    await requireActiveAdmin(ctx, args.approverUserId);
    await requireActiveClaimTarget(ctx, args.targetUserId);
    if (args.ticketRef.trim() === '' || args.approvalRef.trim() === '') {
      throw appError('INVALID_INPUT', 'error.legacy.notYours');
    }
    const legacy = await ctx.db
      .query('legacyUsers')
      .withIndex('by_legacyUid', (q) => q.eq('legacyUid', args.legacyUid))
      .unique();
    if (legacy === null)
      throw appError('LEGACY_NOT_FOUND', 'error.legacy.notFound');
    if (legacy.claimState !== 'orphan_no_email') {
      throw appError('FORBIDDEN', 'error.legacy.notYours');
    }
    await ctx.db.insert('authAudit', {
      userId: args.targetUserId,
      event: 'legacy_force_claimed',
      detail: {
        legacyUid: args.legacyUid,
        operatorUserId: String(args.operatorUserId),
        approverUserId: String(args.approverUserId),
        approvalRef: args.approvalRef,
      },
      ticketRef: args.ticketRef,
      createdAt: Date.now(),
    });
    await ctx.db.patch(legacy._id, {
      claimState: 'claiming',
      claimTicketRef: args.ticketRef,
    });
    await ctx.scheduler.runAfter(0, internal.legacy.internal.runClaim, {
      legacyUserId: legacy._id,
      userId: args.targetUserId,
    });
    return null;
  },
});
```

The audit stores references and actor ids only, never evidence or financial facts. The normal 7-day
co-member dispute notice still fires. A later claim restores access but does not silently reclaim
ownership from a rescued active owner; that needs a separate, confirmed ownership transfer. 4. **In-app copy.** The sign-in screen carries a "예전에 페이스북으로 로그인하셨나요?" link →
`app/(auth)/legacy-help.tsx`, which explains the email-OTP path first and only then offers the support
contact for the genuinely email-less.

There is no automatic orphan purge. At month 24 the cohort enters quarterly documented purpose review;
deletion requires a separately approved retention change, attempted notice where possible, and proof
that no active member or open support claim depends on the ledger. Inability to email is not consent.

---

## 12. Sign-out, unlink, and account deletion

### 12.1 Sign-out

```ts
async function performSignOut(): Promise<void> {
  await tryStep(() => unregisterPushToken()); // needs a LIVE session -> must be first
  await releaseSocialSessions(); // best-effort, never blocks
  await signOut(); // useAuthActions() -> clears SecureStore
  clearSessionCaches(); // MMKV: profile cache + lastStage. NOT the lock config.
}
```

`releaseSocialSessions` attempts **all three** SDKs, because _which provider signed the user in is not
recorded anywhere_; an SDK that was never signed in simply rejects, and every call is wrapped in a
log-and-continue `tryRelease`.

```ts
async function releaseSocialSdk(
  provider: SocialProvider,
  mode: 'logout' | 'unlink',
): Promise<void> {
  const unlinking = mode === 'unlink';
  if (provider === 'apple') return; // no client secret on-device; backend revokes
  if (provider === 'kakao')
    return void (unlinking ? kakaoUnlink() : kakaoLogout());
  if (provider === 'naver') {
    initializeNaverOnce();
    return void (unlinking ? NaverLogin.deleteToken() : NaverLogin.logout());
  }
  configureGoogleOnce(); // the native session outlives the JS process
  return void (unlinking
    ? GoogleSignin.revokeAccess()
    : GoogleSignin.signOut());
}
```

Guarded by a `leavingRef` (`useRef<boolean>`, **not** state) plus a `leaving` state flag:

> 로그아웃·탈퇴는 네트워크를 몇 단계 오가는 동안 화면이 그대로라, 눌리지 않은 줄 알고 다시 누르면 전체가
> 중복 실행됩니다.

The lock config survives sign-out, but it is **bound to a user**: the SecureStore record carries
`lockOwnerUserId`, and signing in as a different `userId` destroys it (§14.6). A device-level PIN that a
second person inherits and cannot enter would be a support nightmare.

### 12.2 Unlink

```ts
export const unlinkAccount = mutation({
  args: {method: v.union(socialProviderValidator, v.literal('email'))},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireActiveProfile(ctx);
    const rows = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', profile.userId))
      .take(LINKED_ACCOUNT_SCAN_LIMIT);

    // An OTP row exists from the REQUEST step, before any code was verified [lib-verified].
    // Only a row that actually proved an address counts as a usable login method.
    const usable = rows.filter(
      (r) =>
        isSocialProvider(r.provider) ||
        (isEmailOtpProvider(r.provider) && r.emailVerified !== undefined),
    );
    const target = usable.filter((r) => methodOf(r.provider) === args.method);
    if (target.length === 0) return null; // idempotent no-op
    if (target.length === usable.length) {
      throw appError('LINK_LAST_METHOD', 'error.link.lastMethod');
    }

    // HARD delete: the row IS the credential. A `deletedAt` would leave behind exactly the
    // thing being revoked, and `providerAndAccountId` would still find it.
    for (const row of target) await ctx.db.delete(row._id);

    if (args.method === 'apple') {
      await ctx.scheduler.runAfter(0, internal.user.actions.revokeAppleTokens, {
        userId: profile.userId,
      });
    }
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'account_unlinked',
      detail: {method: args.method},
      createdAt: Date.now(),
    });
    return null;
  },
});
```

Client side, unlink also calls `disconnectSocialAccount(provider)` so the native SDK's consent is dropped
too — `GoogleSignin.revokeAccess()`, `kakaoUnlink()`, `NaverLogin.deleteToken()`.

### 12.3 Apple refresh tokens: acquisition

App Store Review Guideline **5.1.1(v)** requires any app offering Sign in with Apple to let the user revoke
the grant on account deletion. Revocation needs the **refresh token**, which is only obtainable by spending
the one-time `authorizationCode` within 5 minutes of sign-in.

```ts
// convex/lib/appleTokens.ts
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const CLIENT_SECRET_TTL_SECONDS = 5 * 60; // Apple allows 6 months; we mint per request

/** Everything below is a silent no-op until all three env vars land. */
export function appleClientSecretConfig(): AppleClientSecretConfig | null {
  const teamId = readEnv('APPLE_TEAM_ID');
  const keyId = readEnv('APPLE_KEY_ID');
  const privateKey = readEnv('APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !privateKey) return null;
  // A .p8 is multi-line and most env-var entry paths flatten it.
  return {teamId, keyId, privateKey: privateKey.replace(/\\n/g, '\n')};
}

/** Apple takes a signed ES256 JWT where other providers take a static secret. */
export async function createAppleClientSecret(
  config: AppleClientSecretConfig,
  clientId: string,
): Promise<string> {
  const key = await importPKCS8(config.privateKey, 'ES256');
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({alg: 'ES256', kid: config.keyId})
    .setIssuer(config.teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + CLIENT_SECRET_TTL_SECONDS)
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId) // bundle id (iOS) or Services ID (Android web)
    .sign(key);
}

export function appleWebRedirectUri(): string {
  return `${process.env.CONVEX_SITE_URL ?? ''}${APPLE_CALLBACK_PATH}`;
}
```

```ts
async function scheduleAppleCodeExchange(
  ctx: AuthorizeCtx,
  userId: Id<'users'>,
  clientId: string,
  authorizationCode: string | undefined,
): Promise<void> {
  if (authorizationCode === undefined) return;
  if (appleClientSecretConfig() === null) return; // no signing key -> nothing to spend it on
  await ctx.scheduler.runAfter(0, internal.user.actions.exchangeAppleCode, {
    userId,
    clientId,
    authorizationCode,
  });
}
```

Scheduled, never awaited: the code is single-use and expires in 5 minutes, but sign-in must not pay an extra
Apple round trip nor fail when Apple is down. `exchangeAppleCode` **swallows failures with `console.error`** —
losing the token costs the ability to revoke later; failing the sign-in over it would cost the user the
account entirely.

`redirect_uri` is sent **only** for the web/Services-ID flow (`isAppleServiceId(clientId)`); the native
bundle-id flow must omit it. The Services ID's Return URL must match `appleWebRedirectUri()`
character-for-character or the exchange is rejected.

`saveAppleRefreshToken` upserts on `(userId, clientId)` — Apple mints a fresh refresh token on every
authorization and only the newest is worth keeping. A user holds at most one row per Apple `client_id`, so
two; `APPLE_TOKEN_SCAN_LIMIT = 8` is generous.

### 12.4 Account deletion (App Store 5.1.1(v))

**Client order.** Two `Alert.alert` confirmations, the second requiring the user to type their `@handle` —
a plain "확인" is not a considered decision for something that destroys a joint financial record.

```ts
await requestAccountDeletion({reason}); // server: soft-delete + schedules revoke + ledger handoff
await disconnectSocialAccounts(); // AFTER, so a failed 탈퇴 never strips consents from a live account
await performSignOut();
```

**Server.**

```ts
export const requestAccountDeletion = mutation({
  args: {reason: v.optional(v.string())},
  returns: v.object({purgeAfter: v.number()}),
  handler: async (ctx, args): Promise<{purgeAfter: number}> => {
    const profile = await requireActiveProfile(ctx);
    const now = Date.now();
    const purgeAfter = now + DELETION_GRACE_MS;

    await ctx.db.patch(profile._id, {
      deletedAt: now,
      purgeAfter,
      deletionReason: args.reason?.slice(0, 500),
      updatedAt: now,
    });

    // Release the handle. PATCH, never delete — the row is the impersonation record, and
    // I8 (grace 30d < release cooldown 90d) guarantees a restore gets it back.
    if (profile.handleKey !== undefined) {
      const claim = await ctx.db
        .query('userHandles')
        .withIndex('by_handleKey', (q) => q.eq('handleKey', profile.handleKey!))
        .unique();
      if (
        claim !== null &&
        claim.userId === profile.userId &&
        claim.releasedAt === undefined
      ) {
        await ctx.db.patch(claim._id, {releasedAt: now});
      }
    }

    // Hard-delete push tokens: there is no deletedAt on that table, and a survivor would
    // keep pushing to a device whose account is gone.
    for (const t of await ctx.db
      .query('pushTokens')
      .withIndex('by_userId_disabledAt', (q) => q.eq('userId', profile.userId))
      .take(20)) {
      await ctx.db.delete(t._id);
    }

    // 5.1.1(v): revoke NOW, not at purge time. See the tradeoff note below.
    await ctx.scheduler.runAfter(0, internal.user.actions.revokeAppleTokens, {
      userId: profile.userId,
    });
    await ctx.scheduler.runAfter(0, internal.user.deletion.handOffLedgers, {
      userId: profile.userId,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'deletion_requested',
      detail: {purgeAfter},
      createdAt: now,
    });
    return {purgeAfter};
  },
});
```

**Apple revocation.**

```ts
export async function revokeAppleRefreshToken(
  config: AppleClientSecretConfig,
  clientId: string,
  refreshToken: string,
): Promise<void> {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: await createAppleClientSecret(config, clientId),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  const {ok, payload, status} = await postToApple(APPLE_REVOKE_URL, form); // RFC 7009
  if (ok) return;
  throw new Error(
    `Apple token revocation failed (${appleErrorCode(payload, status)})`,
  );
}
```

> Apple answers **200 with an empty body** both for a token it just killed and for one it does not recognise
> (verified with a junk token). So 200 means "Apple accepted the request", never "the grant is provably gone".
> Only a non-200 (bad client id, unverifiable secret) is worth retrying.

`revokeAppleTokens` (internalAction): `listAppleRefreshTokens` → if none, done; **if
`appleClientSecretConfig()` is null, return while KEEPING the rows** so the grant can be cleaned up once the
key lands. Otherwise loop, collect the ids that succeeded, `dropAppleRefreshTokens({ids})`. A row that
survives a failure **is** the record that this grant still owes Apple a revocation.
`dropAppleRefreshTokens` **hard-deletes** — the row _is_ the secret, so a `deletedAt` would leave behind
exactly the value we were asked to get rid of.

Scheduled, not awaited: a mutation cannot reach the network, and 탈퇴 has already committed — its outcome
must not be undone by Apple being slow.

**Tradeoff, stated plainly.** Revoking at soft-delete rather than at purge means a user who restores inside
the grace period must re-connect Apple (and Kakao/Naver, whose unlink also ran client-side). The alternative —
deferring revocation 30 days — reads as non-compliance with 5.1.1(v), which is a shipping risk. Compliance
wins; the restore screen says so up front: _"복구하면 소셜 로그인은 다시 연결해야 해요."_

### 12.5 Grace period and restore

`beforeSessionCreation` refuses **only** `purgedAt`, not `deletedAt` (§6.1). A soft-deleted user can therefore
still sign in — and `Stack.Protected guard={stage === 'pending-deletion'}` puts them on `/account/deleted`,
which is the _only_ screen they can reach. Every other function goes through `requireActiveProfile`, which
throws `ACCOUNT_DELETED`.

This is deliberate. The alternative (refuse the session, show the message on the sign-in screen) makes restore
impossible without an unauthenticated "restore my account" endpoint keyed on email — which is an account
takeover primitive. Letting the session exist but gating every capability behind one predicate is both safer
and less code.

```ts
export const cancelAccountDeletion = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const profile = await requireProfile(ctx); // NOT requireActiveProfile
    if (profile.deletedAt === undefined) return null;
    if (profile.purgedAt !== undefined)
      throw appError('ACCOUNT_DELETED', 'error.account.purged');
    const now = Date.now();

    // Re-take our own handle. `claim.userId === profile.userId` bypasses the release
    // cooldown, and I8 guarantees nobody else could have taken it inside the grace window.
    if (profile.handleKey !== undefined) {
      const claim = await ctx.db
        .query('userHandles')
        .withIndex('by_handleKey', (q) => q.eq('handleKey', profile.handleKey!))
        .unique();
      if (claim !== null && claim.userId === profile.userId) {
        await ctx.db.patch(claim._id, {releasedAt: undefined, claimedAt: now});
      }
    }
    await ctx.db.patch(profile._id, {
      deletedAt: undefined,
      purgeAfter: undefined,
      deletionReason: undefined,
      updatedAt: now,
    });
    await ctx.db.insert('authAudit', {
      userId: profile.userId,
      event: 'deletion_cancelled',
      createdAt: now,
    });
    return null;
  },
});
```

Ledger ownership that was handed off during the grace period is **not** taken back automatically — the new
owner has been acting as owner for up to 30 days. The restore screen explains this and offers a one-tap
"소유권 돌려받기 요청" that notifies the current owner.

### 12.6 What happens to ledgers a deleted user owned

Run by `handOffLedgers`, batched with `LEDGER_HANDOFF_BATCH = 25` and a self-rescheduling cursor:

| situation                                            | action                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger where the user is the **sole** member         | `ledgers.orphanedAt = now`. Excluded from every listing. Purged together with the account at the end of the grace period.                                                                                                                                                                                                                                                                 |
| Ledger where the user is **owner** and others remain | Ownership transfers to the **earliest-joined remaining active member** (bounded live roster from `ledgerMembers.by_ledgerId_deletedAt_role`, then `joinedAt` / lexicographic `_id` minimum). Writes `ledgers.ownershipTransferredFromUserId`, an `authAudit` `ledger_ownership_transferred` row, and pushes the new owner: _"OO님이 탈퇴하여 회원님이 「가계부명」의 소유자가 되었어요."_ |
| Ledger where the user is a **non-owner member**      | The `ledgerMembers` row is soft-deleted. The ledger is untouched.                                                                                                                                                                                                                                                                                                                         |
| **Entries the user authored**                        | Shared financial facts stay because deleting them silently changes every co-member's balance. Identity is cleared and renders through a tombstone: `displayName` → `t('user.deleted')`, avatar → placeholder, handle → none, no profile link.                                                                                                                                             |
| **Comments the user authored**                       | Remain during the 30-day recovery window, then hard-delete in bounded account-purge batches and repair `commentCount`.                                                                                                                                                                                                                                                                    |
| **Photos the user uploaded**                         | Remain during recovery, then delete the original/thumbnail blobs and rows in bounded batches. Account deletion never silently transfers blob ownership to the ledger.                                                                                                                                                                                                                     |

The deletion confirmation copy states this explicitly, and it is what makes the design defensible on the
data-protection side: shared transaction facts survive de-identified to preserve co-members' balances, while
the deleting account's receipt bytes, comments, profile, email, handle, provider links, and tokens are
destroyed. `privacy-and-compliance.md` owns the exact retention and public disclosure.

Anyone who wants their entries gone must delete them (or leave the ledger and delete their own entries)
before deleting the account — the settings screen offers "내 항목 모두 삭제" as a separate, explicit action.

### 12.7 Purge

```ts
export const purgeExpiredAccounts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now();
    const due = await ctx.db
      .query('userProfiles')
      .withIndex('by_purgeAfter', (q) => q.lt('purgeAfter', now))
      .take(PURGE_BATCH);
    for (const profile of due) {
      await ctx.scheduler.runAfter(0, internal.user.deletion.purgeUser, {
        userId: profile.userId,
      });
    }
    return null;
  },
});
```

`purgeUser` (batched, cursor-driven, self-rescheduling) does, in order:

1. Hard-delete `authAccounts` (the rows _are_ the credentials) and `authSessions` / `authRefreshTokens` for
   the user via `invalidateSessions`.
2. Hard-delete `appleRefreshTokens`, `pushTokens`, `emailLinkCodes`, active/expired `dataExports`, all
   associated export blobs/part rows, each export maintenance job through its derived `by_jobKey` point
   lookup, and any remaining D6 `clientMutationReceipts` through
   `by_userId_clientRequestId`. The global 30-day receipt expiry normally removes them first; account
   purge does not rely on cron ordering.
3. Hard-delete `userEmails` at purge; account exclusivity is no longer a reason to retain the address.
4. Clear `users` PII: `{name: undefined, image: undefined, email: undefined, emailVerificationTime: undefined}`.
   The `users` row itself stays so foreign keys in kept entries do not dangle.
5. Delete the owned avatar blob, authored comments, and account-uploaded item-photo rows/blobs in cursor-
   bounded stages; patch affected item counters/covers without changing financial rollups.
6. Patch `userProfiles`: `{purgedAt: now, purgeAfter: undefined, displayName: '', bio: '', phone: '',
avatarStorageId: undefined, avatarUrl: undefined, avatarThumbUrl: undefined,
avatarLegacyUrl: undefined, avatarLegacySourcePath: undefined, legacyUid: undefined,
legacyRaw: undefined, deletionReason: undefined}`.
7. Delete `ledgers` (and their entries/photos) whose `orphanedAt` is set and whose only member was this user.
8. `userHandles` rows are **kept** with `releasedAt` intact — the 90-day impersonation cooldown must outlive
   the account.
9. Write `authAudit.deletion_purged`; D4's three-year compliance purge later deletes auth/legal evidence
   unless a documented preservation hold applies.

A second nightly cron cleans up the OTP-request garbage described in §3.5:

```ts
export const purgeStaleUnverifiedUsers = internalMutation({
  args: {},
  returns: v.null(),
  // users rows with no emailVerificationTime, no userProfiles row, no authAccounts row
  // carrying `emailVerified`, and _creationTime older than 24h. These are created at the
  // OTP REQUEST step by anyone who can type an address [lib-verified].
});
```

---

## 13. Session/token storage and the anti-flicker cold start

### 13.1 Where the tokens live

Convex Auth persists a **refresh token** and a short-lived JWT. On native they go into
`expo-secure-store` (iOS Keychain / Android EncryptedSharedPreferences backed by the Keystore), never
AsyncStorage, never MMKV.

```tsx
// app/_layout.tsx — module scope, executed at import time before any component renders
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({duration: 250, fade: true});

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

/**
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY:
 *  - "WHEN_UNLOCKED": the token is unreadable while the device is locked, so a background
 *    fetch cannot leak it off a locked phone.
 *  - "THIS_DEVICE_ONLY": it never rides an iCloud/Google backup onto a different device.
 *    Restoring a backup should require signing in again — that is the correct behaviour for
 *    an app holding somebody's spending history.
 * NOT `requireAuthentication: true` — that would prompt Face ID on every token read,
 * including silent refreshes. Biometrics belong to the app lock (§14), not the session.
 */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const secureStorage = {
  getItem: (key: string): Promise<string | null> =>
    SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS),
  setItem: (key: string, value: string): Promise<void> =>
    SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS),
  removeItem: (key: string): Promise<void> =>
    SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS),
};
```

Provider order is normative in D6's `boot-and-providers.md`; the auth-specific constraints are that
`ConvexAuthProvider` sits inside theme and outside every query/session consumer, the in-memory cache is
inside auth and keyed by a session epoch, and notification providers mount only for `ready`:

```
GestureHandlerRootView
└─ RootProvider              (CpkProvider: theme + SafeAreaProvider + fonts; kstyled ThemeProvider inside)
   └─ ErrorBoundary
      └─ KeyboardProvider
         └─ ActionSheetProvider
            └─ ConvexAuthProvider  client={convex}
                                   storage={Platform.OS === 'web' ? undefined : secureStorage}
               └─ SessionCacheBoundary → ConvexQueryCacheProvider
                  └─ Locale → AccessibilityPreferences → Connectivity → LegacySensitiveStorageCleanup + BootGate
                     └─ AppLockProvider → AuthGate
                        └─ ready: LedgerAccent → Notification → AppNavigator
```

Do **not** add a second `SafeAreaProvider`; cpk-ui's `CpkProvider` already renders one.

### 13.2 Why the flash happens

Three asynchronous facts must land before the app knows which screen to show, and each is a separate frame:

1. `ConvexAuthProvider` reads the refresh token out of SecureStore — **async**, ~10–40 ms.
   Until it resolves, `useConvexAuth()` reports `{isLoading: true, isAuthenticated: false}`.
2. The token is exchanged for a JWT and the WebSocket authenticates — another round trip.
3. `api.user.queries.currentUser` returns `undefined` until its first result arrives.

**Every naive gate branches on `isAuthenticated` while `isLoading` is still true, paints the sign-in screen,
then replaces it.** That is the flash.

### 13.3 The four-layer fix

**Layer 1 — never branch on a value that is still loading.**

```ts
const {isLoading: authLoading, isAuthenticated} = useConvexAuth();
const user = useQuery(
  api.user.queries.currentUser,
  isAuthenticated ? {} : 'skip',
);

const stage: SessionStage = authLoading
  ? 'loading'
  : !isAuthenticated
    ? 'signed-out'
    : user === undefined
      ? 'loading' // first result not in yet
      : user === null
        ? 'profile-missing'
        : user.suspended
          ? 'suspended'
          : user.purgeAfter !== null
            ? 'pending-deletion'
            : user.onboardingStep !== 'done'
              ? 'onboarding'
              : lockRequired
                ? 'locked'
                : 'ready';
```

`profile-missing` must **not** fold into `'loading'`, or a session that outlived its profile hangs on the
splash forever. It fires `void signOut()`.

**Layer 2 — keep the native splash up until the stage is decided.** `AuthGate` returns `null` while
`stage === 'loading'`, and `SplashScreen.hideAsync()` runs in an effect keyed on
`stage !== 'loading' && fontsReady`. No navigator is mounted before the answer exists, so there is no wrong
screen to paint. This alone removes the flash; layers 3 and 4 remove the _blank splash dwell_.

**Layer 3 — MMKV hint for an instant, correct skeleton.** MMKV reads are **synchronous**, so they are
available before the first frame:

```ts
// src/features/auth/sessionHint.ts
export interface SessionHint {
  hadSession: boolean;
  lastStage: Exclude<SessionStage, 'loading'>;
  lastOnboardingStep: OnboardingStep | null;
  writtenAt: number;
}

const HINT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function readSessionHint(): SessionHint | null; // sync, MMKV
export function writeSessionHint(session: Session): void; // called whenever `stage` settles
export function clearSessionHint(): void; // on sign-out and on profile-missing
```

While `stage === 'loading'`, if `readSessionHint()?.hadSession` is true we render the **app shell skeleton**
(tab bar, header, FlashList placeholders) instead of the splash — so a returning user sees their app
materialise rather than a logo. If the hint says `signed-out`, we can safely mount `(auth)` immediately.

**The hint is a rendering hint only.** It never grants access: every server function re-checks, and if the
real stage disagrees the `Stack.Protected` guards correct it on the next frame. Treating it as authority
would be a client-side auth bypass. It contains no handle, display name, email, avatar, user/document id,
or ledger content; those values may appear only after a live query lands.

**Layer 4 — geometry-matched live-query transition.** `currentUser` remains a live Convex query. The
PII-free hint may choose only the skeleton geometry; it never supplies identity or route authority. The
settled live result replaces the skeleton without persisting a profile mirror.

**Measurement gate.** D6's typed local `APP_START` diagnostic buckets the duration at splash hide and
never uploads it automatically. `observability.md` measures at least 20 production-mode cold starts per
reference device. Regression budget: sample **p50 ≤450 ms, p95 ≤900 ms** for a warm authenticated user;
this is release evidence, not an uncollected fleet percentile.

### 13.4 Token lifecycle edge cases

| case                                                                   | behaviour                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh token revoked server-side (`invalidateSessions` after a merge) | The next refresh fails → `isAuthenticated` flips false → `stage` becomes `signed-out` → `(auth)` mounts. `clearSessionHint()` runs in the same effect so the next cold start does not show the app skeleton.                                                                                      |
| Device offline at cold start                                           | The refresh token settles when connectivity permits; until then the PII-free session hint may show only shell geometry. No prior profile or ledger data is restored from disk, and writes remain visibly uncommitted with Retry.                                                                  |
| App restored from another device's backup                              | `THIS_DEVICE_ONLY` means the keychain item is absent → clean `signed-out`. Correct and intended.                                                                                                                                                                                                  |
| User deleted from another device                                       | `beforeSessionCreation` only runs at sign-in, so the live session survives until its JWT expires; `requireActiveProfile` rejects every call in the meantime and the client routes to `/account/deleted` on the first `ACCOUNT_DELETED` error.                                                     |
| User suspended while a session is live                                 | `currentUser.suspended` moves the root to `/account/suspended`; `requireActiveProfile` also rejects every capability with `ACCOUNT_SUSPENDED`. A new sign-in is refused by `beforeSessionCreation`, and the sign-in adapter opens the same public, data-free help surface from the typed payload. |

---

## 14. App lock (PIN + biometrics), redesigned

### 14.1 What the legacy did, and everything wrong with it

`Lock.tsx` + `SettingLock.tsx` (note 01 §5.6, §5.27):

- `AsyncStorage.LOCKED = "true"`, **`LOCKED_NUMBER = "1234"` in plaintext**, `LOCKED_FINGERPRINT = bool`.
- 4 one-character `secureTextEntry` inputs compared with `pw1+pw2+pw3+pw4 === LOCKED_NUMBER`.
- Biometrics via `NativeModules.ExponentFingerprint.authenticateAsync(...)`, bypassing the SDK.
- On biometric failure: `navigation.goBack()` — from the **root** route, so nothing happens and the user is
  stuck on a dead screen.
- Turning the lock **off** in Settings deleted all three keys **with no authentication whatsoever** — anyone
  holding the unlocked phone could disable it.
- The app locked **only on cold start**. No auto-lock, no lock-on-background.

### 14.2 The redesign

| dimension            | decision                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary factor       | **Device biometrics or device passcode**, via `expo-local-authentication` `authenticateAsync({disableDeviceFallback: false})`. The OS is the strongest authenticator on the device; use it.                                                      |
| Secondary factor     | An **optional app-specific 6-digit PIN** (up from 4), for devices with no enrolled biometrics and for users who want a code distinct from their phone unlock.                                                                                    |
| Where the PIN lives  | `expo-secure-store` only, as a salted scrypt verifier. **Never on the server, never in MMKV, never in plaintext.** (I9)                                                                                                                          |
| Trigger              | Cold start, `AppState` → `background`, and inactivity ≥ `autoLockAfterMs`. All three, all new.                                                                                                                                                   |
| Privacy screen       | On `AppState === 'inactive'`, render an opaque cover so the app-switcher snapshot never shows spending data.                                                                                                                                     |
| Turning the lock off | Requires passing the lock first.                                                                                                                                                                                                                 |
| Forgotten PIN        | No recovery. "PIN을 잊으셨나요?" destroys the lock config and signs the user out; they re-authenticate with their real provider.                                                                                                                 |
| Scope                | Purely local. The lock never changes server authorization and failing it never signs the user out (until the destroy threshold). New push registration pauses while the lock route is visible; already-registered OS push delivery is unchanged. |

### 14.3 Stored record

```ts
// src/features/lock/lockStore.ts
const LOCK_KEY = 'bookoo.applock.v1';

export interface AppLockRecord {
  version: 1;
  /** Which account this lock belongs to. A different sign-in destroys it (§12.1). */
  lockOwnerUserId: string;
  biometricsEnabled: boolean;
  /** undefined when the user relies on biometrics/device passcode only. */
  pin?: {
    algo: 'scrypt';
    n: number; // 8192
    r: number; // 8
    p: number; // 1
    dkLen: number; // 32
    saltB64: string; // 16 random bytes from expo-crypto getRandomBytes
    verifierB64: string; // scrypt(pin, salt)
    digits: 6;
  };
  autoLockAfterMs: number; // 0 = immediately on background; default 60_000
  failedAttempts: number;
  lockedUntil?: number; // epoch ms, exponential backoff
}

export function readLockRecord(): Promise<AppLockRecord | null>;
export function writeLockRecord(record: AppLockRecord): Promise<void>;
export function destroyLockRecord(): Promise<void>;
```

Written with the same `SECURE_STORE_OPTIONS` as the session tokens (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), so
the lock config does not survive a restore onto a different device.

A **separate, synchronous MMKV mirror** holds only the two booleans the cold-start path needs before the first
frame — `lock.enabled` and `lock.lastActiveAt`. Neither is a secret, and MMKV's synchronous read is what lets
the lock screen render on frame 1 instead of flashing the app behind it (the §13.2 problem again, in
miniature). The SecureStore record remains the authority; the mirror is rewritten on every lock/unlock.

### 14.4 The PIN KDF — and an honest statement of what it buys

```ts
// src/features/lock/kdf.ts — the ONLY place @noble/hashes is imported
import {scrypt} from '@noble/hashes/scrypt.js';

export const SCRYPT_PARAMS = {N: 8192, r: 8, p: 1, dkLen: 32} as const; // ~8 MiB, ~150–400 ms in Hermes

export async function derivePinVerifier(
  pin: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return scrypt(new TextEncoder().encode(pin), salt, SCRYPT_PARAMS);
}

/** Constant-time compare. A timing side channel on a 6-digit PIN is not the threat, but it costs nothing. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
```

**A 6-digit PIN has ~10⁶ of entropy. No KDF makes that brute-force-proof against an attacker holding the
verifier.** scrypt at N=2¹³ costs roughly 10⁶ × 250 ms ≈ 70 hours on-device single-threaded, but an attacker
who exfiltrated the record runs it off-device where 8 MiB scrypt is ~10³ hashes/s/core → the space falls in
minutes. So state the real security model:

1. **The keychain is the boundary.** Extracting the verifier requires the same access that would also yield
   the Convex refresh token — at which point the PIN is not the weakest link.
2. **The attempt policy is the actual control** (§14.5).
3. scrypt is defence in depth against a _casual_ dump, not against a determined forensic extraction.

Rejected alternatives: PBKDF2-HMAC-SHA512 at OWASP's 210,000 iterations takes 4–10 s in Hermes (unusable for
a lock screen); `expo-crypto.digestStringAsync` iterated ~2,000 times avoids the dependency but pays
unpredictable bridge overhead per call; `crypto.subtle` has no scrypt (only PBKDF2/HKDF) in the RN runtime.

### 14.5 Attempt policy

| failures | consequence                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| 1–4      | Inline error, haptic, shake animation.                                                                     |
| 5        | 60 s lockout (`lockedUntil`).                                                                              |
| 10       | 15 min lockout.                                                                                            |
| 15       | **Destroy the lock record and sign out.** The user must re-authenticate with Kakao/Naver/Google/Apple/OTP. |

`failedAttempts` and `lockedUntil` live in the SecureStore record so killing the app does not reset them.
A successful unlock resets `failedAttempts` to 0. Biometric failures do **not** increment the counter — the OS
runs its own lockout there.

### 14.6 The gate

```ts
// src/features/lock/useAppLock.ts
export interface AppLock {
  enabled: boolean;
  locked: boolean;
  /** Attempt a biometric unlock; returns false on cancel or on no enrolled factor. */
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lockNow: () => void;
  configure: (input: {
    pin?: string;
    biometricsEnabled: boolean;
    autoLockAfterMs: number;
  }) => Promise<void>;
  disable: () => Promise<void>; // requires a successful unlock in the last 60s
}
```

```ts
const result = await LocalAuthentication.authenticateAsync({
  promptMessage: t('lock.prompt'), // "BooKoo 잠금 해제"
  cancelLabel: t('lock.usePin'),
  disableDeviceFallback: false, // device passcode is an acceptable factor (legacy parity)
  requireConfirmation: false,
});
```

Capability probing before offering biometrics, exactly as the legacy did but through the SDK:
`hasHardwareAsync()` → `isEnrolledAsync()` → `supportedAuthenticationTypesAsync()` (to label the button
"Face ID" / "지문" / "홍채" correctly). If hardware exists but nothing is enrolled, the settings row is shown
disabled with `t('lock.biometricsNotEnrolled')` — the legacy alerted `FINGERPRINT_IS_NOT_SET`; we explain it
in place instead of interrupting.

Lifecycle:

```ts
useEffect(() => {
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'inactive') setCovered(true); // app-switcher privacy cover
    if (next === 'background') {
      mmkv.set('lock.lastActiveAt', Date.now());
      if (record.autoLockAfterMs === 0) lockNow();
    }
    if (next === 'active') {
      setCovered(false);
      const idle = Date.now() - (mmkv.getNumber('lock.lastActiveAt') ?? 0);
      if (record.enabled && idle >= record.autoLockAfterMs) lockNow();
    }
  });
  return () => sub.remove();
}, [record]);
```

Cold start: `mmkv.getBoolean('lock.enabled')` is read **synchronously** at module scope, so `stage` starts as
`'locked'` and `Stack.Protected guard={stage === 'locked'}` mounts `app/lock.tsx` on the first frame. On
mount, if `biometricsEnabled`, the biometric prompt fires immediately (biometric-first with PIN fallback —
preserved from the legacy). There is **no back gesture** and **no `goBack()`**; the only exits are a
successful unlock or "PIN을 잊으셨나요?".

### 14.7 UI preserved and improved

Preserved from the legacy: the boxed PIN entry with auto-advance / auto-retreat focus, biometric-first with
PIN fallback, the lock running before any data screen, and a toggle row in 설정.

Changed: **6 digits, not 4**; a single hidden `TextInput` driving six presentational boxes rather than six
real inputs (the legacy's per-box focus juggling breaks with Korean IMEs and with paste); `keyboardType:
'number-pad'`, `textContentType: 'oneTimeCode'` off, `secureTextEntry` on the hidden field; haptic feedback
per digit; and the settings toggle now routes through `disable()`, which requires a fresh unlock.

---

## 15. Rate limiting and abuse control

FightingHows has **no rate limiting at all** (note 09 §4.3), and `@convex-dev/auth` only limits _failed_
verifications. BooKoo uses the exact-pinned `@convex-dev/rate-limiter@0.3.2`. `SCHEMA.md` §2.2 is the
only component mount and the only `new RateLimiter(...)` definition; its sixteen-bucket union includes
all nine auth buckets (`otpRequestPerEmail`, `otpRequestGlobal`, `handleClaim`, `handleRename`,
`emailLinkRequest`, `emailLinkConfirm`, `accountLink`, `legacyClaim`, and `deletionRequest`). Auth call
sites import that shared instance.

Plus `signIn: {maxFailedAttempsPerHour: 5}` on `convexAuth` (library key, typo included).

**`checkHandleAvailability` is deliberately left unlimited.** It is one indexed read, queries cannot write (so
a hand-rolled counter would have to be a mutation, which would be more expensive than the thing it protects),
and the real cost and the real abuse live in the _claim_. This is the pragmatic split note 09 §12.8 argues
for. If enumeration ever becomes a problem, move the limit to a per-connection budget in the component rather
than turning a read into a write.

`RATE_LIMITED` throws with `error.rateLimited` and a `retryAfterSeconds` param so the client can render a
countdown instead of a dead button.

---

## 16. i18n error keys

The server throws keys; the client translates. Minimum set (ko/en/ja/zh/id, note 04 §4):

```
error.auth.google.noSub            error.auth.apple.aud / .nonce / .noSub / .state / .parse / .notConfigured
error.auth.kakao.aud / .nonce / .noSub / .foreignToken
error.auth.naver.profile           error.auth.otp.email / .mismatch
error.auth.accountPurged           error.account.deleted / .purged / .suspended
error.handle.TOO_SHORT / .TOO_LONG / .BAD_CHARSET / .BAD_EDGE / .DOUBLE_SEPARATOR
error.handle.reserved / .taken / .cooldown / .renameTooSoon / .alreadySet / .notSet
error.link.duplicate / .bothHaveData / .unlinkFirst / .lastMethod
error.email.invalid / .inUse
error.legacy.notFound / .alreadyClaimed / .notYours / .tooMany
error.rateLimited                  error.onboardingRequired / error.handle.required
user.deleted                       lock.prompt / .usePin / .biometricsNotEnrolled / .forgotPin
```

`error.handle.*` keys deliberately mirror the `HandleRejection` union member names, so
`` `error.handle.${reason}` `` is exhaustive by construction and a new rejection reason fails the
`eslint-plugin-i18n-json` check rather than rendering a raw key.

**Do not copy FightingHows' Korean sentences into `throw`.** They are unreachable for a Japanese user and
untranslatable after the fact.

---

## 17. Test plan

`shared/` is the only code that unit-tests cleanly without a Convex harness, which is exactly why the
security-critical logic lives there.

**Unit (`__tests__/`, jest-expo):**

- `username.test.ts` — NFKC folding (`ｈｙｏ` → `hyo`), Cyrillic rejection, edge/consecutive-separator rules,
  every `RESERVED_EXACT` entry, prefix rules, `confusableKey` pairs, `suggestHandles` determinism and its
  Korean-name-collapses-to-`user` path, **and the route-manifest collision guard**.
- `authPolicy.test.ts` — `shouldAutoLinkViaEmail` truth table incl. whitespace-only email; the four
  `hasMatchingAccountEmails` branches; `isEmailOtpProvider` across all five ids.
- `email.test.ts` — `normalizeEmail` casing/trim/no-`@`, **and a byte-diff against `scripts/migrate/lib/email.ts`**.
- `onboarding.test.ts` — `nextOnboardingStep` over all 2×2×2×5 fact combinations; legacy-before-ledger ordering.
- `constants.test.ts` — I8 (`DELETION_GRACE_MS < HANDLE_RELEASE_COOLDOWN_MS`).
- `kdf.test.ts` — scrypt vector, `timingSafeEqual`.

**Integration (`convex-test`):**

- Two concurrent `claimHandle` calls for the same key → exactly one succeeds, the other throws
  `HANDLE_TAKEN`. This is the test that proves §10.3.
- Release → immediate re-claim by the owner succeeds; by a stranger throws `HANDLE_COOLDOWN`; after
  90 days succeeds.
- Google-then-Apple on one verified email → one `users` row, two `authAccounts`.
- Kakao-without-consent → a second `users` row; then `linkAccount` merges it only when both emails match.
- Naver → never auto-merges, even with a matching email string.
- `requestAccountDeletion` → handle released, session still opens, only `/account/deleted` reachable,
  `cancelAccountDeletion` restores the handle.
- Ledger handoff: sole-member → orphaned; owner-with-members → earliest-joined member becomes owner.
- Legacy: 0 / 1 / 2 candidates on one email → nothing / auto-claim / `ambiguous`.
- `confirmEmailLink` on an address another user holds → their row soft-deletes, ledgers unchanged.

**Manual / device matrix (no substitute exists):** iOS Face ID and Touch ID, Android fingerprint and
no-biometrics, KakaoTalk installed vs not (the app hand-off is a different code path from the web sheet),
Apple on Android (the whole `form_post` → fragment → deep-link chain), Kakao with and without email consent,
and a release build with R8 enabled (the ProGuard rules only matter there).

---

## 18. Open questions

1. **Closed by D5 — recovery scope.** RTDB has 434 users without a usable profile email and 270 without
   `info`; the exact provider-derived `orphan_no_email` count remains an Auth-export preflight value, not
   an architecture question. The help UI, dual-approved support path, ownership rescue, and
   no-automatic-purge policy ship regardless of the count.
2. **Legacy accounts with two entries on one email — how many?** If it is zero, the `legacy` onboarding step
   can be dropped to a settings-only flow and the state machine loses a state.
3. **Zh/id at launch, or ko/en/ja first?** Five OTP provider ids means five `authAccounts` rows per address in
   the worst case; three is nicer. Note 04 recommends keeping all five locales, but the OTP provider ids can
   ship incrementally (falling back to `bookoo-otp` / English) without a migration.
4. **Does the co-member dispute window (§11.6) need a real moderation queue on day one**, or is an
   `authAudit` row plus an email to support enough for the expected volume?
5. **Closed by D4:** keep `authorId` pointing at the PII-cleared authless `users` tombstone. Re-attributing
   it to the current owner would fabricate authorship. Receipt photos/comments are purged separately, while
   the shared financial row survives so co-member totals do not change.
6. **App-lock auto-lock default.** 60 s is proposed. Legacy had none, so there is no user expectation to
   preserve; worth a look at what Toss/뱅크샐러드 default to before shipping.
