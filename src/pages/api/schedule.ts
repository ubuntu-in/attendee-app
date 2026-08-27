import type { APIRoute } from 'astro';
import { EVENT_CONFIG } from '../../config.js';

export const GET: APIRoute = async () => {
  const url = `${EVENT_CONFIG.indicoBaseUrl}/export/event/${EVENT_CONFIG.indicoId}.json?detail=contributions`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch schedule from Indico (HTTP ${res.status})` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Failed to fetch schedule from Indico',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
