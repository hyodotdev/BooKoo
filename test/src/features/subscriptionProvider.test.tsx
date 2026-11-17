import {useEffect, type ReactElement} from 'react';
import {AppState, Platform, Text} from 'react-native';
import {act, render, waitFor} from '@testing-library/react-native';
import * as IAP from 'expo-iap';
import type {Purchase, PurchaseError, PurchaseIOS} from 'expo-iap';
import {
  getFunctionName as mockGetFunctionName,
  type FunctionReference,
} from 'convex/server';
import {
  SubscriptionProvider,
  useSubscription,
} from '~/features/subscription/provider';
import {Storage, storage} from '~/utils/storage';

jest.mock('expo-iap');
const mockMine = jest.fn();
const mockUser = jest.fn();
const mockAuth = jest.fn();
const mockVerify = jest.fn();
const mockRefresh = jest.fn();
jest.mock('convex/react', () => ({
  useConvexAuth: () => mockAuth(),
  useQuery: (query: FunctionReference<'query'>) =>
    mockGetFunctionName(query) === 'user/queries:currentUser'
      ? mockUser()
      : mockMine(),
  useAction: (action: FunctionReference<'action'>) =>
    mockGetFunctionName(action).endsWith(':verify') ? mockVerify : mockRefresh,
}));
let current: ReturnType<typeof useSubscription>;
function Probe(): ReactElement {
  const value = useSubscription();
  useEffect(() => {
    current = value;
  }, [value]);
  return <Text>ledger alive</Text>;
}
const mount = () =>
  render(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );
