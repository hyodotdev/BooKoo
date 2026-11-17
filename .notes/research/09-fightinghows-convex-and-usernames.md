# 09 — FightingHows Convex Architecture + Unique-Username Design

Sources of truth:
- `/Users/hyo/Github/hyodotdev/FightingHows` (convex backend, `shared/`, `src/`, `app/`)
- `/Users/hyo/Github/hyodotdev/Martie` (for the style comparison; details already in `06-martie-convex.md`)
- Convex docs (fetched 2026-08-24) for the uniqueness / OCC research in §12

Companion notes (do not duplicate):
- `06-martie-convex.md` — Martie backend conventions
- `08-fightinghows-auth.md` — FightingHows social-auth recipe end to end (`auth.ts`, `lib/idToken.ts`, `lib/kakaoIdentity.ts`, `lib/naverIdentity.ts`, `lib/appleTokens.ts`, `appleWeb.ts`, client sign-in hooks, app.config.ts, env vars). **This note deliberately does not re-derive auth-provider internals.** It covers the *architecture around* auth: schema, permissions, profile model, domain modules, pagination, push, and the new username design.

---

## 0. Version matrix (`FightingHows/package.json`, exact)

| Package | Version | Dep type |
|---|---|---|
| `convex` | `^1.42.3` | dependency |
| `@convex-dev/auth` | `^0.0.94` | **devDependency** |
| `expo` | `~57.0.9` | dependency |
| `expo-router` | `~57.0.9` | dependency |
| `expo-notifications` | `~57.0.8` | dependency |
| `expo-device` | `~57.0.1` | dependency |
| `expo-constants` | `~57.0.8` | dependency |
| `cpk-ui` | `0.7.0` | dependency |
| `kstyled` | `0.4.1` | dependency |
| `babel-plugin-kstyled` | `0.4.1` | devDependency |
| `@shopify/flash-list` | `2.0.2` | dependency |
| `react-native` | `0.86.2` | dependency |
| `react` / `react-dom` | `19.2.3` | dependency |
| `jose` | `^6.2.5` | dependency (ID-token verification) |
| `zustand` | `^5.0.14` | dependency |
| `react-native-mmkv` | `^3.3.3` | dependency |
| `typescript` | `~6.0.3` | devDependency |
| Node engines | `^22.13.0 \|\| >=24.3.0` | |
| Package manager | `bun@1.2.21` | |

`convex.json`:
```json
{
  "$schema": "node_modules/convex/schemas/convex.schema.json",
  "aiFiles": {"enabled": false}
}
```

**`@convex-dev` components in use: NONE beyond auth.** Verified: `ls convex/convex.config.ts` → *No such file*. `ls node_modules/@convex-dev` → `auth` only. No `@convex-dev/aggregate`, `@convex-dev/rate-limiter`, `@convex-dev/migrations`, `@convex-dev/action-retrier`, `@convex-dev/crons`, no `convex-helpers`. Same as Martie.

Note: `@convex-dev/auth` sits in **devDependencies** in both repos and it works — Convex bundles `convex/**` server-side, and the one client import (`@convex-dev/auth/react` in `app/_layout.tsx`) is still resolved by Metro from `node_modules`. It is fragile (a `--production` install would break the app build), so **put it in `dependencies` in BooKoo.**

**No i18n at all.** Every server error message is a hardcoded Korean string inside `ConvexError`. `grep -rn "i18n\|intl\|locale" package.json src/utils` → no hits. This is the single biggest thing BooKoo must change (see §11.2).

---

## 1. Directory layout + house rules

```
convex/
  AGENTS.md                    # 8-line convention doc (verbatim below)
  schema.ts                    # defineSchema only — assembles schema/*
  schema/<table>.ts            # one file per table (or per tight cluster)
  lib/                         # ctx-taking + pure helpers, NOT convex functions
    permissions.ts  constants.ts  serializers.ts  upload.ts
    idToken.ts  appleTokens.ts  kakaoIdentity.ts  naverIdentity.ts
  <domain>/queries.ts | mutations.ts | actions.ts
  auth.ts  auth.config.ts  http.ts  crons.ts  appleWeb.ts  seeds.ts
  tsconfig.json
shared/                        # code shared between convex/ and the app
  authPolicy.ts  youtube.ts
src/                           # app code (features/, hooks/, uis/, utils/)
app/                           # expo-router routes
__tests__/                     # jest — only `authPolicy.test.ts` exists
```

Complete function inventory (103 convex functions, 0 in `_generated`):

| Module | Functions |
|---|---|
| `admin/queries.ts` (350 L) | `listUsers`, `getUser`, `dashboardStats`, `listPendingUsers` |
| `admin/mutations.ts` (359 L) | `setRole`, `updateAdminMemo`, `createMembership`, `updateMembership`, `deleteMembership` |
| `board/queries.ts` (385 L) | `listCategories`, `listPosts`, `listPinnedPosts`, `getPost`, `listComments`, `myPosts` |
| `board/mutations.ts` (658 L) | `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`, `createPost`, `updatePost`, `purgePostLikes`(internal), `deletePost`, `setPostPinned`, `togglePostLike`, `createComment`, `updateComment`, `deleteComment`, `incrementPostView` |
| `chat/queries.ts` (367 L) | `myRoom`, `listRooms`, `getRoom`, `listMessages`, `unreadTotal` |
| `chat/mutations.ts` (405 L) | `ensureMyRoom`, `sendText`, `sendMedia`, `markRead`, `deleteMessage` |
| `shorts/queries.ts` (472 L) | `listCategories`, `feed`, `adminFeed`, `getShorts`, `myFavorites`, `listComments` |
| `shorts/mutations.ts` (701 L) | 13 fns (categories CRUD + reorder, shorts CRUD + reorder, `toggleLike`, `toggleFavorite`, `recordView`, comments CRUD) |
| `videos/queries.ts` (85 L) | `list`, `adminList`, `getVideo` |
| `videos/mutations.ts` (170 L) | `createVideo`, `updateVideo`, `deleteVideo` |
| `notifications/queries.ts` (79 L) | `listMyNotifications`, `unreadNotificationCount` |
| `notifications/mutations.ts` (178 L) | `registerPushToken`, `removePushToken`, `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification` |
| `notifications/actions.ts` (253 L) | `collectPushTokens`(internalQuery), `removePushTokens`(internalMutation), `sendExpoPush`(internalAction) |
| `user/queries.ts` (189 L) | `currentUser`, `linkedAccounts`, `myMemberships` |
| `user/mutations.ts` (357 L) | `updateProfile`, `removeAvatar`, `updateNotificationSettings`, `unlinkAccount`, `deleteAccount`, `touchLastSeen` |
| `user/actions.ts` (694 L) | `promoteVerifiedBootstrapAdmin`, `applyProviderProfileFields`, `linkVerifiedAccount`, `linkAccount`(public action), `saveAppleRefreshToken`, `listAppleRefreshTokens`, `dropAppleRefreshTokens`, `exchangeAppleCode`, `revokeAppleTokens` |
| `files/mutations.ts` (26 L) | `generateUploadUrl` |
| `uploads/mutations.ts` (343 L) | `backfillUploadOwners`(internal), `purgeOrphanUploads`(internal) |

### `convex/AGENTS.md` (verbatim, whole file)

