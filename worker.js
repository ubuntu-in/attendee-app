import { proxySchedule } from './src/lib/schedule-proxy.ts';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/attendee\//, '/');
    if (path === '/api/schedule' || path === '/api/timetable') {
      if (request.method !== 'GET') {
        return new Response(null, { status: 405, headers: { Allow: 'GET' } });
      }
      return proxySchedule(path === '/api/timetable');
    }
    return env.ASSETS.fetch(request);
  },
};
