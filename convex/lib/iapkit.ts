import type {SubscriptionStatus} from '../../shared/entitlements';
import {STORE_PRODUCT_IDS} from '../../shared/entitlements';
import {APPLICATION_ID} from '../../shared/application';

export const IAPKIT_ORIGIN = 'https://kit.openiap.dev';

/** Modeled v1 commerce types. New protocol types are acknowledged, never applied. */
const MODELED_EVENT_TYPES: ReadonlySet<string> = new Set([
  'subscription.started',
  'subscription.renewed',
  'subscription.recovered',
  'subscription.entered_grace_period',
  'subscription.entered_billing_retry',
  'subscription.expired',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.refunded',
  'subscription.product_changed',
  'subscription.price_changed',
  'subscription.deferred',
  'subscription.paused',
  'subscription.resumed',
  'entitlement.granted',
  'entitlement.revoked',
]);
export function isModeledIapkitEventType(type: string): boolean {
  return MODELED_EVENT_TYPES.has(type);
}

export type SubscriptionEnvironment = 'SANDBOX' | 'PRODUCTION';
export interface IapkitSnapshot {
  providerSubscriptionId?: string;
  productId: string;
  store: 'APP_STORE' | 'PLAY_STORE';
  status: SubscriptionStatus;
  expiresAt: number;
  willRenew: boolean;
  updatedAt: number;
  hasBillingIssue: boolean;
}
export interface IapkitEvent extends IapkitSnapshot {
  occurredAt: number;
  eventId: string;
  type: string;
  appUserId: string;
  environment: SubscriptionEnvironment;
  projectId: string;
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isProProduct(product: unknown): product is string {
  return (
    product === STORE_PRODUCT_IDS.iosMonthly ||
    product === STORE_PRODUCT_IDS.iosAnnual ||
    product === STORE_PRODUCT_IDS.androidSubscription
  );
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function status(state: unknown): SubscriptionStatus | null {
  switch (state) {
    case 'Active':
    case 'InGracePeriod':
      return 'ACTIVE';
    case 'Paused':
    case 'InBillingRetry':
      return 'PAUSED';
    case 'Expired':
      return 'EXPIRED';
    case 'Refunded':
    case 'Revoked':
      return 'REFUNDED';
    case 'Unknown':
      return 'NONE';
    default:
      return null;
  }
}
export function parseIapkitSnapshot(value: unknown): IapkitSnapshot | null {
  if (!isObject(value) || !isProProduct(value.productId)) return null;
  const parsed = status(value.state);
  const next =
    parsed === 'ACTIVE' && value.active === false ? 'EXPIRED' : parsed;
  const store =
    value.store === 'apple' || value.platform === 'IOS'
      ? 'APP_STORE'
      : value.store === 'google' || value.platform === 'Android'
        ? 'PLAY_STORE'
        : null;
  if (
    next === null ||
    store === null ||
    !finite(value.updatedAt) ||
    (next === 'ACTIVE' && !finite(value.expiresAt))
  )
    return null;
  if (
    (store === 'PLAY_STORE') !==
    (value.productId === STORE_PRODUCT_IDS.androidSubscription)
  )
    return null;
  return {
    ...(typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 256
      ? {providerSubscriptionId: value.id}
      : {}),
    productId: value.productId,
    store,
    status: next,
    expiresAt: finite(value.expiresAt) ? value.expiresAt : 0,
    hasBillingIssue:
      value.state === 'InGracePeriod' || value.state === 'InBillingRetry',
    willRenew: value.willRenew === true,
    updatedAt: value.updatedAt,
  };
}
export function parseIapkitEvent(value: unknown): IapkitEvent | null {
  if (
    !isObject(value) ||
    value.eventVersion !== '1.0' ||
    value.applicationId !== APPLICATION_ID ||
    typeof value.eventId !== 'string' ||
    !value.eventId ||
    typeof value.eventType !== 'string' ||
    typeof value.userId !== 'string' ||
    !value.userId ||
    typeof value.projectId !== 'string' ||
    !finite(value.occurredAt) ||
    !isObject(value.subscription)
  )
    return null;
  const environment =
    value.environment === 'production'
      ? 'PRODUCTION'
      : value.environment === 'sandbox'
        ? 'SANDBOX'
        : null;
  const snapshot = parseIapkitSnapshot({
    ...value.subscription,
    store: value.store,
    updatedAt: value.subscription.updatedAt ?? value.occurredAt,
  });
  if (
    environment === null ||
    snapshot === null ||
    (snapshot.status === 'ACTIVE' && value.subscription.active !== true)
  )
    return null;
  return {
    ...snapshot,
    occurredAt: value.occurredAt,
    eventId: value.eventId,
    type: value.eventType,
    appUserId: value.userId,
    environment,
    projectId: value.projectId,
  };
}

/** Bounded active-provider response; never read project-wide purchase history. */
export function parseIapkitEntitlements(
  value: unknown,
  userId: string,
): IapkitSnapshot[] | null {
  if (
    !isObject(value) ||
    value.userId !== userId ||
    !Array.isArray(value.productIds) ||
    value.productIds.length > 128 ||
    !value.productIds.every(
      (product: unknown) => typeof product === 'string',
    ) ||
    !Array.isArray(value.subscriptions) ||
    value.subscriptions.length > 128
  )
    return null;
  const result: IapkitSnapshot[] = [];
  const ids = new Set<string>();
  for (const entry of value.subscriptions) {
    if (
      !isObject(entry) ||
      (entry.userId !== undefined && entry.userId !== userId)
    )
      return null;
    if (!isProProduct(entry.productId)) continue;
    const snapshot = parseIapkitSnapshot(entry);
    if (
      !snapshot?.providerSubscriptionId ||
      snapshot.status !== 'ACTIVE' ||
      ids.has(snapshot.providerSubscriptionId)
    )
      return null;
    ids.add(snapshot.providerSubscriptionId);
    result.push(snapshot);
  }
  const declaredProducts = new Set(value.productIds.filter(isProProduct));
  const observedProducts = new Set(
    result.map((snapshot) => snapshot.productId),
  );
  if (
    declaredProducts.size !== observedProducts.size ||
    [...declaredProducts].some((product) => !observedProducts.has(product))
  )
    return null;
  return result;
}
export async function sha256Hex(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function verifyIapkitSignature(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  nowMs: number,
): Promise<boolean> {
  if (!timestamp || !signature || !secret || !/^\d+$/.test(timestamp))
    return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > 300)
    return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['verify'],
  );
  for (const part of signature.split(',', 4)) {
    const match = /^v1=([a-f0-9]{64})$/.exec(part.trim());
    if (!match) continue;
    const bytes = Uint8Array.from(match[1].match(/.{2}/g) ?? [], (hex) =>
      Number.parseInt(hex, 16),
    );
    if (
      await crypto.subtle.verify(
        'HMAC',
        key,
        bytes,
        new TextEncoder().encode(`${timestamp}.${raw}`),
      )
    )
      return true;
  }
  return false;
}
