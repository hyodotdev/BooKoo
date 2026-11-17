import {httpAction} from '../_generated/server';
import {internal} from '../_generated/api';

const notFound = (): Response =>
  new Response('Not found', {
    status: 404,
    headers: {'Cache-Control': 'private, no-store'},
  });

export const serveExport = httpAction(async (ctx, request) => {
  const match = new URL(request.url).pathname.match(/^\/exports\/file\/([^/]+)$/);
  if (match?.[1] === undefined) return notFound();
  try {
    const resolved = await ctx.runQuery(
      internal.exports.internal.resolveDownload,
      {fileId: match[1], now: Date.now()},
    );
    if (resolved === null) return notFound();
    const blob = await ctx.storage.get(resolved.storageId);
    if (blob === null) return notFound();
    const safeName = resolved.fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    return new Response(blob, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Type': resolved.mediaType,
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Authorization',
      },
    });
  } catch {
    return notFound();
  }
});