const plan = {
  identifier: 'monthly',
  product: {identifier: 'pro', priceString: '$3.99'},
  offerToken: 'eligible',
} as const;
const receipt: Purchase = {
  id: 'order',
  productId: 'pro',
  store: 'google',
  storeId: 'play',
  purchaseToken: 'proof',
  purchaseState: 'purchased',
  transactionDate: 1800000000000,
  quantity: 1,
  isAutoRenewing: true,
};
const emit = async (purchase: Purchase = receipt): Promise<void> => {
  await act(async () => {
    jest.mocked(IAP.purchaseUpdatedListener).mock.calls.at(-1)?.[0](purchase);
  });
};
afterEach(() => jest.restoreAllMocks());
const error = async (code: PurchaseError['code']): Promise<void> => {
  await act(async () => {
    jest
      .mocked(IAP.purchaseErrorListener)
      .mock.calls.at(-1)?.[0](Object.assign(new Error('store error'), {code}));
  });
};
beforeEach(() => {
  storage.clearAll();
  jest.clearAllMocks();
  mockAuth.mockReturnValue({isAuthenticated: true});
  mockUser.mockReturnValue({userId: 'user-a'});
  mockMine.mockReturnValue({
    billingReady: true,
    status: 'NONE',
    store: 'UNKNOWN',
    periodType: 'NORMAL',
    willRenew: false,
  });
  mockVerify.mockResolvedValue({verified: true, refreshed: true});
  mockRefresh.mockResolvedValue({refreshed: false});
  jest.mocked(IAP.initConnection).mockResolvedValue(true);
  jest.mocked(IAP.getAvailablePurchases).mockResolvedValue([]);
  jest.mocked(IAP.getPendingTransactionsIOS).mockResolvedValue([]);
  jest.mocked(IAP.requestPurchase).mockResolvedValue(null);
});
it('keeps server truth independent from native purchase events', async () => {
  const screen = mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  await emit();
  expect(current.isActive).toBe(false);
  expect(screen.getByText('ledger alive')).toBeTruthy();
  expect(mockVerify).not.toHaveBeenCalled();
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
});
it.each(['false', 'rejection'] as const)(
  'retries a transient %s store connection on foreground',
  async (failure) => {
    if (failure === 'false')
      jest.mocked(IAP.initConnection).mockResolvedValueOnce(false);
    else
      jest
        .mocked(IAP.initConnection)
        .mockRejectedValueOnce(new Error('Store unavailable'));
    const listener = jest.spyOn(AppState, 'addEventListener');
    mount();
    await waitFor(() => expect(IAP.initConnection).toHaveBeenCalledTimes(1));
    expect(current.canPurchase).toBe(false);
    // Let the rejected/false attempt settle before a new active transition.
    await act(async () => {});
    await act(async () => {
      listener.mock.calls.at(-1)?.[1]('active');
    });
    await waitFor(() => expect(current.canPurchase).toBe(true));
    expect(IAP.initConnection).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      listener.mock.calls.at(-1)?.[1]('active');
    });
    expect(IAP.initConnection).toHaveBeenCalledTimes(2);
  },
);
it.each(['PAUSED', 'EXPIRED'] as const)(
  'retains management identity without granting %s access',
  async (status) => {
    mockMine.mockReturnValue({
      billingReady: true,
      status,
      store: 'APP_STORE',
      periodType: 'NORMAL',
      willRenew: false,
      expiresAt: 1900000000000,
    });
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    expect(current.hasStoreSubscription).toBe(true);
    expect(current.isActive).toBe(false);
    expect(current.canManage).toBe(true);
  },
);
it('does not bind completed legacy purchases automatically on login', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest
    .mocked(IAP.getAvailablePurchases)
    .mockResolvedValue([{...receipt, isAcknowledgedAndroid: true}]);
  mount();
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  expect(mockVerify).not.toHaveBeenCalled();
  expect(IAP.getAvailablePurchases).not.toHaveBeenCalled();
});
it('recovers only unfinished receipts for the account that requested checkout', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  storage.set(
    Storage.PendingPurchaseIntent,
    JSON.stringify({userId: 'user-a', productId: 'pro'}),
  );
  const pending = {...receipt, isAcknowledgedAndroid: false};
  jest
    .mocked(IAP.getAvailablePurchases)
    .mockResolvedValue([
      {...receipt, purchaseToken: 'old-finished', isAcknowledgedAndroid: true},
      pending,
    ]);
  mount();
  await waitFor(() => expect(IAP.finishTransaction).toHaveBeenCalledTimes(1));
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith(
    expect.objectContaining({expectedUserId: 'user-a', proof: 'proof'}),
  );
  expect(storage.getString(Storage.PendingPurchaseIntent)).toBeUndefined();
});
it('leaves an expired unfinished iOS receipt alone during recovery', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const expired: PurchaseIOS = {
    id: 'expired-ios',
    productId: 'dev.hyo.bookoo.pro.monthly',
    store: 'apple',
    storeId: 'app-store',
    purchaseToken: 'expired-proof',
    purchaseState: 'purchased',
    transactionDate: Date.now() - 40 * 86_400_000,
    transactionId: 'expired-order',
    expirationDateIOS: Date.now() - 10 * 86_400_000,
    quantity: 1,
    isAutoRenewing: false,
  };
  storage.set(
    Storage.PendingPurchaseIntent,
    JSON.stringify({userId: 'user-a', productId: expired.productId}),
  );
  jest.mocked(IAP.getPendingTransactionsIOS).mockResolvedValue([expired]);
  mount();
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  expect(IAP.getPendingTransactionsIOS).toHaveBeenCalledTimes(1);
  expect(mockVerify).not.toHaveBeenCalled();
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
});
it('does not resolve a checkout from an expired receipt for the same product', async () => {
  const expired: PurchaseIOS = {
    id: 'expired-ios',
    productId: 'pro',
    store: 'apple',
    storeId: 'app-store',
    purchaseToken: 'expired-proof',
    purchaseState: 'purchased',
    transactionDate: Date.now() - 40 * 86_400_000,
    transactionId: 'expired-order',
    expirationDateIOS: Date.now() - 10 * 86_400_000,
    quantity: 1,
    isAutoRenewing: false,
  };
  // Convex never verifies an expired receipt.
  mockVerify.mockImplementation(async ({proof}: {proof: string}) =>
    proof === expired.purchaseToken
      ? {verified: false, refreshed: false}
      : {verified: true, refreshed: true},
  );
  jest.mocked(IAP.requestPurchase).mockImplementation(async () => {
    const listener = jest.mocked(IAP.purchaseUpdatedListener).mock.calls.at(-1);
    listener?.[0](expired);
    listener?.[0](receipt);
    return null;
  });
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  let outcome: ReturnType<typeof current.purchase> | undefined;
  await act(async () => {
    outcome = current.purchase(plan);
  });
  await expect(outcome).resolves.toEqual({kind: 'PURCHASED'});
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith(
    expect.objectContaining({proof: 'proof'}),
  );
});
it('retries failed unfinished enumeration on foreground while refreshing server access', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const unfinished: PurchaseIOS = {
    id: 'unfinished-ios',
    productId: 'dev.hyo.bookoo.pro.monthly',
    store: 'apple',
    storeId: 'app-store',
    purchaseToken: 'proof',
    purchaseState: 'purchased',
    transactionDate: 1800000000000,
    transactionId: 'order',
    quantity: 1,
    isAutoRenewing: true,
  };
  storage.set(
    Storage.PendingPurchaseIntent,
    JSON.stringify({userId: 'user-a', productId: unfinished.productId}),
  );
  jest
    .mocked(IAP.getPendingTransactionsIOS)
    .mockRejectedValueOnce(new Error('Temporary StoreKit failure'))
    .mockResolvedValueOnce([unfinished]);
  const listener = jest.spyOn(AppState, 'addEventListener');
  mount();
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  expect(current.canPurchase).toBe(true);
  expect(mockVerify).not.toHaveBeenCalled();
  expect(storage.getString(Storage.PendingPurchaseIntent)).toContain('user-a');
  await act(async () => {
    listener.mock.calls.at(-1)?.[1]('active');
  });
  await waitFor(() => expect(IAP.finishTransaction).toHaveBeenCalledTimes(1));
  expect(IAP.getPendingTransactionsIOS).toHaveBeenCalledTimes(2);
  expect(mockVerify).toHaveBeenCalledWith(
    expect.objectContaining({expectedUserId: 'user-a'}),
  );
  expect(storage.getString(Storage.PendingPurchaseIntent)).toBeUndefined();
  expect(IAP.initConnection).toHaveBeenCalledTimes(1);
});
it('leaves another accounts unfinished checkout untouched at login', async () => {
  storage.set(
    Storage.PendingPurchaseIntent,
    JSON.stringify({userId: 'user-b', productId: 'pro'}),
  );
  mount();
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  await emit();
  expect(mockVerify).not.toHaveBeenCalled();
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
  expect(storage.getString(Storage.PendingPurchaseIntent)).toContain('user-b');
});
it('verifies proof before finishing a purchase', async () => {
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  let result: Promise<unknown>;
  act(() => {
    result = current.purchase(plan);
  });
  await emit();
  await expect(result!).resolves.toEqual({kind: 'PURCHASED'});
  expect(mockVerify).toHaveBeenCalledWith({
    expectedUserId: 'user-a',
    store: 'google',
    productId: 'pro',
    proof: 'proof',
  });
  expect(IAP.finishTransaction).toHaveBeenCalledWith({
    purchase: receipt,
    isConsumable: false,
  });
  expect(mockVerify.mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(IAP.finishTransaction).mock.invocationCallOrder[0],
  );
});
it('does not acknowledge a purchase the server could not verify', async () => {
  mockVerify.mockResolvedValue({verified: false, refreshed: false});
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  let result: Promise<unknown>;
  act(() => {
    result = current.purchase(plan);
  });
  await emit();
  await expect(result!).resolves.toEqual({kind: 'PENDING'});
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
});
it('keeps the UI pending if an anchored payment awaits reactive access', async () => {
  mockVerify.mockResolvedValue({verified: true, refreshed: false});
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  let result: Promise<unknown>;
  act(() => {
    result = current.purchase(plan);
  });
  await emit();
  await expect(result!).resolves.toEqual({kind: 'PENDING'});
  expect(IAP.finishTransaction).toHaveBeenCalled();
});
it.each([IAP.ErrorCode.UserCancelled, IAP.ErrorCode.DeferredPayment] as const)(
  'handles %s without a misleading failure',
  async (code) => {
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    let result: Promise<unknown>;
    act(() => {
      result = current.purchase(plan);
    });
    await error(code);
    await expect(result!).resolves.toEqual({
      kind: code === 'user-cancelled' ? 'CANCELLED' : 'PENDING',
    });
  },
);
it('does not purchase before an authenticated identity resolves', async () => {
  mockUser.mockReturnValue(undefined);
  mount();
  await expect(current.purchase(plan)).resolves.toEqual({kind: 'UNAVAILABLE'});
  expect(IAP.initConnection).not.toHaveBeenCalled();
});
it('restores through proof validation without opening another sale', async () => {
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  jest.mocked(IAP.getAvailablePurchases).mockResolvedValue([receipt]);
  await act(async () => {
    expect(await current.restore()).toEqual({kind: 'PURCHASED'});
  });
  expect(IAP.restorePurchases).toHaveBeenCalled();
  expect(IAP.requestPurchase).not.toHaveBeenCalled();
});
it.each(['promise', 'listener'] as const)(
  'prompts restore and clears new checkout intent on already-owned from %s',
  async (source) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    if (source === 'promise')
      jest
        .mocked(IAP.requestPurchase)
        .mockRejectedValueOnce({code: IAP.ErrorCode.AlreadyOwned});
    let result: Promise<unknown>;
    act(() => {
      result = current.purchase(plan);
    });
    if (source === 'listener') await error(IAP.ErrorCode.AlreadyOwned);
    await expect(result!).resolves.toEqual({kind: 'ALREADY_SUBSCRIBED'});
    expect(storage.getString(Storage.PendingPurchaseIntent)).toBeUndefined();
    await emit();
    expect(mockVerify).not.toHaveBeenCalled();
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
  },
);
it('treats a cancelled restore login as cancellation', async () => {
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  jest.mocked(IAP.restorePurchases).mockRejectedValueOnce({
    code: IAP.ErrorCode.UserCancelled,
  });
  await expect(current.restore()).resolves.toEqual({kind: 'CANCELLED'});
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
});
it.each([
  [
    'UnexpectedException: Request Canceled (at ExpoModulesCore/ConcurrentFunctionDefinition.swift:90)',
    'CANCELLED',
  ],
  [
    'UnexpectedException: Network failure (at ExpoModulesCore/ConcurrentFunctionDefinition.swift:90)',
    'FAILED',
  ],
] as const)(
  'classifies the native restore exception %s',
  async (message, kind) => {
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    jest
      .mocked(IAP.restorePurchases)
      .mockRejectedValueOnce({code: 'ERR_UNEXPECTED', message});
    await expect(current.restore()).resolves.toEqual({kind});
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
  },
);
it('keeps native management available when backend billing is unavailable', async () => {
  mockMine.mockReturnValue({
    billingReady: false,
    status: 'NONE',
    store: 'UNKNOWN',
    periodType: 'NORMAL',
    willRenew: false,
  });
  mount();
  await waitFor(() => expect(current.isLoading).toBe(false));
  expect(current.canPurchase).toBe(false);
  expect(current.canManage).toBe(true);
  await expect(current.manage()).resolves.toEqual({kind: 'CLOSED'});
});
it('requires a fresh connection when the same account signs back in', async () => {
  const screen = mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  mockAuth.mockReturnValue({isAuthenticated: false});
  screen.rerender(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(current.canPurchase).toBe(false));
  jest.mocked(IAP.initConnection).mockResolvedValueOnce(false);
  mockAuth.mockReturnValue({isAuthenticated: true});
  screen.rerender(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(IAP.initConnection).toHaveBeenCalledTimes(2));
  expect(current.canPurchase).toBe(false);
  await expect(current.purchase(plan)).resolves.toEqual({kind: 'UNAVAILABLE'});
  expect(IAP.requestPurchase).not.toHaveBeenCalled();
});
it('keeps failed server probes unknown and leaves the app mounted', async () => {
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  mockMine.mockImplementation(() => {
    throw new Error('offline');
  });
  const screen = mount();
  await waitFor(() => expect(current.isStatusAvailable).toBe(false));
  expect(screen.getByText('ledger alive')).toBeTruthy();
  expect(current.isActive).toBe(false);
  consoleError.mockRestore();
});
it('isolates a delayed store callback from account switching', async () => {
  const screen = mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  const oldListener = jest
    .mocked(IAP.purchaseUpdatedListener)
    .mock.calls.at(-1)![0];
  mockUser.mockReturnValue({userId: 'user-b'});
  screen.rerender(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(IAP.endConnection).toHaveBeenCalled());
  await act(async () => {
    oldListener(receipt);
  });
  expect(mockVerify).not.toHaveBeenCalled();
});
it('opens the native subscription management screen', async () => {
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  await expect(current.manage()).resolves.toEqual({kind: 'CLOSED'});
  expect(IAP.deepLinkToSubscriptions).toHaveBeenCalled();
});

