import {httpAction} from '../_generated/server';
import {internal} from '../_generated/api';

const notFound = (): Response =>
  new Response('Not found', {
    status: 404,
    headers: {'Cache-Control': 'private, no-store'},
  });

export const servePhoto = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/media\/photo\/([^/]+)\/(thumb|original)$/,
  );
  if (match?.[1] === undefined || match[2] === undefined) return notFound();
  try {
    const resolved = await ctx.runQuery(internal.photos.internal.resolveMedia, {
      photoId: match[1],
      variant: match[2] === 'thumb' ? 'thumb' : 'original',
    });
    if (resolved === null) return notFound();
    const blob = await ctx.storage.get(resolved.storageId);
    if (blob === null) return notFound();
    return new Response(blob, {
      status: 200,
      headers: {
        'Cache-Control':
          match[2] === 'thumb'
            ? 'private, max-age=300, must-revalidate'
            : 'private, no-store',
        'Content-Type': resolved.mediaType,
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Authorization',
      },
    });
  } catch {
    return notFound();
  }
});
