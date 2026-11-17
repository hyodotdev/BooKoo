import type {Purchase, PurchaseError} from 'expo-iap';

export const ErrorCode = {
  UserCancelled: 'user-cancelled',
  AlreadyOwned: 'already-owned',
  DeferredPayment: 'deferred-payment',
  Pending: 'pending',
};
export const initConnection = jest.fn(async () => true);
export const endConnection = jest.fn(async () => undefined);
export const fetchProducts = jest.fn(async () => []);
export const isEligibleForIntroOfferIOS = jest.fn(async () => true);
export const getAvailablePurchases = jest.fn(
  async (): Promise<Purchase[]> => [],
);
export const getPendingTransactionsIOS = jest.fn(
  async (): Promise<Purchase[]> => [],
);
export const requestPurchase = jest.fn(async () => null);
export const restorePurchases = jest.fn(async () => undefined);
export const finishTransaction = jest.fn(async () => undefined);
export const deepLinkToSubscriptions = jest.fn(async () => undefined);
export const purchaseUpdatedListener = jest.fn(
  (_listener: (purchase: Purchase) => void) => ({remove: jest.fn()}),
);
export const purchaseErrorListener = jest.fn(
  (_listener: (error: PurchaseError) => void) => ({remove: jest.fn()}),
);
