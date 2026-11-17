import {httpRouter} from 'convex/server';

import {appleCallback} from './appleWeb';
import {auth} from './auth';
import {APPLE_CALLBACK_PATH} from './lib/constants';
import {servePhoto} from './photos/http';
import {serveExport} from './exports/http';
import {handleIapkitWebhook} from './subscriptions/http';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({
  path: APPLE_CALLBACK_PATH,
  method: 'POST',
  handler: appleCallback,
});
http.route({
  pathPrefix: '/media/photo/',
  method: 'GET',
  handler: servePhoto,
});
http.route({
  pathPrefix: '/exports/file/',
  method: 'GET',
  handler: serveExport,
});

http.route({
  path: '/iapkit/webhook',
  method: 'POST',
  handler: handleIapkitWebhook,
});

export default http;
