import type { APIRoute, GetStaticPaths } from 'astro';
import { proxySchedule } from '../../lib/schedule-proxy.js';

// Dev-only endpoints. Production API requests are handled by worker.js.
export const getStaticPaths: GetStaticPaths = () => import.meta.env.DEV
  ? ['schedule', 'timetable'].map((endpoint) => ({ params: { endpoint } }))
  : [];

export const GET: APIRoute = ({ params }) => proxySchedule(params.endpoint === 'timetable');
