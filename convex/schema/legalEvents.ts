import {defineTable} from 'convex/server';
import {v} from 'convex/values';

import {localeValidator} from './userProfiles';

export const legalEventKindValidator = v.union(
  v.literal('TERMS_ACCEPTED'),
  v.literal('PRIVACY_NOTICE_ACKNOWLEDGED'),
  v.literal('AGE_14_PLUS_ATTESTED'),
  v.literal('OPTIONAL_LOCATION_GRANTED'),
  v.literal('OPTIONAL_LOCATION_WITHDRAWN'),
  v.literal('OPTIONAL_MARKETING_GRANTED'),
  v.literal('OPTIONAL_MARKETING_WITHDRAWN'),
  v.literal('OPTIONAL_COUNTRY_ANALYTICS_GRANTED'),
  v.literal('OPTIONAL_COUNTRY_ANALYTICS_WITHDRAWN'),
);

export const legalEventsTable = defineTable({
  userId: v.id('users'),
  kind: legalEventKindValidator,
  documentVersion: v.string(),
  documentSha256: v.string(),
  locale: localeValidator,
  createdAt: v.number(),
})
  .index('by_userId_kind_createdAt', ['userId', 'kind', 'createdAt'])
  .index('by_createdAt', ['createdAt']);
