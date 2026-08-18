import { EVENT_CONFIG } from '../config.js';

export interface KonfHubParticipant {
  name: string;
  status: string | number;
  ticketName?: string;
  designation?: string;
  organisation?: string;
  [key: string]: unknown;
}

export interface StoredTicket {
  bookingId: string;
  eventId: string;
  attendee: KonfHubParticipant;
}

const STORAGE_KEY = 'ticket';
const KONFHUB_URL = 'https://api.konfhub.com/integration/validate';

export function buildQRPayload(ticket: StoredTicket): string {
  return `id:${ticket.bookingId}|n:${ticket.attendee.name}|eid:${ticket.eventId}`;
}

export function parseQRPayload(
  raw: string,
): { bookingId: string; name: string; eid: string } | null {
  const match = /^id:([^|]+)\|n:([^|]+)\|eid:([^|]+)$/.exec(raw.trim());
  if (!match) return null;
  const [, bookingId, name, eid] = match;
  return eid === EVENT_CONFIG.id ? { bookingId, name, eid } : null;
}

export function loadTicket(): StoredTicket | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as StoredTicket;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveTicket(ticket: StoredTicket): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
}

export function removeTicket(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchTicket(bookingId: string): Promise<StoredTicket> {
  const url = new URL(KONFHUB_URL);
  url.searchParams.set('validateBy', bookingId);
  url.searchParams.set('eventId', EVENT_CONFIG.id);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Ticket validation timed out. Please try again.'
        : 'Could not reach KonfHub. Check your connection and try again.',
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not validate this ticket. Please try again.');
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    bookingId,
    eventId: EVENT_CONFIG.id,
    attendee: data as KonfHubParticipant,
  };
}