```md
# Convex

이 디렉터리에서 작업할 때.

- 함수 첫 줄: `convex/lib/permissions.ts` 헬퍼.
- 에러: `ConvexError({code, message})`.
- 목록: `paginationOptsValidator` + `.paginate()` + 인덱스. 상한 없는
  `.collect()` 금지. 작은 카탈로그만 `.take()`.
- 삭제는 `deletedAt`. 하드 삭제는 조인 테이블과 고아 blob 만.
- 스키마는 `schema/*.ts` → `schema.ts` 조립.
- `convex/_generated/**` 직접 수정 금지. 배포 확인은 `bunx convex dev --once`.
```

**Copy this file (translated/adapted) into BooKoo verbatim as `convex/AGENTS.md`.** It is the cheapest mechanism that produced the consistency gap between FightingHows and Martie.

---

## 2. `convex/schema.ts` (verbatim, whole file)

```ts
import {defineSchema} from 'convex/server';
import {authTables} from '@convex-dev/auth/server';

import {appleRefreshTokensTable} from './schema/appleRefreshTokens';
import {userProfilesTable} from './schema/userProfiles';
import {membershipsTable} from './schema/memberships';
import {boardCategoriesTable} from './schema/boardCategories';
import {postsTable} from './schema/posts';
import {postCommentsTable} from './schema/postComments';
import {postLikesTable} from './schema/postLikes';
import {shortsCategoriesTable} from './schema/shortsCategories';
import {shortsTable} from './schema/shorts';
import {videosTable} from './schema/videos';
import {
  shortsCommentsTable,
  shortsFavoritesTable,
  shortsLikesTable,
  shortsViewsTable,
} from './schema/shortsReactions';
import {chatMessagesTable, chatRoomsTable} from './schema/chat';
import {notificationsTable, pushTokensTable} from './schema/notifications';
import {uploadsTable} from './schema/uploads';
import {uploadMaintenanceTable} from './schema/uploadMaintenance';

export default defineSchema({
  ...authTables,

  userProfiles: userProfilesTable,
  memberships: membershipsTable,
  appleRefreshTokens: appleRefreshTokensTable,

  boardCategories: boardCategoriesTable,
  posts: postsTable,
  postComments: postCommentsTable,
  postLikes: postLikesTable,

  shortsCategories: shortsCategoriesTable,
  shorts: shortsTable,
  shortsLikes: shortsLikesTable,
  shortsFavorites: shortsFavoritesTable,
  shortsComments: shortsCommentsTable,
  shortsViews: shortsViewsTable,

  videos: videosTable,

  chatRooms: chatRoomsTable,
  chatMessages: chatMessagesTable,

  pushTokens: pushTokensTable,
  notifications: notificationsTable,

  uploads: uploadsTable,
  uploadMaintenance: uploadMaintenanceTable,
});
```

Two structural choices worth stealing:
1. **Blank-line grouping by bounded context** inside `defineSchema` — a reader sees the domains, not 19 alphabetized keys.
2. **A schema file may export more than one table when they are a unit** (`schema/chat.ts` → `chatRoomsTable` + `chatMessagesTable`; `schema/notifications.ts` → `notificationsTable` + `pushTokensTable`; `schema/shortsReactions.ts` → 4 join tables). Martie's rigid one-table-per-file rule produced 19 files, several of them 8 lines long.

### 2.1 Full table + index inventory

`...authTables` (from `@convex-dev/auth/server`) contributes: `users`, `authAccounts`, `authSessions`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers`, `authRateLimits`. `authAccounts` has the `userIdAndProvider` index used by `user/queries.ts:linkedAccounts` and `user/mutations.ts:unlinkAccount`.

| Table | Fields | Indexes |
|---|---|---|
| `userProfiles` | `userId: Id<'users'>`, `email: string`, `displayName: string`, `avatarStorageId?: Id<'_storage'>`, `phone?`, `bio?`, `nickname?`, `gender?: 'M'\|'F'`, `birthday?` ("MM-DD"), `birthyear?` ("YYYY"), `role`, `approvedAt?: number`, `approvedBy?: Id<'users'>`, `adminMemo?`, `pushEnabled: boolean`, `chatNotificationEnabled: boolean`, `postNotificationEnabled: boolean`, `lastSeenAt?`, `updatedAt?`, `deletedAt?` | `by_user ['userId']`, `by_email ['email']`, `by_role ['role']` |
| `memberships` | `userId`, `planName`, `startAt`, `endAt`, `totalSessions?`, `usedSessions?`, `note?`, `createdBy`, `updatedAt?`, `deletedAt?` | `by_user ['userId']`, `by_user_and_endAt ['userId','endAt']`, `by_endAt ['endAt']` |
| `appleRefreshTokens` | `userId`, `clientId`, `refreshToken` (secret), `updatedAt` | `by_user_and_client ['userId','clientId']` |
| `boardCategories` | `name`, `description?`, `order`, `readAccess`, `writeAccess`, `isNotice`, `createdBy`, `updatedAt?`, `deletedAt?` | `by_order ['order']`, `by_deleted_and_order ['deletedAt','order']` |
| `posts` | `categoryId`, `authorId`, `title`, `content`, `imageStorageIds?: Id<'_storage'>[]`, `isPinned`, `viewCount`, `likeCount`, `commentCount`, `updatedAt?`, `deletedAt?` | `by_category ['categoryId']`, `by_category_and_pinned ['categoryId','isPinned']`, `by_author ['authorId']` |
| `postComments` | `postId`, `authorId`, `content`, `parentId?`, `updatedAt?`, `deletedAt?` | `by_post_and_parent ['postId','parentId']`, `by_parent ['parentId']`, `by_author ['authorId']` |
| `postLikes` | `postId`, `userId` | `by_post_and_user ['postId','userId']`, `by_user ['userId']` |
| `shortsCategories` | `name`, `description?`, `emoji?`, `order`, `coverStorageId?`, `createdBy`, `updatedAt?`, `deletedAt?` | `by_order ['order']` |
| `shorts` | `categoryId`, `title`, `description?`, `videoStorageId?`, `videoUrl?`, `thumbnailStorageId?`, `thumbnailUrl?`, `durationMs?`, `width?`, `height?`, `byteSize?`, `uploadedBy`, `isPublished`, `order`, `viewCount`, `likeCount`, `favoriteCount`, `commentCount`, `updatedAt?`, `deletedAt?` | `by_category ['categoryId']`, `by_published ['isPublished']`, `by_category_and_published ['categoryId','isPublished']` |
| `shortsLikes` | `shortsId`, `userId` | `by_shorts_and_user`, `by_user` |
| `shortsFavorites` | `shortsId`, `userId` | `by_shorts_and_user`, `by_user` |
| `shortsComments` | `shortsId`, `authorId`, `content`, `parentId?`, `updatedAt?`, `deletedAt?` | `by_shorts_and_parent`, `by_parent`, `by_author` |
| `shortsViews` | `shortsId`, `userId`, `viewedAt` | `by_shorts_and_user` |
| `videos` | `title`, `description?`, `youtubeUrl`, `youtubeVideoId`, `thumbnailUrl`, `uploadedBy`, `isPublished`, `order`, `updatedAt?`, `deletedAt?` | `by_published ['isPublished']`, `by_youtube_video_id ['youtubeVideoId']` |
| `chatRooms` | `memberId`, `lastMessageAt?`, `lastMessagePreview?`, `memberUnreadCount`, `adminUnreadCount`, `memberLastReadAt`, `adminLastReadAt`, `deletedAt?` | `by_member ['memberId']`, `by_lastMessageAt ['lastMessageAt']` |
| `chatMessages` | `roomId`, `senderId`, `senderIsAdmin` (denormalized), `kind`, `text?`, `storageId?`, `thumbnailStorageId?`, `width?`, `height?`, `durationMs?`, `byteSize?`, `mimeType?`, `fileName?`, `readAt?`, `deletedAt?` | `by_room ['roomId']`, `by_room_and_read ['roomId','readAt']` |
| `pushTokens` | `userId`, `token` (Expo), `platform: 'ios'\|'android'`, `deviceName?`, `updatedAt` | `by_user ['userId']`, `by_token ['token']` |
| `notifications` | `userId`, `kind`, `title`, `body`, `route?`, `readAt?`, `deletedAt?` | `by_user ['userId']`, `by_user_and_deleted ['userId','deletedAt']`, `by_user_and_deleted_and_read ['userId','deletedAt','readAt']` |
| `uploads` | `storageId`, `userId` | `by_storage ['storageId']` |
| `uploadMaintenance` | `backfillSource`, `backfillCursor?`, `backfillDone[]`, `backfillCompletedAt?`, `purgedThrough?` (single row) | *(none)* |

No `searchIndex`, no `vectorIndex` anywhere in FightingHows.

### 2.2 Enum validators exported from schema files (reused by function args)

```ts
// schema/userProfiles.ts
export const userRoleValidator = v.union(
  v.literal('PENDING'), v.literal('MEMBER'), v.literal('ADMIN'), v.literal('SUSPENDED'),
);
// schema/boardCategories.ts
export const boardAccessValidator = v.union(v.literal('MEMBER'), v.literal('ADMIN'));
// schema/chat.ts
export const chatMessageKindValidator = v.union(
  v.literal('TEXT'), v.literal('IMAGE'), v.literal('VIDEO'), v.literal('SYSTEM'),
);
// schema/notifications.ts
export const notificationKindValidator = v.union(
  v.literal('CHAT'), v.literal('POST'), v.literal('COMMENT'),
  v.literal('APPROVAL'), v.literal('MEMBERSHIP'), v.literal('SHORTS'),
);
// schema/uploadMaintenance.ts
export const uploadBackfillSourceValidator = v.union(/* 5 table-name literals */);
```

The union validator is exported **from the schema file** and re-imported by `admin/mutations.ts` (`args: {role: userRoleValidator}`), `notifications/actions.ts` (`kind: notificationKindValidator`), etc. Derived TS types come from `Doc<'userProfiles'>['role']` or `Infer<typeof x>` — never hand-written. **Adopt this exactly.**

---

## 3. Schema style: FightingHows vs Martie — verdict

**FightingHows is clearly better. Adopt FightingHows' style wholesale for BooKoo.** Evidence, point by point:

| Dimension | Martie | FightingHows | Winner |
|---|---|---|---|
| Timestamps | Mixed: `deletedAt: v.string()` (ISO), `updatedAt: v.string()` (ISO), `premiumExpiration: v.number()` (epoch ms), `lastStreakDate: '2026-04-12'` — three encodings in one table | **Uniformly `v.number()` epoch ms** for every timestamp (`updatedAt`, `deletedAt`, `approvedAt`, `readAt`, `lastMessageAt`, `startAt`, `endAt`, `viewedAt`, `lastSeenAt`). Date-shaped strings only where they are genuinely partial dates (`birthday` "MM-DD", `birthyear` "YYYY") and each is documented | **FH** |
| Enums | `quizSubmissions.status` uses `v.union(v.literal(...))` ✅ but `leagues.tier`, `quizLanguages.type`, `articleLanguages.type` are bare `v.string()` with the real values hidden in a `const` in a mutations file ❌ | Every enum is a `v.union(v.literal(...))` **exported from the schema file** and reused in `args` | **FH** |
| Optionality | `userProfiles` has 17 optional vs 5 required — every post-launch field made optional to dodge a migration, never tightened | Optional means "genuinely absent" (`avatarStorageId`, `approvedAt`, `deletedAt`). Behaviour flags are **required with defaults written at insert** (`pushEnabled`, `chatNotificationEnabled`, `postNotificationEnabled`, `viewCount`, `likeCount`, `commentCount`) so no read path needs `?? false` / `?? 0` | **FH** |
| `args` style | Two competing forms in one repo: `args: {x: v.string()}` (~70%) and `args: v.object({...})` (~30%) | One form everywhere: `args: {x: v.string()}` | **FH** |
| `returns:` validators | **Zero** occurrences | **42 occurrences across 103 functions (~41%)**, including every `user/*` and `notifications/*` function; explicit `Promise<T>` return annotations on the handler as well | **FH** (but BooKoo should go to 100%) |
| Errors | `throw new Error('English sentence')` everywhere; client can only string-match; several handlers swallow errors in `try/catch` and return `null`/`[]`, making failure indistinguishable from empty | `ConvexError({code, message})` with a closed `AuthErrorCode` union the client narrows on | **FH** |
| Auth check | **No shared helper.** `getAuthUserId` + 8 different "else" behaviours across ~50 sites; the only helper is `assertAdmin` with a hardcoded email allowlist duplicated in the client | One `convex/lib/permissions.ts`; **first line of every handler** is `requireProfile` / `requireMember` / `requireAdmin` / `getCurrentProfile`; admin is a DB `role`, not a hardcoded list | **FH** |
| `.collect()` | 52 sites, several unbounded on per-user append-only tables — "the single biggest performance liability" | **2 sites**, both a single user's `pushTokens` (bounded by device count) | **FH** |
| Index/limit discipline | Multiple unbounded scans on hot tables | 32 `.take()` sites, every one behind a named `*_SCAN_LIMIT` / `*_BATCH` constant with a comment justifying the number | **FH** |
| Comments | Sparse | Every non-obvious index, cap, soft-delete rule and denormalization carries a *why*, e.g. `by_order` "spans deleted rows on purpose", `by_user_and_deleted_and_read` "`deletedAt` sits in the middle so an inbox full of read rows is skipped by the index instead of being walked and thrown away by a post-filter" | **FH** |
| Naming | `quizResult/query.ts` + `mutation.ts` and `userCategory/mutation.ts` are singular while everything else is plural — leaks into the client API path | 100% plural `queries.ts` / `mutations.ts` / `actions.ts` | **FH** |

**Where Martie is not worse:** its discriminated-union soft-fail results (`{success:false, error:'invalid_code'|...} as const`) are a good pattern for *expected* domain outcomes, and FightingHows has no equivalent (it throws for everything). BooKoo should use **both**: `ConvexError({code,message})` for auth/permission/validation failures, and a discriminated union return for expected business outcomes (e.g. `{status:'TAKEN', suggestions:[...]}` in §12).

### 3.1 Index naming grammar (adopt verbatim)

`by_<field>` / `by_<a>_and_<b>` / `by_<a>_and_<b>_and_<c>`, fields in the same order as the tuple, camelCase preserved (`by_user_and_endAt`, `by_youtube_video_id` is the one snake_case outlier — do not copy that one).

Two rules FightingHows follows that matter for BooKoo's unbounded ledger:
1. **Put the low-cardinality soft-delete discriminator *inside* the index, not in a `.filter()`** — `notifications.by_user_and_deleted_and_read` exists so the unread-badge query never walks read rows.
2. **When you cannot** (because the index predates the field, e.g. `posts.by_category` has no `deletedAt`), **document that pages can come back short** and that the client must keep paging until `isDone`:
   > `posts.by_category` carries no `deletedAt` component, so hidden rows can only be dropped after the page comes back. A page may therefore return fewer than `numItems` rows — clients must keep paging until `isDone`.

For BooKoo, prefer (1) always: bake `deletedAt` into every list index so pages are never short.

---

## 4. `convex/lib/permissions.ts` — the auth-check + error helper pattern

Verbatim, whole file (161 lines) — **this is the single most copyable file in the repo.**

```ts
import {ConvexError} from 'convex/values';
import type {Auth} from 'convex/server';
import {getAuthUserId} from '@convex-dev/auth/server';

import type {Doc, Id} from '../_generated/dataModel';
import type {MutationCtx, QueryCtx} from '../_generated/server';

export type UserRole = Doc<'userProfiles'>['role'];
export type BoardAccess = Doc<'boardCategories'>['readAccess'];

/** Higher wins. Used for every "at least this account type" check. */
const ROLE_RANK: Record<UserRole, number> = {
  SUSPENDED: -1,
  PENDING: 0,
  MEMBER: 1,
  ADMIN: 2,
};

export type AuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'PENDING_APPROVAL'
  | 'SUSPENDED'
  | 'FORBIDDEN'
  | 'NOT_FOUND';

export function authError(code: AuthErrorCode, message: string): ConvexError<{
  code: AuthErrorCode;
  message: string;
}> {
  return new ConvexError({code, message});
}

