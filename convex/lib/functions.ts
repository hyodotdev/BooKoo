import {customCtx, customMutation} from 'convex-helpers/server/customFunctions';
import {Triggers} from 'convex-helpers/server/triggers';
import {v} from 'convex/values';

import type {DataModel} from '../_generated/dataModel';
import {registerLedgerItemTriggers} from './rollups';
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from '../_generated/server';

/**
 * The only raw mutation imports in the application. All domain mutations use
 * these trigger-aware builders so adding a table trigger cannot be bypassed by
 * an older write site.
 */
export const triggers = new Triggers<DataModel>();
registerLedgerItemTriggers(triggers);

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);

/**
 * Public only so the local migration driver can call it. The secret argument is
 * consumed by this wrapper and never reaches a handler. Unlike normal domain
 * mutations this deliberately bypasses ledger-item triggers: P11 rebuilds all
 * rollups through the production repair path after the import.
 */
export const migrationMutation = customMutation(rawMutation, {
  args: {secret: v.string()},
  input: async (_ctx, {secret}) => {
    const expected = process.env.MIGRATION_SECRET;
    if (expected === undefined || expected.length < 32 || secret !== expected)
      throw new Error('forbidden');
    return {ctx: {}, args: {}};
  },
});
