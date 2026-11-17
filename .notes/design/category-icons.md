# Category icons — AUTHORITATIVE decision

## Decision: use cpk-ui's built-in icon font. Ship NO category PNGs.

`cpk-ui` bundles **3,771 Phosphor icons** in `cpk.ttf`, wired through
`@expo/vector-icons/createIconSet` in `src/components/uis/Icon/Icon.tsx`, and the font is already
registered by `app.config.ts` (`node_modules/cpk-ui/components/uis/Icon/cpk.ttf`).

Consequences, all in our favour:
- **Zero new binary assets.** The legacy app shipped 34 PNGs (plus @2x/@3x); we ship none.
- Icons inherit `color` and `size` from props, so a category icon is automatically correct in
  light mode, dark mode, and against a ledger's accent color. PNGs could never do that.
- They stay crisp at any size, including tablet layouts.
- One import: `import {Icon} from 'cpk-ui'` → `<Icon name="Coffee" size={24} color={...} />`

`shared/categories.ts` therefore stores an **icon NAME string**, never an asset require().
The name must be a member of cpk-ui's exported `IconName` union (whose runtime source is `iconList`),
so a typo in a preset is a compile error.

## The 34 preset categories

`legacyIconId` is the legacy `item.category.iconId` and is the ONLY join key the migration has.
Keep these ids stable forever.

`key` is the stable camelCase application slug and i18n suffix. `legacyStringKey` is the uppercase
key from the legacy `STRINGS.js` file; it exists only for migration label matching.

| legacyIconId | key | legacyStringKey | kind | cpk-ui icon | legacy asset (dropped) |
|---:|---|---|---|---|---|
| 0 | `cafe` | `CAFE` | EXPENSE | `Coffee` | ~~categoryCafe.png~~ |
| 1 | `drink` | `DRINK` | EXPENSE | `BeerBottle` | ~~categoryDrink.png~~ |
| 2 | `snack` | `SNACK` | EXPENSE | `Cookie` | ~~categorySnack.png~~ |
| 3 | `meal` | `MEAL` | EXPENSE | `ForkKnife` | ~~categoryMeal.png~~ |
| 4 | `dating` | `DATING` | EXPENSE | `Heart` | ~~categoryDate.png~~ |
| 5 | `movie` | `MOVIE` | EXPENSE | `FilmSlate` | ~~categoryMovie.png~~ |
| 6 | `pet` | `PET` | EXPENSE | `Dog` | ~~categoryPet.png~~ |
| 7 | `transport` | `TRANSPORT` | EXPENSE | `Bus` | ~~categoryTransport.png~~ |
| 8 | `exercise` | `EXERCISE` | EXPENSE | `Barbell` | ~~categoryExercise.png~~ |
| 9 | `wear` | `WEAR` | EXPENSE | `TShirt` | ~~categoryWear.png~~ |
| 10 | `sleep` | `SLEEP` | EXPENSE | `Bed` | ~~categorySleep.png~~ |
| 11 | `baby` | `BABY` | EXPENSE | `Baby` | ~~categoryBaby.png~~ |
| 12 | `gift` | `GIFT` | EXPENSE | `Gift` | ~~categoryGift.png~~ |
| 13 | `electronic` | `ELECTRONIC` | EXPENSE | `Television` | ~~categoryElectronic.png~~ |
| 14 | `furniture` | `FURNITURE` | EXPENSE | `Couch` | ~~categoryFurniture.png~~ |
| 15 | `travel` | `TRAVEL` | EXPENSE | `Airplane` | ~~categoryTravel.png~~ |
| 16 | `mobileFee` | `MOBILE_FEE` | EXPENSE | `DeviceMobile` | ~~categoryMobileFee.png~~ |
| 17 | `hospital` | `HOSPITAL` | EXPENSE | `FirstAid` | ~~categoryHospital.png~~ |
| 18 | `walletMoney` | `WALLET_MONEY` | INCOME | `Wallet` | ~~categoryWallet.png~~ |
| 19 | `salary` | `SALARY` | INCOME | `Money` | ~~categorySalary.png~~ |
| 20 | `bonus` | `BONUS` | INCOME | `Trophy` | ~~categoryBonus.png~~ |
| 21 | `sellProduct` | `SELL_PRODUCT` | INCOME | `Storefront` | ~~categoryProduct.png~~ |
| 22 | `award` | `AWARD` | INCOME | `Medal` | ~~categoryAward.png~~ |
| 23 | `present` | `PRESENT` | INCOME | `HandHeart` | ~~categoryPresent.png~~ |
| 24 | `extra` | `EXTRA` | INCOME | `DotsThreeCircle` | ~~categoryExtra.png~~ |
| 25 | `car` | `CAR` | EXPENSE | `Car` | ~~categoryCar.png~~ |
| 26 | `culture` | `CULTURE` | EXPENSE | `Ticket` | ~~categoryCulture.png~~ |
| 27 | `education` | `EDUCATION` | EXPENSE | `GraduationCap` | ~~categoryEducation.png~~ |
| 28 | `electric` | `ELECTRIC` | EXPENSE | `Lightning` | ~~categoryElectric.png~~ |
| 29 | `insurance` | `INSURANCE` | EXPENSE | `ShieldCheck` | ~~categoryInsurance.png~~ |
| 30 | `maintenance` | `MAINTENANCE` | EXPENSE | `Wrench` | ~~categoryMaintenance.png~~ |
| 31 | `membership` | `MEMBERSHIP` | EXPENSE | `IdentificationCard` | ~~categoryMembership.png~~ |
| 32 | `stuffs` | `STUFFS` | EXPENSE | `Basket` | ~~categoryStuffs.png~~ |
| 33 | `tax` | `TAX` | EXPENSE | `Receipt` | ~~categoryTax.png~~ |