export function isAdmin(profile: Doc<'userProfiles'> | null): boolean {
  return profile?.role === 'ADMIN';
}

export function hasAtLeast(
  profile: Doc<'userProfiles'> | null,
  required: UserRole,
): boolean {
  if (!profile || profile.deletedAt) return false;

  return ROLE_RANK[profile.role] >= ROLE_RANK[required];
}

export function satisfiesAccess(
  profile: Doc<'userProfiles'> | null,
  access: BoardAccess,
): boolean {
  return hasAtLeast(profile, access);
}

/** Profile of the signed-in user, or `null` when signed out / soft-deleted. */
export async function getCurrentProfile(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'userProfiles'> | null> {
  const userId = await getAuthUserId(ctx);

  if (!userId) return null;

  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();

  if (!profile || profile.deletedAt) return null;

  return profile;
}

export async function requireProfile(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'userProfiles'>> {
  const profile = await getCurrentProfile(ctx);

  if (!profile) {
    throw authError('UNAUTHENTICATED', '로그인이 필요합니다.');
  }

  return profile;
}

/**
 * Same gate as `requireProfile`, for a function that was handed a user id
 * rather than reading it off the session — an action proves who the caller is
 * with `requireActionUserId` but has no `db`, so the "account still exists"
 * half of the check has to run in the mutation it hands off to.
 */
export async function requireProfileOf(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'userProfiles'>> { /* same body, keyed by userId */ }

/**
 * The only gate an action can run itself: `ctx.auth` is all it has, so this
 * proves the caller holds a valid session and nothing more.
 */
export async function requireActionUserId(ctx: {auth: Auth}): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw authError('UNAUTHENTICATED', '로그인이 필요합니다.');
  }

  return userId;
}

/**
 * The gate everything member-facing goes through: approved members and admins
 * pass, everyone else gets a code the client turns into the waiting screen.
 */
export async function requireMember(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'userProfiles'>> {
  const profile = await requireProfile(ctx);

  if (profile.role === 'SUSPENDED') {
    throw authError('SUSPENDED', '이용이 정지된 계정입니다.');
  }

  if (profile.role === 'PENDING') {
    throw authError('PENDING_APPROVAL', '관리자 승인 후 이용할 수 있습니다.');
  }

  return profile;
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'userProfiles'>> {
  const profile = await requireMember(ctx);

  if (profile.role !== 'ADMIN') {
    throw authError('FORBIDDEN', '관리자만 사용할 수 있습니다.');
  }

  return profile;
}

/** Author-or-admin check used by every edit/delete mutation. */
export function assertCanMutateOwn(
  profile: Doc<'userProfiles'>,
  authorId: Id<'users'>,
): void {
  if (profile.userId === authorId || profile.role === 'ADMIN') return;

  throw authError('FORBIDDEN', '작성자만 수정하거나 삭제할 수 있습니다.');
}
```

### 4.1 The five rules encoded here

1. **Six entry points, no free-form checks.** `getCurrentProfile` (nullable, for screens that must render signed-out), `requireProfile` (session only — settings screens usable while PENDING), `requireMember` (the app-wide gate), `requireAdmin`, `requireProfileOf` (mutation called by an action), `requireActionUserId` (all an action can do).
2. **Soft-deleted == signed out.** `getCurrentProfile` returns `null` when `profile.deletedAt` is set. Every gate inherits this, so *one* line makes withdrawal effective across all 103 functions.
3. **Error codes are a closed union the client narrows on.** `PENDING_APPROVAL` and `SUSPENDED` are distinct codes precisely so the client can route to two different waiting screens without string matching.
4. **`ConvexError` is mandatory, not stylistic.** Comment in `auth.ts`: *"Has to be a ConvexError: a production deployment redacts the message of anything else, and the sign-in screen would show 'Server Error'."*
5. **Role rank as a `Record<UserRole, number>`** so `hasAtLeast` / `satisfiesAccess` compose. `SUSPENDED: -1` makes a suspended account rank *below* pending — a suspension can never accidentally satisfy any gate.

### 4.2 Input errors reuse the same payload shape

`convex/user/mutations.ts` and `convex/lib/upload.ts` both define a local:

```ts
function invalidInput(message: string): ConvexError<{code: 'INVALID_INPUT'; message: string}> {
  return new ConvexError({code: 'INVALID_INPUT' as const, message});
}
```
> *"Input errors reuse the `{code, message}` payload shape of `authError` so the client keeps a single ConvexError handler for every failure. `code` stays a literal so that handler can still narrow on it."*

**BooKoo improvement:** hoist `invalidInput` into `lib/errors.ts` (it is duplicated in two files here), widen the code union to `AppErrorCode = AuthErrorCode | 'INVALID_INPUT' | 'HANDLE_TAKEN' | 'HANDLE_RESERVED' | 'RATE_LIMITED' | ...`, and **make `message` an i18n key + params instead of a Korean sentence** (see §11.2).

### 4.3 Rate limiting: NONE

`grep -rni "ratelimit|rate limit|throttle"` over `convex/` and `src/` returns only `LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000` in `user/mutations.ts:32` — a *write-amplification* throttle, not a security control:

```ts
export const touchLastSeen = mutation({
  args: {}, returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const profile = await requireProfile(ctx);
    const now = Date.now();
    if (profile.lastSeenAt !== undefined && now - profile.lastSeenAt < LAST_SEEN_THROTTLE_MS) return null;
    await ctx.db.patch(profile._id, {lastSeenAt: now});
    return null;
  },
});
```
> *"Every profile write invalidates `user.currentUser` for that member, so the 'still here' heartbeat is throttled instead of writing on every app focus."*

**This is a real gap.** `@convex-dev/auth` ships an `authRateLimits` table (part of `authTables`) that rate-limits OTP/sign-in only. Nothing rate-limits `generateUploadUrl`, `createPost`, `sendText`, or — critically for BooKoo — a username-availability probe. BooKoo should add `@convex-dev/rate-limiter` (a real Convex component) or a hand-rolled `rateLimits` table keyed by `(userId, bucket)` with a token bucket. See §12.8.

---

## 5. `convex/lib/constants.ts` (whole file, 55 lines)

```ts
import {v, type Infer} from 'convex/values';

/** Prefix used when a provider gives us neither a name nor an email. */
export const DEFAULT_DISPLAY_NAME_PREFIX = '회원';

export const socialProviderValidator = v.union(
  v.literal('apple'), v.literal('google'), v.literal('kakao'), v.literal('naver'),
);
export type SocialProvider = Infer<typeof socialProviderValidator>;

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  apple: 'Apple', google: 'Google', kakao: '카카오', naver: '네이버',
};

export function isSocialProvider(value: string): value is SocialProvider {
  return Object.prototype.hasOwnProperty.call(SOCIAL_PROVIDER_LABELS, value);
}

export const LINKED_ACCOUNT_SCAN_LIMIT = 20;
export const APPLE_CALLBACK_PATH = '/auth/apple/callback';
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
export const DELETED_POST_PLACEHOLDER = '삭제된 글입니다.';
export const DELETED_COMMENT_PLACEHOLDER = '삭제된 댓글입니다.';
export const DELETED_MESSAGE_PLACEHOLDER = '삭제된 메시지입니다.';
```

Note `isSocialProvider` is a **type guard used to narrow the library's untyped `authAccounts.provider: string`** back into the app's closed union — `linkedAccounts` filters unknown providers out rather than returning them untyped. Same trick will be needed in BooKoo.

`MAX_UPLOAD_BYTES` is described as *"Hard cap enforced on both the client picker and the server metadata"* — but note it lives in `convex/lib/`, so the client imports it via the `@convex/*` tsconfig path (§8), not via `shared/`.

---

## 6. `convex/lib/serializers.ts` — the N+1 killer

```ts
export interface PublicAuthor {
  userId: Id<'users'>;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

const UNKNOWN_AUTHOR = '알 수 없음';

export async function toPublicAuthor(
  ctx, profile: Doc<'userProfiles'> | null, fallbackUserId: Id<'users'>,
): Promise<PublicAuthor> { /* null-profile → UNKNOWN_AUTHOR, avatarUrl null */ }

/**
 * Batch profile lookup for list queries. Convex has no `IN` operator, so a
 * `Map` keyed by `userId` keeps list rendering to one lookup per distinct
 * author instead of one per row.
 */