it.each(['single', 'array'] as const)(
  'verifies a returned %s receipt without a listener callback',
  async (shape) => {
    const returned: PurchaseIOS = {
      ...receipt,
      store: 'apple',
      storeId: 'app-store',
      transactionId: 'order',
    };
    jest
      .mocked(IAP.requestPurchase)
      .mockResolvedValue(shape === 'single' ? returned : [returned]);
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    let outcome: ReturnType<typeof current.purchase> | undefined;
    await act(async () => {
      outcome = current.purchase(plan);
    });
    await expect(outcome).resolves.toEqual({kind: 'PURCHASED'});
    expect(mockVerify).toHaveBeenCalledWith({
      expectedUserId: 'user-a',
      store: 'apple',
      productId: 'pro',
      proof: 'proof',
    });
    expect(IAP.finishTransaction).toHaveBeenCalledTimes(1);
    expect(current.isActive).toBe(false);
  },
);
it('keeps a returned receipt pending when server verification fails', async () => {
  jest.mocked(IAP.requestPurchase).mockResolvedValue(receipt);
  mockVerify.mockResolvedValue({verified: false, refreshed: false});
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  let outcome: ReturnType<typeof current.purchase> | undefined;
  await act(async () => {
    outcome = current.purchase(plan);
  });
  await expect(outcome).resolves.toEqual({kind: 'PENDING'});
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
  expect(storage.getString(Storage.PendingPurchaseIntent)).toContain('user-a');
});
it('settles one receipt when the store returns it and publishes it', async () => {
  jest.mocked(IAP.requestPurchase).mockImplementation(async () => {
    jest.mocked(IAP.purchaseUpdatedListener).mock.calls.at(-1)?.[0](receipt);
    return receipt;
  });
  mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  let outcome: ReturnType<typeof current.purchase> | undefined;
  await act(async () => {
    outcome = current.purchase(plan);
  });
  await expect(outcome).resolves.toEqual({kind: 'PURCHASED'});
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(IAP.finishTransaction).toHaveBeenCalledTimes(1);
});
it('ignores a returned receipt after its initiating account changes', async () => {
  let returnReceipt:
    ((value: Purchase | Purchase[] | null) => void) | undefined;
  jest.mocked(IAP.requestPurchase).mockImplementation(
    () =>
      new Promise((resolve) => {
        returnReceipt = resolve;
      }),
  );
  const screen = mount();
  await waitFor(() => expect(current.canPurchase).toBe(true));
  let outcome: ReturnType<typeof current.purchase> | undefined;
  await act(async () => {
    outcome = current.purchase(plan);
  });
  mockUser.mockReturnValue({userId: 'user-b'});
  screen.rerender(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(current.canPurchase).toBe(true));
  await act(async () => {
    returnReceipt?.(receipt);
  });
  await expect(outcome).resolves.toEqual({kind: 'PENDING'});
  expect(mockVerify).not.toHaveBeenCalled();
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
});

