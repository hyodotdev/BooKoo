import {httpAction} from '../_generated/server';
import {internal} from '../_generated/api';
import {APPLICATION_ID} from '../../shared/application';
import {
  parseIapkitEvent,
  isObject,
  sha256Hex,
  verifyIapkitSignature,
} from '../lib/iapkit';

export const handleIapkitWebhook = httpAction(
  async (ctx, request): Promise<Response> => {
    const secret = process.env.IAPKIT_WEBHOOK_SECRET;
    if (!secret || !process.env.IAPKIT_PROJECT_ID)
      return new Response(null, {status: 401});
    if (Number(request.headers.get('content-length')) > 65536)
      return new Response(null, {status: 413});
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 65536)
      return new Response(null, {status: 413});
    if (
      !(await verifyIapkitSignature(
        raw,
        request.headers.get('openiap-timestamp'),
        request.headers.get('openiap-signature'),
        secret,
        Date.now(),
      ))
    )
      return new Response(null, {status: 401});
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, {status: 400});
    }
    // Verification can produce an event before its account binding is applied.
    // A signed, correctly scoped unbound event is acknowledged without a grant.
    if (
      isObject(body) &&
      body.projectId === process.env.IAPKIT_PROJECT_ID &&
      body.applicationId === APPLICATION_ID &&
      typeof body.eventId === 'string' &&
      request.headers.get('openiap-event-id') === body.eventId &&
      !body.userId
    ) {
      return new Response(JSON.stringify({outcome: 'UNKNOWN_SUBSCRIBER'}), {
        status: 200,
      });
    }
    const event = parseIapkitEvent(body);
    if (
      !event ||
      event.projectId !== process.env.IAPKIT_PROJECT_ID ||
      request.headers.get('openiap-event-id') !== event.eventId
    )
      return new Response(null, {status: 400});
    const result = await ctx.runMutation(
      internal.subscriptions.internal.applyWebhookEvent,
      {body: raw, payloadDigest: await sha256Hex(raw)},
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  },
);
