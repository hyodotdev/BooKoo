import {normalizeIpCountryCode} from '../../shared/ipCountry';

/** Existing Vercel edge lookup. No account, cookie, IP, city or request logging. */
export default {
  fetch(request: Request): Response {
    const countryCode =
      request.method === 'GET' && process.env.VERCEL === '1'
        ? normalizeIpCountryCode(request.headers.get('x-vercel-ip-country'))
        : undefined;
    return Response.json(
      {countryCode: countryCode ?? null},
      {
        status: request.method === 'GET' ? 200 : 405,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Content-Type-Options': 'nosniff',
          ...(request.method === 'GET' ? {} : {Allow: 'GET'}),
        },
      },
    );
  },
};
