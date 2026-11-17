import {v} from 'convex/values';

import {query} from '../_generated/server';
import {listCategoryRows, type CategoryRow} from '../lib/categories';
import {requireLedgerMember} from '../lib/ledgerPermissions';
import {
  categoryKindValidator,
  categorySourceValidator,
} from '../schema/ledgerCategories';

export const categoryRowValidator = v.object({
  key: v.string(),
  source: categorySourceValidator,
  kind: categoryKindValidator,
  iconKey: v.string(),
  colorToken: v.string(),
  i18nKey: v.union(v.string(), v.null()),
  label: v.union(v.string(), v.null()),
  sortOrder: v.number(),
  hidden: v.boolean(),
  archived: v.boolean(),
  reassigning: v.boolean(),
});

export const list = query({
  args: {ledgerId: v.id('ledgers')},
  returns: v.array(categoryRowValidator),
  handler: async (ctx, args): Promise<CategoryRow[]> => {
    await requireLedgerMember(ctx, args.ledgerId);
    return listCategoryRows(ctx, args.ledgerId);
  },
});
