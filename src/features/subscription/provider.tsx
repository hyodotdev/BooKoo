import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {AppState} from 'react-native';
import {ErrorCode, type Purchase} from 'expo-iap';
import {useQuery} from 'convex-helpers/react/cache';
import {useAction, useConvexAuth} from 'convex/react';
import ErrorBoundary from 'react-native-error-boundary';

import {api} from '@convex/_generated/api';
import type {MySubscription} from '@convex/subscriptions/queries';
import type {PurchaseVerificationResult} from '@convex/subscriptions/actions';
import type {Id} from '@convex/_generated/dataModel';
import {
  entitlementDeadline,
  STORE_PRODUCT_IDS,
  isEntitlementActive,
  isEntitlementEnding,
  type PremiumCapability,
} from '@shared/entitlements';
import {
  IAP,
  isPurchasesConfigured,
  openStoreConnection,
  closeStoreConnection,
  loadStorePlans,
  requestPlan,
  getStorePurchases,
  getPendingStorePurchases,
} from './client';
import type {SubscriptionPlan} from './plans';
import {Storage, storage} from '~/utils/storage';
import {APPLICATION_ID} from '@shared/application';

/** Only non-secret caller/SKU intent; never retain a receipt or store token. */
function pendingProductFor(userId: Id<'users'>): string | null {
  const raw = storage.getString(Storage.PendingPurchaseIntent);
  if (!raw || raw.length > 512) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' &&
      value !== null &&
      'userId' in value &&
      value.userId === userId &&
      'productId' in value &&
      typeof value.productId === 'string'
      ? value.productId
      : null;
  } catch {
    return null;
  }
}

/**
 * OpenIAP apple 4.0.7 leaves expired subscription receipts unfinished until the
 * app reconciles them. Convex never verifies an expired receipt, so settling one
 * only repeats a failed check and would resolve a live checkout as PENDING.
 */
function isExpiredReceipt(receipt: Purchase): boolean {
  return (
    'expirationDateIOS' in receipt &&
    receipt.expirationDateIOS != null &&
    receipt.expirationDateIOS <= Date.now()
  );
}

export type PurchaseOutcome =
  | {kind: 'PURCHASED'}
  | {kind: 'PENDING'}
  | {
      kind: 'CONFIRMATION_BLOCKED';
      blocker: NonNullable<PurchaseVerificationResult['blocker']>;
    }
  | {kind: 'NOTHING_TO_RESTORE'}
  | {kind: 'CANCELLED'}
  | {kind: 'ALREADY_SUBSCRIBED'}
  | {kind: 'UNAVAILABLE'}
  | {kind: 'FAILED'};
export type ManagementOutcome = {kind: 'CLOSED' | 'UNAVAILABLE' | 'FAILED'};
interface SubscriptionState {
  readonly isActive: boolean;
  readonly isEnding: boolean;
  readonly expiresAt: number | undefined;
  readonly hasBillingIssue: boolean;
  readonly hasStoreSubscription: boolean;
  readonly canPurchase: boolean;
  readonly canManage: boolean;
  readonly isLoading: boolean;
  readonly isStatusAvailable: boolean;
  readonly packages: readonly SubscriptionPlan[];
  loadPackages: (capability: PremiumCapability) => Promise<void>;
  purchase: (plan: SubscriptionPlan) => Promise<PurchaseOutcome>;
  restore: () => Promise<PurchaseOutcome>;
  manage: () => Promise<ManagementOutcome>;
}
const EMPTY_PLANS: readonly SubscriptionPlan[] = [];
const SubscriptionContext = createContext<SubscriptionState | null>(null);
function errorOutcome(error: unknown): PurchaseOutcome {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  // expo-iap6.0.1 exposes AppStore.sync cancellation through Expo's generic
  // exception rather than its purchase-error envelope. Match this observed
  // cancellation only; unrelated ERR_UNEXPECTED failures stay failures.
  const syncCancelled =
    code === 'ERR_UNEXPECTED' &&
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.startsWith(
      'UnexpectedException: Request Canceled (at ExpoModulesCore/',
    );
  if (code === ErrorCode.UserCancelled || syncCancelled)
    return {kind: 'CANCELLED'};
  if (code === ErrorCode.AlreadyOwned) return {kind: 'ALREADY_SUBSCRIBED'};
  if (code === ErrorCode.DeferredPayment || code === ErrorCode.Pending)
    return {kind: 'PENDING'};
  return {kind: 'FAILED'};
}

