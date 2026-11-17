# 04 — Legacy Content & Reference Data Inventory (BooKoo)

Recon phase 04. Source of truth: `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/` (read-only).
Everything below is extracted verbatim from the legacy tree. Nothing here is invented.

Legacy stack for context: Expo SDK `^36.0.2`, `react-native-globalize@^3.0.0` (+ 3.1 MB `assets/cldr.json`),
`moment@^2.24.0`, `expo-sqlite@^8.0.0` (local `categories` table), `react-native-simple-encryption@^1.2.1`,
Redux + `react-native-extended-stylesheet`. No i18n library at all — a hand-rolled `getString()` over a
single 87 KB `STRINGS.js`.

---

## 1. Files read

| Path (absolute) | What it holds |
|---|---|
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/STRINGS.js` | All 5 locales × 263 keys, flat, one JS object |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/utils/Localizations.ts` | `setLocale()`, `getString()` |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/models/Locale.ts` | `Locale` class shape |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/utils/Data.ts` | `CATEGORIES_ICON`, `INITIAL_CATEGORIES`, `DATE_FORMAT*`, `ENCRYPTION_KEY`, `STATUS_CODE`, `VERSION` |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/utils/Icons.ts` | `ICONS` preload array + named icon exports |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/components/screen/LedgerSettingCurrency.tsx` | 47-currency matrix |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/components/screen/LedgerSettingLanguage.tsx` | 5-language matrix (`SETTING_ITEMS`) |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/app.js` | SQLite category seeding, `Globalize.load(cldr.json)` |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/BaseStyles.ts` | Named colour tokens |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/src/components/screen/Tab3.tsx` | Chart colour arrays |
| `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/app.json` | iOS `infoPlist` permission strings |
| Reference for new i18n: `/Users/hyo/Github/hyodotdev/Martie/src/STRINGS.ts`, `/Users/hyo/Github/hyodotdev/Martie/src/hooks/useLocale.ts`, `/Users/hyo/Github/hyodotdev/Martie/assets/langs/*.json` |

---

## 2. STRINGS.js structure

```
const STRINGS = {
  en: { 'KEY': 'value', ... },   // line 2
  ko: { ... },                   // line 267
  'ja': { // Japanese            // line 531
  'zh': { // Chinese             // line 795
  id: { // Indonesian            // line 1059
};
export default STRINGS;          // line 1323
```

- **Shape**: 2-level only — `STRINGS[lang][FLAT_KEY] = string`. **No nesting anywhere.**
- **Languages (5)**: `en`, `ko`, `ja`, `zh`, `id`. (`zh` is Simplified — values use 简体, e.g. `咖啡馆`, `运输费用`.)
- **Key naming style**: `SCREAMING_SNAKE_CASE`, flat, quoted string literals, no namespace prefixing.
  Ad-hoc pseudo-grouping via suffixes/prefixes only: `*_HINT`, `*_BODY`, `*_DETAIL`, `*_CONFIRM`,
  `*_TXT`, `ERR_TITLE_*`, `ERR_BODY_*`, `SETTING_*`, `PERMISSION_*`, `ANNOUNCEMENT_n` / `ANNOUNCEMENT_TXT_n`,
  `FAQ_n` / `FAQ_TXT_n`, `TUTORIAL_TXT_HEADn` / `TUTORIAL_TXT_BODYn`, `INTRO_FOOTER_TXTn`, `TABn`.
- **Key counts**: `en` 263, `ko` 262, `ja` 262, `zh` 262, `id` 262.
- **Interpolation**: **zero**. No `{{x}}`, no `%s`, no `$`. Everything is a fixed string; dynamic values are
  string-concatenated at call sites (e.g. `getString('VERSION') + '  ' + VERSION` in `Setting.tsx:199`).
- **Multi-line values (9)** using literal `\n`: `NO_LEDGER_TXT`, `INVITE_MEMBER_WITH_EMAIL`,
  `TUTORIAL_TXT_BODY1/2/3`, `ANNOUNCEMENT_TXT_2/3/6`, `EMAIL_INVITE_BODY`.

### Locale parity defects (must be fixed during conversion)

| Issue | Detail |
|---|---|
| `PERMISSION_REQUEST_CAMERA_ROLL` | present in `en` only; missing in `ko`, `ja`, `zh`, `id` |
| `id` missing 4 | `PERMISSION_REQUEST_CAMERA_ROLL`, `ANNOUNCEMENT_9`, `ANNOUNCEMENT_TXT_9`, `REQUESTED` |
| `id` has 3 stray keys | `ANNOUNCEMENT1_TITLE`, `ANNOUNCEMENT1_BODY` (dead, wrong naming convention), `DIMINTA` (= Indonesian for "Requested"; it is the mistranslated stand-in for `REQUESTED`) |
| Referenced-but-undefined | `getString('PERMISSION_CAMERA_NOT_GRANTED')` is called in code but **the key does not exist in any locale** → renders `'...'` at runtime |

`getString()` silently returns the literal `'...'` for any missing key (`Localizations.ts`):

```ts
const string = STRINGS[LANG] ? STRINGS[LANG][param.toString()] : null;
if (!string) { return '...'; }
```

