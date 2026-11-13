import { EVENT_CONFIG } from '../config.js';

export async function proxySchedule(timetable = false): Promise<Response> {
  const endpoint = timetable ? 'timetable' : 'event';
  const query = timetable ? '' : '?detail=contributions';
  const url = `${EVENT_CONFIG.indicoBaseUrl}/export/${endpoint}/${EVENT_CONFIG.indicoId}.json${query}`;

  try {
    const options = {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cf: { cacheTtl: 300, cacheEverything: true },
    };
    const upstream = await fetch(url, options);
    if (!upstream.ok) {
      throw new Error(`Failed to fetch schedule from Indico (HTTP ${upstream.status})`);
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : 'Failed to fetch schedule from Indico',
    }, { status: 502 });
  }
}