export async function loadAuthorMap(
  ctx, userIds: Id<'users'>[],
): Promise<Map<string, PublicAuthor>> {
  const unique = [...new Set(userIds.map((id) => id as string))];
  const entries = await Promise.all(unique.map(async (userId) => {
    const profile = await ctx.db.query('userProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>)).first();
    return [userId, await toPublicAuthor(ctx, profile, userId as Id<'users'>)] as const;
  }));
  return new Map(entries);
}

export async function storageUrl(ctx, storageId?: Id<'_storage'>): Promise<string | null>
export async function storageUrls(ctx, storageIds?: Id<'_storage'>[]): Promise<string[]>
```

Usage in `board/queries.ts`:
```ts
async function toPostListRows(ctx, posts, viewer) {
  const authors = await loadAuthorMap(ctx, posts.map((p) => p.authorId));
  return Promise.all(posts.map((p) => toPostListRow(ctx, p, viewer, authors)));
}
```

**Directly reusable for BooKoo.** A shared ledger's transaction list renders "who entered this" per row; `loadAuthorMap` turns 50 profile reads into ≤ (number of distinct members in the ledger, i.e. ~3). Rename to `loadMemberMap` and key on the ledger membership doc so it also carries per-ledger role and per-ledger nickname.

Three more lessons baked in:
- `PublicAuthor` is a **hand-built projection**, never `Doc<'userProfiles'>` — `email`, `phone`, `adminMemo`, `birthyear` can never leak by accident.
- A missing profile degrades to `UNKNOWN_AUTHOR` rather than throwing — a deleted member must not 500 a whole feed page.
- `ctx.storage.getUrl()` is called once per *distinct* blob, inside the map builder.

---

## 7. `convex/lib/upload.ts` + the `uploads` ownership system

The problem statement (verbatim from `schema/uploads.ts`):
> *"Convex records no uploader on storage metadata, so a mutation handed a storage id cannot tell a member's own file from one they guessed — which is why every delete path had to choose between erasing someone else's blob and never erasing anything."*

Three parts:

**(a) `files/mutations.ts:generateUploadUrl`** — `requireMember(ctx)` then `ctx.storage.generateUploadUrl()`. Gated so pending accounts cannot burn quota. **There is deliberately no "delete arbitrary storage id" mutation.**

**(b) `lib/upload.ts:claimUpload(ctx, userId, storageId, message?) → Promise<number>`** — the single gate every mutation accepting a client-supplied storage id goes through:
```ts
async function requireUploadedSize(ctx, storageId, message) {
  const blob = await ctx.db.system.get(storageId);      // ← real metadata, not a client-supplied byteSize
  if (!blob) throw invalidInput('업로드된 파일을 찾을 수 없습니다. 다시 시도해 주세요.');
  if (blob.size > MAX_UPLOAD_BYTES) throw invalidInput(message);
  return blob.size;
}
export async function claimUpload(ctx, userId, storageId, message?) {
  const byteSize = await requireUploadedSize(ctx, storageId, message);
  const owner = await ctx.db.query('uploads')
    .withIndex('by_storage', (q) => q.eq('storageId', storageId)).first();
  if (!owner) { await ctx.db.insert('uploads', {storageId, userId}); return byteSize; }
  if (owner.userId !== userId) throw authError('FORBIDDEN', '다른 회원이 올린 파일은 사용할 수 없습니다.');
  return byteSize;
}
```
Key insight: **`ctx.db.system.get(storageId)` reads the real blob metadata.** Every earlier upload path gated on an optional client `byteSize` arg — *"which put the cap one omitted field away from being bypassed"*. Ownership is **first-claim-wins**.

**(c) `deleteOwnedUploads(ctx, ownerId, storageIds)`** — deletes the ownership row and the blob together, and **silently skips any blob whose owner row is missing or is someone else's**. `ownerId` is the *document's* author (so an admin deleting a member's post still frees that member's blobs), not the caller.

**(d) The nightly orphan purge** (`crons.ts` 18:00 UTC = 03:00 KST → `internal.uploads.mutations.purgeOrphanUploads`), with a genuinely subtle interlock in `schema/uploadMaintenance.ts`:
> *"`backfillCompletedAt` is an interlock, not a statistic. The purge deletes every blob with no `uploads` row, and blobs that predate the `uploads` table have exactly that shape — so on a deployment where the backfill has not finished, the purge would erase every legacy avatar, post image and chat attachment."*

`ORPHAN_MIN_AGE_MS = 24h`; `BACKFILL_BATCH = PURGE_BATCH = 100`; `backfillDone: BackfillSource[]` tracks per-source coverage so a chain resumed halfway cannot claim coverage it never had; `purgedThrough` is the high-water mark so the next pass starts above it.

**Reusability for BooKoo: HIGH.** A ledger app has receipt photos attached to transactions. Copy `uploads` + `claimUpload` + `deleteOwnedUploads` + the cron **on day one** — BooKoo is greenfield, so `backfillCompletedAt` can simply be stamped at deploy time and the whole backfill machinery (`uploadMaintenance.backfillSource/backfillCursor/backfillDone`, `backfillUploadOwners`) can be dropped. Keep only `purgedThrough` + `purgeOrphanUploads`.

Also note the security reasoning repeated in `removeAvatar`:
> *"Storage URLs carry no auth and no expiry, so one left behind stays open to anyone who copied the link."*
A receipt photo is financial data. BooKoo must delete blobs, not just references.

---

## 8. The `shared/` folder pattern + how tsconfig makes it work

**Layout:** `shared/` is a sibling of `convex/` and `src/`, at the repo root. Two files today:

- `shared/authPolicy.ts` (56 L) — `bootstrapAdminEmails`, `shouldAutoLinkViaEmail`, `shouldPromoteBootstrapAdmin`, `hasMatchingAccountEmails`. **Pure functions, zero imports.**
- `shared/youtube.ts` (118 L) — `isYoutubeUrl`, id/thumbnail extraction. Pure.

**Import sites (relative paths only — no alias):**
| Importer | Specifier |
|---|---|
| `convex/auth.ts:24` | `'../shared/authPolicy'` |
| `convex/user/actions.ts:38` | `'../../shared/authPolicy'` |
| `convex/seeds.ts:14` | `'../shared/youtube'` |
| `convex/shorts/mutations.ts:12` | `'../../shared/youtube'` |
| `convex/videos/mutations.ts:10` | `'../../shared/youtube'` |
| `src/demo/catalog.ts:22` | `'../../shared/youtube'` |
| `src/features/shorts/ShortsOverlay.tsx:23` | `'../../../shared/youtube'` |
| `app/admin/videos-form.tsx:28` | `'../../shared/youtube'` |
| `__tests__/authPolicy.test.ts:8` | `'../shared/authPolicy'` |

### 8.1 Why it works — three independent toolchains

**1. Convex bundler (esbuild).** `convex/tsconfig.json` has `"include": ["./**/*"]`, which does **not** cover `../shared`. That is fine: `include` only controls *typechecking scope*, not module resolution. The Convex CLI bundles `convex/**` with esbuild and **follows relative imports out of the directory**, pulling `shared/authPolicy.ts` into the deployed bundle. Constraint: **anything in `shared/` must be runnable in the Convex isolate** — no `node:` builtins, no React, no React Native, no `expo-*`. Both files are pure TS with zero imports, which is why it holds.

**2. Metro (app bundle).** Relative import out of `src/` resolves normally. Same purity constraint applies from the other side.

**3. Root `tsconfig.json` — the typecheck seam (verbatim):**
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "paths": {
      "~/*": ["./src/*"],
      "@convex/*": ["./convex/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "src/styled.d.ts"],
  "exclude": ["node_modules", "dist", "android", "ios", "convex/_generated"]
}
```
`include: ["**/*.ts", "**/*.tsx"]` from the root sweeps `shared/`, `convex/`, `src/`, `app/`, `__tests__/` in **one** program, so `bun typecheck` (= `tsc --noEmit`) checks the shared code against both consumers simultaneously. **This is the whole trick.** `convex/tsconfig.json` is the stock Convex one and exists only so the Convex CLI/LSP has isolate-appropriate `lib`/`module` settings:
```json
{
  "compilerOptions": {
    "allowJs": true, "strict": true, "moduleResolution": "Bundler", "jsx": "react-jsx",
    "skipLibCheck": true, "allowSyntheticDefaultImports": true, "target": "ESNext",
    "lib": ["ES2021", "dom", "dom.iterable"], "types": ["node"],
    "forceConsistentCasingInFileNames": true, "module": "ESNext",
    "isolatedModules": true, "noEmit": true
  },
  "include": ["./**/*"], "exclude": ["./_generated"]
}
```
Note `"exclude": ["convex/_generated"]` in the **root** config: generated code is excluded from the strict app-level lint/typecheck but still typechecked by the Convex config.

**4. Path aliases.** `~/*` → `./src/*` and `@convex/*` → `./convex/*`. There is deliberately **no `@shared/*` alias** — `shared/` is imported relatively everywhere. For BooKoo, add `"@shared/*": ["./shared/*"]` **for app code only** and keep `convex/` importing `../shared/...` relatively, because the Convex bundler does not read the root tsconfig `paths`.

### 8.2 Payoff: `shared/` is the only tested code in the repo

`__tests__/authPolicy.test.ts` is the **only** test file, and it tests `shared/authPolicy.ts`. That is the pattern: **push every decision rule that is pure into `shared/`, then unit-test it there.** For BooKoo this is exactly where the username validator/normalizer/reserved-list belongs (§12) — it must run identically in the client (instant feedback, no round trip) and in the mutation (the real gate).

**BooKoo `shared/` inventory to plan for:**
`shared/username.ts` (normalize/validate/reserved/suggest), `shared/money.ts` (minor-unit arithmetic, currency formatting rules), `shared/date.ts` (ledger period keys `YYYY-MM`, timezone-fixed day boundaries), `shared/category.ts` (built-in category ids + i18n keys), `shared/errors.ts` (the `AppErrorCode` union + payload type), `shared/authPolicy.ts` (copy as-is).

---

## 9. Pagination + index usage — the performance census

**This section is the whole reason BooKoo is being rewritten. FightingHows is the model; Martie is the anti-model.**

Raw counts over `convex/**` excluding `_generated`:

| Metric | FightingHows | Martie |
|---|---|---|
| `.collect()` sites | **2** | 52 |
| `.take(...)` sites | 32 (every one behind a named constant) | — |
| `.filter((q) => ...)` sites | 15 (all post-index narrowing) | many |
| `.paginate(...)` sites | 19 | 9 |
| `returns:` validators | 42 / 103 functions | 0 |

The two `.collect()` sites, both bounded by "devices a person owns":
- `convex/user/mutations.ts:322` — a user's `pushTokens` in `deleteAccount`
- `convex/notifications/actions.ts:119` — a user's `pushTokens` in `collectPushTokens`

### 9.1 Canonical paginated query (`board/queries.ts:171`)

```ts
export const listPosts = query({
  args: {
    categoryId: v.id('boardCategories'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const profile = await requireMember(ctx);          // 1. gate
    await readableCategory(ctx, profile, args.categoryId); // 2. row-level authz

    const result = await ctx.db
      .query('posts')
      .withIndex('by_category', (q) => q.eq('categoryId', args.categoryId)) // 3. index
      .order('desc')
      .paginate(args.paginationOpts);                   // 4. paginate

    const visible = result.page.filter((post) => !isHiddenPost(post)); // 5. post-filter

    return {...result, page: await toPostListRows(ctx, visible, profile)}; // 6. batch serialize
  },
});
```
Shape to reuse: **gate → row authz → indexed range → `.paginate` → in-JS visibility filter → `{...result, page: serialized}`**. Always spread `...result` so `isDone` / `continueCursor` / `splitCursor` / `pageStatus` pass through untouched.

### 9.2 Every `.paginate()` call site

| File:line | Index used | Notes |
|---|---|---|
| `board/queries.ts:185` | `posts.by_category` | `deletedAt` filtered in JS → short pages possible |
| `board/queries.ts:299` | `postComments.by_post_and_parent` | root comments only (`parentId: undefined`); replies via `.take(REPLY_SCAN_LIMIT=100)` |
| `board/queries.ts:358` | `posts.by_author` | "my posts" |
| `chat/queries.ts:235` | `chatRooms.by_lastMessageAt` | admin desk room list |
| `chat/queries.ts:323` | `chatMessages.by_room`, `.order('desc')` | *"Newest first — the client renders an inverted list and pages backwards."* |
| `shorts/queries.ts:256` | `shorts.by_category_and_published` or `by_published` | branch on optional `categoryId`; `.filter(deletedAt === undefined)` |
| `shorts/queries.ts:304` | same, admin variant | deliberately drops both visibility filters so unpublished clips remain editable |
| `shorts/queries.ts:361` | `shortsFavorites.by_user` | |
| `shorts/queries.ts:422` | `shortsComments.by_shorts_and_parent` | |
| `videos/queries.ts:42, 60` | `videos.by_published` | |
| `admin/queries.ts:204/209` | full-table `.order('desc')` **or** `userProfiles.by_role` | branch on optional `role` filter |
| `admin/queries.ts:332` | `userProfiles.by_role` (`PENDING`) | |
| `notifications/queries.ts:46` | `notifications.by_user_and_deleted` | |
| `uploads/mutations.ts:68/83/98/112/128/311` | unindexed full-table walk | **internal batch jobs only**, `numItems: 100`, cursor persisted in `uploadMaintenance` |

### 9.3 The two shapes of "bounded, not paginated"

**(a) Small admin-curated catalogs → `.take(CONST)` with a justifying comment.** All 24 limit constants:

```
board/queries.ts      PINNED_SCAN_LIMIT=50   CATEGORY_SCAN_LIMIT=100  REPLY_SCAN_LIMIT=100
board/mutations.ts    POST_LIKE_PURGE_BATCH=200
chat/mutations.ts     ADMIN_FANOUT_LIMIT=20  READ_RECEIPT_LIMIT=200
chat/queries.ts       ADMIN_UNREAD_SCAN_LIMIT=300
admin/queries.ts      MEMBERSHIP_LOOKUP_LIMIT=20  MEMBERSHIP_HISTORY_LIMIT=100  STATS_LIMIT=200
admin/mutations.ts    ADMIN_SCAN_LIMIT=20
user/queries.ts       MEMBERSHIP_HISTORY_LIMIT=100  LIVE_MEMBERSHIP_LIMIT=20
user/mutations.ts     ADMIN_SCAN_LIMIT=20
user/actions.ts       APPLE_TOKEN_SCAN_LIMIT=8
notifications/queries.ts UNREAD_COUNT_LIMIT=100
shorts/queries.ts     REPLY_SCAN_LIMIT=100
shorts/mutations.ts   ORDER_SCAN_LIMIT=500
videos/mutations.ts   ORDER_SCAN_LIMIT=500
uploads/mutations.ts  BACKFILL_BATCH=100  PURGE_BATCH=100
lib/constants.ts      LINKED_ACCOUNT_SCAN_LIMIT=20
seeds.ts              YOUTUBE_SHORTS_SCAN_LIMIT=500  YOUTUBE_VIDEOS_SCAN_LIMIT=300
```

**(b) Counters as "existence probes", never as true counts.** `unreadNotificationCount` does `.take(UNREAD_COUNT_LIMIT=100)` then `.length` — *"the UI renders anything above this as '99+'"*. `admin/queries.ts` `dashboardStats` uses `STATS_LIMIT=200` and returns `{count: Math.min(visible.length, 200), hasMore: rows.length > 200}`.

**Direct BooKoo consequence:** the legacy app got slow because it computed real totals over the whole ledger. Under Convex the same design would be worse (unbounded read + OCC conflict surface). BooKoo must:
- render "this month's total" from a **rollup document**, never from a scan;
- render any "all-time" figure from a rollup too, or as a capped `count/hasMore` probe.

### 9.4 Denormalized counters — the pattern and its limit

`posts` carries `viewCount`, `likeCount`, `commentCount`; `shorts` carries four counters. They are patched in the same mutation as the join-row write:

```ts
export const togglePostLike = mutation({
  args: {postId: v.id('posts')},
  handler: async (ctx, args) => {
    const profile = await requireMember(ctx);
    const post = await requirePost(ctx, args.postId);
    await requireReadableCategory(ctx, profile, post.categoryId);
    if (post.deletedAt) throw authError('FORBIDDEN', '삭제된 게시글입니다.');

    const existing = await ctx.db.query('postLikes')
      .withIndex('by_post_and_user', (q) => q.eq('postId', post._id).eq('userId', profile.userId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      const likeCount = Math.max(0, post.likeCount - 1);   // ← clamped, never negative
      await ctx.db.patch(post._id, {likeCount});
      return {liked: false, likeCount};
    }
    await ctx.db.insert('postLikes', {postId: post._id, userId: profile.userId});
    const likeCount = post.likeCount + 1;
    await ctx.db.patch(post._id, {likeCount});
    return {liked: true, likeCount};
  },
});
```

**The OCC caveat BooKoo must respect:** every writer of a counter reads and patches the *same document*, so concurrent writers conflict on that doc. Fine for a post's likes; **catastrophic for a shared ledger's monthly total** if 3 people enter transactions at once and each patches one `ledgerMonthlyTotals` doc. Mitigations for BooKoo, in order of preference:
1. **Shard the rollup** (`ledgerRollups` keyed by `(ledgerId, period, shardIndex 0..N)`; read sums N docs, write touches 1).
2. Use the `@convex-dev/aggregate` component (built for exactly this; internally a B-tree with configurable sharding).
3. Recompute in a scheduled internal mutation and accept eventual consistency for the "total" tile.

### 9.5 Fan-out / self-rescheduling batch mutation

```ts
export const purgePostLikes = internalMutation({
  args: {postId: v.id('posts')},
  handler: async (ctx, args) => {
    const likes = await ctx.db.query('postLikes')
      .withIndex('by_post_and_user', (q) => q.eq('postId', args.postId))
      .take(POST_LIKE_PURGE_BATCH);              // 200
    await Promise.all(likes.map((l) => ctx.db.delete(l._id)));
    if (likes.length < POST_LIKE_PURGE_BATCH) return;
    await ctx.scheduler.runAfter(0, internal.board.mutations.purgePostLikes, args);
  },
});
```
**Copy this shape** for BooKoo's "delete a ledger and everything in it" — an unbounded cascade must never be one mutation.

---

## 10. Push notifications — the full stack

### 10.1 Server tables

```ts
export const pushTokensTable = defineTable({
  userId: v.id('users'),
  /** Expo push token — `ExponentPushToken[...]`. */
  token: v.string(),
  platform: v.union(v.literal('ios'), v.literal('android')),
  deviceName: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_token', ['token']);