That silent fallback is the reason the above defects went unnoticed. **The new implementation must be
compile-time typed (Martie's `NestedKeys<typeof en>` pattern) so this class of bug is impossible.**

### Top-level key groups (the 263 `en` keys, grouped by intent)

| Group | Count | Representative keys |
|---|---|---|
| Auth / account | 37 | `LOGIN`, `SIGNUP`, `LOGOUT`, `PASSWORD*`, `FORGOT_PW`, `FIND_PW`, `SEND_LINK`, `SEND_MAIL_*`, `DO_EMAIL_VERIFICATION`, `TRANSFER_*`, `EMAIL_VERIFICATION_*`, `AUTH_WITH_PW`, `FACEBOOK_NO_EMAIL`, `NONAME`, `NOEMAIL` |
| Common UI verbs/nouns | 38 | `LOADING`, `MORE`, `COMPLETE`, `DONE`, `CANCEL`, `OK`, `YES`, `NO`, `ADD`, `UPDATE`, `DELETE`, `NEXT`, `SEND`, `ERROR`, `WARNING`, `SUCCESS`, `FAILED`, `NONE`, `UNKNOWN`, `VERSION`, `SEE_ALL`, `MEMO`, `SUM`, `AMOUNT`, `CATEGORY`, `DATE`, `LOCATION`, `PICTURE`, `COLOR`, `MEMBER`, `INVITE` |
| Calendar (weekday + month names) | 19 | `SUN`…`SAT`, `JAN`…`DEC` |
| Intro / legal footer | 5 | `INTRO_FOOTER_TXT1`…`5` |
| Tutorial (3 slides) | 6 | `TUTORIAL_TXT_HEAD1-3`, `TUTORIAL_TXT_BODY1-3` |
| Tabs | 4 | `TAB1`=Monthly, `TAB2`=Lists, `TAB3`=Graph, `TAB4`=Extra |
| Ledger (household) | 19 | `NO_LEDGER_TXT`, `ADD_LEDGER`, `WRITE_NAME_OF_LEDGER`, `EXIT_ALERT*`, `CHANGE_OWNER*`, `REQUEST_JOIN`, `WAITING_LIST`, `ACCEPT`, `REJECT` |
| Ledger item (transaction) | 14 | `ADD_LEDGER_ITEM*`, `UPDATE_LEDGER_ITEM*`, `INCOME`, `CONSUME`, `NO_LIST_ADDED_YET`, `PLZ_WRITE_COMMENT`, `SEE_ALL_REVIEWS`, `FOLD_REVIEWS`, `VIDEO_IS_NOT_SUPPORTED` |
| **Category names** | 34 | `CAFE`…`TAX` (see §3) |
| Category CRUD | 5 | `CATEGORY_ADD`, `CATEGORY_ADD_HINT`, `SELECT_ICON`, `ERR_TITLE_CATEGORY_ADD`, `ERR_BODY_CATEGORY_ADD` |
| Member / invite | 10 | `INVITE_MEMBER_WITH_EMAIL`, `INVITATION_SENT`, `INVITING`, `UNREGISTERED_USER`, `DELETE_MEMBER*`, `ERR_NO_VALID_EMAIL*`, `EMAIL_INVITE_SUBJECT`, `EMAIL_INVITE_BODY` |
| Settings | 16 | `SETTING_*`, `CURRENCY_UNIT`, `WRITE_OPINION_HINT`, `SENDING_OPINION_*`, `EXPORT_EXCEL`, `NEXT_UPDATE*` |
| Permissions | 6 | `PERMISSION_*` |
| Lock / biometrics | 10 | `FINGERPRINT_*`, `LOGIN_WITH_FINGERPRINT*`, `PW_NUMBER_NOT_SET`, `ERR_*_LOCK*` |
| **Announcements (content)** | 18 | `ANNOUNCEMENT_1`…`_9` + `ANNOUNCEMENT_TXT_1`…`_9` |
| **FAQ (content)** | 22 | `FAQ_1`…`_11` + `FAQ_TXT_1`…`_11` |

---

## 3. Complete category taxonomy

Source: `Data.ts` → `CATEGORIES_ICON` (34 entries, `id` 0–33) and `INITIAL_CATEGORIES` (34 entries).
The two arrays are **index-aligned**: `INITIAL_CATEGORIES[n].iconId === n === CATEGORIES_ICON[n].id`.

`category: 0` = consume/expense, `category: 1` = income. Only **7 income** categories (iconIds 18–24);
the remaining **27 are expense**. Note the ordering oddity: the income block sits between `HOSPITAL` (17)
and `CAR` (25) — categories 25–33 were appended later in a maintenance update
(`ANNOUNCEMENT_TXT_6`: "Added category icons to support customer needs").

### 3.1 Table

| iconId | Icon asset (`assets/icons/`) | i18n key | Type | en | ko | ja | zh | id |
|---|---|---|---|---|---|---|---|---|
| 0 | `categoryCafe.png` | `CAFE` | expense | Cafe | 카페 | カフェ | 咖啡馆 | KAFE |
| 1 | `categoryDrink.png` | `DRINK` | expense | Drink | 술 | 術 ⚠ | 酒精 | MINUM |
| 2 | `categorySnack.png` | `SNACK` | expense | Snack | 간식 | おやつ | 小吃 | CAMILAN |
| 3 | `categoryMeal.png` | `MEAL` | expense | Meal | 식사 | 食事 | 餐 | MAKAN |
| 4 | `categoryDate.png` | `DATING` | expense | Dating | 데이트 | デート | 日期 ⚠ | tanggal ⚠ |
| 5 | `categoryMovie.png` | `MOVIE` | expense | Movie | 영화 | 映画 | 电影 | FILM |
| 6 | `categoryPet.png` | `PET` | expense | Pet | 애견용품 | 犬用品 | 狗用品 | Kebutuhan anjing |
| 7 | `categoryTransport.png` | `TRANSPORT` | expense | Transport | 교통비 | 交通費 | 运输费用 | MENGANGKUT |
| 8 | `categoryExercise.png` | `EXERCISE` | expense | Exercise | 운동 | 運動 | 运动 | OLAHRAGA |
| 9 | `categoryWear.png` | `WEAR` | expense | Wear | 의류 | 衣類 | 服装 | MEMAKAI |
| 10 | `categorySleep.png` | `SLEEP` | expense | Sleep | 숙박 | 宿泊 | 住宿 | TIDUR |
| 11 | `categoryBaby.png` | `BABY` | expense | Baby | 유아용품 | ベビー用品 | 婴儿用品 | BAYI |
| 12 | `categoryGift.png` | `GIFT` | expense | Gift | 경조사비 | 慶弔費 | 进贡费 | HADIAH |
| 13 | `categoryElectronic.png` | `ELECTRONIC` | expense | Electronic | 전자제품 | 電子製品 | 电子产品 | ELEKTRONIK |
| 14 | `categoryFurniture.png` | `FURNITURE` | expense | Furniture | 가전제품 | 家電製品 | 家用电器 | MEBEL |
| 15 | `categoryTravel.png` | `TRAVEL` | expense | Travel | 여행 | 旅行 | 旅游 | PERJALANAN |
| 16 | `categoryMobileFee.png` | `MOBILE_FEE` | expense | Mobile | 통신비 | 通信費 | 通讯费用 | biaya komunikasi |
| 17 | `categoryHospital.png` | `HOSPITAL` | expense | Hospital | 병원 | 病院 | 医院 | rumah sakit |
| 18 | `categoryWallet.png` | `WALLET_MONEY` | **income** | Wallet | 용돈 | 小遣い | 口袋钱 | uang jajan |
| 19 | `categorySalary.png` | `SALARY` | **income** | Salary | 월급 | 給料 | 薪水 | GAJI |
| 20 | `categoryBonus.png` | `BONUS` | **income** | Bonus | 보너스 | ボーナス | 奖金 | BONUS |
| 21 | `categoryProduct.png` | `SELL_PRODUCT` | **income** | Sale of goods | 물품판매 | 物品販売 | 出售商品 | Penjualan Barang |
| 22 | `categoryAward.png` | `AWARD` | **income** | Award | 상금 | 賞金 | 奖金 | MENGHADIAHKAN |
| 23 | `categoryPresent.png` | `PRESENT` | **income** | Present | 경조사비 ⚠ | 慶弔費 ⚠ | 进贡费 ⚠ | MENYAJIKAN |
| 24 | `categoryExtra.png` | `EXTRA` | **income** | Extra | 기타 | その他 | 吉他 ⚠ | TAMBAHAN␠ ⚠ |
| 25 | `categoryCar.png` | `CAR` | expense | Car | 자동차 | 自動車 | 汽车 | pajak ⚠ |
| 26 | `categoryCulture.png` | `CULTURE` | expense | Culture | 문화 | 文化 | 文化 | budaya |
| 27 | `categoryEducation.png` | `EDUCATION` | expense | Education | 교육 | 教育 | 教育 | pendidikan |
| 28 | `categoryElectric.png` | `ELECTRIC` | expense | Electric | 전기 | 電気代 | 电动 ⚠ | listrik |
| 29 | `categoryInsurance.png` | `INSURANCE` | expense | Insurance | 보험 | 保険 | 保险 | asuransi |
| 30 | `categoryMaintenance.png` | `MAINTENANCE` | expense | Maintenance | 관리비 | 管理費 | 保养 | pemeliharaan |
| 31 | `categoryMembership.png` | `MEMBERSHIP` | expense | Membership | 멤버쉽 | 会費 | 籍 ⚠ | keanggotaan |
| 32 | `categoryStuffs.png` | `STUFFS` | expense | Stuffs | 잡화 | 雑貨 | 东西 | barang |
| 33 | `categoryTax.png` | `TAX` | expense | Tax | 세금 | 税金 | 税 | pajak |

⚠ = known bad translation, re-translate during migration:
- `DRINK` ja `術` — should be `お酒` / `飲み会` (someone transliterated the Korean 술 by hanja).
- `DATING` zh `日期` and id `tanggal` — both mean "calendar date", not "a date/outing". Should be `约会` / `kencan`.
- `PRESENT`(23) collides with `GIFT`(12) in ko/ja/zh (both `경조사비`/`慶弔費`/`进贡费`). Give 23 a distinct income-side wording (ko `선물받음`, ja `贈り物`, zh `礼金收入`).
- `EXTRA` zh `吉他` = "guitar". Should be `其他`. id `"TAMBAHAN "` has a trailing space.
- `CAR` id `pajak` = "tax" (duplicate of `TAX`). Should be `mobil`.
- `ELECTRIC` zh `电动` = "electric-powered". Should be `电费`.
- `MEMBERSHIP` zh `籍` is nonsense. Should be `会员费`.
- `AWARD`(22) and `BONUS`(20) both render `奖金` in zh — disambiguate.

### 3.2 Ready-to-paste TypeScript

Slug-per-category (`key`) is the new stable identifier — **do not migrate on numeric `iconId` alone**;
keep `legacyIconId` so the Firebase → Convex data migration can map old `LedgerItem.category.iconId`.

```ts
// convex/seed/categories.ts  (or src/constants/categories.ts)

export type CategoryKind = 'expense' | 'income';

export interface CategorySeed {
  /** Stable slug; also the i18n key suffix -> t(`category.${key}`) */
  key: string;
  /** Legacy Data.ts CATEGORIES_ICON id / INITIAL_CATEGORIES[n].iconId. 0..33 */
  legacyIconId: number;
  /** Legacy STRINGS.js flat key (for the STRINGS.js -> langs/*.json converter) */
  legacyStringKey: string;
  /** Legacy raster asset basename under BooKooLegacy/assets/icons/ */
  legacyAsset: string;
  kind: CategoryKind;
  /** Display order in the picker (== legacyIconId in the legacy app) */
  order: number;
}

export const DEFAULT_CATEGORIES: readonly CategorySeed[] = [
  { key: 'cafe',        legacyIconId: 0,  legacyStringKey: 'CAFE',         legacyAsset: 'categoryCafe',        kind: 'expense', order: 0 },
  { key: 'drink',       legacyIconId: 1,  legacyStringKey: 'DRINK',        legacyAsset: 'categoryDrink',       kind: 'expense', order: 1 },
  { key: 'snack',       legacyIconId: 2,  legacyStringKey: 'SNACK',        legacyAsset: 'categorySnack',       kind: 'expense', order: 2 },
  { key: 'meal',        legacyIconId: 3,  legacyStringKey: 'MEAL',         legacyAsset: 'categoryMeal',        kind: 'expense', order: 3 },
  { key: 'dating',      legacyIconId: 4,  legacyStringKey: 'DATING',       legacyAsset: 'categoryDate',        kind: 'expense', order: 4 },
  { key: 'movie',       legacyIconId: 5,  legacyStringKey: 'MOVIE',        legacyAsset: 'categoryMovie',       kind: 'expense', order: 5 },
  { key: 'pet',         legacyIconId: 6,  legacyStringKey: 'PET',          legacyAsset: 'categoryPet',         kind: 'expense', order: 6 },
  { key: 'transport',   legacyIconId: 7,  legacyStringKey: 'TRANSPORT',    legacyAsset: 'categoryTransport',   kind: 'expense', order: 7 },
  { key: 'exercise',    legacyIconId: 8,  legacyStringKey: 'EXERCISE',     legacyAsset: 'categoryExercise',    kind: 'expense', order: 8 },
  { key: 'wear',        legacyIconId: 9,  legacyStringKey: 'WEAR',         legacyAsset: 'categoryWear',        kind: 'expense', order: 9 },
  { key: 'sleep',       legacyIconId: 10, legacyStringKey: 'SLEEP',        legacyAsset: 'categorySleep',       kind: 'expense', order: 10 },
  { key: 'baby',        legacyIconId: 11, legacyStringKey: 'BABY',         legacyAsset: 'categoryBaby',        kind: 'expense', order: 11 },
  { key: 'gift',        legacyIconId: 12, legacyStringKey: 'GIFT',         legacyAsset: 'categoryGift',        kind: 'expense', order: 12 },
  { key: 'electronic',  legacyIconId: 13, legacyStringKey: 'ELECTRONIC',   legacyAsset: 'categoryElectronic',  kind: 'expense', order: 13 },
  { key: 'furniture',   legacyIconId: 14, legacyStringKey: 'FURNITURE',    legacyAsset: 'categoryFurniture',   kind: 'expense', order: 14 },
  { key: 'travel',      legacyIconId: 15, legacyStringKey: 'TRAVEL',       legacyAsset: 'categoryTravel',      kind: 'expense', order: 15 },
  { key: 'mobileFee',   legacyIconId: 16, legacyStringKey: 'MOBILE_FEE',   legacyAsset: 'categoryMobileFee',   kind: 'expense', order: 16 },
  { key: 'hospital',    legacyIconId: 17, legacyStringKey: 'HOSPITAL',     legacyAsset: 'categoryHospital',    kind: 'expense', order: 17 },
  { key: 'walletMoney', legacyIconId: 18, legacyStringKey: 'WALLET_MONEY', legacyAsset: 'categoryWallet',      kind: 'income',  order: 18 },
  { key: 'salary',      legacyIconId: 19, legacyStringKey: 'SALARY',       legacyAsset: 'categorySalary',      kind: 'income',  order: 19 },
  { key: 'bonus',       legacyIconId: 20, legacyStringKey: 'BONUS',        legacyAsset: 'categoryBonus',       kind: 'income',  order: 20 },
  { key: 'sellProduct', legacyIconId: 21, legacyStringKey: 'SELL_PRODUCT', legacyAsset: 'categoryProduct',     kind: 'income',  order: 21 },
  { key: 'award',       legacyIconId: 22, legacyStringKey: 'AWARD',        legacyAsset: 'categoryAward',       kind: 'income',  order: 22 },
  { key: 'present',     legacyIconId: 23, legacyStringKey: 'PRESENT',      legacyAsset: 'categoryPresent',     kind: 'income',  order: 23 },
  { key: 'extra',       legacyIconId: 24, legacyStringKey: 'EXTRA',        legacyAsset: 'categoryExtra',       kind: 'income',  order: 24 },
  { key: 'car',         legacyIconId: 25, legacyStringKey: 'CAR',          legacyAsset: 'categoryCar',         kind: 'expense', order: 25 },
  { key: 'culture',     legacyIconId: 26, legacyStringKey: 'CULTURE',      legacyAsset: 'categoryCulture',     kind: 'expense', order: 26 },
  { key: 'education',   legacyIconId: 27, legacyStringKey: 'EDUCATION',    legacyAsset: 'categoryEducation',   kind: 'expense', order: 27 },
  { key: 'electric',    legacyIconId: 28, legacyStringKey: 'ELECTRIC',     legacyAsset: 'categoryElectric',    kind: 'expense', order: 28 },
  { key: 'insurance',   legacyIconId: 29, legacyStringKey: 'INSURANCE',    legacyAsset: 'categoryInsurance',   kind: 'expense', order: 29 },
  { key: 'maintenance', legacyIconId: 30, legacyStringKey: 'MAINTENANCE',  legacyAsset: 'categoryMaintenance', kind: 'expense', order: 30 },
  { key: 'membership',  legacyIconId: 31, legacyStringKey: 'MEMBERSHIP',   legacyAsset: 'categoryMembership',  kind: 'expense', order: 31 },
  { key: 'stuffs',      legacyIconId: 32, legacyStringKey: 'STUFFS',       legacyAsset: 'categoryStuffs',      kind: 'expense', order: 32 },
  { key: 'tax',         legacyIconId: 33, legacyStringKey: 'TAX',          legacyAsset: 'categoryTax',         kind: 'expense', order: 33 },
] as const;

export const EXPENSE_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense'); // 27
export const INCOME_CATEGORIES  = DEFAULT_CATEGORIES.filter((c) => c.kind === 'income');  // 7
export const CATEGORY_BY_LEGACY_ICON_ID = new Map(DEFAULT_CATEGORIES.map((c) => [c.legacyIconId, c]));
```

### 3.3 Legacy category storage — the bug to NOT reproduce

`src/app.js` seeds a **local SQLite** table on first launch:

```js
tx.executeSql(
  'create table if not exists categories' +
  '(id integer primary key AUTOINCREMENT, category int, iconId int, text text);',
);
// ...
tx.executeSql(
  'insert into categories (id, category, iconId, text) values (null, ?, ?, ?)',
  [INITIAL_CATEGORIES[i].category, INITIAL_CATEGORIES[i].iconId, getString(INITIAL_CATEGORIES[i].text)],
);
```

It stores the **already-translated display string**, once, at install time, keyed only by device locale
at that moment. Consequences that the rewrite must fix:

1. Changing the app language **never re-translates** existing categories.
2. Categories are **device-local**, not per-ledger and not synced — two members of the same shared ledger
   can have different category names for the same `iconId`.
3. `LedgerItem.category` (`src/models/LedgerItem.ts`) persists `{ iconId, showDelBtn, txt }` — a UI flag
   (`showDelBtn`) leaked into the persisted model, and `txt` is a denormalised translated snapshot.

**New design**: store `categoryKey: string` (slug) + `isCustom: boolean` + optional `customLabel: string`
on the ledger item. Built-in categories resolve their label through `t('category.' + key)` at render time.
Custom categories carry the user's literal label. Keep `iconKey` separate from `categoryKey` so users can
re-icon a custom category.

---

## 4. Supported languages

Source: `LedgerSettingLanguage.tsx` → `SETTING_ITEMS` (the user-facing picker) and
`Localizations.ts` → `setLocale()` (the device-locale → default mapping).

| Picker index | `lang` value stored | `display` label | STRINGS bucket | Default currency (from `setLocale`) | Default unit |
|---|---|---|---|---|---|
| 0 | `en_US` ⚠ | `ENGLISH` | `en` | `USD` | `$` |
| 1 | `ko` | `한국어` | `ko` | `KRW` | `$` ⚠ (bug — should be `₩`) |
| 2 | `ja` | `日本語` | `ja` | `JPY` | `¥` |
| 3 | `zh` | `中國語` ⚠ (Traditional glyphs for a Simplified bundle) | `zh` | `CNY` | `¥` |
| 4 | `id` | `Indonesia` | `id` | `IND` ⚠ (not a real ISO code; Indonesia is `IDR`) | `Rp` |

⚠ `en_US` vs `en`: the picker writes `en_US`, but `getString()` does `LANG.substring(0, 2)` →
`'en'`, so it happens to work. `LedgerSettingLanguage.componentDidMount` also switches on the raw
`'en_US'`. Do not carry this inconsistency forward — use bare BCP-47 primary subtags.

Also present but with **no strings bundle**: `src/app.js` imports moment locales `ko`, `ja`, `zh-cn`,
`es`, `fr`, `id`. `es`/`fr` are dead imports (no `STRINGS.es` / `STRINGS.fr`).

`assets/cldr.json` (3.16 MB, loaded eagerly via `Globalize.load()`) ships CLDR `main` data for **53**
locales: `am ar bg bn ca cs da de el en en-GB es es-419 et fa fi fil fr gu he hi hr hu id it ja kn ko lt
lv ml mr ms nb nl pl pt pt-PT ro ru sk sl sr sv sw ta te th tr uk vi zh zh-Hans zh-Hant`.
**Delete it in the rewrite** — Hermes on Expo SDK 57 ships full-ICU `Intl`, so
`Intl.NumberFormat(locale, { style: 'currency', currency })` replaces all of `react-native-globalize`
and its 3 MB payload. That 3 MB parse at boot is one measurable chunk of the legacy startup cost.

### Recommended language set for the rewrite

Keep all five (`en`, `ko`, `ja`, `zh`, `id`), normalised to `en`/`ko`/`ja`/`zh`/`id`. Martie's precedent
(9 locales: `en ko ja de es fr th tw vi`) shows the loader scales; add `de/es/fr/th/tw/vi` later by
dropping files in — no code change beyond the `I18n` constructor object and `SupportedLocale` union.
If Traditional Chinese is wanted, follow Martie and use `tw` as a **separate** file rather than
relabelling `zh`.

---

## 5. Supported currencies (47)

Source: `LedgerSettingCurrency.tsx`, `this.state.items` — fields `currency` (code), `currencyLang`
(locale tag used for number formatting), `unit` (display symbol). Order below is the exact on-screen order
(alphabetical-ish, with several out-of-place entries preserved verbatim).

| # | `currency` | `unit` | `currencyLang` | Notes |
|---|---|---|---|---|
| 1 | `ARS` | `$` | `es` | Argentine peso |
| 2 | `AMD` | `؋` | `hy` | ⚠ `؋` is the **Afghani** sign; Armenian dram is `֏` |
| 3 | `BAM` | `KM` | `bs` | |
| 4 | `BGN` | `лв` | `bg` | |
| 5 | `BRN` | `$` | `ms-bn` | ⚠ Brunei dollar's ISO code is `BND`, not `BRN`; symbol `B$` |
| 6 | `BOB` | `$b` | `es-bo` | |
| 7 | `BRL` | `R$` | `pt-br` | |
| 8 | `BYN` | `Br` | `be` | |
| 9 | `BZD` | `BZ$` | `en-bz` | |
| 10 | `CAD` | `$` | `en-ca` | |
| 11 | `CLP` | `$` | `es-cl` | |
| 12 | `CNY` | `¥` | `zh` | |
| 13 | `COP` | `$` | `es-co` | |
| 14 | `CRC` | `₡` | `es-cr` | |
| 15 | `CZK` | `Kč` | `cs` | |
| 16 | `DOP` | `RD$` | `es-do` | |
| 17 | `EGP` | `£` | `ar-eg` | |
| 18 | `EUR` | `$` | `fr` | ⚠ **symbol is wrong** — must be `€` |
| 19 | `GRD` | `GRD` | `el` | ⚠ dead currency (Greek drachma, replaced by EUR 2002) |
| 20 | `GTQ` | `Q` | `es-gt` | |
| 21 | `HNL` | `L` | `es-hn` | |
| 22 | `HKD` | `$` | `zh-hk` | |
| 23 | `HRK` | `kn` | `hr` | ⚠ dead since 2023 (Croatia → EUR) |
| 24 | `HUF` | `Ft` | `hu` | |
| 25 | `IDR` | `Rp` | `id` | |
| 26 | `IND` | `₹` | `is` | ⚠ **not an ISO code** — Indian rupee is `INR`; `currencyLang: 'is'` is Icelandic |
| 27 | `ISK` | `kr` | `bn` | ⚠ `currencyLang: 'bn'` (Bengali) is wrong for Icelandic króna → `is` |
| 28 | `ITL` | `ITL` | `it-it` | ⚠ dead currency (Italian lira) |
| 29 | `JPY` | `¥` | `ja` | |
| 30 | `KRW` | `₩` | `ko` | |
| 31 | `MXN` | `$` | `es-mx` | |
| 32 | `MYR` | `RM` | `ms-my` | |
| 33 | `NOK` | `kr` | `no-no` | |
| 34 | `NPR` | `Rs` | `ne` | |
| 35 | `PHP` | `₱` | `en-ph` | |
| 36 | `RUB` | `руб` | `ru` | |
| 37 | `RON` | `lei` | `ro` | |
| 38 | `SEK` | `kr` | `sv-se` | |
| 39 | `SOS` | `S` | `so` | |
| 40 | `SYP` | `£` | `ar-sy` | |
| 41 | `SVC` | `$` | `es-sv` | ⚠ effectively dead (El Salvador uses USD) |
| 42 | `TWD` | `NT$` | `zh-tw` | |
| 43 | `TRY` | `₺` | `tr` | |
| 44 | `UZS` | `UZS` | `uz-uz` | |
| 45 | `USD` | `$` | `en-us` | default |
| 46 | `VND` | `R` | `vi` | ⚠ **symbol wrong** — must be `₫` |
| 47 | `ZAR` | `VND` | `en-za` | ⚠ **symbol is literally the string `VND`** — must be `R` (the `VND`/`ZAR` rows have swapped units) |

Rendered in the list as `` `${currency} | ${unit}` `` (`LedgerSettingCurrency.renderItem`).

### Recommendation

Do **not** port this hand-maintained table verbatim. Replace with:

```ts
export const SUPPORTED_CURRENCIES = [
  'USD','KRW','JPY','CNY','TWD','HKD','IDR','MYR','SGD','THB','VND','PHP','INR','EUR','GBP',
  'CAD','AUD','NZD','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','TRY','RUB','UAH','BRL',
  'ARS','CLP','COP','MXN','PEN','ZAR','EGP','NGN','AED','SAR','ILS','NPR','BDT','PKR','LKR','KZT','UZS',
] as const;

// symbol + formatting come from Intl, not a hand-typed table:
export const currencySymbol = (code: string, locale: string) =>
  (0).toLocaleString(locale, { style: 'currency', currency: code, minimumFractionDigits: 0 })
    .replace(/[\d\s.,]/g, '');

export const formatMoney = (minorOrMajor: number, code: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(minorOrMajor);
```

Keep the currency **code** as the persisted field (`Ledger.currency: string`). Store amounts as integer
minor units (`amountMinor: number`) plus `currency`, never as the legacy `amount: string` +
`realAmount: number` pair (`src/models/LedgerItem.ts`) — that dual representation is a rounding hazard
and a sorting hazard.

---

## 6. Other reference constants in `Data.ts`

```js
VERSION: '2.0',                                  // shown as `getString('VERSION') + '  ' + VERSION` in Setting.tsx:199
routes: [],                                      // a MUTABLE module-level array used as a nav stack (push in componentDidMount / pop in componentWillUnmount) — DELETE, expo-router owns this
STATUS_CODE: { ERROR:500, NOT_FOUND:404, NO_CONTENT:204, SUCCESS:200, BAD_REQUEST:400, CONFLICT:409, UNAUTHORIZED:401 },
APP_ID: { },                                     // empty, dead
ENCRYPTION_KEY: 'BOOKOO_LEGENDARY_LEDGER_5897',
DATE_FORMAT: 'YYYY-MM-DD',
DATE_FORMAT_DAYS: 'MMMM Do (ddd)',
```

### `ENCRYPTION_KEY`

- Value: `'BOOKOO_LEGENDARY_LEDGER_5897'` — a **hardcoded symmetric key committed to the repo**.
- Only consumer: `src/apis/authApi.ts:7,9`
  ```ts
  import { decrypt, encrypt } from 'react-native-simple-encryption';
  import { ENCRYPTION_KEY } from '@utils/Data';
  ```
  used to obfuscate the credentials cached in `AsyncStorage` for the "remember me" / app-lock flow.
- **Do not port.** In the new stack, Convex Auth owns the session token; store it in
  `expo-secure-store` (Keychain / Android Keystore). The 4-digit app lock PIN also goes to SecureStore,
  hashed. Delete `react-native-simple-encryption` entirely. Treat the literal above as a leaked secret.

Related secrets also committed in `BooKooLegacy` that must NOT be copied into the new repo:
`app.json` Google Maps API keys (iOS `<REDACTED:legacy-google-maps-ios-key>`, Android
`<REDACTED:legacy-google-maps-android-key>`), Google Sign-In `apiKey`, `sentry-expo` `authToken`,
`src/app.js` inline `firebaseConfig` + Amplitude key, and `keys/*.p12` / `keys/*.jks` /
`functions/admin_key.json`.

### `DATE_FORMAT` / `DATE_FORMAT_DAYS`

| Constant | Value | Used at |
|---|---|---|
| `DATE_FORMAT` | `'YYYY-MM-DD'` | `src/apis/firebaseApi.ts:774` (`opinion.createdAt`), `src/components/screen/Tab1.tsx:65` (calendar bucket key) |
| `DATE_FORMAT_DAYS` | `'MMMM Do (ddd)'` | `src/components/screen/Tab2.tsx:61` (list section header) |
| (local dup) | `'MMMM Do (ddd)'` | `src/components/screen/Tab3.tsx:34` — same format redeclared locally as `dateFormat` |

Both are **moment tokens**. `Do` (ordinal day: "1st") has no `Intl` equivalent and no `date-fns` `format`
equivalent without `do`. Migration:

- `'YYYY-MM-DD'` → this must become a **stored, indexable field**, not a format call. Persist
  `dateKey: string` (`"2026-08-24"`, local-date in the ledger's timezone) on every ledger item and index
  it in Convex — that is what makes month-range pagination O(page) instead of O(all items).
  Produce with `date-fns/format(d, 'yyyy-MM-dd')` (note lowercase `yyyy`/`dd` in date-fns).
- `'MMMM Do (ddd)'` → `Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short' })`.
  Drop the English ordinal suffix; it is meaningless in ko/ja/zh/id anyway.
- Recommended lib: `date-fns` + `date-fns/locale` (`enUS`, `ko`, `ja`, `zhCN`, `id`) — tree-shakeable,
  unlike moment. Do not add moment to the new project.

### Ledger colour palette (`Ledger.info.color`, int `0..5`)

`Main.tsx:371-381` and `LedgerSearch.tsx:116-125` map the int to an icon; `BaseStyles.ts` names the hexes.
`LedgerAdd.tsx` / `LedgerUpdate.tsx` render six swatches `oval1..oval6`. `Ledger.ts` defaults `color: 4`.

| `info.color` | icon asset | token | value |
|---|---|---|---|
| 0 | `assets/icons/ic_red.png` | `$red` | `rgb(255,114,141)` |
| 1 | `assets/icons/ic_orange.png` | `$orange` | `rgb(246,166,35)` |
| 2 | `assets/icons/ic_yellow.png` | `$yellow` | `rgb(238,209,0)` |
| 3 | `assets/icons/ic_green.png` | `$green` | `rgb(29,211,168)` |
| 4 | `assets/icons/ic_blue.png` | `$blue` | `rgb(103,158,255)` (default) |
| 5 | `assets/icons/ic_purple.png` | `$purple` | `rgb(182,105,249)` |

Other brand tokens worth preserving (`BaseStyles.ts`): `$navy #292767`, `$blueyGrey #a0a7b8`,
`$darkGrey #414d6b`, `$paleGrey #dde2ec`, `$mediumGrey #869ab7`, `$cloudyBlue #afc2db`,
`$whiteGrey #f9fbfd`, `$leafyGreen #56bc37`, `$darkishPink rgb(230,103,126)`, `$facebook #4262a3`.
`$navy #292767` is the BooKoo primary. **`BaseStyles.ts` also hardcodes `$1`…`$360` = `n * ratio`
(360 tokens) — this is the legacy "design at 375pt and scale" hack and is exactly what breaks tablet
layouts. Do not port; use kstyled tokens + breakpoints.**

Chart palettes (`Tab3.tsx`):
```js
const numColors = ['rgb(255,114,141)','rgb(246,166,35)','rgb(238,209,0)','rgb(29,211,168)','rgb(103,158,255)','rgb(182,105,249)'];
const colors = ['#afc2db','rgb(255,114,141)','rgb(246,166,35)','rgb(238,209,0)','rgb(29,211,168)','rgb(103,158,255)','rgb(182,105,249)','rgb(230,103,126)','#1dd3a9','#feeb00','#ff728d','#f6a623','#679eff','#b669f9','#414d6b','#8e2dba','#222222','#3c96d2'];
```
None of these are dark-mode aware. Re-derive both palettes as theme-token pairs.

---

## 7. Assets inventory

Root: `/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/assets/`

```
assets/
├── cldr.json      3.16 MB   -> DELETE (see §4)
├── icon.png                 -> legacy Expo icon
├── splash.png               -> legacy splash
├── icons/         172 files (58 logical assets × @1x/@2x/@3x)
└── imgs/          190 files (~64 logical assets × @1x/@2x/@3x)
```

All raster PNG at 1x/2x/3x. **No SVG, no vector, no font files.**

### `assets/icons/` — logical names (58)

- **Category icons (34, the ones that matter):**
  `categoryCafe`, `categoryDrink`, `categorySnack`, `categoryMeal`, `categoryDate`, `categoryMovie`,
  `categoryPet`, `categoryTransport`, `categoryExercise`, `categoryWear`, `categorySleep`, `categoryBaby`,
  `categoryGift`, `categoryElectronic`, `categoryFurniture`, `categoryTravel`, `categoryMobileFee`,
  `categoryHospital`, `categoryWallet`, `categorySalary`, `categoryBonus`, `categoryProduct`,
  `categoryAward`, `categoryPresent`, `categoryExtra`, `categoryCar`, `categoryCulture`,
  `categoryEducation`, `categoryElectric`, `categoryInsurance`, `categoryMaintenance`,
  `categoryMembership`, `categoryStuffs`, `categoryTax`
- **Tab bar (8):** `ic_tab1_n`, `ic_tab1_s`, `ic_tab2_n`, `ic_tab2_s`, `ic_tab3_n`, `ic_tab3_s`, `ic_tab4_n`, `ic_tab4_s` (`_n` = normal, `_s` = selected)
- **Ledger colour dots (6):** `ic_red`, `ic_orange`, `ic_yellow`, `ic_green`, `ic_blue`, `ic_purple`
- **Auth providers (2):** `icGoogle`, `icFacebook`
- **Chrome (7):** `app-icon`, `512`, `btnMenu`, `close`, `icChecked`, `ic_search_b`, `ic_search_w`, `loading`
- **Broken / orphaned (3):**
  - `cateogoryHospital@3x.png` — **typo**; the real `categoryHospital@3x.png` is **missing**
  - `ic_serach_w.png` — **typo**; `ic_search_w.png` (@1x) is **missing**, though `Icons.ts` requires it
  - `512.png`, `loading.png` — not referenced from `Icons.ts`/`Data.ts`

### `assets/imgs/` — logical names (~64)

- **Nav / buttons (20):** `arrLeft`, `arrRight`, `backArrWhite`, `btnAdd`, `btnAddMember`, `btnBack`,
  `btnCategoryPlus`, `btnDelete`, `btnDownloadW`, `btnOwner`, `btnPicPlus`, `btnPinkTrash`, `btnPlus`,
  `btnShareW`, `btnTrashW`, `closeW`, `checkW`, `chkGreen`, `listArrUp`, `listArrDown`
- **Settings row icons (7):** `gearDark`, `gearWhite`, `icFaq`, `icLanguage`, `icMoney`, `icNews`, `icOpinion`, `icPassword`
- **Form field icons (5):** `picNick`, `picTel`, `picMail`, `picMoney`, `picCalendar`, `picLocation`, `picStar`
- **Media pickers (3):** `icPhoto`, `pictoCamera`, `pictoGallery`
- **Empty / placeholder (4):** `icNoLedger`, `ovalNoImg`, `recNoImg`, `rectangle2`
- **Onboarding (7):** `intro1`, `intro2`, `intro3`, `intro4`, `tutorial1`, `tutorial2`, `tutorial3`
- **Brand / misc (11):** `logo`, `group`, `oval7`, `oval7Copy3`, `maskInvite`, `picOwner`, `switchN`, `switchY`, `fingerprint`, `icDropdown`
- **Orphaned / junk (5):** `btnChoice`, `icSearch`, `mask`, `medal`, **`btnPicPlus 복사본.png`** (a literal
  "copy" duplicate with a Korean filename and a space — will break bundlers; do not carry over)

### Asset recommendation

Only the **34 category icons** are genuinely irreplaceable content — they are the app's visual identity
and are keyed by `legacyIconId`. Everything else (arrows, gears, checkmarks, tab icons, close buttons,
form-field glyphs) should be dropped in favour of `cpk-ui`'s `Icon` component / an icon font, which
gives dark-mode tinting for free. The legacy PNGs are baked-in single-colour rasters with **no dark
variant** (`gearDark` / `gearWhite` and `ic_search_b` / `ic_search_w` are the manual two-file hack).

Action for the 34 category icons: re-export as **SVG** (or a single sprite) so they can be tinted per
theme, keeping the `legacyAsset` basenames from §3.2 as the filenames.

Also delete: `Icons.ts`'s `ICONS` array — it is a 100+ entry eager preload
(`Asset.loadAsync(ICONS)` in `app.js:_loadAssetsAsync`) that blocks first paint behind `AppLoading`.
This is another concrete legacy startup cost. Expo SDK 57 + `expo-image` should load lazily with
`expo-asset` only for the small above-the-fold set.

---

## 8. Which STRINGS keys are still needed vs dead

Method: `grep -rhoE "getString\(\s*'([A-Z0-9_]+)'" src functions App.ts` → 209 distinct literal keys,
diffed against the 263 `en` keys. One dynamic call site exists (`src/app.js:84`,
`getString(INITIAL_CATEGORIES[i].text)`) which consumes the 34 category keys.

### 8.1 Referenced but MISSING (must be authored)

| Key | Where |
|---|---|
| `PERMISSION_CAMERA_NOT_GRANTED` | called in `src` but defined in no locale → renders `'...'` |

### 8.2 Not referenced by a literal `getString(...)` but STILL NEEDED (34)

All 34 category keys — resolved dynamically via `INITIAL_CATEGORIES[i].text`:
`CAFE DRINK SNACK MEAL DATING MOVIE PET TRANSPORT EXERCISE WEAR SLEEP BABY GIFT ELECTRONIC FURNITURE
TRAVEL MOBILE_FEE HOSPITAL WALLET_MONEY SALARY BONUS SELL_PRODUCT AWARD PRESENT EXTRA CAR CULTURE
EDUCATION ELECTRIC INSURANCE MAINTENANCE MEMBERSHIP STUFFS TAX`

### 8.3 Genuinely unreferenced (21) — classify before deleting

| Key | en value | Verdict |
|---|---|---|
| `NICK` | "Nickname" | **keep** — label for `NICK_HINT`'s field; the legacy form just omitted the label |
| `EMAIL_ADDRESS` | "Email" | **keep** — same |
| `TEL` | "Phone" | **keep** — same |
| `SEND_MAIL_FAILED_DETAIL` | long | **keep** — paired with the used `SEND_MAIL_FAILED` |
| `CALENDAR` | "Calendar" | **keep** — needed for the Tab1 calendar/list toggle |
| `LIST` | "List" | **keep** — same |
| `EMAIL_VERIFICATION_HEADER` | "Email verification" | **keep** — title for the used `EMAIL_VERIFICATION_BODY` |
| `ADD_LEDGER_ITEM` | "Add new item to ledger." | **keep** — screen title |
| `DONE` | "Done" | **merge** into `COMPLETE` (identical value in all 5 locales) → one `common.done` |
| `SUM` | "Sum" | **keep** — needed by the graph/summary screens |
| `EXIT` | "Exit" | **keep** — generic, still useful |
| `PERMISSION_REQUEST` | "Request permission" | **keep** — generic prompt title |
| `PERMISSION_REQUEST_CAMERA` | long | **move** → `app.json` `infoPlist.NSCameraUsageDescription` / `assets/langs/meta/*.json` |
| `PERMISSION_REQUEST_CAMERA_ROLL` | long | **move** → `NSPhotoLibraryUsageDescription` (and add the 4 missing locales) |
| `PERMISSION_REQUEST_LOCATION` | long | **move** → `NSLocationWhenInUseUsageDescription` |
| `PW_NUMBER_NOT_SET` | "4 digits lock number is not setted" | **keep** (fix typo "setted") |
| `SETTING_REPEAT` | "Repeat setting" | **DEAD** — recurring transactions never shipped. Drop unless the rewrite implements it |
| `PASTE_MESSAGE` | "Paste message" | **DEAD** — never wired up |
| `EXPORT_EXCEL` | "Export to excel" | **DEAD** — never shipped (screen exists only as `NoPage.tsx`) |
| `NEXT_UPDATE` / `NEXT_UPDATE_BODY` | "NEXT UPDATE" / "We are trying our best…" | **DEAD** — placeholders shown by `NoPage.tsx` for unimplemented screens. Drop with `NoPage.tsx` |

### 8.4 Dead because the feature is being dropped

| Key | Reason |
|---|---|
| `FACEBOOK_NO_EMAIL` | Facebook login is not in the new auth set (Kakao/Naver/Google/Apple/email-OTP). Drop, along with `assets/icons/icFacebook.*` and `$facebook` |
| `ANNOUNCEMENT_1..9` + `ANNOUNCEMENT_TXT_1..9` (18) | **Move out of i18n entirely** — release-note content, not UI chrome. Belongs in a Convex `announcements` table (`{ publishedAt, locale, title, body }`) so new notes ship without an app release. `ANNOUNCEMENT_TXT_2/3/4/5/6/7/8/9` all describe legacy 2017–2019 releases and are obsolete on day one of the rewrite |
| `FAQ_1..11` + `FAQ_TXT_1..11` (22) | **Move out of i18n** — same reasoning; Convex `faqs` table (`{ order, locale, question, answer }`). Contents are still substantively accurate (they describe the ledger/ledger-item model, invite flow, ownership rules) and should be **rewritten**, not deleted. `FAQ_TXT_1` hardcodes the support address `dooboolab@gmail.com` |

### 8.5 Net for the new `assets/langs/en.json`

```
263 legacy en keys
 -18 announcements  (→ Convex table)
 -22 faq            (→ Convex table)
  -3 permission usage descriptions (→ app.json / langs/meta)
  -1 DONE merged into COMPLETE
  -1 FACEBOOK_NO_EMAIL (feature dropped)
  -5 SETTING_REPEAT, PASTE_MESSAGE, EXPORT_EXCEL, NEXT_UPDATE, NEXT_UPDATE_BODY (dead features)
  -4 INTRO_FOOTER_TXT1..5 collapse into 1 ICU string (net -4)
  +1 PERMISSION_CAMERA_NOT_GRANTED (missing)
= 210 UI strings
```

---

## 9. Recommended new i18n layout

**Adopt Martie's setup wholesale.** It is already proven on Expo SDK 57 in this same account/org and
already integrates with `cpk-ui`.

### 9.1 What Martie does (verified)

Files:
- `/Users/hyo/Github/hyodotdev/Martie/assets/langs/{en,ko,ja,de,es,fr,th,tw,vi}.json` — 9 locales,
  ~22–38 KB each, **2-level nested**, 31 top-level namespaces (`adminQuizSubmissions`, `article`,
  `categories`, `categoriesMap`, `chat`, `common`, `daily`, `details`, `discover`, `error`, `feather`,
  `forceUpdate`, `home`, `inquiry`, `landing`, `league`, `loginInfo`, `my`, `myQuizzes`, `onboarding`,
  `purchase`, `quiz`, `quizLevel`, `quizResult`, `referral`, `reviewPrompt`, `settings`, `shareCard`,
  `signIn`, `signInCode`, `submitQuiz`), camelCase leaf keys, `{{name}}` interpolation.
- `/Users/hyo/Github/hyodotdev/Martie/assets/langs/meta/{en,ja,ko}.json` — **native manifest strings**
  (`android.app_name`, `ios.CFBundleDisplayName`, `ios.NS*UsageDescription`) consumed by `app.config`.
- `/Users/hyo/Github/hyodotdev/Martie/src/STRINGS.ts` — the loader.
- `/Users/hyo/Github/hyodotdev/Martie/src/hooks/useLocale.ts` — reactive locale switch + MMKV persistence.

Deps (`Martie/package.json`): `i18n-js@^4.5.3`, `@types/i18n-js@4.0.1`, `expo-localization@~57.0.1`,
`expo@~57.0.9`, `eslint-plugin-i18n-json@^4.0.1`.
Script: `"lint:i18n": "eslint --fix --ext .json --format node_modules/eslint-plugin-i18n-json/formatter.js assets/langs/"`
(runs via `"lint:all": "bun lint && bun lint:i18n"`). **This is what enforces key parity across locales —
exactly the guard the legacy STRINGS.js lacked.**

Loader, verbatim from `Martie/src/STRINGS.ts` (note the `require` workaround — `import {I18n}` breaks
under Metro; see the linked issue in the comment):

```ts
import en from '../assets/langs/en.json';
// ...
// ad-hoc: https://github.com/fnando/i18n/issues/26#issuecomment-1225775247
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {I18n} = require('i18n-js/dist/require/index');
const i18n = new I18n({en, ko, ja, de, es, fr, th, tw, vi});

i18n.defaultLocale = 'en';
i18n.enableFallback = true;

const getInitialLocale = (): string => {
  const storedLocale = storage.getString(Storage.Locale);
  if (storedLocale) return storedLocale;
  return Localization.getLocales()[0].languageCode || 'en';
};
i18n.locale = getInitialLocale();

type NestedKeys<T> = T extends object
  ? { [K in keyof T]: K extends string | number
        ? `${K}` | (T[K] extends object ? `${K}.${NestedKeys<T[K]>}` : never)
        : never;
    }[keyof T]
  : '';

export const t = (param: NestedKeys<typeof en>, mapObj?: object, locale?: string): string => {
  const currentLocale = i18n.locale;
  if (locale) i18n.locale = locale;
  const translation = i18n.t(param, mapObj);
  i18n.locale = currentLocale;
  return translation;
};
export {i18n};
```

`useLocale()` keeps a module-level `localeListeners` array so a locale change re-renders every consumer
(i18n-js itself is not reactive) and persists to MMKV `Storage.Locale`.

### 9.2 Proposed BooKoo layout

```
BooKoo/
├── assets/
│   └── langs/
│       ├── en.json          # source of truth for the NestedKeys<> type
│       ├── ko.json
│       ├── ja.json
│       ├── zh.json
│       ├── id.json
│       └── meta/
│           ├── en.json      # android.app_name, ios.CFBundleDisplayName, ios.NS*UsageDescription
│           ├── ko.json
│           └── ja.json
├── src/
│   ├── STRINGS.ts           # i18n-js instance + typed t()  (copy Martie's)
│   ├── hooks/useLocale.ts   # reactive switch + SecureStore/MMKV persist (copy Martie's)
│   └── constants/categories.ts   # DEFAULT_CATEGORIES from §3.2
└── convex/
    ├── announcements.ts     # was ANNOUNCEMENT_* (18 keys)
    └── faqs.ts              # was FAQ_* (22 keys)
```

Deviations from Martie worth making:

1. **Persist the locale with the same store the rest of the app uses.** Martie uses MMKV
   (`react-native-mmkv`). If BooKoo standardises on `expo-secure-store` for the auth token, still use
   MMKV/AsyncStorage for the locale — it is not a secret and SecureStore reads are slow enough to be felt
   at boot.
2. **Do not put the user's chosen locale only on-device.** A shared ledger sends push notifications and
   invite emails; store `preferredLocale` on the Convex `users` document too, so server-side
   notification text is rendered in the recipient's language. (Legacy `EMAIL_INVITE_SUBJECT` /
   `EMAIL_INVITE_BODY` were rendered on the *sender's* device in the *sender's* language — a real bug.)
3. **Currency locale is separate from UI locale.** The legacy `Locale` model already understood this
   (`lang` vs `currencyLang`). Keep two fields: `uiLocale` (`en|ko|ja|zh|id`) and
   `currency` (ISO 4217 code). Derive the number-formatting locale from `uiLocale`, not from a
   third hand-maintained `currencyLang` column.
4. **Add the parity lint on day one**: `eslint-plugin-i18n-json@^4.0.1` + the `lint:i18n` script above,
   wired into CI. This is the single highest-value process fix — it is precisely what let
   `PERMISSION_REQUEST_CAMERA_ROLL` and `REQUESTED` rot in the legacy app.

### 9.3 New nested key namespaces (all 263 legacy keys accounted for)

Proposed top-level namespaces: `common`, `auth`, `calendar`, `intro`, `tutorial`, `tabs`, `ledger`,
`ledgerItem`, `category`, `member`, `settings`, `permission`, `lock`.
(`announcement` / `faq` are intentionally absent — they become Convex data.)

Complete `LEGACY_KEY → new.nested.key` mapping — verified programmatically to cover **263/263** keys with
zero unmapped and zero orphans:

**common (38 → 37 keys; `DONE`+`COMPLETE` merge)**

| legacy | new |
|---|---|
| `LOADING` | `common.loading` |
| `MORE` | `common.more` |
| `COMPLETE`, `DONE` | `common.done` *(merged)* |
| `CANCEL` | `common.cancel` |
| `OK` | `common.ok` |
| `YES` | `common.yes` |
| `NO` | `common.no` |
| `ADD` | `common.add` |
| `UPDATE` | `common.update` |
| `DELETE` | `common.delete` |
| `DELETE_CONFIRM` | `common.deleteConfirm` |
| `NEXT` | `common.next` |
| `SEND` | `common.send` |
| `ERROR` | `common.error` |
| `WARNING` | `common.warning` |
| `SUCCESS` | `common.success` |
| `FAILED` | `common.failed` |
| `NONE` | `common.none` |
| `UNKNOWN` | `common.unknown` |
| `VERSION` | `common.version` |
| `SEE_ALL` | `common.seeAll` |
| `EXIT` | `common.exit` |
| `SUM` | `common.sum` |
| `MEMO` | `common.memo` |
| `AMOUNT` | `common.amount` |
| `CATEGORY` | `common.category` |
| `DATE` | `common.date` |
| `LOCATION` | `common.location` |
| `PICTURE` | `common.picture` |
| `COLOR` | `common.color` |
| `MEMBER` | `common.member` |
| `INVITE` | `common.invite` |
| `TYPE_SEARCH` | `common.searchPlaceholder` |
| `CAMERA` | `common.camera` |
| `GALLERY` | `common.gallery` |
| `CALENDAR` | `common.calendar` |
| `LIST` | `common.list` |

**auth (37)**

| legacy | new |
|---|---|
| `LOGIN` | `auth.login` |
| `SIGNUP` | `auth.signUp` |
| `LOGOUT` | `auth.logout` |
| `STILL_NO_ACCOUNT` | `auth.noAccountYet` |
| `NICK` | `auth.nickname` |
| `NICK_HINT` | `auth.nicknamePlaceholder` |
| `EMAIL_ADDRESS` | `auth.email` |
| `EMAIL_HINT` | `auth.emailPlaceholder` |
| `TEL` | `auth.phone` |
| `TEL_HINT` | `auth.phonePlaceholder` |
| `STATUS_MSG` | `auth.statusMessage` |
| `PASSWORD` | `auth.password` |
| `PASSWORD_HINT` | `auth.passwordPlaceholder` |
| `PASSWORD_SIGNUP_HINT` | `auth.passwordSignUpPlaceholder` |
| `PASSWORD_OK` | `auth.passwordConfirm` |
| `PASSWORD_OK_HINT` | `auth.passwordConfirmPlaceholder` |
| `DISPLAY_NAME` | `auth.displayName` |
| `DISPLAY_NAME_HINT` | `auth.displayNamePlaceholder` |
| `FORGOT_PW` | `auth.forgotPassword` |
| `FIND_PW` | `auth.findPassword` |
| `SEND_LINK` | `auth.sendLink` |
| `SEND_MAIL_FAILED` | `auth.resetMailFailed` |
| `SEND_MAIL_FAILED_DETAIL` | `auth.resetMailFailedBody` |
| `SEND_MAIL_SUCCESSED` | `auth.resetMailSent` |
| `SEND_MAIL_SUCCESSED_DETAIL` | `auth.resetMailSentBody` |
| `DO_EMAIL_VERIFICATION` | `auth.verifyEmail` |
| `TRANSFER_COMPLETE` | `auth.verificationMailSent` |
| `TRANSFER_COMPLETE_BODY` | `auth.verificationMailSentBody` |
| `TRANSFER_FAILED` | `auth.verificationMailFailed` |
| `TRANSFER_FAILED_BODY` | `auth.verificationMailFailedBody` |
| `EMAIL_VERIFICATION_HEADER` | `auth.emailVerificationTitle` |
| `EMAIL_VERIFICATION_BODY` | `auth.emailVerificationBody` |
| `AUTH_WITH_PW` | `auth.authenticateWithPassword` |
| `FACEBOOK_NO_EMAIL` | `auth.facebookNoEmail` *(drop — Facebook login removed)* |
| `NOT_REGISTERED_USER` | `auth.notRegisteredUser` |
| `NONAME` | `auth.noName` |
| `NOEMAIL` | `auth.noEmail` |

New keys to add here for the new auth set: `auth.continueWithKakao`, `auth.continueWithNaver`,
`auth.continueWithGoogle`, `auth.continueWithApple`, `auth.sendOtp`, `auth.otpPlaceholder`,
`auth.otpSent`, `auth.otpInvalid`, `auth.otpResend`.

**calendar (19)** — `SUN`→`calendar.weekdayShort.sun` … `SAT`→`calendar.weekdayShort.sat`;
`JAN`→`calendar.month.jan` … `DEC`→`calendar.month.dec`.
*Consider dropping all 19 and using `Intl.DateTimeFormat(locale, { weekday:'short' })` /
`{ month:'long' }` — the legacy values are just the standard names.*

**intro (5 → 1)** — `INTRO_FOOTER_TXT1..5` collapse into a single ICU string:
```json
"intro": { "agreementNotice": "By continuing you agree to the {{terms}} and {{privacy}}." }
```

**tutorial (6)** — `TUTORIAL_TXT_HEAD1/2/3` → `tutorial.slide1.title` / `slide2.title` / `slide3.title`;
`TUTORIAL_TXT_BODY1/2/3` → `tutorial.slide1.body` / `slide2.body` / `slide3.body`.

**tabs (4)** — `TAB1`→`tabs.monthly`, `TAB2`→`tabs.list`, `TAB3`→`tabs.graph`, `TAB4`→`tabs.extra`.

**ledger (19)**

| legacy | new |
|---|---|
| `NO_LEDGER_TXT` | `ledger.empty` |
| `ADD_LEDGER` | `ledger.add` |
| `WRITE_NAME_OF_LEDGER` | `ledger.titlePlaceholder` |
| `WRITE_DESCRIPTION_OF_LEDGER` | `ledger.descriptionPlaceholder` |
| `MISSING_LEDGER_INFO` | `ledger.missingInfo` |
| `NO_LEDGER_SEARCH_RESULT` | `ledger.noSearchResult` |
| `REQUEST_JOIN` | `ledger.requestJoin` |
| `REQUESTED` | `ledger.requested` |
| `WAITING_LIST` | `ledger.waitingList` |
| `ACCEPT` | `ledger.accept` |
| `REJECT` | `ledger.reject` |
| `EXIT_LEDGER` | `ledger.leave` |
| `EXIT_ALERT` | `ledger.leaveTitle` |
| `EXIT_ALERT_CONFIRM` | `ledger.leaveConfirm` |
| `EXIT_ALERT_OWNER` | `ledger.leaveOwnerBlocked` |
| `EXIT_ALERT_LAST_USER` | `ledger.leaveLastMember` |
| `EXIT_ALERT_INVITES` | `ledger.leavePendingInvites` |
| `CHANGE_OWNER` | `ledger.changeOwner` |
| `CHANGE_OWNER_CONFIRM` | `ledger.changeOwnerConfirm` |

**ledgerItem (14)**

| legacy | new |
|---|---|
| `ADD_LEDGER_ITEM` | `ledgerItem.add` |
| `ADD_LEDGER_ITEM_NOTI` | `ledgerItem.addedNotification` |
| `UPDATE_LEDGER_ITEM` | `ledgerItem.update` |
| `UPDATE_LEDGER_ITEM_NOTI` | `ledgerItem.updatedNotification` |
| `ADD_OR_UPDATE_LEDGER_ITEM` | `ledgerItem.addOrUpdate` |
| `ALERT_LEDGER_ITEM_ADD_TITLE` | `ledgerItem.missingInfoTitle` |
| `ALERT_LEDGER_ITEM_ADD_BODY` | `ledgerItem.missingInfoBody` |
| `NO_LIST_ADDED_YET` | `ledgerItem.empty` |
| `INCOME` | `ledgerItem.income` |
| `CONSUME` | `ledgerItem.expense` |
| `PLZ_WRITE_COMMENT` | `ledgerItem.commentPlaceholder` |
| `SEE_ALL_REVIEWS` | `ledgerItem.expandComments` |
| `FOLD_REVIEWS` | `ledgerItem.collapseComments` |
| `VIDEO_IS_NOT_SUPPORTED` | `ledgerItem.videoNotSupported` |

**category (34 + 5)** — the 34 taxonomy keys map to `category.<key>` using the `key` column of §3.2
(`CAFE`→`category.cafe`, `MOBILE_FEE`→`category.mobileFee`, `WALLET_MONEY`→`category.walletMoney`,
`SELL_PRODUCT`→`category.sellProduct`, … `TAX`→`category.tax`). Plus:
`CATEGORY_ADD`→`category.add`, `CATEGORY_ADD_HINT`→`category.namePlaceholder`,
`SELECT_ICON`→`category.selectIcon`, `ERR_TITLE_CATEGORY_ADD`→`category.addErrorTitle`,
`ERR_BODY_CATEGORY_ADD`→`category.addErrorBody`.

**member (10)**

| legacy | new |
|---|---|
| `INVITE_MEMBER_WITH_EMAIL` | `member.inviteByEmail` |
| `INVITATION_SENT` | `member.invitationSent` |
| `INVITING` | `member.inviting` |
| `UNREGISTERED_USER` | `member.unregistered` |
| `DELETE_MEMBER` | `member.delete` |
| `DELETE_MEMBER_CONFIRM` | `member.deleteConfirm` |
| `ERR_NO_VALID_EMAIL` | `member.invalidEmailTitle` |
| `ERR_NO_VALID_EMAIL_BODY` | `member.invalidEmailBody` |
| `EMAIL_INVITE_SUBJECT` | `member.inviteMailSubject` |
| `EMAIL_INVITE_BODY` | `member.inviteMailBody` |

**settings (16)**

| legacy | new |
|---|---|
| `SETTING_ANNOUNCEMENT` | `settings.announcements` |
| `SETTING_OPINION` | `settings.feedback` |
| `SETTING_FAQ` | `settings.faq` |
| `SETTING_PUSH` | `settings.notifications` |
| `SETTING_LOCK` | `settings.lock` |
| `SETTING_LOCK_HINT` | `settings.lockHint` |
| `CURRENCY_UNIT` | `settings.currency` |
| `SETTING_LANGUAGE` | `settings.language` |
| `SETTING_REPEAT` | `settings.repeat` *(dead)* |
| `PASTE_MESSAGE` | `settings.pasteMessage` *(dead)* |
| `EXPORT_EXCEL` | `settings.exportExcel` *(dead)* |
| `WRITE_OPINION_HINT` | `settings.feedbackPlaceholder` |
| `SENDING_OPINION_FAILED` | `settings.feedbackFailed` |
| `SENDING_OPINION_SUCCESSED` | `settings.feedbackSent` |
| `NEXT_UPDATE` | `settings.comingSoonTitle` *(dead)* |
| `NEXT_UPDATE_BODY` | `settings.comingSoonBody` *(dead)* |

New for the rewrite: `settings.theme`, `settings.themeSystem`, `settings.themeLight`, `settings.themeDark`.

**permission (6, 3 of which leave the bundle)**

| legacy | new |
|---|---|
| `PERMISSION_LOCATION_NOT_GRANTED` | `permission.locationDenied` |
| `PERMISSION_NOTIFICATIONS_NOT_GRANTED` | `permission.notificationsDenied` |
| *(missing today)* | `permission.cameraDenied` ← fixes `PERMISSION_CAMERA_NOT_GRANTED` |
| `PERMISSION_REQUEST` | `permission.requestTitle` |
| `PERMISSION_REQUEST_CAMERA` | → `assets/langs/meta/*.json` `ios.NSCameraUsageDescription` |
| `PERMISSION_REQUEST_CAMERA_ROLL` | → `ios.NSPhotoLibraryUsageDescription` |
| `PERMISSION_REQUEST_LOCATION` | → `ios.NSLocationWhenInUseUsageDescription` |

The legacy `app.json` `infoPlist` already carries English-only copies of these three — that is why the
`meta/*.json` pattern from Martie matters: it gives per-locale native strings.

**lock (10)**

| legacy | new |
|---|---|
| `FINGERPRINT_SET` | `lock.setBiometric` |
| `FINGERPRINT_IS_NOT_SET` | `lock.biometricNotEnrolled` |
| `FINGERPRINT_AUTH_TO_USE_APP` | `lock.biometricPrompt` |
| `LOGIN_WITH_FINGERPRINT` | `lock.biometricTitle` |
| `LOGIN_WITH_FINGERPRINT_BODY` | `lock.biometricBody` |
| `PW_NUMBER_NOT_SET` | `lock.pinNotSet` |
| `ERR_TITLE_LOCK` | `lock.authFailedTitle` |
| `ERR_BODY_LOCK` | `lock.authFailedBody` |
| `ERR_TITLE_LOCK_SET` | `lock.setErrorTitle` |
| `ERR_BODY_LOCK_SET` | `lock.setErrorBody` |

Rename note: the legacy wording says "fingerprint" everywhere; the new copy should say "biometrics"
(Face ID / Touch ID / fingerprint) since `expo-local-authentication` covers all three.

**→ Convex tables (40 keys)** — `ANNOUNCEMENT_1..9` + `ANNOUNCEMENT_TXT_1..9` (18) → `announcements`
table; `FAQ_1..11` + `FAQ_TXT_1..11` (22) → `faqs` table.

### 9.4 Conversion script (STRINGS.js → assets/langs/*.json)

Run once, then hand-edit. Requires the §9.3 mapping as a JS object.

```js
// scripts/convert-legacy-strings.mjs
import fs from 'node:fs';
import path from 'node:path';

const LEGACY = '/Users/hyo/Github/hyodotdev/BooKoo/BooKooLegacy/STRINGS.js';
const OUT_DIR = 'assets/langs';
const LOCALES = ['en', 'ko', 'ja', 'zh', 'id'];

// KEY_MAP: { LEGACY_FLAT_KEY: 'new.nested.key' | null }  — null = intentionally dropped.
// Paste the full table from §9.3. Anything mapping to a '(Convex ...)' target is emitted
// to convex-seed.json instead of the locale files.
import { KEY_MAP, CONVEX_KEYS } from './legacy-key-map.mjs';

// STRINGS.js is an ES module; make it requireable.
const src = fs.readFileSync(LEGACY, 'utf8').replace('export default STRINGS;', 'module.exports = STRINGS;');
const tmp = path.join(process.cwd(), '.strings.cjs');
fs.writeFileSync(tmp, src);
const STRINGS = (await import(`file://${tmp}`)).default;
fs.unlinkSync(tmp);

const setDeep = (obj, dotted, value) => {
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
  cur[parts.at(-1)] = value;
};

// Sort keys recursively so eslint-plugin-i18n-json's sorted-keys rule passes.
const sortDeep = (o) =>
  Object.fromEntries(
    Object.entries(o)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, v && typeof v === 'object' ? sortDeep(v) : v]),
  );