Two collisions were resolved deliberately:
- **13 ELECTRONIC → `Television`** (not `DeviceMobile`) so it does not collide with 16 MOBILE_FEE.
  ELECTRONIC is 가전 (appliances); MOBILE_FEE is the phone bill.
- **23 PRESENT → `HandHeart`** (not `Gift`) so it does not collide with 12 GIFT.
  12 GIFT is an EXPENSE (giving); 23 PRESENT is INCOME (receiving) — a receiving-hand reads correctly.

All 34 names were verified to exist in `iconList` (3,771 entries) on 2026-08-24.

## The real problem the presets do NOT solve

Measured from production (see `.notes/research/15-REAL-DATA-PROFILE.md`):

- **1,081 DISTINCT `category.txt` values** across 34,799 items.
- All 34 `iconId`s are in use, most-used first: 3 MEAL (6,715), 2 SNACK (2,572), 0 CAFE (2,029),
  20 BONUS (1,979), 4 DATING (1,715).
- `txt` is free text that was translated ONCE at install and then frozen, so the SAME preset appears
  under many labels: `'Meal'` 2,617 / `'식사'` 2,104 / `'음식'` 650 / `'외식'` 459 all sit on iconId 3.
- Users also renamed and invented categories: `'예약금'` 517, `'수금'` 512, `'계좌이체'` 390, `'작업'` 348.

### Migration rule

For each item, resolve `(iconId, txt)`:

1. If `txt` matches the preset's label in ANY shipped language (build the lookup from the legacy
   `STRINGS.js` translations of the preset key, normalized: trim + casefold), map to the **preset**
   category `iconId` and drop the frozen label — the new app renders the live translation instead.
   This is what collapses `Meal`/`식사`/`음식` back into one category.
2. Otherwise it is a **user-authored category**: create a per-ledger custom category with
   `name = txt` (verbatim, never translated) and `icon` = the preset icon for that `iconId`.
   Dedupe per ledger on `(iconId, normalized txt)`.
3. `type` comes from `sign(realAmount)`, NOT from `category.category` — that field exists on only
   1,090 of 34,799 items. Negative = EXPENSE, positive = INCOME (measured: 25,895 / 8,903 / 0 zeros).

The new app must let a user rename and reorder categories server-side, which the legacy
device-local SQLite design made impossible — that is why the same person's categories differed
across their own devices.