export const notificationsTable = defineTable({
  userId: v.id('users'),
  kind: notificationKindValidator,   // CHAT|POST|COMMENT|APPROVAL|MEMBERSHIP|SHORTS
  title: v.string(),
  body: v.string(),
  /** Deep-link path handled by `expo-router`, e.g. `/chat/<roomId>`. */
  route: v.optional(v.string()),
  readAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
})
  .index('by_user', ['userId'])
  .index('by_user_and_deleted', ['userId', 'deletedAt'])
  .index('by_user_and_deleted_and_read', ['userId', 'deletedAt', 'readAt']);
```

Preference fields live on `userProfiles`: `pushEnabled` (master), `chatNotificationEnabled`, `postNotificationEnabled` — all **required booleans**, defaulted `true` at profile insert.

### 10.2 Token registration (`notifications/mutations.ts`)

`registerPushToken({token, platform, deviceName?}) → Id<'pushTokens'>` — **upsert keyed on the token string, not the user**:
> *"Expo rotates a device's token, and a device can be handed to another account, so the token string — not the user — is the identity here: an existing row is re-pointed at the current user instead of duplicated."*

`removePushToken({token})` — hard delete, and only if `existing.userId === profile.userId` (*"A token already re-registered by another account is not ours to remove."*). Hard because *"a retired token must stop matching the `by_token` lookup, otherwise the device keeps receiving pushes after sign-out."*

### 10.3 Sending (`notifications/actions.ts`, 253 L) — three functions

```ts
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;   // "Expo rejects requests carrying more than 100 messages."
```

**`collectPushTokens` (internalQuery)** — `{userIds: Id<'users'>[], kind?}` → `string[]`. Per user: load profile via `by_user`; skip if `!profile || profile.deletedAt || !profile.pushEnabled`; skip if `!wantsKind(profile, kind)`; then `.collect()` that user's tokens. Dedupes with a `Set` at both ends.

```ts
function wantsKind(profile, kind) {
  if (kind === 'CHAT') return profile.chatNotificationEnabled;
  if (kind === 'POST' || kind === 'COMMENT') return profile.postNotificationEnabled;
  return true;   // APPROVAL / MEMBERSHIP are account-level: master switch only
}
```

**`sendExpoPush` (internalAction)** — `{userIds, title, body, route?, kind?}` → `{sent, failed, removedTokens}`. Chunks by 100, `fetch` POSTs `[{to, title, body, sound:'default', data:{route}}]`, parses `{data:[tickets]}` defensively, and on `ticket.details.error === 'DeviceNotRegistered'` collects the token for **`removePushTokens` (internalMutation)** — self-healing token GC. Never throws: a bad batch is `console.error`'d and counted.

**No expo-server-sdk dependency** — raw `fetch` to `exp.host`. No Expo access token / FCM v1 service account handling on the server side; it relies on unauthenticated Expo push (fine for now, but Expo recommends an access token for production; note as a BooKoo TODO).

### 10.4 Fan-out call sites — always "row first, push scheduled"

Every notification is written to the `notifications` table **and** scheduled as a push, in that order, in the same mutation:

```ts
await ctx.db.insert('notifications', {userId, kind: 'COMMENT', title, body, route});
await ctx.scheduler.runAfter(0, internal.notifications.actions.sendExpoPush,
  {userIds: [post.authorId], title, body, route, kind: 'COMMENT'});
```
> *"Scheduled rather than awaited: a push outage must never roll back a message that is already in the thread."*

Call sites: `chat/mutations.ts:172+184` (CHAT), `board/mutations.ts:521+531` (COMMENT), `admin/mutations.ts:163+173` (APPROVAL, on `setRole` promotion), `admin/mutations.ts:245+255` (MEMBERSHIP, on `createMembership`).

`board/mutations.ts` also checks the recipient's preference **before writing the row**:
> *"Respect the author's own notification switch instead of writing a row they explicitly asked not to receive."*
(`collectPushTokens` re-checks it for the push; the in-app row is skipped here.)

### 10.5 Reading (`notifications/queries.ts`)

- `listMyNotifications({paginationOpts})` — `by_user_and_deleted` with `deletedAt: undefined`, `.order('desc')`, serialized through `toListItem` (adds `isRead`, maps `undefined → null`).
- `unreadNotificationCount()` — `by_user_and_deleted_and_read` triple-eq index, `.take(100)`, `.length`. Uses `getCurrentProfile` (returns `0` when signed out) *"so a missing profile is `0` rather than an auth error"* — because the tab bar renders before the session resolves.

### 10.6 Client (`src/features/notifications/usePushNotifications.ts`)

Module-level, once:
```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: true,
  }),
});
```
(Note the SDK-53+ field names — `shouldShowBanner`/`shouldShowList` replaced `shouldShowAlert`.)

Android channel created before token request:
```ts
await Notifications.setNotificationChannelAsync('default', {
  name: '기본 알림',
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#D4A62A',
});
```

Token minting:
```ts
const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
const token = await Notifications.getExpoPushTokenAsync(projectId ? {projectId} : undefined);
```
Guarded by `Device.isDevice`. `requestExpoPushToken()` prompts and records `StorageKey.DidAskNotificationPermission` in MMKV; `currentExpoPushToken()` **never** prompts (*"releasing a token must not pop a permission dialog"*).

`usePushNotifications(enabled: boolean)` — `enabled` is "the account is approved", so a PENDING member is never asked. Details worth copying:
- `registeredRef` / `registeringRef` — only a *completed* registration counts as done; a denied permission or failed mutation stays retryable.
- `if (!enabled) registeredRef.current = false` — *"Another account can sign in on this device; the next session has to claim the token for itself."*
- `AppState` `'active'` listener re-runs registration, because permission is usually granted from the OS Settings app which does not remount.
- Swallows `googleServicesFile` / `FirebaseApp is not initialized` errors — dev builds without FCM config would otherwise open LogBox every launch.

Deep-link routing:
```ts
const route = typeof content.data?.route === 'string' ? content.data.route : null;
if (route) router.push(route as never);
```
with `handledResponseRef` de-duping by `request.identifier`, because *"`getLastNotificationResponseAsync` keeps handing back the same response"*. Both cold start (`getLastNotificationResponseAsync`) and warm (`addNotificationResponseReceivedListener`) are handled.

`useUnregisterPushToken()` — must run **before** sign-out (the mutation needs the session) and never throws.

`app.config.ts` plugin block:
```ts
['expo-notifications', {icon: './assets/notification-icon.png', color: '#C9A227'}]
```

**Reusability for BooKoo: near-100% copy.** Rename `notificationKindValidator` literals to `'LEDGER_INVITE' | 'TRANSACTION_ADDED' | 'COMMENT' | 'BUDGET_ALERT' | 'SETTLEMENT' | 'SYSTEM'`. Change `title`/`body` from stored Korean strings to **`titleKey`/`bodyKey` + `params: v.any()`** so the push action can localize per recipient (`userProfiles.locale`) at send time — FightingHows cannot do this and it is the main change needed (§11.2).

---

## 11. Other modules — one paragraph each + ledger reuse verdict

| Module | What it does | Reuse for BooKoo |
|---|---|---|
| `admin/` | `listUsers` (paginated, optional `role` filter branch, in-JS keyword match on the page), `getUser` (profile + capped membership history + adminMemo), `dashboardStats` (capped `count/hasMore` probes), `listPendingUsers`. Mutations: `setRole` (self-demotion blocked; last-admin guard via `by_role` + `.take(20)`; preserves original `approvedAt`/`approvedBy` when re-promoting; fires APPROVAL notification+push), `updateAdminMemo`, membership CRUD. | **Medium.** The *shape* (paginated admin list + capped stat probes + last-admin guard) transfers to BooKoo's "ledger owner" role. BooKoo's roles are **per-ledger**, not global, so `role` moves off `userProfiles` onto a `ledgerMembers` join table. Keep a small global `appRole` for support/admin tooling. |
| `board/` | Categories with `readAccess`/`writeAccess` (`MEMBER`/`ADMIN`), posts with images + pin + 3 counters, one-level-threaded comments, likes join table, soft delete with the "post survives as 삭제된 글입니다 if it has comments" rule, `incrementPostView`. | **Low-medium.** Not a ledger feature. But `postComments` (one-level threading, `by_post_and_parent`, replies via capped `.take`) is a **direct template for comments on a transaction**, and `togglePostLike` is the template for any per-user reaction. |
| `chat/` | One room per member, admin desk on the other side; `chatRooms` carries `lastMessageAt`, `lastMessagePreview`, and **two** unread counters + two `lastReadAt`; `chatMessages` has `senderIsAdmin` denormalized *"so the bubble can pick a side without a profile lookup"*, media metadata inline, and `readAt` driving the KakaoTalk "1". Messages paginate `by_room` `.order('desc')` into an inverted list. | **Medium.** BooKoo does not need 1:1 admin chat, but the **per-side unread counter + `lastReadAt` + preview-on-the-parent-doc** design is exactly what a shared ledger's "activity feed / unseen changes" badge needs, and it is O(1) to read. Also the media-metadata-inline pattern (width/height/durationMs/byteSize/mimeType/fileName next to `storageId`) is right for receipt photos. |
| `files/` | `generateUploadUrl` only (26 lines), gated by `requireMember`. | **Direct copy.** |
| `uploads/` | Ownership backfill + nightly orphan purge (§7d). | **Copy the purge; drop the backfill** (greenfield). |
| `videos/` | YouTube link catalog: `youtubeUrl`, `youtubeVideoId`, `thumbnailUrl`, `isPublished`, `order`; `by_youtube_video_id` index used to reject duplicates. URL parsing lives in `shared/youtube.ts`. | **None** (content feature). But `by_youtube_video_id` is a **good example of the check-then-insert uniqueness pattern already in this repo** — see §12.3. |
| `shorts/` | Full short-video feed: categories, uploads to `_storage`, publish flag, 4 counters, likes/favorites/comments/views join tables, `recordView` upsert on `by_shorts_and_user`, admin reorder via `ORDER_SCAN_LIMIT=500`. | **None** (content feature). `recordView`'s idempotent upsert-on-composite-index is the template for BooKoo's "mark ledger activity seen". |
| `seeds.ts` | `convex run seeds:seedAll`. | Pattern worth copying for BooKoo's built-in category seed. |
| `crons.ts` | Exactly one job: daily 18:00 UTC (03:00 KST) `purgeOrphanUploads`. | Copy; BooKoo adds recurring-transaction materialization + budget-alert jobs. |

### 11.1 Missing entirely (BooKoo needs these, FightingHows has none)

- **Reporting / blocking / muting.** No `reports` or `blocks` table anywhere. For an Instagram-style social ledger with public handles, BooKoo needs both from day one (App Store 1.2 requires user-generated-content apps to ship reporting + blocking).
- **Rate limiting** (§4.3).
- **Search indexes.** No `searchIndex` anywhere; `admin.listUsers` does a `.filter()` on the *already-paginated page*, so it only searches the current page — a real bug in a large member list. BooKoo needs a real `searchIndex` for user/handle search (§12.9).
- **Audit log.** Admin actions (`setRole`, `updateAdminMemo`, membership edits) leave no trail. A shared ledger absolutely needs `ledgerAuditLog`.
- **i18n** (below).

### 11.2 The i18n hole — the one thing to change structurally

Every `ConvexError` message is a hardcoded Korean sentence, and `notifications.title` / `.body` are Korean strings **stored in the DB**. BooKoo is multi-language, so:

```ts
// shared/errors.ts
export type AppErrorCode =
  | 'UNAUTHENTICATED' | 'PENDING_APPROVAL' | 'SUSPENDED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'INVALID_INPUT'   | 'RATE_LIMITED'
  | 'HANDLE_TAKEN'    | 'HANDLE_RESERVED' | 'HANDLE_INVALID' | 'HANDLE_COOLDOWN';