for (const loc of LOCALES) {
  const flat = STRINGS[loc] ?? {};
  const out = {};
  for (const [legacyKey, newKey] of Object.entries(KEY_MAP)) {
    if (!newKey) continue;                            // intentionally dropped
    if (CONVEX_KEYS.has(legacyKey)) continue;         // announcements / faq -> Convex
    // Fall back to en so a missing ko/ja/zh/id key does not produce `undefined`.
    const value = flat[legacyKey] ?? STRINGS.en[legacyKey];
    if (value === undefined) { console.warn(`[${loc}] MISSING ${legacyKey}`); continue; }
    setDeep(out, newKey, value);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${loc}.json`), JSON.stringify(sortDeep(out), null, 2) + '\n');
  console.log(`wrote ${OUT_DIR}/${loc}.json`);
}

// Announcements + FAQ -> Convex seed
const announcements = [];
for (let i = 1; i <= 9; i++)
  for (const loc of LOCALES)
    if (STRINGS[loc][`ANNOUNCEMENT_${i}`])
      announcements.push({ order: i, locale: loc, title: STRINGS[loc][`ANNOUNCEMENT_${i}`], body: STRINGS[loc][`ANNOUNCEMENT_TXT_${i}`] });
const faqs = [];
for (let i = 1; i <= 11; i++)
  for (const loc of LOCALES)
    if (STRINGS[loc][`FAQ_${i}`])
      faqs.push({ order: i, locale: loc, question: STRINGS[loc][`FAQ_${i}`], answer: STRINGS[loc][`FAQ_TXT_${i}`] });
fs.writeFileSync('convex/seed/legacyContent.json', JSON.stringify({ announcements, faqs }, null, 2) + '\n');
```

Post-conversion manual passes (do not skip):
1. Fix the ⚠ translations from §3.1.
2. Author `permission.cameraDenied` in all 5 locales.
3. Merge `INTRO_FOOTER_TXT1..5` into `intro.agreementNotice` with `{{terms}}` / `{{privacy}}`.
4. Drop `settings.repeat`, `settings.pasteMessage`, `settings.exportExcel`, `settings.comingSoon*`,
   `auth.facebookNoEmail`.
5. Move the 3 permission usage descriptions into `assets/langs/meta/*.json`.
6. Run `bun lint:i18n` — it will flag any remaining parity gap.
7. Add the ~9 new auth keys + ~4 theme keys.

---

## 10. Performance-relevant content findings (feeds the "must stay snappy" goal)

These are content/asset-layer causes of the legacy slowness, not architecture:

1. `assets/cldr.json` — **3.16 MB JSON parsed synchronously at module load** (`app.js:36`,
   `Globalize.load([require('@assets/cldr.json')])`). Delete; use `Intl`.
2. `Icons.ts`'s `ICONS` array — **100+ PNGs eagerly downloaded via `Asset.loadAsync(ICONS)`** behind
   `<AppLoading>` before first paint (`app.js:_loadAssetsAsync`). Load lazily.
3. `STRINGS.js` — the full 87 KB object with **all 5 locales** is bundled and kept in memory even though
   only one is used. Martie's per-locale JSON files at least let Metro treat them as separate modules;
   if bundle size becomes an issue later, only `en` needs to be static and the rest can be
   `require`d on demand.
4. Category names stored as **translated text in per-device SQLite** means every category render did a
   cross-store lookup by `iconId` against a Redux array (`updateCategories(_array)`), and the array grew
   without bound as users added custom categories. Store categories in Convex, keyed by slug, indexed by
   `ledgerId`.
5. `Data.ts` exports `routes: []`, a **mutable module-level array** pushed/popped by every screen's
   `componentDidMount`/`componentWillUnmount`. Delete outright — expo-router owns navigation state.
6. `LedgerItem` persists `location: {}` and `picture: []` **inline on the item document**. With
   unbounded ledgers this makes every list query drag image URLs and geo blobs across the wire.
   In Convex, put pictures in a separate `ledgerItemPhotos` table (or `_storage` ids) and select them
   only on the detail screen.

---

## 11. Open questions for later phases

1. Keep `zh` as Simplified only, or split `zh` (Simplified) / `tw` (Traditional) as Martie does?
   The legacy `display` label says `中國語` (Traditional glyphs) while the values are Simplified.
2. Do we keep the 4-digit PIN + biometric app lock at all? It exists in legacy
   (`Lock.tsx`, `SettingLock.tsx`, `ModalFingerprint.tsx`, 10 `lock.*` strings) and is genuinely useful
   for a finance app, but it is a whole surface to rebuild.
3. Are `Review` (comments on a ledger item, `src/models/Review.ts`: `{ text, writer, date }`) and the
   `SEE_ALL_REVIEWS` / `FOLD_REVIEWS` / `PLZ_WRITE_COMMENT` strings in scope for v1 of the rewrite?
4. Is there real production data to migrate out of Firebase Realtime Database
   (`https://bookoo-89f6c.firebaseio.com`, `bookoo/{users,ledgers,invites}`)? If yes, the
   `legacyIconId` column in §3.2 is load-bearing; if no, drop it.
5. Should custom (user-created) categories be per-ledger or per-user? Legacy made them per-device,
   which was strictly wrong for a shared ledger.
6. `EXPORT_EXCEL` was never shipped but is an obvious ask for a ledger app — is it in scope now?
   (If yes, note that Artifact/viewer sandboxes block script-initiated downloads; needs a share sheet.)
