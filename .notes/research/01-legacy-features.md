# 01 — Legacy BooKoo: complete FEATURE + SCREEN inventory

Source of truth: `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/` (read-only reference).
App version in `package.json` = `2.0.2`; `app.json` `expo.version` = `3.0.0`; Android `versionCode` 24;
`VERSION` constant shown in Settings = `'2.0'` (`src/utils/Data.ts`).

Everything below was read from source. Paths are absolute where they matter.

---

## 0. Stack snapshot (what we are replacing)

| Concern | Legacy | Notes |
|---|---|---|
| Runtime | `expo` ^36.0.2, `sdkVersion` 36.0.0, RN from `https://github.com/expo/react-native/archive/sdk-36.0.0.tar.gz`, React ^16.9.0 | Classic (non-bare) Expo, `main: node_modules/expo/AppEntry.js` |
| Nav | `@react-navigation/*` v5 **alpha** (`stack` 5.0.0-alpha.68, `native` 5.0.0-alpha.29, `material-bottom-tabs` 5.0.0-alpha.40) | Only `createStackNavigator` is actually used |
| Tabs | `react-native-tab-navigator` ^0.3.4 | NOT react-navigation tabs |
| Drawer | `react-native-side-menu` ^1.1.3 | Custom drawer inside `Main` |
| State | `redux` ^4.0.5 + `react-redux` ^7.1.3, `immutability-helper` ^3.0.1 | Plain `createStore`, no middleware, no thunk |
| Backend | `firebase` ^7.7.0 (Realtime Database + Auth + Storage) | Root ref is `firebase.database().ref('bookoo')` |
| Local DB | `expo-sqlite` ^8.0.0, db file `db.db`, one table `categories` | Categories are **device-local**, not synced |
| Styling | `react-native-extended-stylesheet` ^0.12.0 + `src/BaseStyles.ts` (360 `$N` size vars) | Light-mode only, no theming |
| i18n | `react-native-globalize` ^3.0.0 + hand-rolled `STRINGS.js` | 5 languages |
| Dates | `moment` ^2.24.0 + locale imports ko/ja/zh-cn/es/fr/id | |
| Charts | `react-native-pie` ^1.1.0 (donut), `react-native-svg` 9.13.3 (hand-drawn line graph), `@react-native-community/art` | |
| Lists | `deprecated-react-native-listview` ^0.0.6, `react-native-smooth-swipe-list` ^1.4.7, `FlatList` | |
| Images | `expo-image-picker` ^8.0.2, `react-native-pinch-zoom-view` ^0.2.0, `react-native-swiper` ^1.5.14 | |
| Maps | `react-native-maps` 0.26.1 + Google Maps API keys hardcoded in `app.json` | |
| Auth providers | Email/password, `expo-facebook` (appId `437626799936821`), `expo-google-app-auth` | |
| Biometrics | `expo-local-authentication` ~8.0.0 + raw `NativeModules.ExponentFingerprint` | |
| Ads | `expo-ads-admob` ^8.0.0 | **All banner call-sites are commented out** |
| Analytics | `expo-analytics-amplitude` ^8.0.0 | |
| Crash | `sentry-expo` ^2.0.1 | |
| Misc | `apsl-react-native-button`, `react-native-modalbox`, `react-native-loading-spinner-overlay`, `react-native-snackbar-component`, `react-native-communications`, `react-native-display`, `react-native-modal-datetime-picker`, `react-native-simple-encryption`, `react-native-tab-view` 2.12.0 | |

Module aliases (`babel.config.js`, `module-resolver`): `@assets`, `@apis`, `@libs`, `@navigation`,
`@screen`, `@shared`, `@utils`, `@actions`, `@reducers`, `@models`, `@STRINGS`, `@BaseStyles`, `@app`.

---

## 1. App bootstrap

### `App.ts` (repo root)
```ts
import * as Sentry from 'sentry-expo';
import App from './src/App';       // resolves to src/app.js (case-insensitive macOS FS)
Sentry.init({
  dsn: 'https://<REDACTED:legacy-sentry-dsn-key>@sentry.io/1271305',
  enableInExpoDevelopment: true,
  debug: true
});
export default App;
```

### `src/app.js` — the real root component
Order of operations:
1. Imports `moment/locale/{ko,ja,zh-cn,es,fr,id}`.
2. `Globalize.load([require('@assets/cldr.json')])`.
3. `createStore(combineReducers({...reducers}))` — **no middleware, no devtools, no persistence.**
4. `firebase.initializeApp(firebaseConfig)` with the config inline in source:
   `apiKey <REDACTED:legacy-firebase-web-api-key>`, `projectId bookoo-89f6c`,
   `databaseURL https://bookoo-89f6c.firebaseio.com`, `storageBucket bookoo-89f6c.appspot.com`,
   `messagingSenderId 41319162996`.
5. `Amplitude.initialize('<REDACTED:legacy-amplitude-key>')`.
6. `SQLite.openDatabase('db.db')`.
7. `componentDidMount`: `_createSqlite()` + `_loadAssetsAsync()` + `setLocale(store)`.
   - `_createSqlite()` checks AsyncStorage `APP_INSTALLED`. If absent → creates
     `create table if not exists categories (id integer primary key AUTOINCREMENT, category int, iconId int, text text);`
     then inserts all 34 `INITIAL_CATEGORIES` rows with `getString(text)` (the **translated label is
     frozen into the DB at install time** — changing app language does NOT re-translate existing
     categories; a real bug worth not repeating).
   - `_loadAssetsAsync()` `Asset.loadAsync(ICONS)` (~90 PNGs) then `dispatch(updateAppState(true))`.
8. Render: `AppLoading` until `isAppReady`, then
   `<Provider store><FormattedProvider locale currency><View><StatusBar barStyle="dark-content"/><RootStackNavigator/></View></FormattedProvider></Provider>`.
   Note `FormattedProvider` reads `store.getState()` **once at render** → currency/locale change needs an app reload.

---

## 2. Navigation tree

`src/components/navigation/RootStackNavigator.tsx` — a **single flat `createStackNavigator`** with
`screenOptions={{ headerShown: false }}` (every screen draws its own header). `initialRouteName` is
computed at runtime; while it is empty the component renders `<AppLoading/>`.

### Start-page decision (inside `firebase.auth().onAuthStateChanged`)
```
isLocked = JSON.parse(await AsyncStorage.getItem('LOCKED'))
if (isLocked)        -> startPage = 'Lock'
else if (!user)      -> startPage = 'Tutorial'
else                 -> startPage = 'Main'
(catch)              -> startPage = 'Tutorial'
```
Also calls `_registerForPushNotifications()` on mount and removes the subscription on unmount.

### Registered routes (30), in declaration order
```
Tutorial                -> @screen/Tutorial
Lock                    -> @screen/Lock
Main                    -> @screen/Main
Login                   -> @screen/Login
Signup                  -> @screen/Signup
Intro                   -> @screen/Intro
FindPw                  -> @screen/FindPw
ProfileMine             -> @screen/ProfileMine
ProfileYours            -> @screen/ProfileYours
Setting                 -> @screen/Setting
SettingAnnouncement     -> @screen/SettingAnnouncement
SettingOpinion          -> @screen/SettingOpinion
SettingFAQ              -> @screen/SettingFAQ
SettingNoti             -> @screen/SettingNoti
SettingLock             -> @screen/SettingLock
LedgerAdd               -> @screen/LedgerAdd
LedgerSearch            -> @screen/LedgerSearch
LedgerUpdate            -> @screen/LedgerUpdate
LedgerDetail            -> @screen/LedgerDetail
LedgerSettingCurrency   -> @screen/LedgerSettingCurrency
LedgerSettingLanguage   -> @screen/LedgerSettingLanguage
SeeMembers              -> @screen/SeeMembers
LedgerItemAddOrUpdate   -> @screen/LedgerItemAddOrUpdate   (dir: index.tsx + ConsumeView + IncomeView)
LedgerItemDetail        -> @screen/LedgerItemDetail
LedgerLineGraph         -> @screen/LedgerLineGraph
GoogleMap               -> @screen/GoogleMap
Test                    -> @screen/Test                    (dev stub, renders empty View)
NotFound                -> @screen/NoPage
PictureSwipePage        -> @screen/PictureSwipePage
SeeAllPicture           -> @screen/SeeAllPicture
```

### Tree
```
RootStack (no headers)
├── Tutorial            (3-slide onboarding swiper) ──reset──> Intro
├── Intro               (auth landing) ──> Login / Signup / [FB or Google] ──reset──> Main
│   ├── Login ──> FindPw
│   └── Signup
├── Lock                (PIN / fingerprint gate) ──reset──> Main | Intro
└── Main  [SideMenu drawer + TabNavigator]
    ├── drawer
    │   ├── header: avatar+name+email ──> ProfileMine ; gear ──> Setting ; X closes
    │   ├── ledger rows (color dot, owner crown, member count) → selectLedger(index)
    │   ├── ledger row "MORE" → LedgerUpdate (if owner) | LedgerDetail (if member)
    │   └── "+ ADD_LEDGER" ──> LedgerAdd ──> LedgerSearch
    ├── Tab1  "Monthly"  Calendar + that day's items    ──> LedgerItemDetail
    ├── Tab2  "Lists"    month-sectioned list + search  ──> LedgerItemDetail
    ├── Tab3  "Graph"    donut pie + category list      ──> LedgerLineGraph
    ├── Tab4  "Extra"    ──> LedgerSettingCurrency / LedgerSettingLanguage
    └── navbar "+" ──> LedgerItemAddOrUpdate
                        ├── ──> GoogleMap (pick location)
                        └── ──> PictureSwipePage (update mode → delete photo)

LedgerItemDetail ──> LedgerItemAddOrUpdate (edit) | PictureSwipePage | SeeAllPicture
                 ──> GoogleMap (showOnly) | ProfileYours (tap review author)
LedgerUpdate / LedgerDetail ──> SeeMembers ──> ProfileYours
Setting ──> SettingAnnouncement | SettingOpinion | SettingFAQ | SettingNoti | SettingLock
```

### `NavigationService.ts`
Imperative singleton over `CommonActions`: `setTopLevelNavigator`, `navigate(name, params)`,
`reset(routeName)` (index 0, single route), `goBack()`. Used for the auth resets
(`Intro`/`Main`) from Tutorial, Intro, Login, Signup, Lock, Setting-logout.

### Android back-button handling (a hack to preserve semantics)
`src/utils/Data.ts` exports a mutable module-level array `routes: []`. Almost every non-root screen
does `routes.push(this.props.routeName)` in `componentDidMount` and `routes.pop()` in
`componentWillUnmount`. `Main.componentDidMount` registers `BackHandler` `hardwareBackPress`:
```
if (routes.length !== 0)              return false;   // a child screen is on top
else if (drawer.isOpen)               { close; return true; }
else if (selectedTab !== 'tab1')      { changeTab('tab1'); return true; }
return false;
```
Note `this.props.routeName` does not exist in react-navigation v5, so `routes` is filled with
`undefined` values — it works only as a *depth counter*.

---

## 3. Redux state shape

`src/reducers/index.ts` — 9 reducers combined by name. **Full initial state:**

```ts
{
  appIsReady: false,                              // reducer name: appIsReady
  locale: new Locale({                            // reducer name: locale
    lang: 'en', currencyLang: 'en-us',
    currency: 'USD', unit: '$', display: 'ENGLISH',
  }),
  isLoggedIn: false,                              // reducer fn isLoggedIn, initial from `login`
  myProfile: null,                                // {displayName,email,tel,statusMsg,photoURL}
  membersInLedger: [],                            // declared, never dispatched to (dead)
  selectedLedger: new Ledger(),                   // { key, info:{color,description,people,title},
                                                  //   items:[], members:[], owner:'', visible:true }
  selectedLedgerItem: new LedgerItem(),           // BUG: reducer default is `initialState` (whole obj)
  categories: [],                                 // rows from SQLite: {id,category,iconId,text}
  currentMoment: { current: moment(), selected: moment() },
}
```

### Action creators (`src/actions/index.ts`) → action `type`
| creator | type | consumed by |
|---|---|---|
| `updateAppState(v)` | `UPDATE_APP_STATE` | `src/app.js` after asset preload |
| `updateSelectedDate(v)` | `MOMENT_SELECT_SELECTED` | Calendar `selectDate`/`selectMoment` |
| `updateCurrentMoment(v)` | `MOMENT_SELECT_CURRENT` | Calendar prev/next/swipe |
| `updateLocale(v)` | `UPDATE_LOCALE` | `setLocale()`, LedgerSettingCurrency, LedgerSettingLanguage |
| `updateLoginState(v)` | `UPDATE_LOGIN_STATE` | imported in `src/app.js` but never dispatched (comment says it became useless after Firebase) |
| `updateProfile(v)` | `UPDATE_PROFILE` | ProfileMine.handleUpdate; imported in RootStackNavigator but never used |
| `updateMembersInLedger(v)` | `UPDATE_MEMBERS_IN_LEDGER` | **never dispatched** |
| `updateSelectedLedger(v)` | `UPDATE_SELECTED_LEDGER` | Main.setMyLedgers / selectLedger / handleLedgerUpdate |
| `selectLedgerItem(v)` | `SELECT_LEDGER_ITEM` | Tab1/Tab2 row press, LedgerItemAddOrUpdate |
| `updateCategories(v)` | `UPDATE_CATEGORIES` | `src/app.js` after SQLite select |
| `addCategory(v)` | `ADD_CATEGORY` | LedgerItemAddOrUpdate.handleCategoryAdd |
| `deleteCategory(v)` | `DELETE_CATEGORY` | LedgerItemAddOrUpdate.handleCategoryDelete |
| `addOrUpdateSelectedLedgerItem(v)` | `ADD_SELECTED_LEDGER_ITEM` | after item save (merges `{[key]: item}` into `selectedLedger.items`) |
| `deleteSelectedLedgerItem(v)` | `DELETE_SELECTED_LEDGER_ITEM` | after item delete (`delete state.items[key]` — **mutates state in place**) |