function SubscriptionProviderInner({
  children,
  mine,
  currentUser,
  probeFailed,
}: {
  children: ReactNode;
  mine: MySubscription | undefined;
  currentUser: {userId: Id<'users'>} | null | undefined;
  probeFailed: boolean;
}): ReactElement {
  const {isAuthenticated} = useConvexAuth();
  const refresh = useAction(api.subscriptions.actions.refresh);
  const verify = useAction(api.subscriptions.actions.verify);
  const [catalog, setCatalog] = useState<{
    userId: Id<'users'>;
    plans: readonly SubscriptionPlan[];
  } | null>(null);
  const [readyFor, setReadyFor] = useState<Id<'users'> | null>(null);
  const purchaserId =
    isAuthenticated && !probeFailed ? currentUser?.userId : undefined;
  const identityRef = useRef(purchaserId);
  useLayoutEffect(() => {
    identityRef.current = purchaserId;
  }, [purchaserId]);
  const pendingRef = useRef<{
    userId: Id<'users'>;
    productId: string;
    resolve: (outcome: PurchaseOutcome) => void;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const inFlightRef = useRef(new Map<string, Promise<PurchaseOutcome>>());
  const canPurchase =
    isPurchasesConfigured() &&
    readyFor === purchaserId &&
    purchaserId !== undefined &&
    mine?.billingReady === true;

  const settle = useCallback(
    (receipt: Purchase, userId: Id<'users'>): Promise<PurchaseOutcome> => {
      if (identityRef.current !== userId)
        return Promise.resolve({kind: 'PENDING'});
      if (receipt.purchaseState !== 'purchased')
        return Promise.resolve({kind: 'PENDING'});
      const token = receipt.purchaseToken;
      if (!token) return Promise.resolve({kind: 'PENDING'});
      const key = `${userId}:${token}`;
      const existing = inFlightRef.current.get(key);
      if (existing) return existing;
      const operation = (async (): Promise<PurchaseOutcome> => {
        try {
          const store =
            receipt.store === 'apple'
              ? 'apple'
              : receipt.store === 'google'
                ? 'google'
                : null;
          if (store === null) return {kind: 'UNAVAILABLE'};
          // Proof, product identity, user binding and access are verified in Convex.
          // A network failure after payment is pending, never a second sale.
          const result = await verify({
            expectedUserId: userId,
            store,
            productId: receipt.productId,
            proof: token,
          });
          if (identityRef.current !== userId) return {kind: 'PENDING'};
          if (!result.verified)
            return result.blocker
              ? {kind: 'CONFIRMATION_BLOCKED', blocker: result.blocker}
              : {kind: 'PENDING'};
          await IAP.finishTransaction({purchase: receipt, isConsumable: false});
          if (pendingProductFor(userId) === receipt.productId)
            storage.delete(Storage.PendingPurchaseIntent);
          return {kind: result.refreshed ? 'PURCHASED' : 'PENDING'};
        } catch {
          return {kind: 'PENDING'};
        }
      })();
      inFlightRef.current.set(key, operation);
      void operation.finally(() => inFlightRef.current.delete(key));
      return operation;
    },
    [verify],
  );

  useEffect(() => {
    if (!isPurchasesConfigured() || purchaserId === undefined) return;
    let disposed = false;
    let connectedForSession = false;
    let connecting = false;
    let recovering = false;
    const buyer = purchaserId;
    const complete = (outcome: PurchaseOutcome): void => {
      const pending = pendingRef.current;
      if (pending?.userId !== buyer) return;
      if (pending.timer !== null) clearTimeout(pending.timer);
      pendingRef.current = null;
      pending.resolve(outcome);
    };
    const updates = IAP.purchaseUpdatedListener((receipt) => {
      if (disposed || !connectedForSession || identityRef.current !== buyer)
        return;
      const pending = pendingRef.current;
      if (pending && receipt.productId !== pending.productId) return;
      if (pendingProductFor(buyer) !== receipt.productId) return;
      if (isExpiredReceipt(receipt)) return;
      void settle(receipt, buyer).then(complete);
    });
    const errors = IAP.purchaseErrorListener((error) => {
      if (disposed) return;
      const outcome = errorOutcome(error);
      if (
        (outcome.kind === 'CANCELLED' ||
          outcome.kind === 'ALREADY_SUBSCRIBED') &&
        pendingProductFor(buyer) !== null
      )
        storage.delete(Storage.PendingPurchaseIntent);
      complete(outcome);
    });
    const recover = async (): Promise<void> => {
      if (
        disposed ||
        recovering ||
        !connectedForSession ||
        identityRef.current !== buyer
      )
        return;
      const productId = pendingProductFor(buyer);
      if (productId === null) return;
      recovering = true;
      try {
        const receipts = await getPendingStorePurchases();
        for (const receipt of receipts) {
          if (
            disposed ||
            identityRef.current !== buyer ||
            pendingProductFor(buyer) !== productId
          )
            break;
          if (receipt.productId === productId && !isExpiredReceipt(receipt))
            await settle(receipt, buyer);
        }
      } catch {
        // Keep caller/SKU intent so the next foreground can enumerate again.
      } finally {
        recovering = false;
      }
    };
    const connect = (): void => {
      if (disposed || connecting || connectedForSession) return;
      connecting = true;
      void openStoreConnection()
        .then(async (connected) => {
          if (disposed || !connected) return;
          connectedForSession = true;
          setReadyFor(buyer);
          // Recover unacknowledged transactions after a process death. Do not open
          // StoreKit's explicit restore/login UI during startup.
          await recover();
          if (!disposed) await refresh({});
        })
        .catch(() => undefined)
        .finally(() => {
          connecting = false;
        });
    };
    connect();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !disposed) {
        if (!connectedForSession) connect();
        else
          void recover()
            .then(() => {
              if (!disposed && identityRef.current === buyer)
                return refresh({});
            })
            .catch(() => undefined);
      }
    });
    return () => {
      disposed = true;
      setReadyFor(null);
      complete({kind: 'PENDING'});
      updates.remove();
      errors.remove();
      foreground.remove();
      void closeStoreConnection().catch(() => undefined);
    };
  }, [purchaserId, refresh, settle]);

  const loadPackages = useCallback(
    async (_capability: PremiumCapability): Promise<void> => {
      if (!canPurchase || purchaserId === undefined) return;
      try {
        const plans = await loadStorePlans();
        if (identityRef.current === purchaserId)
          setCatalog({userId: purchaserId, plans});
      } catch {
        if (identityRef.current === purchaserId)
          setCatalog({userId: purchaserId, plans: []});
      }
    },
    [canPurchase, purchaserId],
  );

  const purchase = useCallback(
    async (plan: SubscriptionPlan): Promise<PurchaseOutcome> => {
      if (!canPurchase || purchaserId === undefined)
        return {kind: 'UNAVAILABLE'};
      if (pendingRef.current) return {kind: 'PENDING'};
      return new Promise<PurchaseOutcome>((resolve) => {
        const finish = (outcome: PurchaseOutcome): void => {
          const pending = pendingRef.current;
          if (pending?.resolve !== resolve) return;
          if (pending.timer !== null) clearTimeout(pending.timer);
          pendingRef.current = null;
          resolve(outcome);
        };
        pendingRef.current = {
          userId: purchaserId,
          productId: plan.product.identifier,
          resolve,
          timer: null,
        };
        storage.set(
          Storage.PendingPurchaseIntent,
          JSON.stringify({
            userId: purchaserId,
            productId: plan.product.identifier,
          }),
        );
        const ownsCheckout = (): boolean =>
          identityRef.current === purchaserId &&
          pendingProductFor(purchaserId) === plan.product.identifier &&
          (pendingRef.current === null ||
            pendingRef.current.resolve === resolve);
        void requestPlan(plan)
          .then(async (result) => {
            // Native checkout owns its authentication UI until this promise
            // returns. Bound callback/proof confirmation only after that point.
            const pending = pendingRef.current;
            if (pending?.resolve === resolve)
              pending.timer = setTimeout(
                () => finish({kind: 'PENDING'}),
                120_000,
              );
            if (result == null) return;
            const receipts = Array.isArray(result) ? result : [result];
            for (const receipt of receipts) {
              if (!ownsCheckout()) break;
              if (receipt.productId !== plan.product.identifier) continue;
              if (isExpiredReceipt(receipt)) continue;
              finish(await settle(receipt, purchaserId));
            }
          })
          .catch((error: unknown) => {
            if (!ownsCheckout()) return;
            const outcome = errorOutcome(error);
            if (
              (outcome.kind === 'CANCELLED' ||
                outcome.kind === 'ALREADY_SUBSCRIBED') &&
              pendingProductFor(purchaserId) === plan.product.identifier
            )
              storage.delete(Storage.PendingPurchaseIntent);
            finish(outcome);
          });
      });
    },
    [canPurchase, purchaserId, settle],
  );

  const restore = useCallback(async (): Promise<PurchaseOutcome> => {
    if (!canPurchase || purchaserId === undefined) return {kind: 'UNAVAILABLE'};
    try {
      await IAP.restorePurchases();
      const receipts = await getStorePurchases();
      if (receipts.length === 0) return {kind: 'NOTHING_TO_RESTORE'};
      let result: PurchaseOutcome = {kind: 'NOTHING_TO_RESTORE'};
      for (const receipt of receipts) {
        if (identityRef.current !== purchaserId) return {kind: 'PENDING'};
        const next = await settle(receipt, purchaserId);
        if (next.kind === 'PURCHASED') result = next;
        else if (result.kind !== 'PURCHASED') result = next;
      }
      return result;
    } catch (error: unknown) {
      return errorOutcome(error);
    }
  }, [canPurchase, purchaserId, settle]);

  const manage = useCallback(async (): Promise<ManagementOutcome> => {
    if (!isPurchasesConfigured()) return {kind: 'UNAVAILABLE'};
    try {
      await IAP.deepLinkToSubscriptions({
        skuAndroid: STORE_PRODUCT_IDS.androidSubscription,
        packageNameAndroid: APPLICATION_ID,
      });
      return {kind: 'CLOSED'};
    } catch {
      return {kind: 'FAILED'};
    }
  }, []);

  const snapshot = useMemo(
    () =>
      mine === undefined
        ? null
        : {
            status: mine.status,
            provider: mine.provider,
            ...(mine.expiresAt === undefined
              ? {}
              : {expiresAt: mine.expiresAt}),
            ...(mine.billingIssueDetectedAt === undefined
              ? {}
              : {billingIssueDetectedAt: mine.billingIssueDetectedAt}),
            willRenew: mine.willRenew,
          },
    [mine],
  );

  /**
   * Entitlement is a function of the clock, so the UI needs one.
   *
   * Reading `Date.now()` during render would be impure AND wrong: a
   * subscription that lapsed while the app was open would keep rendering as
   * active until some unrelated re-render happened to recompute it. Instead the
   * clock advances once, exactly at the instant the entitlement flips, and
   * never on a polling timer in between.
   */
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (snapshot === null) return;
    if (snapshot.expiresAt === undefined) return;
    if (!isEntitlementActive(snapshot, nowMs)) return;

    const flipsAt = entitlementDeadline(snapshot);
    if (flipsAt === undefined) return;
    const delay = Math.max(0, flipsAt - Date.now());

    // setTimeout saturates above ~24.8 days; past that, re-check at the cap.
    const timer = setTimeout(
      () => setNowMs(Date.now()),
      Math.min(delay, 0x7fffffff),
    );

    return () => clearTimeout(timer);
  }, [snapshot, nowMs]);

  const packages =
    catalog && catalog.userId === purchaserId ? catalog.plans : EMPTY_PLANS;

  const value = useMemo<SubscriptionState>(() => {
    const now = nowMs;

    return {
      isActive:
        isAuthenticated && !probeFailed && isEntitlementActive(snapshot, now),
      isEnding:
        isAuthenticated && !probeFailed && isEntitlementEnding(snapshot, now),
      expiresAt: mine?.expiresAt,
      hasBillingIssue: mine?.billingIssueDetectedAt !== undefined,
      hasStoreSubscription:
        isAuthenticated &&
        !probeFailed &&
        mine?.status !== undefined &&
        mine.status !== 'NONE' &&
        (mine.store === 'APP_STORE' || mine.store === 'PLAY_STORE'),
      canPurchase,
      canManage: isPurchasesConfigured(),
      // A failed probe must not read as a permanent spinner.
      isLoading:
        isAuthenticated &&
        (mine === undefined || currentUser === undefined) &&
        !probeFailed,
      isStatusAvailable:
        !probeFailed && (!isAuthenticated || mine !== undefined),
      packages,
      loadPackages,
      purchase,
      restore,
      manage,
    };
  }, [
    mine,
    currentUser,
    probeFailed,
    snapshot,
    nowMs,
    canPurchase,
    isAuthenticated,
    packages,
    loadPackages,
    purchase,
    restore,
    manage,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

/** Report probe failure without unmounting the app or inferring a free tier. */
function ProbeFailed({onFail}: {onFail: () => void}): null {
  useEffect(() => {
    onFail();
  }, [onFail]);

  return null;
}

function SubscriptionProbe({
  onResult,
}: {
  onResult: (result: {
    mine: MySubscription | undefined;
    currentUser: {userId: Id<'users'>} | null | undefined;
  }) => void;
}): null {
  const {isAuthenticated} = useConvexAuth();
  const mine = useQuery(
    api.subscriptions.queries.mine,
    isAuthenticated ? {} : 'skip',
  );
  const currentUser = useQuery(
    api.user.queries.currentUser,
    isAuthenticated ? {} : 'skip',
  );

  useEffect(() => {
    onResult({mine, currentUser});
  }, [mine, currentUser, onResult]);

  return null;
}

/**
 * Subscription state, with a hard guarantee: **this cannot take down the app,
 * and it cannot swallow the app's own errors either.**
 *
 * The probe sits alone inside the boundary; `children` are its sibling. A
 * failing subscription query therefore leaves entitlement unknown, and a
 * failing screen still reaches the root error boundary where it belongs.
 *
 * The probe is keyed on the auth signature so a failure that was caused by an
 * unsettled session gets one honest retry, rather than latching for the life of
 * the process.
 */
export function SubscriptionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const {isAuthenticated} = useConvexAuth();
  const [probe, setProbe] = useState<{
    mine: MySubscription | undefined;
    currentUser: {userId: Id<'users'>} | null | undefined;
  }>({mine: undefined, currentUser: undefined});
  const [failed, setFailed] = useState(false);

  const onResult = useCallback(
    (result: {
      mine: MySubscription | undefined;
      currentUser: {userId: Id<'users'>} | null | undefined;
    }): void => {
      setFailed(false);
      setProbe(result);
    },
    [],
  );
  const onFail = useCallback((): void => setFailed(true), []);

  const renderFallback = useCallback(
    (): ReactElement => <ProbeFailed onFail={onFail} />,
    [onFail],
  );

  return (
    <>
      <ErrorBoundary
        key={isAuthenticated ? 'authed' : 'anon'}
        FallbackComponent={renderFallback}
      >
        <SubscriptionProbe onResult={onResult} />
      </ErrorBoundary>
      <SubscriptionProviderInner
        currentUser={probe.currentUser}
        mine={probe.mine}
        probeFailed={failed}
      >
        {children}
      </SubscriptionProviderInner>
    </>
  );
}

export function useSubscription(): SubscriptionState {
  const value = useContext(SubscriptionContext);
  if (value === null)
    throw new Error('useSubscription must be used inside SubscriptionProvider');

  return value;
}
