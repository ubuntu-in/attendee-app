import { afterEach, expect, test } from 'bun:test';
import { EVENT_CONFIG } from '../src/config.ts';
import { buildQRPayload, fetchTicket, parseQRPayload } from '../src/lib/ticket.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('ticket QR payload round-trips for this event', () => {
  const ticket = {
    bookingId: 'booking-123',
    eventId: EVENT_CONFIG.id,
    attendee: { name: 'Test Attendee' },
  };

  expect(parseQRPayload(buildQRPayload(ticket))).toEqual({
    bookingId: ticket.bookingId,
    name: ticket.attendee.name,
    eid: EVENT_CONFIG.id,
  });
  expect(parseQRPayload('id:booking-123|n:Test Attendee|eid:another-event')).toBeNull();
});

test('invalid KonfHub data is not stored as a ticket', async () => {
  globalThis.fetch = async () => Response.json({ name: ' ' });

  expect(fetchTicket('booking-123')).rejects.toThrow('invalid ticket data');
});
