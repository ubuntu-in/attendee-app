import { EVENT_CONFIG } from '../config.js';

const EVENT_TIMEZONE = 'Asia/Kolkata';

export interface IndicoSession {
  id: string;
  title: string;
  speakers: string[];
  isBreak?: boolean;
  track?: string;
  room?: string;
  start: Date;
  end: Date;
  indicoUrl: string;
}

interface IndicoDateTime {
  date?: string;
  time?: string;
  tz?: string;
}

interface IndicoEntry extends Record<string, unknown> {
  speakers?: Record<string, unknown>[];
  startDate?: IndicoDateTime | null;
  endDate?: IndicoDateTime | null;
}

interface IndicoEventExport {
  results?: { contributions?: IndicoEntry[] }[];
}

interface IndicoTimetableExport {
  results?: Record<string, Record<string, Record<string, IndicoEntry>>>;
}

function toDate(d?: IndicoDateTime | null): Date | null {
  if (!d?.date || !d?.time) return null;
  // Event metadata is UTC; timetable entries use the event's local timezone.
  const offset = d.tz === EVENT_TIMEZONE ? '+05:30' : 'Z';
  const dt = new Date(`${d.date}T${d.time}${offset}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function speakerName(s: Record<string, unknown>): string {
  const first = typeof s.first_name === 'string' ? s.first_name : '';
  const last = typeof s.last_name === 'string' ? s.last_name : '';
  const joined = [first, last].filter(Boolean).join(' ').trim();
  return joined || (typeof s.fullName === 'string' ? s.fullName.trim() : '');
}

async function fetchExport<T>(timetable = false): Promise<T> {
  const url = `${import.meta.env.BASE_URL}api/${timetable ? 'timetable' : 'schedule'}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    let message = `Failed to fetch schedule from Indico (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore malformed error body and keep the generic HTTP message
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

/** Fetches talks and non-talk timetable entries, sorted together by start time. */
export async function fetchSchedule(eventId: number): Promise<IndicoSession[]> {
  const [event, timetable] = await Promise.all([
    fetchExport<IndicoEventExport>(),
    fetchExport<IndicoTimetableExport>(true),
  ]);
  const timetableDays = timetable.results?.[String(eventId)];
  if (!timetableDays) {
    throw new Error('The timetable response is missing event data. Please try again.');
  }
  const breaks = Object.values(timetableDays).flatMap((day) => Object.entries(day)
    .filter(([, entry]) => entry.entryType === 'Break')
    .map(([id, entry]) => ({
      ...entry,
      id: `break:${id}`,
      url: `${EVENT_CONFIG.indicoBaseUrl}/event/${eventId}/timetable/`,
    }))
  );
  const entries: IndicoEntry[] = [...(event.results?.[0]?.contributions ?? []), ...breaks];
  const sessions: IndicoSession[] = [];

  for (const [index, c] of entries.entries()) {
    const start = toDate(c.startDate);
    const end = toDate(c.endDate);
    if (!start || !end) continue;

    const speakerList: Record<string, unknown>[] = Array.isArray(c.speakers) ? c.speakers : [];
    const fallbackUrl = `${EVENT_CONFIG.indicoBaseUrl}/event/${eventId}/contributions/${c.db_id}/`;

    sessions.push({
      id: String(c.id ?? c.db_id ?? index).trim() || String(index),
      title: String(c.title ?? '').trim(),
      speakers: speakerList.map(speakerName).filter(Boolean),
      isBreak: c.entryType === 'Break',
      track: typeof c.track === 'string' && c.track ? c.track : undefined,
      room:
        typeof c.roomFullname === 'string' && c.roomFullname
          ? c.roomFullname
          : typeof c.room === 'string' && c.room
            ? c.room
            : undefined,
      start,
      end,
      indicoUrl: typeof c.url === 'string' && c.url ? c.url : fallbackUrl,
    });
  }

  sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
  return sessions;
}

/**
 * Groups sessions by date key in IST (Asia/Kolkata).
 */
export function groupByDay(sessions: IndicoSession[]): Map<string, IndicoSession[]> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const map = new Map<string, IndicoSession[]>();
  for (const session of sessions) {
    const dayKey = fmt.format(session.start);
    const bucket = map.get(dayKey);
    if (bucket) {
      bucket.push(session);
    } else {
      map.set(dayKey, [session]);
    }
  }
  return map;
}

/**
 * Formats a Date to a 12-hour IST time string e.g. "09:30 AM".
 */
export function formatTimeIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: EVENT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Formats a YYYY-MM-DD date key into a readable label e.g. "Saturday, 14 Nov 2026".
 */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T06:30:00Z`);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: EVENT_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
