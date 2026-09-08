export async function proxyApi(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const path = incoming.pathname.startsWith('/api/account')
    ? incoming.pathname.replace(/^\/api\/account/, '/v1/account')
    : incoming.pathname;
  const target = new URL(
    path + incoming.search,
    process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001',
  );
  const headers = new Headers(request.headers);
  for (const name of [
    'host',
    'connection',
    'content-length',
    'x-forwarded-host',
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
  ])
    headers.delete(name);
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      ...(request.method === 'POST' ? { body: await request.text() } : {}),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const outgoing = new Headers(response.headers);
    for (const name of ['content-encoding', 'content-length', 'connection']) outgoing.delete(name);
    outgoing.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The account service is unavailable. Please try again shortly.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