Reducer bugs to not carry over: `DELETE_SELECTED_LEDGER_ITEM` and `DELETE_CATEGORY` mutate state
directly (`delete`, `Array.splice`) and return the same reference, so connected components can miss
updates. `selectedLedgerItem`'s default state is the entire `initialState` object.

### `mapState` per screen (who subscribes to what)
- `Main`: `myProfile`, `selectedLedger`
- `Tab1`: `selectedLedger`, `currentMoment`
- `Tab2`: `locale`, `selectedLedger`, `currentMoment`
- `Tab3`: `selectedLedger`, `currentMoment`, `locale`
- `Tab4`: `locale`
- `LedgerItemAddOrUpdate`: `routes`(nonexistent), `locale`, `selectedLedger`, `categories`
- `ConsumeView` / `IncomeView`: `selectedLedger`
- `LedgerItemDetail`: `locale`, `color: state.selectedLedger.info.color`, `selectedLedgerItem`, `selectedLedger`
- `LedgerLineGraph`: `locale`, `selectedLedger`, `currentMoment`
- `LedgerDetail` / `LedgerUpdate` / `ProfileMine`: `myProfile`
- `LedgerSettingCurrency` / `LedgerSettingLanguage`: `locale`
- `Login` / `Signup` / `FindPw` / `Intro`: `isLoggedIn`
- `LedgerListItem`: `locale`, `selectedLedger`; `BackOptionTxtNav`: `selectedLedger`; `Calendar`/`Day`: `currentMoment`, `selectedLedger`

**Dead imports that would throw/undefined today:**
`Main.tsx` imports `updateDrawerState` from `@actions` (does not exist);
`LedgerItemDetail.tsx` imports `getReviews` from `@apis/firebaseApi` and
`updateSelectedLedgerItemReviews` from `@actions` (neither exists).

---

## 4. Firebase Realtime Database data model (root ref `bookoo`)

```
bookoo/
├── users/{uid}/
│   ├── info: { displayName, email, photoURL, statusMsg, tel }
│   ├── ledgers/{ledgerKey}: ledgerKey            // membership index (value == key)
│   └── push_tokens/{encodedToken}: token          // '.' url-encoded to '%2E'
├── ledgers/{ledgerKey}/                           // .indexOn: "info/title"
│   ├── info: { title, description, color: 0..5, people }
│   ├── owner: uid
│   ├── visible: true
│   ├── members/{uid}: uid
│   ├── requests/{uid}: uid                        // join requests awaiting owner approval
│   └── items/{itemKey}/                           // UNBOUNDED — the perf killer
│       ├── category: { iconId, txt, category?, showDelBtn? }
│       ├── memo, amount (formatted string), realAmount (number; NEGATIVE = expense)
│       ├── selectedDate, created, updated (moment().format() ISO strings)
│       ├── writer: uid
│       ├── location: { street, latitude, longitude, ...reverseGeocode fields }
│       ├── picture: [ { path, url, base64? } ]
│       └── reviews/{reviewKey}: { text, writer, date }
├── invites/
│   ├── {ledgerKey}/{encodedEmail}: encodedEmail   // pending invites for a ledger
│   └── {encodedEmail}/{ledgerKey}: ledgerKey      // reverse index for an unregistered email
└── opinions/{pushKey}: { user:{uid,displayName,email,phoneNumber,photoURL}, opinion, createdAt }
```

Storage paths: item photos `ledgers/{ledgerKey}/{itemKey}/{randomStr}{moment()}`; avatar `users/{email}`.
`storage.rules`: any authenticated user can read/write **any** path (wide open).
`database.rules.json`: `bookoo` is `auth != null` read+write at the top level, so the finer per-node
rules underneath are effectively bypassed. Rules also use `auth.id` (should be `auth.uid`) → those
clauses never match.

### API surface — `src/apis/firebaseApi.ts` (exported)
`getPhotoURL, deletePhoto, getMyLedger, getMyLedgers, getMembersInfo, getUserProfile, inviteUsers,
deleteInvites, changeOwner, addReview, deleteReview, addLedger, addOrUpdateLedgerItem,
deleteLedgerItem, updateProfileMine, updateLedgerInfo, exitLedger, deleteLedger, addPushToken,
deletePushToken, sendNotiToUser, sendNotiToUsersInLedger, sendOpinion, searchLedgers, requestLedger,
getRequestedUsers, acceptOrRejectRequestedUser, uploadFile`
Plus three dead/deprecated uploaders kept in file: `uploadPhoto`, `uploadBase64String`,
`uploadPhotoFunction` (posts to `https://us-central1-bookoo-89f6c.cloudfunctions.net/app/picture`).

### API surface — `src/apis/authApi.ts` (exported)
`signupUser, emailLogin, facebookLogin, googleLogin, checkLogin` + private `addInvitedLedgers(userData)`
(on first login, drains `bookoo/invites/{encodedEmail}` into `users/{uid}/ledgers` +
`ledgers/{key}/members/{uid}`). `SERVER_URL = 'http://localhost:3000'` and `checkLogin` are dead code.

### Firebase Cloud Functions — `functions/index.js`
One Express app mounted as `exports.app = functions.https.onRequest(app)` with a single route
`POST /picture` that Busboy-parses a multipart upload and writes to GCS with a signed URL expiring
`03-09-2491`. The client no longer uses it (`uploadFile` uploads directly via the Firebase SDK).
`functions/admin_key.json` (a service-account key) is committed. Also `keys/BooKoo.jks`,
`keys/BooKoo_dist.p12`, `keys/BooKoo_push.p12` and a Sentry `authToken` in `app.json` are committed
→ **all these secrets must be treated as compromised and rotated; do not carry them over.**

---

## 5. SCREEN-BY-SCREEN INVENTORY

Every file under `src/components/screen/`. Format: route → flow → data → UX to preserve → what to replace.

---

### 5.1 `Tutorial.tsx` — route `Tutorial`
- **Reached by**: initial route when `!LOCKED && !user`.
- **Flow**: 3-page `react-native-swiper` (`loop={false}`), images `tutorial1..3.png`, texts
  `TUTORIAL_TXT_HEAD1..3` / `TUTORIAL_TXT_BODY1..3`. Bottom-right "NEXT" button advances; on index 2
  (or `onIndexChanged > 2`) → `NavigationService.reset('Intro')`. `StatusBar hidden`.
- **Data**: none.
- **Preserve**: dark navy `rgb(65,77,107)` background, left-aligned pagination dots, swipe-past-the-end
  to finish.
- **Replace**: `react-native-swiper` → `react-native-pager-view` or `FlashList` horizontal /
  `react-native-reanimated-carousel`. Onboarding "seen" flag should live in MMKV, not implicit auth state.

---

### 5.2 `Intro.tsx` — route `Intro`
- **Reached by**: `NavigationService.reset('Intro')` from Tutorial / Setting-logout / Lock (no user).
- **Flow**: logo; "LOGIN" button → `Login`; "STILL_NO_ACCOUNT / SIGNUP" → `Signup`;
  hardcoded divider text `'----------- or login with -----------'`;
  Facebook button → `facebookLogin()` → on success `reset('Main')`;
  Google button → `googleLogin()` → on success `reset('Main')`.
  Footer opens `https://dooboolab.com/termsofservice` and `https://dooboolab.com/privacyandpolicy`
  via `Linking.openURL`.
- **Data**: writes AsyncStorage `token`, `login_type`; creates `users/{uid}/info` when new;
  `addInvitedLedgers`; `addPushToken(token, true)`; `Amplitude.setUserId` + `logEvent('Facebook Login'|'Google Login')`.
- **Preserve**: per-button loading spinners (`NativeButton isLoading`), ToS/Privacy links.
- **Replace**: Facebook login is dropped (per DECISIONS.md). New providers Kakao/Naver/Google/Apple/
  email-OTP via Convex Auth. The divider must become an i18n string. Apple Sign-In is mandatory on iOS
  once any third-party social login exists.

---

### 5.3 `Login.tsx` — route `Login`
- **Flow**: back arrow; email `TextInput` (ref `'1'`) → password (ref `'2'`, `secureTextEntry`);
  a green check icon (`IC_CHECKED`) appears per field once valid; `onSubmitEditing` chains focus;
  LOGIN button disabled until `validateEmail(email) && pw`; `emailLogin(email, pw)` →
  `NavigationService.reset('Main')`. "FORGOT_PW / FIND_PW" → `FindPw`.
  Keyboard listeners (`keyboardWillShow/Hide`) scroll the ScrollView to end after 100 ms.
- **Data**: `firebase.auth().signInWithEmailAndPassword`; on success `addPushToken(pushToken, true)`,
  `Amplitude.setUserId(uid)`, `logEvent('Email Login')`. Errors surface as `Alert.alert`.
- **Preserve**: inline per-field validity checkmarks, disabled-until-valid submit, keyboard avoidance.
- **Replace**: email+password → **email OTP** (Convex Auth). String refs (`ref='1'`) are removed in
  React 19. `KeyboardAvoidingView` → `react-native-keyboard-controller`.

---

### 5.4 `Signup.tsx` — route `Signup`
- **Flow**: 4 fields — email, password (`PASSWORD_SIGNUP_HINT`), password confirm, displayName.
  Validation: `validateEmail`, `pw.length >= 6`, `pw === pwOk`, `displayName` non-empty.
  (`onTextChanged` has a real bug: the displayName branch sets `notValidate = false`, clearing earlier
  failures.) `signupUser(user)` → `reset('Main')`.
- **Data (`authApi.signupUser`)**: `createUserWithEmailAndPassword` →
  `currentUser.sendEmailVerification()` → set `bookoo/users/{uid}/info = {displayName, email, photoURL:'', tel:'', statusMsg:''}`
  → `addInvitedLedgers(userData)` → `addPushToken` → `Amplitude.setUserId` + `logEvent('Email Signup')`.
  Failure alert title is a hardcoded Korean string `'회원가입 실패'`.
- **Preserve**: email-verification-on-signup, the invite-drain on first signup (an invited email that
  registers must immediately see the ledger).
- **Replace**: same as Login. New requirement from DECISIONS.md: force a unique Instagram-style
  **handle/username** at first login.

---

### 5.5 `FindPw.tsx` — route `FindPw`
- **Flow**: single email field → `SEND_LINK` → `firebase.auth().sendPasswordResetEmail(email)` →
  success/failure `Alert`.
- **Replace**: obsolete once auth is email-OTP/social — delete the screen.

---

### 5.6 `Lock.tsx` — route `Lock` (app-lock gate)
- **Reached by**: `initialRouteName` when AsyncStorage `LOCKED === true`.
- **Flow** (`componentDidMount`): read `LOCKED`, `LOCKED_NUMBER`, `LOCKED_FINGERPRINT`.
  On Android with fingerprint enabled → open `ModalFingerprint`. Then, if `LOCKED_FINGERPRINT`:
  `unLockFingerprint()`; if it resolves truthy → `goToApp()`; otherwise `this.props.navigation.goBack()`
  (**bug**: `Lock` is the root, so there is nothing to go back to).
  PIN path: four 1-char `secureTextEntry` numeric `TextInput`s that auto-advance/auto-retreat focus,
  then `AUTH_WITH_PW` button compares `pw1+pw2+pw3+pw4` string-equal to `LOCKED_NUMBER`.
- **`unLockFingerprint()`** calls `Fingerprint.hasHardwareAsync()` + `isEnrolledAsync()`, then bypasses
  the SDK and calls `NativeModules.ExponentFingerprint.authenticateAsync(...)` directly
  (iOS passes the prompt string `FINGERPRINT_AUTH_TO_USE_APP`).
- **`goToApp()`**: `LayoutAnimation.configureNext(easeInEaseOut)` then
  `NavigationService.reset(firebase.auth().currentUser ? 'Main' : 'Intro')`.
- **Preserve**: 4-box PIN with auto-advance focus; biometric-first with PIN fallback; the lock gate
  runs *before* any data screen.
- **Replace**: `NativeModules.ExponentFingerprint` → `expo-local-authentication`
  `authenticateAsync({ promptMessage, disableDeviceFallback:false })`. PIN must be stored hashed in
  `expo-secure-store` (see §7).

---

### 5.7 `Main.tsx` — route `Main` (the app shell: drawer + 4 tabs)
The single most important screen. 852 lines.

**Structure**: `<SideMenu ref='drawer' openMenuOffset={330*ratio} hiddenMenuOffset={0} menu={…}>` wrapping
`<TabNavigator>` (from `react-native-tab-navigator`) containing 4 `TabNavigator.Item`s.

**Drawer content (menu)** — a `ScrollView` with:
- Header row: close (X) button, gear button → `Setting`.
- Account block → `ProfileMine`; shows a small **red dot** when `!firebase.auth().currentUser.emailVerified`;
  avatar `key={new Date()}` (forces an image refetch on every render — perf bug), falls back to
  `@assets/imgs/mask.png`; name falls back to `NONAME`, email to `NOEMAIL`.
