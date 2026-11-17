import type {FunctionReturnType} from 'convex/server';

import {api} from '@convex/_generated/api';

export type LedgerRow = FunctionReturnType<
  typeof api.ledgers.queries.listMinePaginated
>['page'][number];

export type ItemRow = FunctionReturnType<typeof api.items.queries.get>;

export type CategoryRow = FunctionReturnType<
  typeof api.categories.queries.list
>[number];

export type MonthRollup = FunctionReturnType<typeof api.rollups.queries.month>;

export type CategoryRollup = FunctionReturnType<
  typeof api.rollups.queries.categoriesOfMonth
>[number];

export type DayRollup = FunctionReturnType<
  typeof api.rollups.queries.daysInRange
>[number];
