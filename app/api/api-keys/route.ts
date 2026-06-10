import { NextResponse } from 'next/server';
import { registerApiClient } from '@/lib/auth/apiKeys';

function isAuthorized(request: Request): boolean {
  const adminSecret = process.env.ADMIN_API_SECRET;
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  if (!adminSecret) return false;
  return request.headers.get('authorization') === `Bearer ${adminSecret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let name = 'api-client';
  try {
    const body = (await request.json()) as { name?: unknown };
    if (typeof body?.name === 'string' && body.name.trim().length > 0) {
      name = body.name.trim();
    }
  } catch {
    // empty/invalid body is allowed; fall back to default name
  }

  const client = await registerApiClient(name);

  // The plaintext key is returned only once at creation time.
  return NextResponse.json(
    { id: client.id, name: client.name, api_key: client.rawKey },
    { status: 201 },
  );
}
