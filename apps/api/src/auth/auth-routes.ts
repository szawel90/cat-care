import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from './auth.service';

export function registerAuthRoutes(server: FastifyInstance, service: AuthService) {
  server.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      reply.header('Cache-Control', 'no-store');
      if (
        request.method === 'POST' &&
        ((request.headers.origin && request.headers.origin !== service.settings.baseUrl) ||
          request.headers['sec-fetch-site'] === 'cross-site')
      ) {
        return reply
          .status(403)
          .send({ code: 'INVALID_ORIGIN', message: 'This request origin is not allowed.' });
      }
      const headers = fromNodeHeaders(request.headers);
      headers.delete('x-forwarded-for');
      headers.delete('cf-connecting-ip');
      headers.set('x-real-ip', request.ip);
      const authRequest = new Request(new URL(request.url, service.settings.baseUrl), {
        method: request.method,
        headers,
        ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}),
      });
      const response = await service.auth.handler(authRequest);
      if (request.url.split('?')[0] === '/api/auth/get-session' && response.ok) {
        const result = (await response.clone().json()) as { user?: { id: string } } | null;
        if (result?.user && !(await service.access.hasAccess(result.user.id))) {
          return reply.status(403).send({
            code: 'ACCESS_UNAVAILABLE',
            message: 'Access is not available for this account.',
          });
        }
      }
      response.headers.forEach((value, key) => {
        if (!['set-cookie', 'cache-control'].includes(key.toLowerCase())) reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.status(response.status).send(response.body ? await response.text() : null);
    },
  });
}