export interface AppErrorPayload {
  code: AppErrorCode;
  /** i18n key, e.g. 'error.handleTaken'. */
  messageKey: string;
  /** Interpolation params for the key. */
  params?: Record<string, string | number>;
}
```
and store notifications as `titleKey`/`bodyKey`/`params` + `userProfiles.locale`, localizing inside `sendExpoPush` per recipient. Keep an English `fallbackText` on the row so an unknown key still renders something.

---

## 12. DESIGN: Instagram-style unique usernames (handles) on Convex

Requirement: a globally unique, case-insensitive handle chosen at **first sign-in**, changeable later, safe against impersonation, with a debounced availability check and suggestions.

### 12.1 Confirmed research — Convex has NO unique constraint

| Question | Answer | Source |
|---|---|---|
| Does Convex support `unique: true` on an index? | **No.** The indexes doc documents only `.index(name, fields)`, `.searchIndex`, `.vectorIndex`. Limits: **16 fields per index, 32 indexes per table**, `_creationTime` auto-appended and counting toward the 16. | docs.convex.dev/database/indexes |
| Official stance? | *"Out of the box, Convex doesn't have row-level security, uniqueness constraints, or much of anything"* — but teams have built them *"and they've benefited from the same level of transactional integrity they'd have with… Postgres."* | stack.convex.dev/the-software-defined-database |
| Recommended pattern? | **Check-then-insert inside one mutation**, using an index on the field. *"The way to enforce unique constraints is to create an index and write a query that efficiently checks for that item, which is the same way that unique constraints are implemented in SQL databases."* | Convex Discord Q&A (discord-questions.convex.dev) |
| Why is it race-safe? | *"whichever mutation finishes first will commit, which will invalidate reads done by the second mutation when it finishes and checks this, so it will need to be retried."* | Convex Discord Q&A |
| Isolation model | Convex is ACID with **serializable isolation and optimistic concurrency control**. *"Two serializable transactions conflict if one of them reads or writes data that the other writes."* Writes commit only *"if every version in the read set is still the latest version."* | docs.convex.dev/database/advanced/occ |
| Conflict granularity | **Convex uses index ranges in transactions' read sets to detect conflicts** — a write landing inside a range you read invalidates you. Remediation advice: *"Consider reducing the amount of data read by using indexed queries with selective index range expressions."* | docs.convex.dev/error ("Write conflict: Optimistic concurrency control") |
| Retries | *"If a conflict is detected, the transaction aborts, rolls back its writes, and the function runner automatically retries the entire mutation at a fresh timestamp."* *"Convex internally does several retries to mitigate this concern"* — but under sustained hammering some invocations eventually surface a write-conflict error. | docs.convex.dev/error, stack.convex.dev/how-convex-works |
| Determinism during retry | Mutations must be deterministic; Convex provides *"a 'seeded' strong pseudo-random number generator at `Math.random()`"*, and `Date.now()` is fixed per transaction. So `Math.random()` in a suggestion generator is legal and does not break OCC. | docs.convex.dev/functions/runtimes |
| Helper libraries | `convex-helpers/server/triggers` can attach a trigger to a table so the uniqueness check runs *"within the same mutation that changes the data… atomically with the data changing"* — i.e. enforcement on every `insert`/`patch`/`replace` without remembering to call the helper. | stack.convex.dev/triggers, convex-helpers README |

### 12.2 Why check-then-insert is actually safe here (the precise argument)

Take two concurrent mutations M1 and M2 both claiming `hyo`.

1. Each runs, **inside a single mutation transaction**:
   ```ts
   const taken = await ctx.db.query('userHandles')
     .withIndex('by_handleKey', (q) => q.eq('handleKey', 'hyo'))
     .unique();                       // registers an index-range read over exactly [hyo, hyo]
   if (taken) throw handleTaken();
   await ctx.db.insert('userHandles', {handleKey: 'hyo', ...});
   ```
2. M1 commits first. Its insert produces a document **whose `handleKey` falls inside the index range M2 read**.
3. At M2's commit, Convex compares M2's read set against writes since M2's start timestamp. The `by_handleKey = 'hyo'` range is no longer at the version M2 saw → **write conflict**.
4. Convex **aborts M2, rolls back its writes, and re-runs the whole mutation at a fresh timestamp**. On the re-run the query now returns M1's row → M2 throws `HANDLE_TAKEN`. A duplicate is impossible.

Three conditions this argument depends on — **all three are hard requirements:**

- **(C1) The check and the write must be in the SAME mutation.** A client calling `checkAvailability` (query) and then `claimHandle` (mutation) is a classic TOCTOU: the query's read set is discarded when the query returns. The availability query is *advisory UX only*; the mutation must re-check.
- **(C2) The check must use `withIndex` with an exact `.eq()` on the normalized key — never `.filter()`.** A `.filter()` scan is still *correct* (its read set is the whole table, so it conflicts too), but it makes **every** write to that table conflict with **every** in-flight handle claim, which under load converts into repeated retries and eventually surfaced write-conflict errors. The narrow index range is what keeps the conflict set to "someone else claiming the exact same handle".
- **(C3) The uniqueness key must be the normalized field, and normalization must be identical on read and write.** Store `handleKey` (already normalized) as its own column and index that; never `.eq('handle', input.toLowerCase())` against a non-normalized column.

Use `.unique()` rather than `.first()` for the check: it throws if the range somehow contains >1 document, turning a pre-existing data corruption into a loud error instead of a silent pick.

### 12.3 Precedent already in these repos

- **Good:** `videos.by_youtube_video_id` — an index that exists purely so `createVideo` can reject a duplicate YouTube id. Exactly the C2 shape.
- **Bad (do not copy):** Martie's `generateUniqueNickname` in `Martie/convex/user/mutations.ts:45`:
  ```ts
  async function generateUniqueNickname(ctx: MutationCtx): Promise<string> {
    while (true) {
      const nickname = 'User_' + uuidv4().split('-')[0];
      const existingProfile = await ctx.db.query('userProfiles')
        .filter((q) => q.eq(q.field('displayName'), nickname))   // ← FULL TABLE SCAN
        .first();
      if (!existingProfile) return nickname;
    }
  }
  ```
  and `updateProfile` at `:171-178`, same `.filter()` scan, `throw new Error('This display name is already taken.')`. Both violate C2 (unbounded read set = conflicts with every profile write) and C3 (case-sensitive, unnormalized). An **unbounded `while(true)`** inside a mutation is also a hazard — cap the attempts.

### 12.4 Recommended schema

Two tables. `userProfiles` keeps the *display* copy for cheap rendering; a dedicated `userHandles` table is the **authority**, the uniqueness index, and the history/cooldown ledger in one.

```ts
// convex/schema/userHandles.ts
import {defineTable} from 'convex/server';
import {v} from 'convex/values';

/**
 * Authority for handle uniqueness. One row per handle ever claimed.
 *
 * Convex has no unique constraint, so uniqueness is enforced by a
 * check-then-insert inside a single mutation against `by_handleKey`. That is
 * safe because Convex tracks *index ranges* in a transaction's read set: an
 * insert into the range this mutation read invalidates it, Convex aborts and
 * re-runs the mutation, and the re-run sees the winner's row.
 *
 * The row is NEVER deleted on rename. `releasedAt` is what stops a handle
 * being recycled straight into an impersonation.
 */
export const userHandlesTable = defineTable({
  /**
   * Normalized uniqueness key: NFKC-folded, lowercased, ASCII-only.
   * This — not `handle` — is what `by_handleKey` indexes and what every
   * uniqueness check compares.
   */
  handleKey: v.string(),
  /** Exactly what the member typed, for display: "HyoChan" renders cased. */
  handle: v.string(),
  userId: v.id('users'),
  claimedAt: v.number(),
  /** Set when the owner renames away. `undefined` == currently held. */
  releasedAt: v.optional(v.number()),
})
  // THE uniqueness index. `.eq(handleKey)` is the narrowest possible read set.
  .index('by_handleKey', ['handleKey'])
  // A user's own handle history, newest last: rename-rate limit + audit.
  .index('by_user', ['userId'])
  // "is this user's handle currently live?" without scanning their history.
  .index('by_user_and_released', ['userId', 'releasedAt']);
