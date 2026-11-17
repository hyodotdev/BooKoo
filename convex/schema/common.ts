import {v} from 'convex/values';

/** Every standard mutable row. `createdAt` is explicit because _creationTime is unsettable by import. */
export const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
} as const;

/** The eight manifest-listed user-visible soft-delete tables. `deletedAt` is field #2 of list indexes. */
export const softDelete = {
  deletedAt: v.optional(v.number()),
  deletedByUserId: v.optional(v.id('users')),
} as const;

/** Migrated rows without a documented natural unique key. Paired invariant: `by_legacyKey`. */
export const legacyTrailer = {
  /** Globally unique legacy path — never a bare RTDB push id (`14` §6.1). Migration idempotency key. */
  legacyKey: v.optional(v.string()),
  /** epoch ms, from item.created / review.date / the push-id timestamp. */
  legacyCreatedAt: v.optional(v.number()),
  /** JSON string of every source field this schema does not model. NEVER parsed by app code. */
  legacyRaw: v.optional(v.string()),
} as const;