- One row per ledger: colored dot (`IC_RED|ORANGE|YELLOW|GREEN|BLUE|PURPLE` by `info.color` 0..5),
  an **owner crown** overlay (`picOwner.png`) if `ledger.owner === currentUser.uid`, title, and
  `"{n} Person|People"` (hardcoded English, not i18n). Tapping the left side → `selectLedger(index)`.
  Tapping the right "MORE" → `goToLedgerUpdate(ledger, index)` which routes to **`LedgerUpdate` if
  owner, else `LedgerDetail`**, passing `{index, data, handleLedgerUpdate, handleSetMembers,
  handleSetOwner, handleExitLedger}` — callbacks passed through navigation params, 2 levels deep.
  A small blue dot (`drawerItemAlert`) shows when `ledger.hasInvite` (pending join requests, owner only).
- `+ ADD_LEDGER` row → `LedgerAdd`.

**Data load** (`componentDidMount`):
```ts
firebase.database().ref('bookoo').child('/users/'+uid+'/ledgers').on('value', snaps => setMyLedgers(snaps))
```
`setMyLedgers` → `getMyLedgers(snapshots)` → for each key `getMyLedger(key)` which does
`ledgers/{key}.once('value')` — i.e. **downloads the whole ledger node including every item, every
review and every picture record**. Then per ledger `getRequestedUsers(key, null)` to set `hasInvite`.
Reads AsyncStorage `selectedLedgerIndex`, builds a `Ledger` with `{key, items, info.title, info.color}`
and `dispatch(updateSelectedLedger(ledger))`.

`selectLedger(index)`: persists `selectedLedgerIndex`, re-fetches the ledger, closes drawer, then
`setTimeout(…, 330)` before dispatching (to let the drawer animation finish).

**Empty state**: when `ledgers.length === 0` — `icNoLedger.png`, `NO_LEDGER_TXT`, and an
`ADD_LEDGER` outlined pill button; the tab bar is not rendered at all.

**Loading**: `react-native-loading-spinner-overlay` with `LOADING` text, green `rgb(29,211,168)`.

**Tab bar**: `tabbarsX` (height 80, paddingBottom 16) when `Constants.statusBarHeight > 24` (notch),
else `tabbars` (height 56). Icons `IC_TAB{1..4}_{N,S}`; the title only renders for the selected tab.

- **Preserve**: drawer as ledger-switcher, owner crown, pending-request dot, unverified-email dot,
  remembered selected ledger, notch-aware tab bar, empty state.
- **Replace**: `react-native-side-menu` → expo-router layout + `react-native-drawer-layout` (or a
  bottom-sheet ledger switcher, which is more 2026); `react-native-tab-navigator` → expo-router
  `Tabs`; callbacks-in-navigation-params → Convex reactive queries (delete all of `handleSetMembers`
  / `handleSetOwner` / `handleLedgerUpdate` / `handleExitLedger` plumbing); whole-ledger `.once()` →
  paginated `usePaginatedQuery` + a rollup table for totals.

---

### 5.8 `Tab1.tsx` — "Monthly" (`getString('TAB1')` = Monthly / 월별 / 月別 / 每月一次 / bulanan)
- **Reached by**: first tab of `Main`. Not a route.
- **Flow**: a `ParallaxScrollView` (local lib) whose parallax foreground is the `MainOptionNav`
  (title + subtitle) and whose sticky header is the same navbar in title-only mode. Header height
  `182*ratio` on notch devices else `158*ratio`; sticky `102*ratio`/`78*ratio`.
  Inside: the custom `Calendar` (see §6.6) with `scrollEnabled showControls showEventIndicators`,
  localized month names (`JAN..DEC`) and day headings (`SUN..SAT`), `weekStart={0}`,
  prev/next arrow images. Selecting a day → `handleSelectDate(date)` filters
  `selectedLedger.items` to `moment(item.selectedDate).isSame(date,'d')`, sorts desc by
  `selectedDate`, renders a `LedgerListItem` per item (category icon, category text + review count,
  memo, formatted currency amount tinted by ledger color when negative). Row press →
  `dispatch(selectLedgerItem(item))` + `navigate('LedgerItemDetail')`.
- **Event dots**: `checkEventDates(items)` builds a de-duplicated array of `{date, hasEventCircle}` so
  days with entries get an indicator. Implementation is O(n²) (`events.forEach` inside the item loop).
- **Background color** of the parallax header is derived from `selectedLedger.info.color`
  (red/orange/yellow/green/blue/purple literals).
- **Preserve**: parallax header collapsing into a sticky colored navbar, event dots on the calendar,
  ledger-color theming, day-detail list under the calendar.
- **Replace**: hand-rolled `ParallaxScrollView` → `react-native-reanimated` v4 collapsing header +
  `FlashList`; the calendar → `react-native-calendars` (or a Reanimated custom one) fed by a
  **month-scoped** Convex query, not the full item map; the O(n²) event scan → a server-side
  `daysWithEntries(month)` query.

---

### 5.9 `Tab2.tsx` — "Lists" (`TAB2` = Lists / 리스트 / リスト / 清单 / daftar)
- **Flow**: `MainOptionNav` in **search mode** (`isSearch`) — the title is replaced by a `TextInput`
  with placeholder `TYPE_SEARCH` and a magnifier icon; typing calls
  `onTextChanged('search', txt.toLowerCase())` which filters the in-memory `allItems` by
  `realAmount.toString().includes(txt) || category.txt.toLowerCase().includes(txt)`.
  Body is a `deprecated-react-native-listview` `ListView` with `cloneWithRowsAndSections`.
  Items are filtered to `currentMoment.current`'s year+month, sorted desc, then grouped by
  `moment(selectedDate).format('MMMM Do (ddd)')` (`DATE_FORMAT_DAYS`).
- **Section header**: date on the left; on the right the day's income total and expense total, each
  `<FormattedCurrency>`, separated by `'\n'` when both exist.
- **Empty**: centered `NO_LIST_ADDED_YET`.
- **Preserve**: sticky date section headers with per-day income/expense subtotals; in-list search
  over category + amount; a footer spacer of `62*ratio` so the tab bar doesn't cover the last row.
- **Replace**: `deprecated-react-native-listview` → `@shopify/flash-list` with `sections`/sticky
  headers; client-side filter → Convex search index (`searchIndex` on memo/category) + paginated
  query; the "current month" scoping must become a server-side range query on `selectedDate`.

---

### 5.10 `Tab3.tsx` — "Graph" / statistics (`TAB3` = Graph / 통계 / 統計 / 统计 / statistika)
- **Flow**:
  - Header row: `"{year} {localizedMonth}"` + prev/next arrow buttons.
  - A horizontally paged `ScrollView` of 3 pages (`[prevMonth, currentMonth, nextMonth]`),
    `pagingEnabled`, `scrollEnabled={Platform.OS === 'ios'}` (**Android cannot swipe — arrows only**).
    `onMomentumScrollEnd` → page 2 = `onNext()`, page 0 = `onPrev()`; then `scrollToItem()` recenters.
  - Each page: a 2-segment control `CONSUME | INCOME`, and a **donut pie chart** (`react-native-pie`,
    `innerRadius 80*ratio`, `radius 120*ratio`, `backgroundColor rgb(220,226,235)`), series =
    per-category percentages. Center label = **running balance** (`remainingAmount`, sum of every item
    dated on/before the 1st of next month) over the selected month's total
    (`thisMonthConsume` or `thisMonthIncome`), both `<FormattedCurrency>`.
  - Below: a `FlatList` of `LedgerListItem`s, one per category, titled `"{category} ({percent}%)"`.
    Tapping a row with `amount !== 0` → `navigate('LedgerLineGraph', { item })`.
- **Color palette**: module-level `colors` array of 18 hex/rgb values with the ledger color unshifted
  in front. **`getDerivedStateFromProps` does `colors.unshift(color)` on every single render** → the
  module array grows without bound for the life of the process (memory + wrong colors over time).
- **`setChartData(items, currentMoment)`** is called from `getDerivedStateFromProps` (every render),
  from `componentDidMount`, and again inside a `setTimeout(…, 0)` "fixes initial scrolling bug on
  Android". It walks **all** items each time.
- **Preserve**: donut chart with balance in the center, expense/income toggle, month pager,
  category breakdown with percentages, drill-down into a 12-month trend.
- **Replace**: `react-native-pie` (+ ART) → `victory-native` XL or `react-native-svg` + Skia;
  all aggregation → Convex rollup table / `@convex-dev/aggregate` keyed by
  `(ledgerId, yearMonth, categoryId, sign)`; make the month pager work on Android too.

---

### 5.11 `Tab4.tsx` — "Extra" (`TAB4` = Extra / 기타 / その他 / 吉他 / gitar)
- **Flow**: navbar + exactly **two** rows:
  1. `icMoney.png` + `CURRENCY_UNIT`, right value `"{locale.currency} | {locale.unit}"` →
     `navigate('LedgerSettingCurrency', { reload })`.
  2. `icLanguage.png` + `SETTING_LANGUAGE`, right value `locale.display` →
     `navigate('LedgerSettingLanguage', { reload })`.
  `reload` is `() => this.props.reload()` → `Main.changeTab('tab4')`, a forced remount hack so the
  new locale is reflected.
- **Note**: the Chinese/Indonesian translations of `TAB4` are mistranslations ("吉他"/"gitar" = *guitar*).
- **Replace**: fold into a proper Settings screen; locale/currency changes must be reactive (no
  `reload()` hack) — put them in a zustand store persisted to MMKV.

---

### 5.12 `LedgerAdd.tsx` — route `LedgerAdd`
- **Reached by**: drawer `+ ADD_LEDGER`, and the empty-state button.
- **Flow**: full-bleed background in the currently-picked ledger color. Header: white back arrow;
  white search icon (`IC_SEARCH_W`) → `LedgerSearch`. Body: title `TextInput`
  (`WRITE_NAME_OF_LEDGER`), multiline description (`WRITE_DESCRIPTION_OF_LEDGER`), and a 6-swatch
  color picker (a white check overlays the selected swatch). `COMPLETE` →
  validates both fields non-empty (else `Alert(WARNING, MISSING_LEDGER_INFO)`), then
  `addLedger({ info: { title, description, color: colorIndex, people: 1 } })`,
  `Amplitude.logEvent('Add Ledger')`, `goBack()`.
- **`addLedger`**: `push()` a key under `ledgers`, sets `owner = uid`, `visible = true`,
  `members = {uid: uid}`, and fan-out-writes `/ledgers/{key}` + `/users/{uid}/ledgers/{key}`.