```

```ts
// convex/schema/userProfiles.ts — the relevant additions
export const userProfilesTable = defineTable({
  userId: v.id('users'),
  email: v.string(),

  /** Unique @handle. Absent only between account creation and onboarding. */
  handle: v.optional(v.string()),
  /** Denormalized normalized copy so a profile read needs no join. */
  handleKey: v.optional(v.string()),
  /** Cheap rename-rate gate; also drives "changed N days ago" in the UI. */
  handleUpdatedAt: v.optional(v.number()),

  /** Free-form, non-unique, Unicode, may repeat. Korean names welcome. */
  displayName: v.string(),
  avatarStorageId: v.optional(v.id('_storage')),
  locale: v.union(v.literal('ko'), v.literal('en'), v.literal('ja')),
  // ...role, notification prefs, deletedAt, updatedAt as in FightingHows
})
  .index('by_user', ['userId'])
  .index('by_email', ['email'])
  // Public profile lookup by handle: /@<handle> deep links, mention resolution.
  .index('by_handleKey', ['handleKey'])
  .searchIndex('search_handle', {
    searchField: 'handle',
    filterFields: ['deletedAt'],
  });
```

**Why `handle` is `v.optional`:** the account exists the moment Convex Auth creates the `users` row, but the handle is chosen on the onboarding screen. Making it required would force a placeholder into the uniqueness namespace. Instead, the app gates on `profile.handle === undefined → /onboarding/handle`. (See §12.6 for the alternative "auto-assign then let them change it" flow.)

**Why keep both `userProfiles.handleKey` and `userHandles`:**
- `userProfiles.by_handleKey` serves `/@hyo` profile lookups in **one indexed read**, no join.
- `userHandles.by_handleKey` is the **claim ledger**: it also contains *released* handles, which `userProfiles` cannot represent. The uniqueness + cooldown check reads exactly one range on it.
- Both are written in the same mutation, so they cannot drift.

*(Alternative considered and rejected: a single `handleKey` field on `userProfiles` with no claim table. It is simpler, but then a rename either loses the old handle entirely — impersonation risk — or needs a third table anyway. Also rejected: enforcing uniqueness by making `handleKey` part of the `by_user` index — index membership does not imply uniqueness in Convex.)*

### 12.5 `shared/username.ts` — normalization, charset, reserved list, suggestions

Pure, zero-dependency, imported by **both** `convex/` (the real gate) and `src/` (instant client-side feedback). This is exactly the `shared/authPolicy.ts` pattern from §8, and it is the only file that must be unit-tested in `__tests__/username.test.ts`.

```ts
// shared/username.ts

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

/**
 * ASCII-only on purpose. Restricting the *key* charset removes the entire
 * Unicode-confusable attack surface (`раypal` with Cyrillic а/р, fullwidth
 * ｈｙｏ, RTL overrides, zero-width joiners) in one stroke, and it keeps the
 * handle typeable on every keyboard and safe in a URL path segment.
 *
 * Korean/Japanese identity lives in `displayName`, which is free Unicode and
 * deliberately NOT unique — the same split Instagram uses (username vs name).
 */
const HANDLE_BODY = /^[a-z0-9._]+$/;
const HANDLE_EDGE = /^[a-z0-9]$/;          // first and last char
const CONSECUTIVE_SEPARATORS = /[._]{2}/;  // no "..", "__", "._", "_."

export type HandleRejection =
  | 'TOO_SHORT' | 'TOO_LONG' | 'BAD_CHARSET'
  | 'BAD_EDGE'  | 'DOUBLE_SEPARATOR' | 'RESERVED';

/**
 * The one normalization function. `handleKey` is ALWAYS the output of this.
 *
 * NFKC first: it folds fullwidth/compatibility forms ("ｈｙｏ" → "hyo",
 * "ⅰ" → "i") so a visually identical string cannot claim a second slot.
 * Anything still outside the ASCII charset after folding is rejected, not
 * transliterated — silent transliteration would let two different inputs map
 * to one key and confuse the "you typed X, you got Y" UX.
 */
