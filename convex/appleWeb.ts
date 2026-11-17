import {appleAppRedirectLocation} from '../shared/apple';
import {httpAction} from './_generated/server';

export const appleCallback = httpAction(async (_ctx, request) => {
  const body = await request.text().catch(() => null);
  if (body === null) return new Response('Bad Request', {status: 400});
  return new Response(null, {
    status: 302,
    headers: {Location: appleAppRedirectLocation(new URLSearchParams(body))},
  });
});
