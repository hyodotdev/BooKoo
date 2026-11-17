'use node';

import {v} from 'convex/values';

import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {internalAction} from '../_generated/server';
import {
  PUSH_EXPO_BATCH_SIZE,
  PUSH_RECEIPT_DELAY_MS,
  PUSH_RECEIPT_MAX_ATTEMPTS,
} from '../lib/constants';
import {itemAddedPushArgs} from './internal';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';

interface ExpoTicket {
  readonly status?: unknown;
  readonly id?: unknown;
  readonly details?: unknown;
}

interface ReceiptMapping {
  readonly receiptId: string;
  readonly pushTokenId: Id<'pushTokens'>;
}

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const postWithRetry = async (url: string, body: object): Promise<unknown> => {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      lastStatus = response.status;
      if (response.ok) return response.json() as Promise<unknown>;
      if (response.status !== 429 && response.status < 500)
        throw new Error('Permanent Expo push failure');
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await sleep(250 * 2 ** attempt + Math.floor(Math.random() * 150));
  }
  throw new Error(`Expo push unavailable (${lastStatus})`);
};

const objectValue = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const ticketError = (ticket: ExpoTicket): string | null => {
  const details = objectValue(ticket.details);
  return typeof details?.error === 'string' ? details.error : null;
};

export const sendItemAdded = internalAction({
  args: itemAddedPushArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const recipients = await ctx.runMutation(
      internal.notifications.internal.claimItemPushRecipients,
      args,
    );
    for (let offset = 0; offset < recipients.length; offset += PUSH_EXPO_BATCH_SIZE) {
      const batch = recipients.slice(offset, offset + PUSH_EXPO_BATCH_SIZE);
      const response = objectValue(
        await postWithRetry(
          EXPO_SEND_URL,
          batch.map((recipient) => ({
            to: recipient.token,
            sound: 'default',
            channelId: 'ledger-activity',
            title: recipient.title,
            body: recipient.body,
            data: {
              kind: 'ITEM_ADDED',
              ledgerId: String(args.ledgerId),
              itemId: String(args.itemId),
            },
          })),
        ),
      );
      const data = Array.isArray(response?.data)
        ? (response.data as ExpoTicket[])
        : [];
      const disabled: Id<'pushTokens'>[] = [];
      const receipts: ReceiptMapping[] = [];
      for (const [index, recipient] of batch.entries()) {
        const ticket = data[index];
        if (ticket === undefined) continue;
        if (ticket.status === 'ok' && typeof ticket.id === 'string')
          receipts.push({receiptId: ticket.id, pushTokenId: recipient.pushTokenId});
        else if (ticketError(ticket) === 'DeviceNotRegistered')
          disabled.push(recipient.pushTokenId);
      }
      if (disabled.length > 0)
        await ctx.runMutation(internal.notifications.internal.disableTokens, {
          pushTokenIds: disabled,
          now: Date.now(),
        });
      if (receipts.length > 0)
        await ctx.scheduler.runAfter(
          PUSH_RECEIPT_DELAY_MS,
          internal.notifications.actions.checkPushReceipts,
          {mappings: receipts, attempt: 1},
        );
    }
    return null;
  },
});

export const sendInbox = internalAction({
  args: {notificationId: v.id('notifications')},
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const recipients = await ctx.runMutation(
      internal.notifications.internal.claimInboxPushRecipients,
      {notificationId: args.notificationId, now: Date.now()},
    );
    for (
      let offset = 0;
      offset < recipients.length;
      offset += PUSH_EXPO_BATCH_SIZE
    ) {
      const batch = recipients.slice(offset, offset + PUSH_EXPO_BATCH_SIZE);
      const response = objectValue(
        await postWithRetry(
          EXPO_SEND_URL,
          batch.map((recipient) => ({
            to: recipient.token,
            sound: 'default',
            channelId: recipient.channelId,
            title: recipient.title,
            body: recipient.body,
            data: {
              kind: recipient.kind,
              ...(recipient.ledgerId === undefined
                ? {}
                : {ledgerId: String(recipient.ledgerId)}),
              ...(recipient.itemId === undefined
                ? {}
                : {itemId: String(recipient.itemId)}),
            },
          })),
        ),
      );
      const data = Array.isArray(response?.data)
        ? (response.data as ExpoTicket[])
        : [];
      const disabled: Id<'pushTokens'>[] = [];
      const receipts: ReceiptMapping[] = [];
      for (const [index, recipient] of batch.entries()) {
        const ticket = data[index];
        if (ticket === undefined) continue;
        if (ticket.status === 'ok' && typeof ticket.id === 'string')
          receipts.push({
            receiptId: ticket.id,
            pushTokenId: recipient.pushTokenId,
          });
        else if (ticketError(ticket) === 'DeviceNotRegistered')
          disabled.push(recipient.pushTokenId);
      }
      if (disabled.length > 0)
        await ctx.runMutation(internal.notifications.internal.disableTokens, {
          pushTokenIds: disabled,
          now: Date.now(),
        });
      if (receipts.length > 0)
        await ctx.scheduler.runAfter(
          PUSH_RECEIPT_DELAY_MS,
          internal.notifications.actions.checkPushReceipts,
          {mappings: receipts, attempt: 1},
        );
    }
    return null;
  },
});

export const checkPushReceipts = internalAction({
  args: {
    mappings: v.array(
      v.object({receiptId: v.string(), pushTokenId: v.id('pushTokens')}),
    ),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const response = objectValue(
      await postWithRetry(EXPO_RECEIPT_URL, {
        ids: args.mappings.map((mapping) => mapping.receiptId),
      }),
    );
    const receiptData = objectValue(response?.data) ?? {};
    const disabled: Id<'pushTokens'>[] = [];
    const retry: ReceiptMapping[] = [];
    for (const mapping of args.mappings) {
      const receipt = objectValue(receiptData[mapping.receiptId]);
      if (receipt === null) {
        retry.push(mapping);
        continue;
      }
      const error = ticketError(receipt);
      if (error === 'DeviceNotRegistered') disabled.push(mapping.pushTokenId);
      else if (receipt.status !== 'ok' && error === null) retry.push(mapping);
    }
    if (disabled.length > 0)
      await ctx.runMutation(internal.notifications.internal.disableTokens, {
        pushTokenIds: disabled,
        now: Date.now(),
      });
    if (
      retry.length > 0 &&
      Number.isSafeInteger(args.attempt) &&
      args.attempt < PUSH_RECEIPT_MAX_ATTEMPTS
    )
      await ctx.scheduler.runAfter(
        PUSH_RECEIPT_DELAY_MS,
        internal.notifications.actions.checkPushReceipts,
        {mappings: retry, attempt: args.attempt + 1},
      );
    return null;
  },
});

export const pushActionInternals = {objectValue, ticketError} as const;