export function normalizeHandle(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function validateHandle(raw: string): {ok: true; key: string} | {ok: false; reason: HandleRejection} {
  const key = normalizeHandle(raw);

  if (key.length < HANDLE_MIN_LENGTH) return {ok: false, reason: 'TOO_SHORT'};
  if (key.length > HANDLE_MAX_LENGTH) return {ok: false, reason: 'TOO_LONG'};
  if (!HANDLE_BODY.test(key)) return {ok: false, reason: 'BAD_CHARSET'};
  if (!HANDLE_EDGE.test(key[0]!) || !HANDLE_EDGE.test(key[key.length - 1]!)) {
    return {ok: false, reason: 'BAD_EDGE'};
  }
  if (CONSECUTIVE_SEPARATORS.test(key)) return {ok: false, reason: 'DOUBLE_SEPARATOR'};
  if (isReservedHandle(key)) return {ok: false, reason: 'RESERVED'};

  return {ok: true, key};
}

/**
 * Impersonation-similarity key. NOT a uniqueness key — enforcing uniqueness on
 * this would block legitimate pairs like `jo.hn` / `john`. It is used to (a)
 * warn the claimer "this looks like @john", (b) flag the pair for review, and
 * (c) surface both in a report.
 */
export function confusableKey(key: string): string {
  return key
    .replace(/[._]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/3/g, 'e');
}

/** Exact reserved words. Lowercase, already normalized. */
const RESERVED_EXACT = new Set<string>([
  // routes & app surface — must never be shadowed by /@handle deep links
  'about','account','admin','api','app','auth','blog','callback','contact','dev',
  'developer','docs','download','edit','explore','faq','feed','help','home','index',
  'invite','join','ledger','ledgers','legal','login','logout','me','new','notice',
  'notification','notifications','oauth','onboarding','password','pricing','privacy',
  'profile','register','reset','root','search','security','settings','share','signin',
  'signout','signup','static','status','support','system','terms','user','users',
  'verify','webhook','well-known','www',
  // brand & impersonation
  'bookoo','bookooapp','bookoo_official','official','staff','team','mod','moderator',
  'administrator','helpdesk','customer','customerservice','billing','payment','payments',
  // financial-authority impersonation (a ledger app makes these dangerous)
  'bank','kakaobank','tossbank','nh','kb','shinhan','woori','hana','ibk',
  // generic
  'null','undefined','true','false','anonymous','deleted','unknown','test',
]);

/** Reserved prefixes: anything starting with these is refused. */
const RESERVED_PREFIXES = ['bookoo', 'admin', 'official', 'support', 'system'];

export function isReservedHandle(key: string): boolean {
  if (RESERVED_EXACT.has(key)) return true;
  return RESERVED_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Candidate handles derived from a seed (the provider display name, the email
 * local part, or whatever the member just typed and lost).
 *
 * Deterministic first, random last: a member who sees `hyo1`, `hyo_2` gets the
 * same list if they retry, which reads as a considered suggestion rather than
 * noise. `Math.random()` is legal in a Convex mutation (the runtime seeds it),
 * so the numeric tail is only reached when the deterministic ones are gone.
 */
export function suggestHandles(seed: string, taken: (key: string) => boolean, count = 5): string[] {
  const base = normalizeHandle(seed)
    .replace(/[^a-z0-9._]/g, '')
    .replace(/[._]{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, HANDLE_MAX_LENGTH - 4) || 'user';

  const year = new Date().getFullYear() % 100;
  const candidates: string[] = [
    base,
    `${base}_`.slice(0, HANDLE_MAX_LENGTH - 2) + String(year),
    `${base}.${year}`,
    ...Array.from({length: 20}, (_, i) => `${base}${i + 1}`),
    ...Array.from({length: 30}, () => `${base}${Math.floor(Math.random() * 9000) + 1000}`),
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

Charset decision recap (compare to the majors): Instagram = 1–30, `[a-z0-9._]`; GitHub = 1–39, alphanumeric + single hyphens, no leading/trailing hyphen; X = 4–15, `[A-Za-z0-9_]`. **BooKoo: 3–20, `[a-z0-9._]`, must start and end alphanumeric, no consecutive separators.** Reasons: 20 fits a mobile row without truncation; `.`/`_` cover the two conventions Korean users actually type; excluding `-` avoids the `handle-1` / URL-slug ambiguity.

### 12.6 The claim mutation (first sign-in)

```ts
// convex/user/mutations.ts
const HANDLE_RELEASE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days
const HANDLE_RENAME_COOLDOWN_MS  = 30 * 24 * 60 * 60 * 1000;  // 30 days
const HANDLE_HISTORY_LIMIT = 50;

export const claimHandle = mutation({
  args: {handle: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // requireProfile (not requireMember): a member with no handle yet is not
    // "approved" in any sense the rest of the app cares about, and onboarding
    // must work before any other gate opens.
    const profile = await requireProfile(ctx);

    if (profile.handle !== undefined) {
      throw appError('FORBIDDEN', 'error.handleAlreadySet');
    }

    const checked = validateHandle(args.handle);
    if (!checked.ok) throw appError('HANDLE_INVALID', `error.handle.${checked.reason}`);
    const {key} = checked;

    // ── THE uniqueness check. Narrow index range = minimal OCC conflict set. ──
    const claim = await ctx.db
      .query('userHandles')
      .withIndex('by_handleKey', (q) => q.eq('handleKey', key))
      .unique();                      // throws loudly if the data ever holds 2

    const now = Date.now();

    if (claim) {
      if (claim.releasedAt === undefined) {
        throw appError('HANDLE_TAKEN', 'error.handle.taken');
      }
      // Released, but still inside the impersonation cooldown, and not by us.
      if (
        claim.userId !== profile.userId &&
        now - claim.releasedAt < HANDLE_RELEASE_COOLDOWN_MS
      ) {
        throw appError('HANDLE_COOLDOWN', 'error.handle.cooldown');
      }
      // Recycling an expired release: rewrite the claim row in place.
      await ctx.db.patch(claim._id, {
        handle: args.handle.trim(),
        userId: profile.userId,
        claimedAt: now,
        releasedAt: undefined,
      });
    } else {
      await ctx.db.insert('userHandles', {
        handleKey: key,
        handle: args.handle.trim(),
        userId: profile.userId,
        claimedAt: now,
      });
    }

    // Same transaction → the denormalized copy can never disagree.
    await ctx.db.patch(profile._id, {
      handle: args.handle.trim(),
      handleKey: key,
      handleUpdatedAt: now,
      updatedAt: now,
    });

    return null;
  },
});
```

**Onboarding flow.** Two viable shapes:

- **(A) Blocking screen (recommended, Instagram-like).** After sign-in, `currentUser.handle === null` → expo-router redirects to `/onboarding/handle`. The screen pre-fills `suggestHandles(providerName ?? email.split('@')[0], …)[0]` and shows live availability. Nothing else in the app is reachable until `claimHandle` succeeds. **Pro:** every account has a real, chosen handle; no junk in the namespace. **Con:** one extra screen before first value.
- **(B) Auto-assign at profile creation, prompt later.** In `afterUserCreatedOrUpdated`, run the FightingHows `DEFAULT_DISPLAY_NAME_PREFIX` trick against the handle namespace: derive a base, then `suggestHandles` with a **capped** attempt loop (never Martie's `while(true)`), insert both rows. **Pro:** zero-friction sign-up. **Con:** the namespace fills with `user_a83f21`-shaped handles that nobody ever changes, and the auth callback now performs a uniqueness check on a hot path.

**Recommendation: (A), with (B)'s generator as the pre-fill.** If (B) is chosen anyway, note the auth callback runs inside `afterUserCreatedOrUpdated(ctx, {userId})` which is a mutation context — the same OCC argument holds, but cap the retry loop at ~8 candidates and fall back to `user_${userId.slice(-8)}` which is collision-free by construction.

### 12.7 Rename policy + impersonation history

```ts
export const changeHandle = mutation({
  args: {handle: v.string()},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireMember(ctx);
    const previousKey = profile.handleKey;
    if (previousKey === undefined) throw appError('FORBIDDEN', 'error.handleNotSet');

    const now = Date.now();
    if (profile.handleUpdatedAt !== undefined &&
        now - profile.handleUpdatedAt < HANDLE_RENAME_COOLDOWN_MS) {
      throw appError('HANDLE_COOLDOWN', 'error.handle.renameTooSoon');
    }

    const checked = validateHandle(args.handle);
    if (!checked.ok) throw appError('HANDLE_INVALID', `error.handle.${checked.reason}`);
    const {key} = checked;
    if (key === previousKey) return null;                    // case-only edit → below

    // ...identical uniqueness + cooldown block as `claimHandle`...

    // Release the old claim — patch, never delete. The row is the anti-
    // impersonation record: it says who held `@hyo`, and until when.
    const old = await ctx.db.query('userHandles')
      .withIndex('by_handleKey', (q) => q.eq('handleKey', previousKey))
      .unique();
    if (old && old.userId === profile.userId) {
      await ctx.db.patch(old._id, {releasedAt: now});
    }

    await ctx.db.patch(profile._id, {
      handle: args.handle.trim(), handleKey: key,
      handleUpdatedAt: now, updatedAt: now,
    });
    return null;
  },
});
```

Policy decisions, and why:

| Rule | Value | Rationale |
|---|---|---|
| Rename cooldown | **30 days** | Stops "borrow a handle, do damage, drop it" cycling. Cheap: one `handleUpdatedAt` compare, no extra read. |
| Released-handle cooldown | **90 days** before anyone *else* can take it | The impersonation window. Someone who followed `@hyo` in a shared ledger must not find a stranger there next week. The original owner can always re-take their own released handle immediately (`claim.userId === profile.userId` bypass). |
| Claim rows | **Never deleted** | The `userHandles` row *is* the history. `by_user` gives a member's full handle history for the security screen ("Previously: @oldhyo until 2026-05-01"). |
| Case-only edits | Allowed, free, no cooldown | `handleKey` is unchanged, so it is a pure `handle` display patch — `hyochan` → `HyoChan`. Handle it as an early-return branch before the uniqueness block. |
| Public display of history | **Show a "recently renamed" badge for 14 days** on the profile of any account whose `handleUpdatedAt` is recent | The single most effective anti-impersonation UI; Instagram, X, and Discord all do a variant. Costs one field already on the profile. |
| Account deletion | Release the claim (`releasedAt = now`), do **not** delete the row | Same 90-day protection applies to a withdrawn account's handle. Fits FightingHows' `deleteAccount` soft-delete exactly. |
| Handle history cap | `HANDLE_HISTORY_LIMIT = 50` on the `by_user` read | FightingHows' `*_SCAN_LIMIT` discipline; nobody legitimately renames 50 times. |

Add to `deleteAccount` (mirroring FightingHows' `pushTokens` cleanup in the same mutation):
```ts
if (profile.handleKey) {
  const claim = await ctx.db.query('userHandles')
    .withIndex('by_handleKey', (q) => q.eq('handleKey', profile.handleKey!)).unique();
  if (claim && claim.userId === profile.userId && claim.releasedAt === undefined) {
    await ctx.db.patch(claim._id, {releasedAt: now});
  }
}
```

### 12.8 Availability query + client debounce

```ts
// convex/user/queries.ts
const handleAvailabilityValidator = v.union(
  v.object({status: v.literal('AVAILABLE')}),
  v.object({status: v.literal('INVALID'), reason: v.string()}),
  v.object({status: v.literal('RESERVED')}),
  v.object({status: v.literal('COOLDOWN')}),
  v.object({status: v.literal('TAKEN'), suggestions: v.array(v.string())}),
);

/**
 * ADVISORY ONLY. The answer is a snapshot; `claimHandle` re-checks inside its
 * own transaction and is the only thing that decides. Never gate the UI's
 * submit button on this alone — always handle HANDLE_TAKEN from the mutation.
 */
export const checkHandleAvailability = query({
  args: {handle: v.string()},
  returns: handleAvailabilityValidator,
  handler: async (ctx, args) => {
    // Authenticated: this is an enumeration oracle, so it is not open to the
    // internet. It never reveals WHO holds a handle — only that it is gone.
    await requireProfile(ctx);

    const checked = validateHandle(args.handle);
    if (!checked.ok) {
      return checked.reason === 'RESERVED'
        ? {status: 'RESERVED' as const}
        : {status: 'INVALID' as const, reason: checked.reason};
    }

    const claim = await ctx.db.query('userHandles')
      .withIndex('by_handleKey', (q) => q.eq('handleKey', checked.key)).unique();

    if (!claim) return {status: 'AVAILABLE' as const};
    if (claim.releasedAt === undefined) {
      return {
        status: 'TAKEN' as const,
        suggestions: await suggestAvailable(ctx, checked.key),   // ≤5 indexed probes
      };
    }
    if (Date.now() - claim.releasedAt < HANDLE_RELEASE_COOLDOWN_MS) {
      return {status: 'COOLDOWN' as const};
    }
    return {status: 'AVAILABLE' as const};
  },
});
```
`suggestAvailable` walks `suggestHandles(base, …)` candidates and does **one `.eq()` index probe per candidate, capped at ~12 probes**, returning the first 5 free ones. It is a query, so a stale answer is harmless.

**Client debounce** — a Convex `useQuery` is a live subscription, so a naive `useQuery(api.user.queries.checkHandleAvailability, {handle: text})` opens a new subscription per keystroke. Debounce the *argument*, not the render:

```tsx
const [text, setText] = useState('');
const [probe, setProbe] = useState<string | null>(null);

// Local, zero-round-trip validation first — typos never reach the server.
const local = useMemo(() => validateHandle(text), [text]);   // from shared/username.ts

useEffect(() => {
  if (!local.ok) { setProbe(null); return; }
  const id = setTimeout(() => setProbe(local.key), 350);      // 300–400ms
  return () => clearTimeout(id);
}, [local]);

const availability = useQuery(
  api.user.queries.checkHandleAvailability,
  probe ? {handle: probe} : 'skip',                            // ← 'skip', not a dummy arg
);
```
Three details that matter:
1. `validateHandle` from `shared/username.ts` runs locally, so length/charset/reserved errors render **instantly with zero network** — the payoff of the `shared/` pattern.
2. `'skip'` (Convex's sentinel) tears the subscription down while typing rather than issuing a query with a placeholder argument.
3. Because the answer is live, a handle that gets taken while the user hesitates flips to `TAKEN` on its own — a genuinely nice Convex-native touch that a REST app cannot do.

**Rate limiting** (the gap from §4.3): even authenticated, this query is an enumeration oracle and a suggestion-generator amplifier. Add a token bucket — either `@convex-dev/rate-limiter` (`convex.config.ts` + `app.use(rateLimiter)`) with e.g. 60 probes/minute/user, or a hand-rolled `rateLimits` table keyed `by_user_and_bucket`. Note that **queries cannot write**, so a hand-rolled counter must live in a mutation; the pragmatic split is: leave the *query* free (it is one indexed read) and rate-limit `claimHandle`/`changeHandle`, which is where the real cost and the abuse are.

### 12.9 Handle search (for mentions / inviting members to a ledger)

`userProfiles.searchIndex('search_handle', {searchField: 'handle', filterFields: ['deletedAt']})`. Convex text search gives **prefix matching on the final term**, which is exactly typeahead:
```ts
const rows = await ctx.db.query('userProfiles')
  .withSearchIndex('search_handle', (q) => q.search('handle', term).eq('deletedAt', undefined))
  .take(10);
```
Limits to respect: 1024 scannable results, ≤16 filter fields, ≤16 search terms, search indexes share the 32-index-per-table budget. This is what FightingHows' `admin.listUsers` should have used instead of filtering an already-paginated page.

### 12.10 Optional hardening: `convex-helpers` triggers

If handles ever get written from more than the two mutations above, move the check into a trigger so it cannot be bypassed:
```ts
import {Triggers} from 'convex-helpers/server/triggers';
const triggers = new Triggers<DataModel>();
triggers.register('userHandles', async (ctx, change) => {
  if (change.newDoc) {
    const dupes = await ctx.db.query('userHandles')
      .withIndex('by_handleKey', (q) => q.eq('handleKey', change.newDoc!.handleKey)).take(2);
    if (dupes.filter((d) => d.releasedAt === undefined).length > 1) {
      throw new ConvexError({code: 'HANDLE_TAKEN', messageKey: 'error.handle.taken'});
    }
  }
});
```
Triggers *"run within the same mutation that changes the data, so they run atomically with the data changing"* — the same transaction, so the same OCC guarantee. Cost: a `customMutation` wrapper everywhere. **Recommendation: skip it initially** (two write sites is manageable), adopt it if a third appears.

### 12.11 Implementation checklist

1. `shared/username.ts` + `__tests__/username.test.ts` (normalize, validate, reserved, confusableKey, suggestHandles) — pure, no ctx.
2. `convex/schema/userHandles.ts` with `by_handleKey`, `by_user`, `by_user_and_released`.
3. `userProfiles`: `handle?`, `handleKey?`, `handleUpdatedAt?`, `locale`, `by_handleKey` index, `search_handle` search index.
4. `convex/user/mutations.ts`: `claimHandle`, `changeHandle`; extend `deleteAccount` to release.
5. `convex/user/queries.ts`: `checkHandleAvailability` (advisory), extend `currentUser` to return `handle`.
6. `app/onboarding/handle.tsx` gated by `currentUser.handle === null`; local validation + 350 ms debounced `useQuery` with `'skip'`.
7. `app/[handle].tsx` public profile route resolving via `userProfiles.by_handleKey` — and make sure the reserved-route list in `shared/username.ts` covers **every** static route the router defines, or `/settings` collides with `@settings`.
8. Rate-limit `claimHandle` / `changeHandle`.
9. "Recently renamed" badge driven by `handleUpdatedAt`.

---

## 13. Condensed decision list for BooKoo

**Copy from FightingHows, unchanged:**
`convex/lib/permissions.ts` (rename the role ladder), `convex/lib/serializers.ts` (`loadAuthorMap`, `storageUrl(s)`, projection interfaces), `convex/lib/upload.ts` + `uploads` table + nightly purge cron, `convex/files/mutations.ts`, the whole push stack (tables + 3 actions + `usePushNotifications`), `convex/AGENTS.md`, `schema/` assembly style, `by_<a>_and_<b>` index grammar, epoch-ms timestamps everywhere, `deletedAt` soft delete, named `*_SCAN_LIMIT` constants, `returns:` validators, the `shared/` + root-tsconfig seam.

**Change:**
- `returns:` on **100%** of functions, not 41%.
- Error payload → `{code, messageKey, params}`; no Korean sentences on the server.
- Notifications store `titleKey`/`bodyKey`/`params` + `userProfiles.locale`, localized in `sendExpoPush`.
- `@convex-dev/auth` → `dependencies`, not `devDependencies`.
- Roles become **per-ledger** (`ledgerMembers` join table) plus a thin global `appRole`.
- Bake `deletedAt` into every list index so pages are never short.
- Add: rate limiting, reporting/blocking, audit log, search indexes, sharded rollups for money totals.
- Drop: the `uploadMaintenance` backfill machinery (greenfield); keep `purgedThrough` + the purge.

**Never copy from Martie:** `.filter()`-based uniqueness, `while(true)` in a mutation, `throw new Error(string)`, hardcoded admin email allowlists, mixed timestamp encodings, unbounded `.collect()`, `try/catch → return null` in queries.