it('waits for native authentication before settling a delayed receipt', async () => {
  jest.useFakeTimers();
  try {
    let returnReceipt:
      ((value: Purchase | Purchase[] | null) => void) | undefined;
    jest.mocked(IAP.requestPurchase).mockImplementation(
      () =>
        new Promise((resolve) => {
          returnReceipt = resolve;
        }),
    );
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    let outcome: ReturnType<typeof current.purchase> | undefined;
    const settled = jest.fn();
    await act(async () => {
      outcome = current.purchase(plan);
      void outcome.then(settled);
    });
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(settled).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
    await act(async () => {
      returnReceipt?.(receipt);
    });
    await expect(outcome).resolves.toEqual({kind: 'PURCHASED'});
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(IAP.finishTransaction).toHaveBeenCalledTimes(1);
    expect(storage.getString(Storage.PendingPurchaseIntent)).toBeUndefined();
  } finally {
    jest.useRealTimers();
  }
});

it('reports a native checkout failure after prolonged authentication', async () => {
  jest.useFakeTimers();
  try {
    let rejectCheckout: ((reason: Error) => void) | undefined;
    jest.mocked(IAP.requestPurchase).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectCheckout = reject;
        }),
    );
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    let outcome: ReturnType<typeof current.purchase> | undefined;
    const settled = jest.fn();
    await act(async () => {
      outcome = current.purchase(plan);
      void outcome.then(settled);
      jest.advanceTimersByTime(180_000);
    });
    expect(settled).not.toHaveBeenCalled();
    await act(async () => {
      rejectCheckout?.(new Error('Payment sheet dismissed without a result'));
    });
    await expect(outcome).resolves.toEqual({kind: 'FAILED'});
    expect(mockVerify).not.toHaveBeenCalled();
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it('bounds a callback-only checkout without losing late receipt recovery', async () => {
  jest.useFakeTimers();
  try {
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    let outcome: ReturnType<typeof current.purchase> | undefined;
    await act(async () => {
      outcome = current.purchase(plan);
    });
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    await expect(outcome).resolves.toEqual({kind: 'PENDING'});
    await emit();
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(IAP.finishTransaction).toHaveBeenCalledTimes(1);
    expect(storage.getString(Storage.PendingPurchaseIntent)).toBeUndefined();
  } finally {
    jest.useRealTimers();
  }
});

it.each(['TEST_ACCOUNT_REQUIRED', 'ACCOUNT_LINK_REQUIRED'] as const)(
  'reports %s without finishing or losing the paid receipt intent',
  async (blocker) => {
    mockVerify.mockResolvedValue({verified: false, refreshed: false, blocker});
    jest.mocked(IAP.requestPurchase).mockResolvedValue(receipt);
    mount();
    await waitFor(() => expect(current.canPurchase).toBe(true));
    let outcome: Promise<unknown> | undefined;
    await act(async () => {
      outcome = current.purchase(plan);
    });
    await expect(outcome).resolves.toEqual({
      kind: 'CONFIRMATION_BLOCKED',
      blocker,
    });
    expect(IAP.finishTransaction).not.toHaveBeenCalled();
    expect(storage.getString(Storage.PendingPurchaseIntent)).toBe(
      JSON.stringify({userId: 'user-a', productId: 'pro'}),
    );
  },
);
