/**
 * Barrel for the reference-data layer.
 *
 * Import through `@shared/...` from the app and from tests; Convex code uses a
 * RELATIVE path (`../shared/index`), because the Convex bundler does not read
 * the root tsconfig `paths`.
 *
 * Everything re-exported here is pure TypeScript with no react-native, no
 * convex/server and no expo-* dependency — see `shared/AGENTS.md`. Prefer the
 * specific module (`@shared/money`) in hot paths so bundlers can tree-shake.
 */

export * from './appErrors';
export * from './apple';
export * from './authPolicy';
export * from './categories';
export * from './currency';
export * from './date';
export * from './email';
export * from './exportFiles';
export * from './inviteCode';
export * from './ledgerCore';
export * from './ledgerIcons';
export * from './ledgerLimits';
export * from './ledgerRoles';
export * from './legal';
export * from './locales';
export * from './money';
export * from './onboarding';
export * from './push';
export * from './username';
export * from './application';