- **Preserve**: color-as-identity for a ledger (drives the entire app's accent color), the
  create-vs-join split (create here, join via LedgerSearch).
- **Replace**: 6 fixed colors are fine but should be theme tokens that work in dark mode.

---

### 5.13 `LedgerSearch.tsx` — route `LedgerSearch`
- **Reached by**: `LedgerAdd` header search icon only.
- **Flow**: header = close icon + search `TextInput` (`WRITE_NAME_OF_LEDGER`) + search button;
  `handleSearch()` → `searchLedgers(txt)` → for each result `getUserProfile(ledger.owner)`.
  Result row: color dot, ledger title, owner displayName, owner email, and a right-side button whose
  label/state is `MEMBER` (disabled) | `REQUESTED` | `REQUEST_JOIN`. Pressing it calls
  `requestLedger(key)`, which **toggles**: creates `ledgers/{key}/requests/{uid}` if absent, removes
  it if present. Empty state `NO_LEDGER_SEARCH_RESULT`.
- **`searchLedgers`**: `ref('bookoo/ledgers').orderByChild('info/title').equalTo(searchTxt)` —
  **exact full-title match only**, then reads every matched ledger fully and flags `isMember` /
  `requested` client-side.
- **Preserve**: public discovery of a ledger by name + request-to-join with owner approval.
- **Replace**: exact-match → Convex `searchIndex` on ledger title; per-result owner fetch → a joined
  query. Per DECISIONS.md, invite links (deep links) are the preferred primary path; keep search as
  secondary or drop it.

---

### 5.14 `LedgerDetail.tsx` — route `LedgerDetail` (read-only ledger view, non-owner)
- **Reached by**: drawer "MORE" when `ledger.owner !== currentUser.uid`.
- **Params**: `{ index, data, handleLedgerUpdate, handleSetMembers, handleSetOwner, handleExitLedger }`.
- **Flow**: colored background; header back arrow + `EXIT_LEDGER` text button.
  Title/description `TextInput`s with `editable={false}`. `MEMBER` section: `SEE_ALL` →
  `SeeMembers` with `{ auth: false, owner, key, membersInfo }`; a horizontal `ScrollView` of member
  avatars (own avatar first). Tapping a member → `ProfileYours`. Tapping an **unregistered** (invited
  but not signed-up) avatar (`maskInvite.png`) → `Alert(NONE, NOT_REGISTERED_USER)`.
  `EXIT_LEDGER` → confirm `Alert(EXIT_ALERT, EXIT_ALERT_CONFIRM)` → `exitLedger(key)` (removes
  `ledgers/{key}/members/{uid}` and `users/{uid}/ledgers/{key}`) → `route.params.handleExitLedger(index)` → goBack.
- **Note**: `componentDidMount` does `routes.push(...)` and then `routes.pop()` in the same function —
  a bug that breaks the Android back-depth counter for this screen.
- **Preserve**: owner vs member capability split; "invited but not registered" avatar state.

---

### 5.15 `LedgerUpdate.tsx` — route `LedgerUpdate` (owner ledger settings, 743 lines)
- **Reached by**: drawer "MORE" when the current user **is** the owner.
- **Flow**: same colored layout as LedgerDetail but everything editable:
  - Title / description editable; 6-color picker (pre-selected from `info.color`).
  - `MEMBER` section: `SEE_ALL` (its underline turns to an alert style when `hasInvite`) →
    `SeeMembers` with `{ auth: true, key, owner, membersInfo, handleSetMembers, handleSetOwner, ledger }`.
    Avatar strip + a trailing `btnAddMember.png` button → opens `ModalMemberAdd`.
  - **Invite flow** (`handleMemberAdd`): the modal's text field accumulates emails; typing a space,
    newline or tab validates the last token with `validateEmail` and appends `', '`.
    On confirm: `inviteUsers(emailArray, ledgerKey)` then merge into `membersInfo`,
    `handleSetMembers(...)` up to Main, `Amplitude.logEvent('Invite member')`, then
    `Communications.email(arr, null, null, '[BooKoo] {title} - EMAIL_INVITE_SUBJECT', EMAIL_INVITE_BODY + store links)`
    — i.e. it opens the **device mail client** with the Play Store and App Store URLs.
    A `SnackBar` shows `INVITATION_SENT` for 5000 ms.
  - `COMPLETE` → `updateLedgerInfo({title, description, color, people:1}, key)` + `handleLedgerUpdate(postData, index)` + goBack.
  - `EXIT_LEDGER` (owner) → `handleDelete()`: blocked with `EXIT_ALERT_OWNER` if `members.length > 1`,
    blocked with `EXIT_ALERT_INVITES` if `membersInfo.length > 1` (pending invites), else confirm
    `EXIT_ALERT_LAST_USER` → `deleteLedger(key)` (removes the whole `ledgers/{key}` node) → goBack.
- **`inviteUsers` internals (important)**: reads **the entire `bookoo/users` node** into memory and
  linear-scans for a matching `info.email`. If found → fan-out add to members; if not → writes
  `invites/{ledgerKey}/{encodedEmail}` and `invites/{encodedEmail}/{ledgerKey}`.
  This is both O(all users) and a **full user-directory leak to every client**.
- **Preserve**: invite-by-email including not-yet-registered users, owner-only delete with the
  "you must be the last member" guard, snackbar confirmation.
- **Replace**: user-directory scan → a Convex mutation that looks up by email index server-side, or
  drop it entirely for invite links. `react-native-communications` → `expo-mail-composer` /
  `expo-sharing` / `Share`, or a server-sent email (Resend) instead of the device mail client.

---

### 5.16 `SeeMembers.tsx` — route `SeeMembers` (717 lines)
- **Reached by**: `LedgerDetail` (`auth:false`) and `LedgerUpdate` (`auth:true`).
- **Params**: `{ auth, key, owner, membersInfo, handleSetMembers?, handleSetOwner?, ledger? }`.
- **Flow**:
  - Header: close icon.
  - `MEMBER {n}` heading; if `auth`, a `+ INVITE` button opens `ModalMemberAdd` (same invite flow as
    LedgerUpdate, also `Communications.email` + snackbar).
  - If `auth` **and** there are pending join requests (`ledgers/{key}/requests`): a `WAITING_LIST`
    block listing each requester (avatar, displayName, email) with `ACCEPT` / `REJECT` buttons.
    `acceptOrRejectRequestedUser(key, uid, accept)` removes the request and, on accept, fan-out-adds
    `ledgers/{key}/members/{uid}` + `users/{uid}/ledgers/{key}`.
  - Member list is a **`react-native-smooth-swipe-list` (`SwipeList`)**: each row's
    `leftSubView` = "make owner" button (`btnOwner.png`), `rightSubView` = "delete member"
    (`btnPinkTrash.png`); both are only attached when `auth && member !== me && !unregistered`
    (owner-transfer additionally excludes unregistered).
    - Swipe-left-reveal → delete → `Alert(DELETE_MEMBER, DELETE_MEMBER_CONFIRM)` →
      `deleteInvites(member, ledgerKey)` (removes the member from `ledgers/*/members`,
      `users/*/ledgers`, and both `invites` indexes) → `Amplitude.logEvent('Delete member')`.
    - Swipe-right-reveal → make owner → `Alert(CHANGE_OWNER, CHANGE_OWNER_CONFIRM)` →
      `changeOwner(member, ledgerKey)` → `handleSetOwner(member)` → goBack.
  - Owner rows show the crown (`picOwner.png`); unregistered rows show `INVITING` as the name and
    `maskInvite.png` as the avatar.
- **Preserve (explicitly called out in the brief)**: **swipe-to-reveal actions on the member list**
  (left = transfer ownership, right = remove), the join-request approval inbox, the crown badge, the
  "inviting / unregistered" member state.
- **Replace**: `react-native-smooth-swipe-list` → `react-native-gesture-handler` `Swipeable` (v2
  `ReanimatedSwipeable`) inside `FlashList`.

---

### 5.17 `LedgerItemAddOrUpdate/` — route `LedgerItemAddOrUpdate` (1153 lines, the biggest screen)
Directory: `index.tsx`, `ConsumeView.tsx`, `IncomeView.tsx`, `styles.ts`.

- **Reached by**: `Main` navbar "+" (`{ item: null }`) and `LedgerItemDetail` "UPDATE"
  (`{ item, reviews, isWriter }`).
- **Layout**: header (back arrow; `DELETE` text button only when `route.params.isWriter`),
  a `react-native-tab-view` `TabView` with two tabs `CONSUME` (key `'1'`) / `INCOME` (key `'2'`),
  and a full-width bottom `COMPLETE` button tinted with the ledger color.
  Initial tab index = `item.realAmount > 0 ? 1 : 0`.
- **Per-tab form (`ConsumeView` / `IncomeView` — near-identical)**:
  1. `AMOUNT` label + numeric `TextInput`. `onFocus` resets to `'0'`; `onEndEditing` →
     `onAmountEdited(type)` which does `amount.match(/\d+/g)`, negates it for consume, and formats
     via `Number.toLocaleString(locale.currencyLang, {style:'currency', currency: locale.currency})`.
     So `amount` is a **display string** and `realAmount` is the signed number.
  2. `CATEGORY` row → opens the bottom category `Modal` (see below).
  3. `DATE` row → `react-native-modal-datetime-picker` in `'datetime'` mode.
  4. `LOCATION` row → permission check, `Location.getCurrentPositionAsync({})`, then
     `navigate('GoogleMap', { onSelectLocation })`. Displays `location.street`.
  5. `MEMO` multiline `TextInput`.
  6. `PICTURE` grid: existing photos + a trailing `btnPicPlus.png` tile. Tapping a photo →
     `PictureSwipePage` in update mode with a `deletePhoto` callback. Tapping "+" → `ModalPicture`
     (Gallery / Camera) → `ImagePicker.launchImageLibraryAsync` or `launchCameraAsync`
     (`allowsEditing:false`, `aspect:[4,3]`, video rejected with `VIDEO_IS_NOT_SUPPORTED`).
- **Category modal** (`react-native-modalbox`, `position:'bottom'`): a `FlatList` grid of the
  device-local SQLite categories filtered by the active tab (`category === 0` consume / `1` income),
  with a leading "+" tile. **Long-press a category → reveals a per-tile delete button**; deleting runs
  `delete from categories where id = ?` and `dispatch(deleteCategory(i))`.
  The "+" tile opens a second centered modal: a name `TextInput` (`CATEGORY_ADD_HINT`) plus a
  `FlatList` grid of all 34 `CATEGORIES_ICON` to pick an icon (selected icon gets a dark overlay);
  `COMPLETE` inserts into SQLite and dispatches `addCategory`. Validation error
  `ERR_TITLE_CATEGORY_ADD` / `ERR_BODY_CATEGORY_ADD`.
- **Save (`handleLedgerItemAddOrUpdate`)**:
  - If the keyboard is open, the first press only dismisses the keyboard.
  - Validates category chosen and `realAmount` non-zero → else `Alert(ALERT_LEDGER_ITEM_ADD_TITLE, …_BODY)`.
  - Filters `picture` to entries whose `url` starts with `data:image/png;base64, ` or `https://`.
  - Deletes `category.img` and `category.key` before persisting.
  - Update path: `pictureDelete.forEach(deletePhoto)` then
    `addOrUpdateLedgerItem(selectedLedger.key, item.key, copyData)`;
    Add path: `addOrUpdateLedgerItem(selectedLedger.key, null, copyData)`.
  - Both then call **`sendNotiToUsersInLedger(ledgerKey, ADD_LEDGER_ITEM_NOTI | UPDATE_LEDGER_ITEM_NOTI, "{ledgerTitle} - {category.txt} : {realAmount.toLocaleString()}")`**.
  - Then `dispatch(addOrUpdateSelectedLedgerItem({ [postKey]: copyData }))` and `goBack()`.
- **`addOrUpdateLedgerItem` (firebaseApi)**: pushes a key if new, sets `created`/`updated` to
  `moment().format()`, forces `realAmount` negative when `category.category === 0`,
  strips `results` and `pictureDelete`, uploads each newly-picked image via `uploadFile` to
  `ledgers/{ledgerKey}/{itemKey}/{randomStr}{moment()}` and pushes `{path, url}` onto `picture`.
- **Delete**: `Alert(WARNING, DELETE_CONFIRM)` → `deleteLedgerItem(ledgerKey, itemKey, picture)`
  (which also deletes every Storage object) → `dispatch(selectLedgerItem(new LedgerItem()))` +
  `dispatch(deleteSelectedLedgerItem(key))` → goBack.
- **Preserve**: the CONSUME/INCOME tabbed entry form, sign-by-tab semantics, currency-formatted
  amount field, per-item category + datetime + geolocation + memo + multi-photo, user-defined
  categories with icon picker, long-press-to-delete a category, delete-item confirmation, and the
  push notification to co-members on add/update.
- **Replace**: `react-native-tab-view` → a segmented control (the two forms are 95 % identical —
  collapse them into one component with a `sign` prop); `react-native-modalbox` → `@gorhom/bottom-sheet`
  or expo-router modal routes; `react-native-modal-datetime-picker` → `@react-native-community/datetimepicker`
  / `react-native-date-picker`; `expo-image-picker` stays (modern API) but add `expo-image-manipulator`
  for resizing before upload; **categories must move server-side (Convex table, per-user or per-ledger)**
  instead of device-local SQLite, which is why categories vanish on reinstall today.

---

### 5.18 `LedgerItemDetail.tsx` — route `LedgerItemDetail` (617 lines)
- **Reached by**: row press in Tab1 / Tab2 (item is put in Redux first via `selectLedgerItem`).
- **Flow**:
  - `BackOptionTxtNav` with option text `UPDATE` shown only when
    `isWriter = (uid === item.writer) || (uid === selectedLedger.owner)` **and** pictures finished
    loading; pressing it → `LedgerItemAddOrUpdate` with `{ item, reviews, isWriter }`.
  - Header word: `CONSUME` if `realAmount < 0` else `INCOME`; large `<FormattedCurrency>` amount
    tinted by ledger color for expenses.
  - Info rows: category icon + text; calendar icon + `moment(selectedDate).format('YYYY-MM-DD(ddd) hh:mm')`;
    location pin + underlined `location.street` → `GoogleMap` with `{ showOnly: true, location }`.
  - Optional memo paragraph.
  - Picture block: header `PICTURE {count}` + `SEE_ALL` → `SeeAllPicture`; a grid of the **first 6**
    photos (`index >= 6 ? null`), each tap → `PictureSwipePage`.
    On mount every photo url is resolved through `getPhotoURL(photo)` (fetches the body when
    `photo.base64` — legacy storage format).
  - **Reviews (comments)**: live subscription
    `ledgers/{ledgerKey}/items/{itemKey}/reviews.limitToLast(100).on('value')`; for each review it
    does a nested `users/{writer}/info.once('value')` to hydrate the author, sorts desc by date.
    Only 3 are shown by default with a `SEE_ALL_REVIEWS {n} ▼` / `FOLD_REVIEWS {n} ▲` toggle.
    Each `ReviewListItem` shows avatar (tap → `ProfileYours`), name, `moment(date).fromNow()`, text,
    and a `DELETE` link when `review.writer === uid` (→ `deleteReview`).
  - Bottom composer: `TextInput` (`PLZ_WRITE_COMMENT`) + `SEND` → `addReview(ledgerKey, itemKey, {text})`
    which stamps `writer = uid` and `date = moment().format()`.
  - `componentDidUpdate`: if `selectedLedgerItem.key` changed → `goBack()` (used after a delete).
- **Preserve**: the comment thread on a ledger entry (this is the "social" in social ledger),
  3-comments-then-expand, relative timestamps, delete-own-comment, 6-photo preview grid + SEE ALL,
  location tap-through to a read-only map, writer-or-owner edit permission.
- **Replace**: N+1 author fetch → Convex query returning reviews joined with author docs;
  `limitToLast(100)` → real pagination; `moment().fromNow()` → `date-fns/formatDistanceToNow`.

---

### 5.19 `LedgerLineGraph.tsx` — route `LedgerLineGraph`
- **Reached by**: tapping a category row in Tab3 (`{ item }` where item = `{title, amount, percent, date, image}`).
- **Flow**: builds a 12-slot array for the **current year** by iterating **every** item in
  `selectedLedger.items` and bucketing those whose `category.txt === item.title` by month, summing
  `Math.abs(realAmount)` for expenses. `maxValue = max * 1.1`.
  Renders a horizontally scrollable **hand-drawn line chart** with `react-native-svg`:
  one `<Svg>` per month containing a `Svg.Polyline` segment to the next month plus two `Svg.Ellipse`
  nodes (filled green `rgb(29,211,168)` when selected, white otherwise), a 1 px baseline, the
  abbreviated localized month label, and two invisible `TouchableOpacity` hit areas (left/right)
  that call `handleAxisPressed(i)`.
  Below: a `FlatList` of the selected month's entries — header `"{year} {MON}"` + month total, rows
  `"YYYY-MM-DD(ddd)"` + amount, all `<FormattedCurrency>`.
- **Known break**: reads `props.navigation.state.params.item` in the constructor (react-navigation v4
  API) but `props.route.params.item` in `render()` — the constructor path crashes on v5.
- **Preserve**: the 12-month trend line per category with a tappable month that filters the list below.
- **Replace**: hand-rolled SVG polyline → `victory-native` / Skia line chart; per-month aggregation
  → a Convex rollup query `monthlyTotalsByCategory(ledgerId, year, categoryId)`.

---

### 5.20 `LedgerSettingCurrency.tsx` — route `LedgerSettingCurrency`
- **Reached by**: Tab4 row 1, with `{ reload }`.
- **Flow**: `SettingTitle(CURRENCY_UNIT)` + a `FlatList` of **46 hardcoded currencies**, each a
  `SettingListItem` rendering `"{currency} | {unit}"` with a green check when selected.
  Selecting → builds a `new Locale(props.locale)` with `{currency, currencyLang, unit}`,
  writes AsyncStorage `LOCALE`, dispatches `updateLocale`. Back arrow calls `route.params.reload()` then `goBack()`.
- **The 46 currencies** (currency / currencyLang / unit):
  ARS·es·$, AMD·hy·؋, BAM·bs·KM, BGN·bg·лв, BRN·ms-bn·$, BOB·es-bo·$b, BRL·pt-br·R$, BYN·be·Br,
  BZD·en-bz·BZ$, CAD·en-ca·$, CLP·es-cl·$, CNY·zh·¥, COP·es-co·$, CRC·es-cr·₡, CZK·cs·Kč,
  DOP·es-do·RD$, EGP·ar-eg·£, EUR·fr·$(sic), GRD·el·GRD, GTQ·es-gt·Q, HNL·es-hn·L, HKD·zh-hk·$,
  HRK·hr·kn, HUF·hu·Ft, IDR·id·Rp, IND·is·₹(sic), ISK·bn·kr(sic), ITL·it-it·ITL, JPY·ja·¥,
  KRW·ko·₩, MXN·es-mx·$, MYR·ms-my·RM, NOK·no-no·kr, NPR·ne·Rs, PHP·en-ph·₱, RUB·ru·руб,
  RON·ro·lei, SEK·sv-se·kr, SOS·so·S, SYP·ar-sy·£, SVC·es-sv·$, TWD·zh-tw·NT$, TRY·tr·₺,
  UZS·uz-uz·UZS, USD·en-us·$, VND·vi·R(sic), ZAR·en-za·VND(sic).
  Several entries are wrong (EUR unit `$`, `IND`/`ISK` mismatched, ZAR unit `VND`, GRD/ITL are
  pre-euro currencies). **Do not port this table verbatim** — derive from `Intl.NumberFormat` /
  a maintained ISO-4217 list.
- **Preserve**: per-app currency selection with the symbol shown, persisted locally.
- **Replace**: `react-native-globalize` + `cldr.json` (a large bundled asset) → `Intl.NumberFormat`
  (Hermes ships full ICU in RN 0.76+) or `@formatjs/intl-numberformat`.

---

### 5.21 `LedgerSettingLanguage.tsx` — route `LedgerSettingLanguage`
- **Reached by**: Tab4 row 2, with `{ reload }`.
- **Flow**: 5 options `SETTING_ITEMS`:
  `en_US → "ENGLISH"`, `ko → "한국어"`, `ja → "日本語"`, `zh → "中國語"`, `id → "Indonesia"`.
  `componentDidMount` maps `props.locale.lang` to the matching index and calls `handleItemPressed`
  (which also **writes** — so merely opening the screen re-saves the locale).
  Selecting writes `LOCALE` to AsyncStorage and dispatches `updateLocale`.
  The `locale` reducer additionally sets the global `moment.locale(...)` for ja/ko/zh/id/en.
- **Note the mismatch**: this screen stores `lang: 'en_US'` but `getString()` does
  `lang.substring(0,2)` → `'en'`; `Localizations.setLocale` stores `'en'`. Fragile.
- **Preserve**: in-app language override independent of device locale, 5 languages minimum
  (en, ko, ja, zh, id).
- **Replace**: `STRINGS.js` mega-object → `i18next`/`react-i18next` or `expo-localization` +
  typed message catalogs; language should apply reactively without the `reload()` hack.

---

### 5.22 `Setting.tsx` — route `Setting`
- **Reached by**: drawer gear icon.
- **Flow**: 5 rows built in the constructor (icon + `getString(...)` label):
  1. `icNews.png` `SETTING_ANNOUNCEMENT` → `SettingAnnouncement` (`{title}`)
  2. `icOpinion.png` `SETTING_OPINION` → `SettingOpinion` (`{title}`)
  3. `icFaq.png` `SETTING_FAQ` → `SettingFAQ` (`{title}`)
  4. `group.png` `SETTING_PUSH` → `SettingNoti` (`{title}`)
  5. `icPassword.png` `SETTING_LOCK` — rendered as a **toggle** (`switchY.png`/`switchN.png`) instead
     of a nav row. If currently on → immediately `AsyncStorage.removeItem('LOCKED' | 'LOCKED_NUMBER' |
     'LOCKED_FINGERPRINT')` (**disables the app lock with no authentication**). If off →
     `navigate('SettingLock', { title, setLockSwitchTrue })`.
  Then a `LOGOUT` row and a version row `"{VERSION} 2.0"`.
- **`handleLogout`**: `await deletePushToken()` → `firebase.auth().signOut()` →
  remove AsyncStorage `email`, `pw`, `token` → `Amplitude.clearUserProperties()` →
  `NavigationService.reset('Intro')`.
- **Dispatch is by translated string** (`switch (type) { case getString('SETTING_ANNOUNCEMENT') … }`)
  — breaks if two languages share a label. Replace with stable keys.
- **Preserve**: the settings inventory; logout clears the push token server-side first.
- **Replace**: routing-by-label → enum; add missing modern rows (theme light/dark/system, account
  deletion — **App Store requires in-app account deletion since 2022**, data export, notification
  granularity).

---

### 5.23 `SettingAnnouncement.tsx` — route `SettingAnnouncement`
- **Flow**: `SettingTitle(title)` + `DoubleListView` over **9 hardcoded announcements** with dates
  `2018-08-31, 2018-06-01, 2018-02-01, 2018-01-01, 2017-12-01, 2017-11-08, 2017-10-08, 2017-09-01,
  2017-09-01` and bodies `ANNOUNCEMENT_1..9` / `ANNOUNCEMENT_TXT_1..9`. Item 1 has `new: true` →
  a small dot. Tap toggles `selected` to expand the body (arrow flips up/down).
- **Replace**: hardcoded array + i18n strings → a Convex `announcements` table (or remote MDX);
  the `new` dot should be computed from a last-read timestamp.

---

### 5.24 `SettingFAQ.tsx` — route `SettingFAQ`
- Identical structure, **11 hardcoded FAQs** (`FAQ_1..11` / `FAQ_TXT_1..11`), no dates, no `new` dot,
  accordion via `DoubleListView`. Same replacement.

---

### 5.25 `SettingNoti.tsx` — route `SettingNoti`
- **Flow**: `SettingTitle(title)` + exactly one switch row `ADD_OR_UPDATE_LEDGER_ITEM`
  (state from AsyncStorage `switch_new`). A second row for `UPDATE_LEDGER_ITEM` (`switch_update`)
  exists but is commented out.
  Toggling on → `checkPermission('NOTIFICATIONS')` → `requestPermission` if needed
  (`Alert(ERROR, PERMISSION_NOTIFICATIONS_NOT_GRANTED)` on denial) →
  `Notifications.getExpoPushTokenAsync()` → `addPushToken(token, true)` → AsyncStorage `push`.
  Toggling off → `deletePushToken()`.
  **Bug**: `getPushToken` only returns a token inside the `if (!granted)` branch — if permission was
  already granted it returns `undefined` and `addPushToken(undefined)` writes garbage.
- **Preserve**: a user-facing kill switch for co-member entry notifications.
- **Replace**: `expo` `Notifications` (SDK 36 API) → `expo-notifications`; per-ledger notification
  preferences stored server-side, not in AsyncStorage.

---

### 5.26 `SettingOpinion.tsx` — route `SettingOpinion`
- **Flow**: `SettingTitle(title)` + one multiline `TextInput` (`WRITE_OPINION_HINT`) + a `SEND`
  button (disabled while empty, spinner while sending) → `sendOpinion(text)` →
  `push()` onto `bookoo/opinions` with `{user:{uid,displayName,email,phoneNumber,photoURL}, opinion, createdAt: moment().format('YYYY-MM-DD')}`.
  Alerts `SUCCESS/SENDING_OPINION_SUCCESSED` or `FAILED/SENDING_OPINION_FAILED`.
- **Replace**: a Convex `feedback` mutation; consider linking to an issue tracker / email instead.

---

### 5.27 `SettingLock.tsx` — route `SettingLock`
- **Params**: `{ title, setLockSwitchTrue }`.
- **Flow**: header back + `COMPLETE`. `SettingTitle(title)`, hint `SETTING_LOCK_HINT`,
  four 1-char numeric `secureTextEntry` `TextInput`s with auto-advance/auto-retreat focus
  (`inputPw1` is auto-focused on mount). Below, a `FINGERPRINT_SET` toggle button:
  `enableFingerprint()` checks `Fingerprint.hasHardwareAsync()` + `isEnrolledAsync()`, alerting
  `ERR_TITLE_LOCK_SET / FINGERPRINT_IS_NOT_SET` when unavailable; when enabled the button turns green
  with a `chkGreen.png` check.
  `done()`: requires exactly 4 digits (else `ERR_TITLE_LOCK_SET / ERR_BODY_LOCK_SET`), then writes
  AsyncStorage `LOCKED = "true"`, **`LOCKED_NUMBER = "1234"` in plaintext**, `LOCKED_FINGERPRINT = bool`,
  calls `setLockSwitchTrue()`, `goBack()`.
- **Replace**: store an Argon2/PBKDF2 hash (or just delegate to
  `LocalAuthentication.authenticateAsync` with device passcode fallback) in `expo-secure-store`;
  never AsyncStorage. Add auto-lock-after-N-minutes and lock-on-background (`AppState`), neither of
  which exists today (the app only locks on cold start).

---

### 5.28 `ProfileMine.tsx` — route `ProfileMine`
- **Reached by**: drawer account block.
- **Flow**: header close (X) + `UPDATE` text button.
  Avatar (tap → `ModalPicture` → gallery/camera; video rejected). If
  `!currentUser.emailVerified` → a `DO_EMAIL_VERIFICATION` link that opens `ModalDialogPrompt`
  (`EMAIL_VERIFICATION_BODY`, Cancel/OK) → `sendVerifyEmail()` →
  `currentUser.sendEmailVerification()` → `Alert(TRANSFER_COMPLETE|TRANSFER_FAILED, …_BODY)` after 300 ms.
  Fields: `NICK_HINT` (displayName), `EMAIL_HINT` (**read-only**, greyed), `TEL_HINT`, and a
  multiline `STATUS_MSG`.
  `handleUpdate()`: if the photo changed → `uploadFile('users/{email}', result.uri)` then
  `firebase.auth().currentUser.updateProfile({displayName, photoURL})`; always
  `updateProfileMine(state)` (writes `bookoo/users/{uid}/info`) + `dispatch(updateProfile(myProfile))`
  + `Amplitude.logEvent('Update Profile')` + `goBack()`.
  Data loaded on mount via `getProfileFromFirebase()` (`users/{uid}/info.once('value')`).
- **Preserve**: avatar upload, editable nickname/tel/status message, email verification nudge.
- **Replace**: avatar storage path keyed by **email** (`users/{email}`) is a privacy/uniqueness
  problem → key by user id in Convex file storage; add crop/resize; add account deletion here.

---

### 5.29 `ProfileYours.tsx` — route `ProfileYours`
- **Params**: `{ userKey }`. **Reached by**: member avatars (LedgerDetail, LedgerUpdate, SeeMembers)
  and review author avatars (LedgerItemDetail).
- **Flow**: close (X); avatar (tap → `PictureSwipePage` with a single-photo array);
  displayName; email row; tel row; divider; `STATUS_MSG` label + value. Read-only.
  Data from `getUserProfile(userKey)` = `users/{userKey}/info.once('value')`.
- **Note**: shows another member's **email and phone number** to anyone in a shared ledger — worth a
  privacy decision in the rewrite.

---

### 5.30 `SeeAllPicture.tsx` — route `SeeAllPicture`
- **Params**: `{ picture }`. **Reached by**: `LedgerItemDetail` "SEE_ALL" in the picture block.
- **Flow**: close (X) + a wrapping grid of `120*ratio` thumbnails; tap → `PictureSwipePage` at that index.
- **Replace**: `Image` → `expo-image` with `recyclingKey` + blurhash placeholders; the grid should be
  a `FlashList` with `numColumns`.

---

### 5.31 `PictureSwipePage.tsx` — route `PictureSwipePage`
- **Params**: `{ index, picture, update?, isUrl?, deletePhoto? }`.
- **Reached by**: `LedgerItemDetail` photo tap (view mode), `SeeAllPicture` (view mode),
  `LedgerItemAddOrUpdate` photo tap (`update: true`), `ProfileYours` avatar tap.
- **Flow**: `BackOptionTxtNav` with a white close icon; a full-screen `react-native-swiper`
  (`height = screenHeight * 0.784`, `showsPagination={false}`) where each page wraps the image in a
  **`PinchZoomView` (pinch-to-zoom + pan)**.
  Footer: in **view mode** a download button → `handleDownload()` which creates
  `FileSystem.documentDirectory + 'download'` and `FileSystem.downloadAsync(url, folder + '/' + randomStr + moment() + '.jpg')`
  (with a spinner); in **update mode** a trash button → `route.params.deletePhoto(index)` and splices
  the local array, `goBack()` when the array empties.
  Empty state: `NO IMAGE`.
- **Known break**: the constructor reads `props.navigation.state.params.*` (v4 API) while
  `handleDelete` reads `props.route.params.*` (v5) — crashes on v5.
- **Preserve (explicitly called out)**: **pinch-zoom photo viewer with horizontal swipe between
  photos, save-to-device, and delete-in-edit-mode**.
- **Replace**: `react-native-swiper` + `react-native-pinch-zoom-view` →
  `react-native-awesome-gallery` or `@likashefqet/react-native-image-zoom` + `react-native-pager-view`;
  `FileSystem.downloadAsync` into a private dir (which the user can never find) →
  `expo-media-library.saveToLibraryAsync` (with permission) or `expo-sharing`.

---

### 5.32 `GoogleMap.tsx` — route `GoogleMap`
- **Params**: `{ onSelectLocation }` (pick mode) or `{ showOnly: true, location }` (view mode).
- **Flow**: dark header with a white close icon and — only when `!showOnly` — a white check icon.
  `MapView.Animated` with a single `MapView.Marker.Animated`. In pick mode `onRegionChange` keeps the
  marker pinned to the region center; the check button runs
  `Location.reverseGeocodeAsync({latitude, longitude})`, falls back to `{street: getString('UNKNOWN')}`,
  attaches lat/lng, `goBack()`, then `route.params.onSelectLocation(address[0])`.
  Initial region defaults to `37.78825, -122.4324` (Apple's sample coords) until the real location loads.
- **Preserve**: attach a place to a ledger entry, reverse-geocoded to a street string; read-only map
  from the detail screen.
- **Replace**: `react-native-maps` 0.26 → current `react-native-maps` (Expo config plugin) or
  `expo-maps` (SDK 52+, Google Maps/Apple Maps native). API keys must move out of `app.json` into
  EAS secrets. `expo-location` `reverseGeocodeAsync` still exists.

---

### 5.33 `NoPage.tsx` — route `NotFound`
- Close icon + centered text `"There is no page. Check the router."` (not translated). Dev fallback.
- **Replace**: expo-router `+not-found.tsx`.

---

### 5.34 `Test.tsx` — route `Test`
- Dev scratchpad. `render()` returns an empty `<View style={styles.container}/>`; has an unused
  `handleAxisPressed` and a `goBack`. **Delete.**

---

## 6. Shared components (`src/components/shared/`) and libs

### 6.1 `MainOptionNav/index.js` (functional)
Props: `color, showTitle, isSearch, hasSubTitle, handleMenuPressed, handleOptionPressed, hasOption,
border, children, onSearchTxtChanged, txtSearch`.
Renders a bar tinted by ledger color: left hamburger (`IC_MENU`), center either the title text or a
search `TextInput` + `icSearch.png`, right a `btnAdd.png` (+) button when `hasOption !== false`.
When `hasSubTitle`, a second row below with the title in large type (this is what makes Tab1's
parallax header look like a big title collapsing to a small one).

### 6.2 `BackOptionTxtNav/index.js` (connected to `selectedLedger`)
Props: `onBackPressed, onOptionPressed, imgBack (default IC_CLOSE), title, optionTxt, border`.
Left image button, centered children text, right text button colored with the ledger accent.

### 6.3 `LedgerListItem.tsx` (connected: `locale`, `selectedLedger`)
The universal entry row. Props: `onListPressed, imgSrc, txtTitle, memo, amount, reviewCnt, consumeColor, displayName`.
Left category icon; title + `"  {reviewCnt}"` superscript; optional memo line; right
`<FormattedCurrency value currency>` — expense amounts (`amount < 0`) tinted with the ledger color,
income amounts in the default income style.

### 6.4 `ReviewListItem.tsx`
Props: `profileClick, deleteReview, img, displayName, txtReview, date, canDelete`.
Avatar (tappable) + name + relative date + comment text + a `DELETE` underlined link when `canDelete`.

### 6.5 `SettingListItem.tsx` / `SettingTitle.tsx`
`SettingListItem`: a `TouchableHighlight` row with text and a `chkGreen.png` check when
`data.selected` (used by both currency and language lists).
`SettingTitle`: a big title block (has the only Jest snapshot test in the repo:
`src/components/shared/__tests__/SettingTitle.test.js`).

### 6.6 `DoubleListView.tsx`
Accordion list used by Announcement + FAQ. Each row: optional date line, title (bold when expanded),
optional `new` dot, and a `listArrUp/Down.png` chevron; expanded body text is `selectable`.
Uses `react-native-display` `<Display enable>` for conditional rendering (an obsolete package —
just use `&&`).

### 6.7 Modals (all `react-native-modalbox`, imperative `.open()/.close()` via refs)
- `ModalPicture.tsx` — centered sheet with two big tiles `GALLERY` / `CAMERA` + `CANCEL`.
- `ModalMemberAdd.tsx` — centered sheet with a multiline email `TextInput`
  (`INVITE_MEMBER_WITH_EMAIL`) + `CANCEL` / `INVITE`.
- `ModalFingerprint.tsx` — Android-only prompt: fingerprint image, `LOGIN_WITH_FINGERPRINT` +
  `..._BODY`, `CANCEL`.
- `ModalDialogPrompt.tsx` — the only TypeScript-typed component (`ItemProps`/`ItemState`); a top-entry
  alert with optional two buttons (`leftString`/`rightString`, defaults `Cancel`/`Confirm`) and
  self-measuring height via `onLayout`.

### 6.8 `src/components/libs/ParallaxScrollView/`
A vendored fork of `react-native-parallax-scroll-view`. Props:
`backgroundColor, backgroundScrollSpeed (default 5), fadeOutForeground (true), fadeOutBackground,
contentBackgroundColor ('#fff'), onChangeHeaderVisibility, parallaxHeaderHeight (required),
renderBackground, renderFixedHeader, renderForeground, renderScrollComponent, renderStickyHeader,
stickyHeaderHeight (0), contentContainerStyle, scrollingStickyHeader (true)`.
Mechanics: an `Animated.Value` `scrollY` driven by `onScroll` (`scrollEventThrottle 16`);
`pivotPoint = parallaxHeaderHeight - stickyHeaderHeight`; background translates at
`-(p / backgroundScrollSpeed)`; foreground fades out; the sticky header cross-fades in over `[0, p]`
and gets `zIndex 999`/`elevation 0.1` once visible. Uses **string refs** (`this.refs['ScrollView']`)
and `React.cloneElement` on the scroll component.
- **Replace**: `react-native-reanimated` v4 `useAnimatedScrollHandler` + `interpolate` over a
  `Animated.FlatList`/FlashList — the collapsing colored header is worth keeping, the implementation
  is not.

### 6.9 `src/components/libs/Calendar/`
Vendored fork of `react-native-calendar` (`index.tsx`, `Day.tsx`, `styles.ts`), connected to Redux
(`currentMoment`, `selectedLedger`) and dispatching `updateSelectedDate` / `updateCurrentMoment`.
- `VIEW_INDEX = 2`: renders a 5-page horizontal `pagingEnabled` `ScrollView`
  (`currentMoment - 2 … + 2` months) and `scrollTo` recenters on index 2 after every update
  (`componentDidUpdate` → `scrollToItem(VIEW_INDEX)`).
- Props: `currentMonth, customStyle, dayHeadings, eventDates, events, monthNames, nextButtonText,
  onDateSelect, onSwipeNext/Prev, onTouchNext/Prev, prevBtn, nextBtn, removeClippedSubviews,
  scrollEnabled, showControls, showEventIndicators, titleFormat ('MMMM YYYY'), today, weekStart,
  calendarFormat ('monthly'|'weekly')`.
- Tapping the title opens a `react-native-modal-datetime-picker` in `'date'` mode to jump months.
- `Day.tsx`: the selected day's circle is filled with the **ledger's color**; days with entries get an
  event indicator; weekend/today/filler variants exist.
- **Replace**: `react-native-calendars` or a Reanimated implementation; the 5-page recentering
  ScrollView is the source of the visible jank on month change.

---

## 7. App-lock (fingerprint / PIN) flow — end to end

```
Setting screen, row 5 "SETTING_LOCK" (a switch, not a link)
 ├─ switch OFF -> navigate SettingLock { title, setLockSwitchTrue }
 │    SettingLock: 4x 1-char numeric secureTextEntry inputs (auto-advance focus)
 │                 + optional "FINGERPRINT_SET" toggle
 │                   guarded by LocalAuthentication.hasHardwareAsync() && isEnrolledAsync()
 │    COMPLETE -> AsyncStorage.setItem('LOCKED', 'true')
 │                AsyncStorage.setItem('LOCKED_NUMBER', '<4 digits, PLAINTEXT>')
 │                AsyncStorage.setItem('LOCKED_FINGERPRINT', 'true'|'false')
 │                setLockSwitchTrue(); goBack()
 └─ switch ON  -> AsyncStorage.removeItem('LOCKED'|'LOCKED_NUMBER'|'LOCKED_FINGERPRINT')
                  (NO authentication required to turn the lock off)

Cold start: RootStackNavigator.componentDidMount inside onAuthStateChanged
  isLocked = JSON.parse(AsyncStorage 'LOCKED')  -> initialRouteName = 'Lock'

Lock screen:
  read LOCKED / LOCKED_NUMBER / LOCKED_FINGERPRINT
  Android && LOCKED_FINGERPRINT -> ModalFingerprint.open()   (a UI prompt only)
  if LOCKED_FINGERPRINT:
      unLockFingerprint():
        hasHardwareAsync() && isEnrolledAsync()  (else Alert FINGERPRINT_IS_NOT_SET)
        NativeModules.ExponentFingerprint.authenticateAsync([iOS: prompt string])
        -> result.success
      success -> goToApp():
                   LayoutAnimation.easeInEaseOut
                   NavigationService.reset(currentUser ? 'Main' : 'Intro')
      failure -> navigation.goBack()   // BUG: Lock is the root route
  PIN path: AUTH_WITH_PW -> compare pw1+pw2+pw3+pw4 === LOCKED_NUMBER
            mismatch -> Alert(ERR_TITLE_LOCK, ERR_BODY_LOCK)
```
Gaps to fix in the rewrite: PIN stored in plaintext; lock can be disabled without auth; no
lock-on-background / auto-lock timeout (only cold start); no lockout after N failed attempts;
`NativeModules.ExponentFingerprint` no longer exists; Face ID needs `NSFaceIDUsageDescription`
(absent from `app.json`).

---

## 8. Push-notification flow — end to end

```
src/apis/registerForPushNotificationsAsync.ts
  Permissions.askAsync(Permissions.NOTIFICATIONS)
  if status !== 'granted' -> return
  token = await Notifications.getExpoPushTokenAsync()
  AsyncStorage.setItem('switch_new', 'true')
  AsyncStorage.setItem('push', token)
  // the POST to PUSH_ENDPOINT ('https://expo-push-server.herokuapp.com/tokens') is COMMENTED OUT

RootStackNavigator.componentDidMount
  _registerForPushNotifications()
    registerForPushNotificationsAsync()
    this._notificationSubscription = Notifications.addListener(this._handleNotification)
  _handleNotification = ({origin, data}) => console.log(...)   // NO routing / deep link at all

On successful login/signup (authApi)
  addPushToken(token, /* always */ true)
    -> set bookoo/users/{uid}/push_tokens/{encodeURIComponent(token).replace(/\./g,'%2E')} = token

SettingNoti toggle ON  -> getPushToken() -> addPushToken(token, true) -> AsyncStorage 'push'
SettingNoti toggle OFF -> deletePushToken()
Setting logout         -> await deletePushToken() before signOut()
  deletePushToken(): read AsyncStorage 'push', remove users/{uid}/push_tokens/{encoded}

SENDING (client-side fan-out — no server involved):
LedgerItemAddOrUpdate.handleLedgerItemAddOrUpdate (both add and update paths)
  sendNotiToUsersInLedger(ledgerKey, title, body)
    title = getString('ADD_LEDGER_ITEM_NOTI') | getString('UPDATE_LEDGER_ITEM_NOTI')
    body  = `${selectedLedger.info.title} , | - ${category.txt} : ${realAmount.toLocaleString()}`
    1. read ledgers/{key}/members  (.once)
    2. for each member: read users/{member}/push_tokens  (.once)
    3. for each token !== my own token:
         POST https://exp.host/--/api/v2/push/send  { to, title, body }
```
`sendNotiToUser(token, title, body)` exists in `firebaseApi.ts` but is never called.

Problems to fix: the *client* fans out pushes (so it needs read access to every member's tokens, and
it silently fails when the app is backgrounded mid-write); notification titles are localized with the
**sender's** language, not the recipient's; tapping a notification does nothing (no deep link);
`switch_new` defaults to `true` at token registration regardless of the user's stored preference;
Android needs a notification channel; the Expo SDK-36 `Notifications` module was replaced by
`expo-notifications`. In the rewrite: Convex mutation → scheduled action → Expo Push API server-side,
with per-recipient locale and an `expo-router` deep link to `/ledger/{id}/item/{itemId}`.

---

## 9. Ads / analytics / crash reporting

### AdMob (`expo-ads-admob`)
```jsx
<AdMobBanner
  style={{ position: 'absolute', bottom: 8 * ratio }}
  bannerSize='smartBannerPortrait'
  adUnitID={Platform.OS === 'ios'
    ? 'ca-app-pub-8181493727238996/7891266848'
    : 'ca-app-pub-8181493727238996/7109324754'}
  testDeviceID="EMULATOR"
  didFailToReceiveAdWithError={this.bannerError}
/>
```
Present in `Tab1.tsx`, `Tab2.tsx` (twice — empty state and root), `Tab3.tsx`, `Tab4.tsx` —
**every occurrence is commented out**, so the shipped app shows no ads. `Tab2.tsx` even imports
`AdMobBanner` from `'expo'` (wrong module) while the others import from `'expo-ads-admob'`.
`Tab4.bannerError` is the only surviving handler.
**Replacement if ads are wanted**: `expo-ads-admob` was removed from Expo SDK 46+ →
`react-native-google-mobile-ads` (config plugin, requires an App Tracking Transparency prompt on iOS
via `expo-tracking-transparency`). Otherwise drop ads entirely.

### Amplitude (`expo-analytics-amplitude`)
`Amplitude.initialize('<REDACTED:legacy-amplitude-key>')` in `src/app.js`.
- `Amplitude.setUserId(uid)` — after email signup, email login, Facebook login, Google login.
- `Amplitude.clearUserProperties()` — on logout (`Setting.handleLogout`).
- `Amplitude.logEvent(...)` events, exhaustive:
  `'Email Signup'`, `'Email Login'` (authApi), `'Facebook Login'`, `'Google Login'` (authApi),
  `'Add Ledger'` (LedgerAdd), `'Invite member'` (LedgerUpdate **and** SeeMembers),
  `'Delete member'` (SeeMembers), `'Update Profile'` (ProfileMine).
No screen-view tracking, no funnel, no revenue events.
**Replacement**: `expo-analytics-amplitude` was removed in SDK 46 →
`@amplitude/analytics-react-native`, or PostHog / Firebase Analytics
(`@react-native-firebase/analytics`). Convex has no built-in analytics.

### Sentry (`sentry-expo` ^2.0.1)
Initialized in `App.ts` (DSN above, `enableInExpoDevelopment: true`, `debug: true`).
`app.json` `hooks.postPublish` runs `sentry-expo/upload-sourcemaps` with
`organization: dooboolab`, `project: bookoo`, and a plaintext `authToken`.
**Replacement**: `@sentry/react-native` with the Expo config plugin; auth token via EAS secret.
Rotate the leaked token.

---

## 10. Why the legacy app got slow (the thing the rewrite must fix)

Ranked, with the exact code:

1. **The entire ledger is loaded and held in Redux.** `Main.setMyLedgers` → `getMyLedgers` →
   `getMyLedger(key)` does `ledgers/{key}.once('value')`, which pulls `info + members + requests +
   ALL items + ALL reviews + ALL picture metadata` in one payload, then
   `dispatch(updateSelectedLedger(ledger))` puts `items` (an object keyed by push-id) into the store.
   Cost grows linearly with the ledger's entire history and is paid on **every app start and every
   ledger switch**.
2. **All four tabs are mounted simultaneously** (`react-native-tab-navigator` renders every
   `TabNavigator.Item` child), so a single `selectedLedger` change re-derives Tab1, Tab2 and Tab3.
3. **Full scans in `getDerivedStateFromProps`** (i.e. on every render):
   - `Tab1.checkEventDates(items)` — O(n²): for each item it loops the accumulated `events` array
     doing `moment(...).isSame(...)`.
   - `Tab1.convertLedgerItemsToArray(items, date)` — allocates a `new LedgerItem()` per item, then sorts.
   - `Tab2.convertLedgerItemsToArray` + `convertSectionToMap` + `ds.cloneWithRowsAndSections` — rebuilds
     the whole ListView datasource.
   - `Tab3.setChartData(items, currentMoment)` — full scan building 12 arrays, called from
     `getDerivedStateFromProps`, `componentDidMount`, `onPrev`, `onNext`, and a `setTimeout(…, 0)`.
4. **Unbounded module-level array growth**: `Tab3`'s `colors.unshift(color)` runs on every derived
   state pass and never resets.
5. **N+1 network patterns**: `getMembersInfo` (one `.once` per member), `LedgerItemDetail.initReviews`
   (one `users/{writer}/info.once` per review), `LedgerSearch` (one `getUserProfile` per result),
   `Main.setMyLedgers` (one `getRequestedUsers` per ledger).
6. **Whole-collection reads**: `inviteUsers` reads the entire `bookoo/users` node client-side.
7. **No pagination anywhere.** The only bound in the whole app is
   `reviews.limitToLast(100)` in `LedgerItemDetail`.
8. **Images**: full-resolution `Image source={{uri}}` everywhere, no thumbnails, no CDN transform, no
   disk cache config; `Main`'s drawer avatar uses `key={new Date()}` which busts the cache on every render.
9. **Client-side aggregation for every statistic**: month totals, category percentages, running
   balance, and the 12-month line graph are all computed in JS from the full item map.
10. Misc: `EStyleSheet.build` creates 360 `$N` variables at boot; `moment` + 6 locale bundles;
    `cldr.json` bundled as an asset; `Asset.loadAsync(ICONS)` preloads ~90 PNGs before first paint.

**Rewrite mandate (matches `.notes/DECISIONS.md` §5)**: every list = FlashList +
`usePaginatedQuery`/`paginate()`; every aggregate = rollup table or `@convex-dev/aggregate`
(suggested key: `(ledgerId, yyyymm)` and `(ledgerId, yyyymm, categoryId, sign)`); every query
`withIndex`; no `.filter()` on large tables; MMKV cache + optimistic updates for cold start.

---

## 11. Legacy → 2026 replacement table

| Legacy | Status in 2026 | Replacement |
|---|---|---|
| Expo SDK 36 / RN 0.61-ish / React 16 | dead | Expo SDK 57 / RN 0.86.2 / React 19.2.3 |
| `@react-navigation/*` v5 alpha, flat stack, `headerShown:false` | dead | `expo-router` file routes + typed routes |
| `react-native-tab-navigator` | unmaintained since 2017 | `expo-router` `Tabs` (+ tablet split layout) |
| `react-native-side-menu` | unmaintained | `react-native-drawer-layout` or a `@gorhom/bottom-sheet` ledger switcher |
| Redux (no middleware) + `immutability-helper` | superseded | Convex reactive queries + `zustand` (persisted to MMKV) for UI state |
| Firebase RTDB + Storage + client-side security | replaced | **Convex** DB + file storage + server functions |
| Firebase Auth (email/pw, Facebook, Google) | replaced | **Convex Auth**: Kakao / Naver / Google / Apple / email-OTP |
| `expo-sqlite` device-local categories | wrong model | Convex `categories` table (per user and/or per ledger), seeded server-side |
| `react-native-extended-stylesheet` + `BaseStyles` `$1..$360` | unmaintained | **kstyled 0.4.1** + `cpk-ui 0.7.0` theme tokens, light/dark |
| `react-native-globalize` + bundled `cldr.json` | unmaintained | `Intl.NumberFormat` (Hermes ICU) / `@formatjs/intl-numberformat` |
| `STRINGS.js` mega-object + `getString()` | works but unsafe | `i18next` + typed catalogs, `expo-localization` for device default |
| `moment` + 6 locale bundles | deprecated by its own maintainers | **date-fns** (per DECISIONS.md) |
| `deprecated-react-native-listview` | removed from RN | `@shopify/flash-list` |
| `react-native-smooth-swipe-list` | unmaintained | `react-native-gesture-handler` `ReanimatedSwipeable` rows in FlashList |
| `react-native-pie` + `@react-native-community/art` | ART removed from RN | `victory-native` XL or `@shopify/react-native-skia` |
| hand-drawn `react-native-svg` line graph | works, brittle | same Skia/Victory chart layer |
| vendored `ParallaxScrollView` (string refs) | breaks on React 19 | `react-native-reanimated` v4 collapsing header |
| vendored `Calendar` (5-page ScrollView) | janky | `react-native-calendars` or Reanimated custom |
| `react-native-swiper` | unmaintained | `react-native-pager-view` / `react-native-reanimated-carousel` |
| `react-native-pinch-zoom-view` | unmaintained | `react-native-awesome-gallery` / `@likashefqet/react-native-image-zoom` |
| `react-native-modalbox` (ref `.open()`) | unmaintained | `@gorhom/bottom-sheet` + expo-router modal routes |
| `react-native-modal-datetime-picker` v8 | old | `@react-native-community/datetimepicker` or `react-native-date-picker` |
| `react-native-loading-spinner-overlay` | unmaintained | cpk-ui loading / skeletons |
| `react-native-snackbar-component` | unmaintained | cpk-ui Snackbar / `react-native-toast-message` |
| `apsl-react-native-button` | unmaintained | cpk-ui `Button` |
| `react-native-display` `<Display enable>` | pointless | `&&` |
| `react-native-communications` (device mail app) | unmaintained | `expo-mail-composer` / share sheet / server-sent email (Resend) |
| `expo-facebook` | removed from Expo SDK | dropped entirely (see DECISIONS.md) |
| `expo-google-app-auth` | removed | `expo-auth-session` / Convex Auth Google provider |
| `expo-permissions` | removed from Expo SDK | per-module `requestPermissionsAsync()` |
| `expo` `Notifications` (SDK 36) | removed | `expo-notifications` + server-side Expo Push from Convex |
| `NativeModules.ExponentFingerprint` | gone | `expo-local-authentication.authenticateAsync()` |
| `AsyncStorage` from `react-native` | removed from core | `react-native-mmkv` (+ `expo-secure-store` for the PIN) |
| `expo-ads-admob` | removed in SDK 46 | `react-native-google-mobile-ads` (+ ATT), or no ads |
| `expo-analytics-amplitude` | removed in SDK 46 | `@amplitude/analytics-react-native` or PostHog |
| `sentry-expo` v2 | superseded | `@sentry/react-native` + Expo config plugin |
| `react-native-maps` 0.26 + inline API keys | old | `expo-maps` or current `react-native-maps`; keys in EAS secrets |
| `FileSystem.downloadAsync` into app sandbox | user-invisible | `expo-media-library.saveToLibraryAsync` / `expo-sharing` |
| `react-native-simple-encryption` + `ENCRYPTION_KEY` constant | insecure, unused | delete |
| `Image` | slow | `expo-image` (blurhash placeholder, `recyclingKey`, memory-disk cache) |
| String refs (`ref='1'`, `this.refs.x`) | removed in React 19 | `useRef` / callback refs |
| Class components + `getDerivedStateFromProps` | legacy | function components + hooks |

---

## 12. i18n inventory

`STRINGS.js` (1323 lines) exports one object with 3 populated language keys — `en` (264 entries),
`ko`, `id` — plus `ja` and `zh` blocks (their `TAB1..TAB4` values are at lines 604-607 and 868-871).
Lookup: `getString(key)` reads `store.getState().locale.lang.substring(0,2)` and returns `'...'` when
a key is missing (silent failure — the rewrite should fail loudly in dev).

Tab labels across languages:
| key | en | ko | ja | zh | id |
|---|---|---|---|---|---|
| TAB1 | Monthly | 월별 | 月別 | 每月一次 | bulanan |
| TAB2 | Lists | 리스트 | リスト | 清单 | daftar |
| TAB3 | Graph | 통계 | 統計 | 统计 | statistika |
| TAB4 | Extra | 기타 | その他 | 吉他 *(=guitar, wrong)* | gitar *(=guitar, wrong)* |

Full `en` key list (264) — groups:
`AUTH_WITH_PW LOADING MORE LOGIN NO_LEDGER_TXT STILL_NO_ACCOUNT SIGNUP NICK NICK_HINT EMAIL_ADDRESS
EMAIL_HINT TEL TEL_HINT STATUS_MSG PASSWORD PASSWORD_HINT PASSWORD_SIGNUP_HINT PASSWORD_OK
PASSWORD_OK_HINT SEND_MAIL_FAILED SEND_MAIL_FAILED_DETAIL SEND_MAIL_SUCCESSED
SEND_MAIL_SUCCESSED_DETAIL DISPLAY_NAME DISPLAY_NAME_HINT FORGOT_PW FIND_PW SEND_LINK CALENDAR LIST
WRITE_NAME_OF_LEDGER WRITE_DESCRIPTION_OF_LEDGER WARNING MISSING_LEDGER_INFO COLOR MEMBER SEE_ALL
COMPLETE INVITE_MEMBER_WITH_EMAIL INVITE CANCEL SUN..SAT JAN..DEC DO_EMAIL_VERIFICATION
TRANSFER_COMPLETE(_BODY) TRANSFER_FAILED(_BODY) EMAIL_VERIFICATION_HEADER EMAIL_VERIFICATION_BODY
INTRO_FOOTER_TXT1..5 TAB1..TAB4 ADD_LEDGER SETTING_ANNOUNCEMENT SETTING_OPINION SETTING_FAQ
SETTING_PUSH SETTING_LOCK SETTING_LOCK_HINT LOGOUT NONAME NOEMAIL TYPE_SEARCH SEND ADD_LEDGER_ITEM
ADD_LEDGER_ITEM_NOTI UPDATE_LEDGER_ITEM UPDATE_LEDGER_ITEM_NOTI CURRENCY_UNIT SETTING_LANGUAGE
SETTING_REPEAT PASTE_MESSAGE EXPORT_EXCEL WRITE_OPINION_HINT INCOME CONSUME AMOUNT CATEGORY DATE
LOCATION PICTURE  [34 category labels: HOSPITAL MOBILE_FEE CAFE DRINK SNACK MEAL DATING MOVIE PET
TRANSPORT EXERCISE WEAR SLEEP BABY GIFT ELECTRONIC FURNITURE TRAVEL CAR CULTURE EDUCATION ELECTRIC
INSURANCE MAINTENANCE MEMBERSHIP STUFFS TAX WALLET_MONEY SALARY BONUS SELL_PRODUCT AWARD PRESENT
EXTRA]  DONE PERMISSION_LOCATION_NOT_GRANTED PERMISSION_NOTIFICATIONS_NOT_GRANTED PERMISSION_REQUEST
PERMISSION_REQUEST_CAMERA PERMISSION_REQUEST_CAMERA_ROLL PERMISSION_REQUEST_LOCATION FINGERPRINT_SET
FINGERPRINT_IS_NOT_SET FINGERPRINT_AUTH_TO_USE_APP PW_NUMBER_NOT_SET ADD CAMERA GALLERY CATEGORY_ADD
CATEGORY_ADD_HINT SELECT_ICON ERROR ERR_TITLE_CATEGORY_ADD ERR_BODY_CATEGORY_ADD ERR_TITLE_LOCK
ERR_BODY_LOCK ERR_TITLE_LOCK_SET ERR_BODY_LOCK_SET YES NO OK UPDATE ALERT_LEDGER_ITEM_ADD_TITLE
ALERT_LEDGER_ITEM_ADD_BODY NO_LIST_ADDED_YET PLZ_WRITE_COMMENT CHANGE_OWNER CHANGE_OWNER_CONFIRM
DELETE DELETE_CONFIRM ERR_NO_VALID_EMAIL ERR_NO_VALID_EMAIL_BODY SUCCESS FAILED INVITATION_SENT
INVITING UNREGISTERED_USER DELETE_MEMBER DELETE_MEMBER_CONFIRM TUTORIAL_TXT_HEAD1..3
TUTORIAL_TXT_BODY1..3 NOT_REGISTERED_USER NEXT SENDING_OPINION_FAILED SENDING_OPINION_SUCCESSED NONE
EXIT EXIT_LEDGER EXIT_ALERT EXIT_ALERT_CONFIRM EXIT_ALERT_OWNER EXIT_ALERT_LAST_USER
EXIT_ALERT_INVITES ADD_OR_UPDATE_LEDGER_ITEM ANNOUNCEMENT_1..9 ANNOUNCEMENT_TXT_1..9 FAQ_1..11
FAQ_TXT_1..11 NEXT_UPDATE NEXT_UPDATE_BODY LOGIN_WITH_FINGERPRINT LOGIN_WITH_FINGERPRINT_BODY
VERSION UNKNOWN SEE_ALL_REVIEWS FOLD_REVIEWS FACEBOOK_NO_EMAIL REQUEST_JOIN REQUESTED
NO_LEDGER_SEARCH_RESULT WAITING_LIST ACCEPT REJECT SUM MEMO EMAIL_INVITE_SUBJECT EMAIL_INVITE_BODY
VIDEO_IS_NOT_SUPPORTED`

Never-implemented keys that hint at a backlog: `SETTING_REPEAT` (recurring transactions),
`EXPORT_EXCEL` (CSV/XLSX export), `PASTE_MESSAGE` (paste an SMS bank alert to auto-fill an entry),
`SUM`, `CALENDAR`, `LIST`, `NEXT_UPDATE`. Worth considering as rewrite features.

---

## 13. Category taxonomy (must be ported)

`src/utils/Data.ts` → `CATEGORIES_ICON` = 34 icons, ids 0..33, each `require('@assets/icons/category*.png')`:
```
0 Cafe        1 Drink       2 Snack       3 Meal        4 Date        5 Movie
6 Pet         7 Transport   8 Exercise    9 Wear       10 Sleep      11 Baby
12 Gift      13 Electronic 14 Furniture  15 Travel     16 MobileFee  17 Hospital
18 Wallet    19 Salary     20 Bonus      21 Product    22 Award      23 Present
24 Extra     25 Car        26 Culture    27 Education  28 Electric   29 Insurance
30 Maintenance 31 Membership 32 Stuffs   33 Tax
```
`INITIAL_CATEGORIES` = **34 seed rows** (verified by count), one per icon id 0..33, each
`{ category: 0|1, iconId, text }` where **`category: 0` = consume/expense, `1` = income**.
Split: **27 expense + 7 income**. The 7 income seeds are iconIds 18-24
(`WALLET_MONEY, SALARY, BONUS, SELL_PRODUCT, AWARD, PRESENT, EXTRA`); everything else is an expense.
Note `iconId 4` uses `categoryDate.png` but its label key is `DATING`.
`text` is stored as an i18n **key** in the source but is inserted into SQLite already translated
(`getString(text)` in `src/app.js`), which is why categories never re-translate.

Other constants in `Data.ts`: `VERSION: '2.0'`, `routes: []`, `STATUS_CODE {ERROR 500, NOT_FOUND 404,
NO_CONTENT 204, SUCCESS 200, BAD_REQUEST 400, CONFLICT 409, UNAUTHORIZED 401}`, `APP_ID {}`,
`ENCRYPTION_KEY: 'BOOKOO_LEGENDARY_LEDGER_5897'` (unused), `DATE_FORMAT: 'YYYY-MM-DD'`,
`DATE_FORMAT_DAYS: 'MMMM Do (ddd)'`.

Ledger colors (index → rgb), used everywhere as the app accent:
`0 rgb(255,114,141)` red · `1 rgb(246,166,35)` orange · `2 rgb(238,209,0)` yellow ·
`3 rgb(29,211,168)` green (default) · `4 rgb(103,158,255)` blue · `5 rgb(182,105,249)` purple.
Brand palette from `BaseStyles.ts`: `$darkGrey #414d6b`, `$mediumGrey #869ab7`, `$paleGrey #dde2ec`,
`$cloudyBlue #afc2db`, `$whiteGrey #f9fbfd`, `$blueyGrey #a0a7b8`, `$navy #292767`,
`$darkishPink rgb(230,103,126)`, `$facebook #4262a3`, `$leafyGreen #56bc37`.
Type scale: `$fontTitle 28`, `$fontBigSize 24`, `$fontTabSize 20`, `$fontSize 16`, `$fontSmallSize 12`
— all `* ratio`, where (`src/utils/Styles.ts`):
```ts
const { width, height } = Dimensions.get('window');
const ratio = (16 * (width / height));
const screenRatio = (ratio < 9 ? width / 9 : height / 16) / (360 / 9);  // exported as `ratio`
```
i.e. every dimension in the app is a phone-only linear scale off a 360 dp baseline. **This is exactly
why the app has no tablet layout** — on a tablet `screenRatio` balloons and everything is drawn huge
rather than re-laid-out. The rewrite must use breakpoint-driven layouts, not a global scalar.

---

## 14. `src/utils/Functions.ts` (exhaustive)

`module.exports` of 7 helpers:
- `getWorldTime(tzOffset)` → `'YYYY-MM-DD HH:mm'` string with manual zero-padding. **Unused.**
- `validateEmail(email)` → regex test. Used by Login, Signup, FindPw, LedgerUpdate, SeeMembers.
- `cacheImages(images)` → maps to `Image.prefetch(url)` or `Asset.fromModule(m).downloadAsync()`.
  **Broken**: `Image` is never imported in this file. Imported by `src/app.js` but never called.
- `cacheFonts(fonts)` → `Font.loadAsync`. **Unused.**
- `snapshotsToArray(snapshots)` → array of `snapshot.val()` with `key` attached. **Unused.**
- `checkPermission(type)` / `requestPermission(type)` — a `switch` over the strings
  `'NOTIFICATIONS' | 'CAMERA' | 'CAMERA_ROLL' | 'RECORDING' | 'CONTACTS' | 'LOCATION'` mapping to
  `expo-permissions`. `requestPermission('CAMERA')` has an early `return true` before asking — a bug.
  Used by LedgerItemAddOrUpdate (LOCATION), ProfileMine (CAMERA), SettingNoti (NOTIFICATIONS).
- `convertToByteArray(base64)` — a hand-rolled atob → `Uint8Array`. Used only by the deprecated
  `uploadPhoto` in `firebaseApi.ts`.

`src/utils/Styles.ts` exports `{ globalStyles, ratio, width, height }` where `globalStyles` is
`back0..back5` (backgroundColor) and `color0..color5` (color) plus `defaultColor` — the ternary
chains you see in nearly every screen (`color === 0 ? globalStyles.back0 : …`) exist because there is
no theme object. In the rewrite this becomes a single `ledgerAccent(colorIndex)` token lookup.

---

## 15. AsyncStorage key inventory (migration checklist)

| key | written by | meaning |
|---|---|---|
| `APP_INSTALLED` | `src/app.js` | `'DONE'` after SQLite category seed |
| `selectedLedgerIndex` | `Main.selectLedger` | last-viewed ledger index (index, not id — breaks if the list reorders) |
| `LOCALE` | `Localizations.setLocale`, LedgerSettingCurrency, LedgerSettingLanguage | JSON `Locale` |
| `LOCKED` | SettingLock / Setting | `'true'` when app lock is on |
| `LOCKED_NUMBER` | SettingLock | **plaintext 4-digit PIN** |
| `LOCKED_FINGERPRINT` | SettingLock | `'true'`/`'false'` |
| `push` | registerForPush…, addPushToken, SettingNoti | Expo push token |
| `switch_new` | registerForPush…, SettingNoti | notification preference |
| `switch_update` | read by SettingNoti only | dead (feature commented out) |
| `token` | authApi facebook/google login; removed on logout | OAuth access token (should never be stored) |
| `login_type` | authApi | `'facebook'` \| `'google'` |
| `email`, `pw` | never written; removed on logout | vestigial |
| `title` | read by `Tab4` constructor (never written) | vestigial |

---

## 16. Known bugs / dead code in the legacy (do not reproduce)

- `Main.tsx` imports `updateDrawerState` from `@actions`; `LedgerItemDetail.tsx` imports `getReviews`
  and `updateSelectedLedgerItemReviews` — **none of these exist**.
- `LedgerLineGraph` and `PictureSwipePage` read `props.navigation.state.params` (react-navigation v4)
  in their constructors while using `props.route.params` elsewhere → crash on v5.
- `Tab2` imports `AdMobBanner` from `'expo'`.
- Reducers `DELETE_SELECTED_LEDGER_ITEM` / `DELETE_CATEGORY` mutate state in place.
- `selectedLedgerItem` reducer's default state is the whole `initialState` object.
- `Tab3` grows the module-level `colors` array without bound.
- `LedgerDetail.componentDidMount` pushes and pops `routes` in the same call.
- `Signup.onTextChanged` clears `notValidate` in the displayName branch.
- `SettingNoti.getPushToken` returns `undefined` when permission is already granted.
- `Functions.cacheImages` references an unimported `Image`.
- `Functions.requestPermission('CAMERA')` returns `true` without asking.
- `Lock` calls `navigation.goBack()` from the root route on biometric failure.
- App lock can be turned off from Settings without any authentication.
- `Setting.goToSetting` switches on **translated** labels.
- `database.rules.json` grants `auth != null` read/write on the whole `bookoo` subtree and uses
  `auth.id` (invalid; should be `auth.uid`); `storage.rules` allows any authenticated user to read or
  write any object.
- Committed secrets: `functions/admin_key.json`, `keys/BooKoo.jks`, `keys/BooKoo_dist.p12`,
  `keys/BooKoo_push.p12`, Sentry `authToken` and Google Maps keys in `app.json`, Firebase web config,
  AdMob unit ids, Amplitude key, Facebook app id. **Rotate all of them.**

---

## 17. Feature checklist for the rewrite (nothing may be silently dropped)

Auth & account: social + email login · signup with display name · email verification nudge ·
password reset *(obsolete)* · logout · profile view/edit (avatar, nickname, tel, status message) ·
view another member's profile.
Ledgers: create (title, description, 1-of-6 color) · edit (owner) · view (member) · delete (owner,
last member only) · leave (member) · switch active ledger from the drawer · remember last ledger ·
search public ledgers by exact title · request to join · owner accept/reject requests · invite by
email (registered → instant member; unregistered → pending invite drained at signup) · device-mail
invitation with store links · member list with swipe-to-transfer-ownership and swipe-to-remove ·
owner crown badge · pending-invite indicator.
Entries: add/edit expense or income · amount with live currency formatting · category (34 icons,
34 seeded (27 expense / 7 income), user-defined categories with icon picker, long-press delete) · date+time picker ·
geolocation with reverse-geocoded street + read-only map view · memo · multiple photos from
gallery/camera · photo grid (first 6 + SEE ALL) · full-screen pinch-zoom swipeable viewer with
save-to-device and delete · delete entry with confirmation · push notification to co-members on
add/update.
Comments: threaded review comments per entry with author avatar/name/relative time, delete own,
3-then-expand, live updates.
Views: monthly calendar with entry indicators + selected-day list · month-sectioned list with
per-day income/expense subtotals and in-list search · donut chart of category shares with running
balance in the center and expense/income toggle · 12-month line trend per category with a tappable
month.
Settings: announcements accordion · FAQ accordion · send feedback · push toggle · app lock
(4-digit PIN + biometric) · currency (46) · language (5) · version · logout.
Onboarding: 3-slide tutorial.
Cross-cutting (new, per DECISIONS.md): dark/light mode, tablet layouts, unbounded-data performance,
data migration from `bookoo-89f6c` with `legacyUid`/`legacyKey` on every table.
